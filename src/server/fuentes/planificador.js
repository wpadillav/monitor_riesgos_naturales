/**
 * Planificador de la consulta periódica (arquitectura §5.3 y §5.6; RNF-04, RNF-06, RNF-10;
 * amenazas AM-18).
 *
 * - **Carga inicial:** 30 días de cada zona y fuente con `minmag = INGESTA_MAG_MIN` (2.0), como
 *   máximo 2 peticiones a la vez por fuente.
 * - **Ciclos escalonados:** cada fuente consulta una zona cada `escalonMs` (EMSC: 30 s por zona,
 *   una cada 6 s; USGS: 60 s por zona, una cada 12 s) con `updatedafter` = última actualización
 *   vista en esa fuente y zona menos 2 min de solape (la fusión es idempotente).
 * - **Fallos:** la zona reintenta con espera creciente (5, 10, 20, 40 y 60 s) y respeta
 *   `Retry-After` en 429/503 bloqueando **toda** la fuente hasta entonces; las demás zonas y
 *   fuentes siguen su calendario. El estado del canal lo lleva `estado-fuentes.js`.
 * - **Cobertura bajo demanda:** `asegurarCobertura(zonas, magMin)` consulta las fuentes solo si
 *   la memoria no cubre la magnitud pedida, con *single-flight* por (canal, zona, magnitud) y un
 *   límite total de 8 s (RNF-04: la petición responde en ≤ 10 s).
 */

import { FuenteError } from './http-cliente.js';
import { minimaMagnitud } from '../dominio/cobertura.js';

/** Esperas de reintento tras 1, 2, 3, 4 y ≥ 5 fallos seguidos de una zona (RNF-06). */
export const ESPERAS_REINTENTO_MS = Object.freeze([5_000, 10_000, 20_000, 40_000, 60_000]);

/** Solape de `updatedafter` respecto a la última actualización vista. */
export const SOLAPE_MS = 120_000;

/** Límite de una petición de `/api/sismos` que necesita consultar las fuentes (RNF-04). */
export const LIMITE_COBERTURA_MS = 8_000;

/** Peticiones simultáneas por fuente en la carga inicial. */
export const CONCURRENCIA_INICIAL = 2;

/** Motivos de descarte que son normales (no son errores de la fuente): solo en `debug`. */
const DESCARTES_ESPERADOS = Object.freeze(['tipo', 'sin-magnitud']);

/**
 * @typedef {import('./puerto.js').FuenteConsulta} FuenteConsulta
 * @typedef {import('./puerto.js').ResultadoConsulta} ResultadoConsulta
 *
 * @typedef {object} FuentePlanificada
 * @property {FuenteConsulta} adaptador
 * @property {number} intervaloMs ciclo por zona
 * @property {number} escalonMs separación entre zonas
 *
 * @typedef {object} ZonaConsulta
 * @property {string} id
 * @property {import('./puerto.js').Rectangulo} rectangulo
 *
 * @typedef {'carga' | 'ciclo' | 'cobertura'} Modo
 */

/**
 * @param {object} deps
 * @param {ReadonlyArray<FuentePlanificada>} deps.fuentes
 * @param {ReadonlyArray<ZonaConsulta>} deps.zonas
 * @param {ReturnType<typeof import('../dominio/catalogo.js').createCatalogo>} deps.catalogo
 * @param {ReturnType<typeof import('../dominio/cobertura.js').createCobertura>} deps.cobertura
 * @param {ReturnType<typeof import('./estado-fuentes.js').createEstadoFuentes>} deps.estado
 * @param {import('../infra/reloj.js').Reloj} deps.reloj
 * @param {import('../infra/log.js').Log} deps.log
 * @param {{ registrar: (m: import('../infra/metricas-latencia.js').MuestraLatencia) => void }}
 *   deps.metricas
 * @param {number | null} [deps.magInicial] `INGESTA_MAG_MIN`; `null` = todas
 * @param {number} [deps.ventanaMs] periodo cargado (retención)
 * @param {number} [deps.limiteCoberturaMs]
 */
export function createPlanificador({
  fuentes,
  zonas,
  catalogo,
  cobertura,
  estado,
  reloj,
  log,
  metricas,
  magInicial = 2.0,
  ventanaMs = 30 * 86_400_000,
  limiteCoberturaMs = LIMITE_COBERTURA_MS,
}) {
  const cancelacion = new AbortController();
  let detenido = false;

  /** Estado por canal|zona. */
  /** @type {Map<string, { marca: number | null, fallos: number, cargado: boolean,
   *   temporizador: ReturnType<typeof setTimeout> | null }>} */
  const porZona = new Map();
  for (const f of fuentes) {
    for (const z of zonas) {
      porZona.set(clave(f.adaptador.canal, z.id), {
        marca: null,
        fallos: 0,
        cargado: false,
        temporizador: null,
      });
    }
  }
  /** canal → instante hasta el que no se llama (Retry-After). @type {Map<string, number>} */
  const bloqueadoHasta = new Map();
  /** Consultas de cobertura en vuelo (single-flight). @type {Map<string, Promise<boolean>>} */
  const enVuelo = new Map();
  /** @type {Promise<unknown> | null} */
  let cargaInicialEnCurso = null;
  let cargaInicialTerminada = false;

  const limitarDescartes = createLimitadorDescartes(log, reloj);

  /** @param {string} canal @param {string} zona */
  function clave(canal, zona) {
    return `${canal}|${zona}`;
  }

  /** @param {FuentePlanificada} f @param {ZonaConsulta} z */
  const estadoDe = (f, z) =>
    /** @type {NonNullable<ReturnType<typeof porZona.get>>} */ (
      porZona.get(clave(f.adaptador.canal, z.id))
    );

  /** @param {string} canal */
  const bloqueada = (canal) => (bloqueadoHasta.get(canal) ?? 0) > reloj.ahora();

  // ---------------------------------------------------------------------------------------
  // Procesado de una respuesta

  /**
   * @param {FuentePlanificada} f
   * @param {ZonaConsulta} z
   * @param {ResultadoConsulta} resultado
   * @param {Modo} modo
   */
  function procesar(f, z, resultado, modo) {
    const { fuente } = f.adaptador;
    const { registros, retirados, descartes, recibidoEn } = resultado;
    const resultados = catalogo.ingerirLote(registros, { recibidoEn });

    let marca = estadoDe(f, z).marca;
    resultados.forEach((r, i) => {
      const reg = registros[i];
      if (marca === null || reg.actualizadoEn > marca) marca = reg.actualizadoEn;
      if (r.accion === 'sin-cambios') return;
      const campos = {
        fuente,
        canal: 'fdsn',
        zona: z.id,
        idFuente: reg.idFuente,
        accion: r.accion,
        publicacionARecepcionMs: recibidoEn - reg.actualizadoEn,
        origenARecepcionMs: recibidoEn - reg.tiempo,
      };
      // La carga de 30 días no es latencia de publicación: se registra solo en `debug` y no
      // entra en los percentiles (RNF-02 mide lo que llega con la consulta periódica).
      if (modo === 'ciclo') {
        log.info('sismo.recibido', campos);
        metricas.registrar({
          fuente,
          canal: 'fdsn',
          publicacionARecepcionMs: campos.publicacionARecepcionMs,
          origenARecepcionMs: campos.origenARecepcionMs,
        });
      } else {
        log.debug('sismo.recibido', { ...campos, modo });
      }
    });
    for (const id of retirados) {
      if (catalogo.retirar(fuente, id)) log.info('sismo.retirado', { fuente, idFuente: id });
    }
    for (const [motivo, cuenta] of Object.entries(descartes)) {
      limitarDescartes(fuente, motivo, cuenta);
    }
    // Una `lastupdate` en el futuro (reloj de la fuente) no debe saltarse revisiones. Una carga
    // completa sin sismos deja la marca en la recepción: el siguiente ciclo ya usa
    // `updatedafter` (con el solape de 2 min).
    if (marca === null && modo !== 'ciclo') marca = recibidoEn;
    estadoDe(f, z).marca = marca === null ? null : Math.min(marca, recibidoEn);
    return registros.length;
  }

  /**
   * @param {FuentePlanificada} f
   * @param {ZonaConsulta} z
   * @param {unknown} err
   * @returns {number} espera hasta el próximo intento (ms)
   */
  function registrarFallo(f, z, err) {
    const { canal } = f.adaptador;
    const st = estadoDe(f, z);
    st.fallos += 1;
    let espera = ESPERAS_REINTENTO_MS[Math.min(st.fallos, ESPERAS_REINTENTO_MS.length) - 1];
    let mensaje = 'Error inesperado';
    let codigo = 'INTERNO';
    if (err instanceof FuenteError) {
      mensaje = err.message;
      codigo = err.codigo;
      if (err.retryAfterMs !== null && err.retryAfterMs > 0) {
        espera = Math.max(espera, err.retryAfterMs);
        bloqueadoHasta.set(canal, reloj.ahora() + err.retryAfterMs);
      }
    } else {
      // Un fallo de programación en un adaptador no tumba el proceso (AM-03), pero se registra.
      log.error('error', {
        fuente: canal,
        mensaje: err instanceof Error ? err.message : String(err),
        pila: err instanceof Error ? err.stack : undefined,
      });
    }
    log.debug('fuente.fallo', { fuente: canal, zona: z.id, codigo, esperaMs: espera });
    estado.registrarFallo(canal, mensaje, reloj.ahora() + espera);
    return espera;
  }

  /** @param {FuentePlanificada} f @param {ZonaConsulta} z */
  function registrarExito(f, z) {
    const st = estadoDe(f, z);
    st.fallos = 0;
    st.cargado = true;
    estado.registrarExito(f.adaptador.canal);
  }

  // ---------------------------------------------------------------------------------------
  // Carga completa (inicial o de cobertura)

  /**
   * @param {FuentePlanificada} f
   * @param {ZonaConsulta} z
   * @param {number | null} magMin
   * @param {Modo} modo
   * @param {number} [timeoutMs]
   * @returns {Promise<boolean>}
   */
  async function cargarCompleta(f, z, magMin, modo, timeoutMs) {
    if (detenido) return false;
    if (bloqueada(f.adaptador.canal)) return false;
    try {
      const resultado = await f.adaptador.consultar(
        {
          rectangulo: z.rectangulo,
          magMin,
          desde: reloj.ahora() - ventanaMs,
          actualizadoDesde: null,
        },
        { timeoutMs, signal: cancelacion.signal },
      );
      if (detenido) return false;
      procesar(f, z, resultado, modo);
      cobertura.registrar(f.adaptador.canal, z.id, magMin);
      registrarExito(f, z);
      return true;
    } catch (err) {
      if (detenido) return false;
      registrarFallo(f, z, err);
      return false;
    }
  }

  async function cargaInicial() {
    const inicio = reloj.ahora();
    let fallos = 0;
    await Promise.all(
      fuentes.map(async (f) => {
        const pendientes = [...zonas];
        const trabajador = async () => {
          for (let z = pendientes.shift(); z; z = pendientes.shift()) {
            if (!(await cargarCompleta(f, z, magInicial, 'carga'))) fallos += 1;
          }
        };
        await Promise.all(Array.from({ length: CONCURRENCIA_INICIAL }, trabajador));
      }),
    );
    cargaInicialTerminada = true;
    log.info('carga.inicial', {
      sismos: catalogo.contarVisibles(),
      enMemoria: catalogo.contar(),
      ms: reloj.ahora() - inicio,
      fallos,
    });
  }

  // ---------------------------------------------------------------------------------------
  // Ciclos periódicos

  /** @param {FuentePlanificada} f @param {ZonaConsulta} z @param {number} retrasoMs */
  function programar(f, z, retrasoMs) {
    if (detenido) return;
    const st = estadoDe(f, z);
    if (st.temporizador) clearTimeout(st.temporizador);
    st.temporizador = setTimeout(() => {
      st.temporizador = null;
      ciclo(f, z).catch((err) => {
        log.error('error', { mensaje: err instanceof Error ? err.message : String(err) });
      });
    }, retrasoMs);
    st.temporizador.unref?.();
  }

  /** @param {FuentePlanificada} f @param {ZonaConsulta} z */
  async function ciclo(f, z) {
    if (detenido) return;
    const { canal } = f.adaptador;
    const ahora = reloj.ahora();
    const bloqueo = bloqueadoHasta.get(canal) ?? 0;
    if (bloqueo > ahora) {
      programar(f, z, bloqueo - ahora);
      return;
    }
    const st = estadoDe(f, z);
    // Si la carga inicial de esta zona falló, el ciclo hace una carga completa.
    const completa = !st.cargado || st.marca === null;
    // `null` en la cobertura significa «todas»: no se puede usar `??`.
    const cargada = cobertura.obtener(canal, z.id);
    const magMin = cargada === undefined ? magInicial : cargada;
    try {
      const resultado = await f.adaptador.consultar(
        {
          rectangulo: z.rectangulo,
          magMin,
          desde: ahora - ventanaMs,
          actualizadoDesde: completa ? null : /** @type {number} */ (st.marca) - SOLAPE_MS,
        },
        { signal: cancelacion.signal },
      );
      if (detenido) return;
      procesar(f, z, resultado, completa ? 'carga' : 'ciclo');
      if (completa) cobertura.registrar(canal, z.id, magMin);
      registrarExito(f, z);
      programar(f, z, f.intervaloMs);
    } catch (err) {
      if (detenido) return;
      programar(f, z, registrarFallo(f, z, err));
    }
  }

  // ---------------------------------------------------------------------------------------
  // API

  return Object.freeze({
    /**
     * Carga inicial y, al terminar, los ciclos escalonados. Devuelve la promesa de la carga.
     * @returns {Promise<void>}
     */
    arrancar() {
      if (cargaInicialEnCurso) return /** @type {Promise<void>} */ (cargaInicialEnCurso);
      const carga = cargaInicial().then(() => {
        for (const f of fuentes) {
          zonas.forEach((z, i) => programar(f, z, f.escalonMs * (i + 1)));
        }
      });
      cargaInicialEnCurso = carga;
      return carga;
    },

    /** Cancela las peticiones en vuelo y los temporizadores (apagado ordenado). */
    detener() {
      detenido = true;
      cancelacion.abort();
      for (const st of porZona.values()) {
        if (st.temporizador) clearTimeout(st.temporizador);
        st.temporizador = null;
      }
    },

    /**
     * Garantiza que la memoria cubre `magMin` en las zonas pedidas (arquitectura §5.6). Espera a
     * la carga inicial si sigue en curso y consulta lo que falte, todo en ≤ `limiteCoberturaMs`.
     * @param {ReadonlyArray<string>} zonaIds
     * @param {number | null} magMin `null` = todas
     * @returns {Promise<{ completo: boolean }>} `completo: false` si alguna consulta necesaria
     *   falló, agotó el tiempo o no se pudo hacer
     */
    async asegurarCobertura(zonaIds, magMin) {
      const limite = reloj.ahora() + limiteCoberturaMs;
      if (cargaInicialEnCurso && !cargaInicialTerminada) {
        /** @type {ReturnType<typeof setTimeout> | undefined} */
        let t;
        await Promise.race([
          cargaInicialEnCurso,
          new Promise((ok) => {
            t = setTimeout(ok, limiteCoberturaMs);
          }),
        ]);
        clearTimeout(t);
      }
      // Nunca se consulta por encima de la magnitud de ingesta: el ciclo usa la cobertura como
      // `minmag` y no debe perder lo que ya trae la carga inicial.
      const objetivo = magInicial === null ? null : minimaMagnitud(magMin, magInicial);
      const seleccion = zonas.filter((z) => zonaIds.includes(z.id));
      let completo = true;
      const consultas = [];
      for (const z of seleccion) {
        for (const f of fuentes) {
          const { canal } = f.adaptador;
          if (cobertura.cubre(canal, z.id, magMin)) continue;
          const restante = limite - reloj.ahora();
          if (detenido || bloqueada(canal) || restante < 1000) {
            completo = false;
            continue;
          }
          const k = `${canal}|${z.id}|${objetivo ?? 'todas'}`;
          let promesa = enVuelo.get(k);
          if (!promesa) {
            promesa = cargarCompleta(f, z, objetivo, 'cobertura', restante).finally(() =>
              enVuelo.delete(k),
            );
            enVuelo.set(k, promesa);
          }
          consultas.push(promesa);
        }
      }
      const resultados = await Promise.all(consultas);
      if (resultados.includes(false)) completo = false;
      for (const z of seleccion) {
        for (const f of fuentes) {
          if (!estadoDe(f, z).cargado || !cobertura.cubre(f.adaptador.canal, z.id, magMin)) {
            completo = false;
          }
        }
      }
      return { completo };
    },
  });
}

/**
 * Registra los descartes del normalizador como mucho una vez por minuto, por fuente y motivo
 * (arquitectura §8.3, AM-29, AM-34). Los motivos esperados (no son sismos) van en `debug`.
 * @param {import('../infra/log.js').Log} log
 * @param {import('../infra/reloj.js').Reloj} reloj
 * @returns {(fuente: string, motivo: string, cuenta: number) => void}
 */
export function createLimitadorDescartes(log, reloj) {
  /** @type {Map<string, { desde: number, pendiente: number }>} */
  const ventanas = new Map();
  return (fuente, motivo, cuenta) => {
    if (DESCARTES_ESPERADOS.includes(motivo)) {
      log.debug('normalizacion.descarte', { fuente, motivo, cuenta });
      return;
    }
    const k = `${fuente}|${motivo}`;
    const ahora = reloj.ahora();
    const v = ventanas.get(k);
    if (v && ahora - v.desde < 60_000) {
      v.pendiente += cuenta;
      return;
    }
    const total = (v?.pendiente ?? 0) + cuenta;
    ventanas.set(k, { desde: ahora, pendiente: 0 });
    log.warn('normalizacion.descarte', { fuente, motivo, cuenta: total });
  };
}
