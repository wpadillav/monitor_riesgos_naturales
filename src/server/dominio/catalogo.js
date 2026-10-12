/**
 * Catálogo de sismos en memoria (ADR-0004; arquitectura §5.4 y §5.5; amenazas AM-16).
 *
 * Guarda los sismos canónicos con sus registros (como máximo uno por fuente), los índices por
 * id de fuente y por minuto de `tiempo`, y aplica las reglas de `src/shared/duplicados.js`:
 * asociación por id, asociación por cercanía, fusión tardía y precedencia. También purga lo que
 * sale de la retención y aplica el tope duro de sismos.
 *
 * ## Eventos internos (interfaz para T4.6)
 *
 * `catalogo.on(evento, oyente)` (es un `EventEmitter`). Se emiten **después** de aplicar cada
 * cambio, de forma síncrona, y solo para los sismos **visibles** (con país asignado; los que no
 * tienen país se guardan para deduplicar, pero no se sirven ni se difunden):
 *
 * | Evento | Carga | Cuándo |
 * |---|---|---|
 * | `alta` | `{ sismo }` | Un sismo pasa a ser visible: alta nueva, o una revisión lo mete en un país |
 * | `actualizacion` | `{ sismo, anterior, cambios }` | Cambia un sismo visible (`cambios` usa el enum del contrato `DatosSismo.cambios`) |
 * | `baja` | `{ id, motivo, reemplazadoPor, anterior }` | Un sismo visible deja de serlo. `motivo`: `fusionado` (con `reemplazadoPor`), `fuera-de-zona` o `retirado` (enum del contrato `DatosSismoEliminado`) |
 * | `purga` | `{ ids, motivo }` | Retención (`retencion`) o tope de memoria (`tope`). **No se difunde** a los clientes (la página aplica su periodo, arquitectura §5.5); sirve para limpiar estructuras auxiliares |
 *
 * En una fusión tardía se emite primero `baja` (`fusionado`) del absorbido y después
 * `actualizacion` (o `alta`) del superviviente, como pide el ADR-0004. `sismo` y `anterior` son
 * objetos `Sismo` del contrato, nuevos en cada cambio: los oyentes no deben modificarlos.
 */

import { EventEmitter } from 'node:events';

import { UMBRALES_DEDUP } from '../../shared/constantes.js';
import { elegirCandidato, mejorCandidato, sePuedenFusionar } from '../../shared/duplicados.js';
import { componerSismo, idEstable, registroPreferido } from '../../shared/modelo.js';
import { algunPaisMarcado, cumpleMagMin } from '../../shared/reglas.js';

/** Nombres de los eventos internos. */
export const EVENTOS_CATALOGO = Object.freeze({
  ALTA: 'alta',
  ACTUALIZACION: 'actualizacion',
  BAJA: 'baja',
  PURGA: 'purga',
});

/**
 * Tope duro de sismos en memoria, con y sin país (AM-16). C-A lo baja de 50 000 a 15 000 para
 * cumplir RNF-05 (≤ 300 MB de RSS) con margen también bajo carga: 1,5 veces el techo de diseño
 * de RNF-03 (10 000 visibles), que deja sitio a los sismos sin país que se guardan para
 * deduplicar (un 30 % con los datos reales). Medición en arquitectura §5.5.
 */
export const TOPE_SISMOS = 15_000;

/**
 * Histéresis del tope (R-15, P-05): al superarlo se baja al 95 %, así que el recorte (que es
 * O(n)) se hace una vez cada `5 %` de altas y no en cada ingesta.
 */
export const HISTERESIS_TOPE = 0.95;

/** Máximo de sismos por respuesta de `/api/sismos` (contrato `RespuestaSismos`). */
export const MAX_RESPUESTA = 10_000;

const DIA_MS = 86_400_000;
const MINUTO_MS = 60_000;

/**
 * @typedef {import('../../shared/modelo.js').RegistroFuente} RegistroFuente
 * @typedef {import('../../shared/modelo.js').Sismo} Sismo
 * @typedef {import('../../shared/modelo.js').UbicacionPais} UbicacionPais
 * @typedef {import('../../shared/modelo.js').CodigoPais} CodigoPais
 * @typedef {import('../../shared/duplicados.js').Umbrales} Umbrales
 *
 * @typedef {'alta' | 'actualizacion' | 'fusion' | 'sin-cambios'} Accion
 *   `alta`: crea un sismo; `actualizacion`: revisión del mismo registro; `fusion`: el registro
 *   se une a un sismo de otra fuente (por cercanía); `sin-cambios`: repetido o más antiguo.
 *
 * @typedef {object} ResultadoIngesta
 * @property {Accion} accion
 * @property {string} id id estable del sismo afectado
 * @property {boolean} visible si el sismo resultante tiene país
 *
 * @typedef {object} Entrada
 * @property {string} id
 * @property {Map<string, Readonly<RegistroFuente>>} registros por fuente, en orden de llegada
 * @property {Readonly<RegistroFuente>} preferido
 * @property {number} recibidoEn
 * @property {number} revision
 * @property {boolean} compuesto si ya se compuso al menos una vez
 * @property {Sismo | null} sismo `null` si no tiene país
 * @property {number} minuto clave en `porMinuto`
 * @property {number} tIndice `tiempo` con el que está (o estará) en el índice por tiempo
 * @property {Set<string>} claves claves de `porFuente` que apuntan a esta entrada
 */

/** Cambios visibles entre dos `Sismo` (enum del contrato `DatosSismo.cambios`). */
export function calcularCambios(/** @type {Sismo} */ a, /** @type {Sismo} */ b) {
  const cambios = [];
  if (a.magnitud !== b.magnitud || a.magnitudTipo !== b.magnitudTipo) cambios.push('magnitud');
  if (a.lat !== b.lat || a.lon !== b.lon) cambios.push('ubicacion');
  if (a.profundidadKm !== b.profundidadKm) cambios.push('profundidad');
  if (a.tiempo !== b.tiempo) cambios.push('tiempo');
  if (a.lugar !== b.lugar) cambios.push('lugar');
  if (
    a.pais !== b.pais ||
    a.zona !== b.zona ||
    String(a.paisesCandidatos) !== String(b.paisesCandidatos)
  ) {
    cambios.push('pais');
  }
  if (JSON.stringify(a.fuentes) !== JSON.stringify(b.fuentes)) cambios.push('fuentes');
  if (a.fuentePreferida !== b.fuentePreferida || a.autor !== b.autor || a.url !== b.url) {
    cambios.push('preferida');
  }
  return cambios;
}

/** @param {Sismo | null} s */
const huella = (s) => (s === null ? 'null' : JSON.stringify({ ...s, revision: 0 }));

/**
 * @param {object} deps
 * @param {(lat: number, lon: number) => UbicacionPais | null} deps.asignarPais
 * @param {Umbrales} [deps.umbrales]
 * @param {number} [deps.retencionDias] 1–30
 * @param {number} [deps.tope]
 * @param {import('../infra/log.js').Log} [deps.log]
 */
export function createCatalogo({
  asignarPais,
  umbrales = UMBRALES_DEDUP,
  retencionDias = 30,
  tope = TOPE_SISMOS,
  log,
}) {
  // Los oyentes se invocan uno a uno en `emitir`: si uno lanza, se registra y se sigue.
  const emisor = new EventEmitter();

  /** @type {Map<string, Entrada>} */
  const entradas = new Map();
  /** `fuente:idFuente` → id del sismo. En USGS, todos los de `ids`. @type {Map<string, string>} */
  const porFuente = new Map();
  /** minuto UTC de `tiempo` preferido → ids. @type {Map<number, Set<string>>} */
  const porMinuto = new Map();
  /**
   * Índice por tiempo (P-04): entradas por `tIndice` ascendente (y id descendente en empate), de
   * modo que recorrerlo al revés da el orden de la API. Se mantiene de forma perezosa: las altas
   * y los cambios de `tiempo` se apuntan en `cambiadas` y las bajas activan `hayBajas`; el índice
   * se rehace solo cuando alguien lo lee. Como casi todo sigue ordenado, la ordenación (TimSort)
   * es casi lineal.
   * @type {Entrada[]}
   */
  let indice = [];
  /** @type {Set<Entrada>} */
  const cambiadas = new Set();
  let hayBajas = false;

  const retencionMs = retencionDias * DIA_MS;
  const ventanaMs = umbrales.dtS * 1000;

  // ---------------------------------------------------------------------------------------
  // Índices

  /** @param {Entrada} e */
  function indexarMinuto(e) {
    const minuto = Math.floor(e.preferido.tiempo / MINUTO_MS);
    if (minuto === e.minuto && porMinuto.get(minuto)?.has(e.id)) return;
    desindexarMinuto(e);
    e.minuto = minuto;
    let ids = porMinuto.get(minuto);
    if (!ids) {
      ids = new Set();
      porMinuto.set(minuto, ids);
    }
    ids.add(e.id);
  }

  /** @param {Entrada} e */
  function desindexarMinuto(e) {
    const ids = porMinuto.get(e.minuto);
    if (!ids) return;
    ids.delete(e.id);
    if (ids.size === 0) porMinuto.delete(e.minuto);
  }

  /** @param {Entrada} e @param {Readonly<RegistroFuente>} r */
  function indexarRegistro(e, r) {
    for (const id of r.ids) {
      const clave = `${r.fuente}:${id}`;
      // Asociación permanente: un id ya asociado a otro sismo no se mueve.
      if (porFuente.has(clave) && porFuente.get(clave) !== e.id) continue;
      porFuente.set(clave, e.id);
      e.claves.add(clave);
    }
  }

  /** @param {Entrada} e */
  function eliminarEntrada(e) {
    for (const clave of e.claves) {
      if (porFuente.get(clave) === e.id) porFuente.delete(clave);
    }
    desindexarMinuto(e);
    entradas.delete(e.id);
    cambiadas.delete(e);
    hayBajas = true;
  }

  /** @param {Entrada} a @param {Entrada} b */
  const porTiempoAsc = (a, b) => a.tIndice - b.tIndice || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

  /** @param {Entrada} e */
  const viva = (e) => entradas.get(e.id) === e;

  /**
   * Índice por tiempo al día (ver `indice`).
   * @returns {Entrada[]}
   */
  function indiceOrdenado() {
    if (cambiadas.size === 0 && !hayBajas) return indice;
    const base = indice.filter((e) => viva(e) && !cambiadas.has(e));
    for (const e of cambiadas) if (viva(e)) base.push(e);
    if (cambiadas.size > 0) base.sort(porTiempoAsc);
    indice = base;
    cambiadas.clear();
    hayBajas = false;
    return indice;
  }

  /**
   * Primera posición del índice con `tIndice ≥ desde` (búsqueda binaria).
   * @param {Entrada[]} idx
   * @param {number} desde
   */
  function primeraDesde(idx, desde) {
    let bajo = 0;
    let alto = idx.length;
    while (bajo < alto) {
      const medio = (bajo + alto) >>> 1;
      if (idx[medio].tIndice < desde) bajo = medio + 1;
      else alto = medio;
    }
    return bajo;
  }

  /**
   * Entradas cuyo `tiempo` preferido está a ≤ `dtS` de `tiempo` (índice por minuto, O(1)).
   * @param {number} tiempo
   * @returns {Entrada[]}
   */
  function cercanasEnTiempo(tiempo) {
    const desde = Math.floor((tiempo - ventanaMs) / MINUTO_MS);
    const hasta = Math.floor((tiempo + ventanaMs) / MINUTO_MS);
    const resultado = [];
    for (let m = desde; m <= hasta; m += 1) {
      const ids = porMinuto.get(m);
      if (!ids) continue;
      for (const id of ids) {
        const e = entradas.get(id);
        if (e) resultado.push(e);
      }
    }
    return resultado;
  }

  /** @param {Entrada} e */
  const comoCandidato = (e) => ({
    id: e.id,
    fuentes: [...e.registros.keys()],
    preferido: e.preferido,
    recibidoEn: e.recibidoEn,
    entrada: e,
  });

  // ---------------------------------------------------------------------------------------
  // Composición

  /**
   * Recalcula precedencia, país y `Sismo`. Sube `revision` si cambia algo visible.
   * @param {Entrada} e
   */
  function recomponer(e) {
    /** @type {Map<string, UbicacionPais | null>} */
    const memo = new Map();
    const ubicar = (lat, lon) => {
      const clave = `${lat},${lon}`;
      if (!memo.has(clave)) memo.set(clave, asignarPais(lat, lon));
      return /** @type {UbicacionPais | null} */ (memo.get(clave));
    };
    const registros = [...e.registros.values()];
    const preferido = registroPreferido(registros, (lat, lon) => ubicar(lat, lon)?.pais ?? null);
    const nuevo = componerSismo(
      { id: e.id, registros, recibidoEn: e.recibidoEn, revision: e.revision },
      ubicar,
    );
    // La primera composición deja la revisión en 1; cada cambio posterior la sube en 1.
    if (!e.compuesto) e.compuesto = true;
    else if (preferido !== e.preferido || huella(nuevo) !== huella(e.sismo)) e.revision += 1;
    if (nuevo) nuevo.revision = e.revision;
    e.sismo = nuevo;
    e.preferido = preferido;
    indexarMinuto(e);
    if (e.tIndice !== preferido.tiempo) {
      e.tIndice = preferido.tiempo;
      cambiadas.add(e);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Transacción: se toma una foto de lo visible antes de tocar cada entrada y se emiten los
  // eventos al final, ya con el estado consistente.

  function crearTransaccion() {
    /** @type {Map<string, Sismo | null>} */
    const antes = new Map();
    /** @type {Map<string, string>} absorbido → superviviente */
    const fusionados = new Map();
    /** @type {Set<string>} */
    const retirados = new Set();
    return {
      /** @param {Entrada} e */
      tocar(e) {
        if (!antes.has(e.id)) antes.set(e.id, e.sismo);
      },
      /** @param {string} id @param {Sismo | null} sismo */
      nueva(id, sismo) {
        if (!antes.has(id)) antes.set(id, sismo);
      },
      fusionado(/** @type {string} */ absorbido, /** @type {string} */ superviviente) {
        fusionados.set(absorbido, superviviente);
      },
      retirado(/** @type {string} */ id) {
        retirados.add(id);
      },
      emitir() {
        for (const [id, superviviente] of fusionados) {
          const anterior = antes.get(id) ?? null;
          if (anterior) {
            emitir(EVENTOS_CATALOGO.BAJA, {
              id,
              motivo: 'fusionado',
              reemplazadoPor: superviviente,
              anterior,
            });
          }
        }
        for (const [id, anterior] of antes) {
          if (fusionados.has(id)) continue;
          const e = entradas.get(id);
          const actual = e?.sismo ?? null;
          if (!anterior && actual) {
            emitir(EVENTOS_CATALOGO.ALTA, { sismo: actual });
          } else if (anterior && !actual) {
            emitir(EVENTOS_CATALOGO.BAJA, {
              id,
              motivo: e === undefined || retirados.has(id) ? 'retirado' : 'fuera-de-zona',
              reemplazadoPor: null,
              anterior,
            });
          } else if (anterior && actual && anterior.revision !== actual.revision) {
            emitir(EVENTOS_CATALOGO.ACTUALIZACION, {
              sismo: actual,
              anterior,
              cambios: calcularCambios(anterior, actual),
            });
          }
        }
      },
    };
  }

  /** @param {string} evento @param {object} carga */
  function emitir(evento, carga) {
    for (const oyente of emisor.listeners(evento)) {
      try {
        oyente(carga);
      } catch (err) {
        log?.error('error', {
          mensaje: `Oyente de ${evento}: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------------------
  // Fusión tardía (ADR-0004, paso 4)

  /**
   * @param {Entrada} e
   * @param {ReturnType<typeof crearTransaccion>} tx
   * @returns {Entrada} la entrada superviviente
   */
  function fusionTardia(e, tx) {
    const propio = comoCandidato(e);
    const validos = cercanasEnTiempo(e.preferido.tiempo)
      .filter((otra) => otra.id !== e.id)
      .map(comoCandidato)
      .filter((candidato) => sePuedenFusionar(propio, candidato, umbrales));
    // Mismo desempate que la asociación por cercanía, con la tolerancia EPSILON (R-14).
    const mejor = mejorCandidato(e.preferido, validos, umbrales)?.entrada ?? null;
    if (mejor === null) return e;

    const eMasAntigua =
      e.recibidoEn < mejor.recibidoEn || (e.recibidoEn === mejor.recibidoEn && e.id < mejor.id);
    const superviviente = eMasAntigua ? e : mejor;
    const absorbida = eMasAntigua ? mejor : e;
    tx.tocar(superviviente);
    tx.tocar(absorbida);

    eliminarEntrada(absorbida);
    for (const [fuente, registro] of absorbida.registros) {
      superviviente.registros.set(fuente, registro);
      indexarRegistro(superviviente, registro);
    }
    // Las claves del absorbido (incluidos ids antiguos de USGS) pasan al superviviente.
    for (const clave of absorbida.claves) {
      if (!porFuente.has(clave)) {
        porFuente.set(clave, superviviente.id);
        superviviente.claves.add(clave);
      }
    }
    superviviente.recibidoEn = Math.min(superviviente.recibidoEn, absorbida.recibidoEn);
    recomponer(superviviente);
    tx.fusionado(absorbida.id, superviviente.id);
    log?.info('sismo.fusion', { id: superviviente.id, absorbido: absorbida.id });
    return superviviente;
  }

  // ---------------------------------------------------------------------------------------
  // Ingesta

  /**
   * @param {Readonly<RegistroFuente>} registro ya normalizado (`crearRegistro`)
   * @param {number} recibidoEn ms
   * @param {ReturnType<typeof crearTransaccion>} tx
   * @returns {ResultadoIngesta}
   */
  function ingerirEnTx(registro, recibidoEn, tx) {
    // 1. Por id (en USGS, cualquiera de `ids`).
    let existente;
    for (const id of registro.ids) {
      const idSismo = porFuente.get(`${registro.fuente}:${id}`);
      if (idSismo !== undefined) {
        existente = entradas.get(idSismo);
        if (existente) break;
      }
    }
    if (existente) {
      const guardado = existente.registros.get(registro.fuente);
      if (guardado && registro.actualizadoEn <= guardado.actualizadoEn) {
        return { accion: 'sin-cambios', id: existente.id, visible: existente.sismo !== null };
      }
      tx.tocar(existente);
      existente.registros.set(registro.fuente, registro);
      indexarRegistro(existente, registro);
      recomponer(existente);
      const final = fusionTardia(existente, tx);
      return { accion: 'actualizacion', id: final.id, visible: final.sismo !== null };
    }

    // 2 y 3. Por cercanía, frente a sismos sin registro de esta fuente.
    const candidatos = cercanasEnTiempo(registro.tiempo).map(comoCandidato);
    const elegido = elegirCandidato(registro, candidatos, umbrales);
    if (elegido) {
      const e = elegido.entrada;
      tx.tocar(e);
      e.registros.set(registro.fuente, registro);
      indexarRegistro(e, registro);
      recomponer(e);
      const final = fusionTardia(e, tx);
      return { accion: 'fusion', id: final.id, visible: final.sismo !== null };
    }

    // Alta.
    const id = idEstable(registro);
    if (entradas.has(id)) {
      // No debería ocurrir (el id está indexado); se trata como sin cambios por seguridad.
      return { accion: 'sin-cambios', id, visible: entradas.get(id)?.sismo !== null };
    }
    /** @type {Entrada} */
    const e = {
      id,
      registros: new Map([[registro.fuente, registro]]),
      preferido: registro,
      recibidoEn,
      revision: 1,
      compuesto: false,
      sismo: null,
      minuto: Number.NaN,
      tIndice: Number.NaN,
      claves: new Set(),
    };
    tx.nueva(id, null);
    entradas.set(id, e);
    indexarRegistro(e, registro);
    recomponer(e);
    // Sin fusión tardía: con un solo registro, sus valores preferidos son los del registro y
    // el paso 2 ya ha descartado todos los candidatos posibles.
    return { accion: 'alta', id, visible: e.sismo !== null };
  }

  /**
   * Aplica el tope duro (AM-16): si se supera, descarta los más antiguos por `tiempo` hasta
   * quedar en el 95 % del tope (histéresis, R-15 y P-05). Usa el índice por tiempo, sin ordenar
   * todo el catálogo.
   */
  function aplicarTope() {
    if (entradas.size <= tope) return;
    const objetivo = Math.floor(tope * HISTERESIS_TOPE);
    const exceso = entradas.size - objetivo;
    const idx = indiceOrdenado();
    const ids = [];
    for (const e of idx.slice(0, exceso)) {
      eliminarEntrada(e);
      ids.push(e.id);
    }
    // Se ha quitado justo el principio del índice: sigue ordenado sin rehacerlo.
    indice = idx.slice(exceso);
    hayBajas = false;
    log?.warn('memoria.tope', { descartados: exceso, tope });
    emitir(EVENTOS_CATALOGO.PURGA, { ids, motivo: 'tope' });
  }

  return Object.freeze({
    /**
     * Ingiere un registro normalizado.
     * @param {Readonly<RegistroFuente>} registro
     * @param {{ recibidoEn: number }} opciones
     * @returns {ResultadoIngesta}
     */
    ingerir(registro, { recibidoEn }) {
      const tx = crearTransaccion();
      const r = ingerirEnTx(registro, recibidoEn, tx);
      tx.emitir();
      aplicarTope();
      return r;
    },

    /**
     * Ingiere varios registros (una respuesta FDSN). El tope se aplica una sola vez al final.
     * @param {ReadonlyArray<Readonly<RegistroFuente>>} registros
     * @param {{ recibidoEn: number }} opciones
     * @returns {ResultadoIngesta[]}
     */
    ingerirLote(registros, { recibidoEn }) {
      const resultados = [];
      for (const registro of registros) {
        const tx = crearTransaccion();
        resultados.push(ingerirEnTx(registro, recibidoEn, tx));
        tx.emitir();
      }
      aplicarTope();
      return resultados;
    },

    /**
     * Retira el registro de una fuente (la fuente lo borró o lo reclasificó como no sísmico).
     * Si el sismo se queda sin registros, desaparece.
     * @param {'emsc' | 'usgs'} fuente
     * @param {string} idFuente
     * @returns {boolean} si había algo que retirar
     */
    retirar(fuente, idFuente) {
      const idSismo = porFuente.get(`${fuente}:${idFuente}`);
      const e = idSismo === undefined ? undefined : entradas.get(idSismo);
      if (!e || !e.registros.has(fuente)) return false;
      const tx = crearTransaccion();
      tx.tocar(e);
      const registro = /** @type {Readonly<RegistroFuente>} */ (e.registros.get(fuente));
      e.registros.delete(fuente);
      for (const id of registro.ids) {
        const clave = `${fuente}:${id}`;
        if (porFuente.get(clave) === e.id) porFuente.delete(clave);
        e.claves.delete(clave);
      }
      if (e.registros.size === 0) {
        eliminarEntrada(e);
        tx.retirado(e.id);
      } else {
        recomponer(e);
      }
      tx.emitir();
      return true;
    },

    /**
     * Purga los sismos con `tiempo` anterior a la retención (arquitectura §5.5). Sin eventos
     * para los clientes; emite `purga` con motivo `retencion`.
     * @param {number} ahora ms
     * @returns {number} sismos purgados
     */
    purgar(ahora) {
      const idx = indiceOrdenado();
      const hasta = primeraDesde(idx, ahora - retencionMs);
      if (hasta === 0) return 0;
      const ids = [];
      for (const e of idx.slice(0, hasta)) {
        eliminarEntrada(e);
        ids.push(e.id);
      }
      indice = idx.slice(hasta);
      hayBajas = false;
      emitir(EVENTOS_CATALOGO.PURGA, { ids, motivo: 'retencion' });
      return ids.length;
    },

    /**
     * Sismos visibles que cumplen el filtro, por `tiempo` descendente, como máximo `limite`.
     * Aplica la regla de la lista de `src/shared/reglas.js`: magnitud cruda ≥ `magMin` y algún
     * país pedido entre los `paisesCandidatos` (HU-03, R-02). Usa el índice por tiempo: solo
     * recorre los sismos posteriores a `desde`, sin ordenar en cada petición (P-04).
     * @param {object} filtro
     * @param {ReadonlyArray<CodigoPais>} filtro.paises
     * @param {number | null} filtro.magMin `null` = todas
     * @param {number} filtro.desde ms
     * @param {number} [filtro.limite]
     * @returns {{ sismos: Sismo[], total: number, truncado: boolean }} `total` cuenta todos los
     *   que cumplen el filtro, aunque se trunque la lista
     */
    listar({ paises, magMin, desde, limite = MAX_RESPUESTA }) {
      const idx = indiceOrdenado();
      /** @type {Sismo[]} */
      const sismos = [];
      let total = 0;
      for (let i = idx.length - 1, primera = primeraDesde(idx, desde); i >= primera; i -= 1) {
        const s = idx[i].sismo;
        if (s === null || !cumpleMagMin(s.magnitud, magMin) || !algunPaisMarcado(s, paises)) {
          continue;
        }
        total += 1;
        if (sismos.length < limite) sismos.push(s);
      }
      return { sismos, total, truncado: total > limite };
    },

    /** @param {string} id @returns {Sismo | null} el sismo visible, o `null` */
    obtener(id) {
      return entradas.get(id)?.sismo ?? null;
    },

    /**
     * ¿Hay algún sismo (con o sin país) asociado a este id de fuente? El WebSocket de EMSC lo
     * usa para no descartar la revisión de un sismo conocido que se mueve fuera de las zonas.
     * @param {'emsc' | 'usgs'} fuente
     * @param {string} idFuente
     * @returns {boolean}
     */
    conoce(fuente, idFuente) {
      return porFuente.has(`${fuente}:${idFuente}`);
    },

    /** Sismos en memoria, con y sin país. */
    contar() {
      return entradas.size;
    },

    /** Sismos con país (los que se sirven). */
    contarVisibles() {
      let n = 0;
      for (const e of entradas.values()) if (e.sismo !== null) n += 1;
      return n;
    },

    /**
     * Suscripción a los eventos internos (ver la cabecera del módulo).
     * @param {'alta' | 'actualizacion' | 'baja' | 'purga'} evento
     * @param {(carga: any) => void} oyente
     * @returns {() => void} cancela la suscripción
     */
    on(evento, oyente) {
      emisor.on(evento, oyente);
      return () => emisor.off(evento, oyente);
    },
  });
}
