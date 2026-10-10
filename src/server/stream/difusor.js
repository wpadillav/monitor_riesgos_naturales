/**
 * Difusor SSE (ADR-0002; arquitectura §4 y §5.7; contrato `GET /api/stream`; amenazas AM-13,
 * AM-14, AM-15 y AM-17).
 *
 * - Se suscribe a los eventos del catálogo (`alta`, `actualizacion`, `baja`; `purga` no se
 *   difunde) y a los cambios de estado de las fuentes.
 * - **Lotes de 250 ms:** los cambios se acumulan y se fusionan por sismo (el primero aporta el
 *   «antes» y el último el «después»). Al vaciar el lote, cada cambio recibe un id
 *   `<arranque>-<secuencia>`, se calcula `notificable` y se guarda en el **historial**
 *   (2 000 eventos o 15 min).
 * - **Filtro por cliente:** cada conexión lleva sus `paises`, `magMin`, `periodo` y `avisoMin`.
 *   Un cambio se traduce en `sismo.nuevo`, `sismo.actualizado` o `sismo.eliminado` según si el
 *   sismo cumplía el filtro antes y lo cumple después (arquitectura §5.7).
 * - **Reanudación:** con `Last-Event-ID` (o `ultimoId`) se reenvía lo posterior que cumpla el
 *   filtro; si el id es de otro arranque, está mal formado o ya no está en el historial, se
 *   envía `flujo.reiniciar`.
 * - **Mantenimiento:** `retry: 3000` al conectar, `: ping` cada 20 s, como máximo 8 clientes y
 *   desconexión del cliente que acumula más de 1 MiB sin leer.
 * - **Formato seguro (AM-15):** `id` y `event` son internos; `data` es `JSON.stringify` en una
 *   sola línea.
 */

import { AVISO_VENTANA_MIN_POR_DEFECTO, alcanzaAviso, esNotificable } from '../dominio/aviso.js';
import { EVENTOS_CATALOGO, calcularCambios } from '../dominio/catalogo.js';
import { PERIODOS_MS } from '../dominio/consulta-sismos.js';

export const RETRY_MS = 3000;
export const LOTE_MS = 250;
export const HEARTBEAT_MS = 20_000;
export const HISTORIAL_MAX = 2000;
export const HISTORIAL_MS = 15 * 60_000;
export const MAX_PENDIENTE_BYTES = 1024 * 1024;
export const MAX_CLIENTES = 8;

/** Id de evento del contrato (`IdEvento`). Como máximo 32 caracteres. */
export const PATRON_ID_EVENTO = /^([0-9a-z]{1,16})-([0-9]{1,15})$/;

/** Tipos de evento (lista cerrada del contrato `Evento.tipo`). */
export const TIPOS_EVENTO = Object.freeze({
  NUEVO: 'sismo.nuevo',
  ACTUALIZADO: 'sismo.actualizado',
  ELIMINADO: 'sismo.eliminado',
  ESTADO: 'estado.fuente',
  REINICIAR: 'flujo.reiniciar',
});

/**
 * @typedef {import('../../shared/modelo.js').Sismo} Sismo
 * @typedef {import('../../shared/modelo.js').CodigoPais} CodigoPais
 * @typedef {import('../http/rutas-salud.js').EstadoFuente} EstadoFuente
 *
 * @typedef {object} FiltroCliente
 * @property {ReadonlyArray<CodigoPais>} paises
 * @property {number | null} magMin `null` = todas
 * @property {keyof typeof PERIODOS_MS} periodo
 * @property {number | null} avisoMin `null` = sin avisos
 *
 * @typedef {object} CambioSismo
 * @property {string} idSismo
 * @property {Sismo | null} anterior lo que veían los clientes antes del lote
 * @property {Sismo | null} actual `null` si es una baja
 * @property {string | null} motivo de la baja
 * @property {string | null} reemplazadoPor
 *
 * @typedef {object} Entrada evento del historial
 * @property {number} seq
 * @property {string} id
 * @property {number} ocurridoEn ms
 * @property {(CambioSismo & { notificable: boolean, cambios: string[],
 *   paisesAnterior: ReadonlyArray<CodigoPais>, paisesActual: ReadonlyArray<CodigoPais> }) | null}
 *   sismo
 * @property {EstadoFuente | null} estado
 * @property {Map<string, string>} cache mensajes ya serializados por tipo
 */

/**
 * ¿Cumple el sismo el filtro del cliente? (arquitectura §5.7, contrato: país marcado y además
 * lista —magnitud y periodo— o aviso —magnitud redondeada ≥ `avisoMin`—).
 * @param {Sismo} sismo
 * @param {ReadonlyArray<CodigoPais>} paisesSismo país asignado y candidatos (frontera CO-PA)
 * @param {FiltroCliente} filtro
 * @param {number} ahora ms
 * @returns {boolean}
 */
export function cumpleFiltro(sismo, paisesSismo, filtro, ahora) {
  if (!paisesSismo.some((p) => filtro.paises.includes(p))) return false;
  const enLista =
    (filtro.magMin === null || sismo.magnitud >= filtro.magMin) &&
    Date.parse(sismo.tiempo) >= ahora - PERIODOS_MS[filtro.periodo];
  return enLista || alcanzaAviso(sismo.magnitud, filtro.avisoMin);
}

/**
 * Un mensaje SSE. `id` y `tipo` son internos; `datos` se serializa con `JSON.stringify`, que
 * escapa los saltos de línea (AM-15).
 * @param {string} id
 * @param {string} tipo
 * @param {string} json
 */
export function formatearMensaje(id, tipo, json) {
  return `id: ${id}\nevent: ${tipo}\ndata: ${json}\n\n`;
}

/**
 * @param {string} tipo
 * @param {number} ocurridoEn
 * @param {object} datos
 */
function sobre(tipo, ocurridoEn, datos) {
  return JSON.stringify({
    tipo,
    version: 1,
    ocurridoEn: new Date(ocurridoEn).toISOString(),
    datos,
  });
}

/**
 * @param {object} deps
 * @param {Pick<ReturnType<typeof import('../dominio/catalogo.js').createCatalogo>, 'on'>} deps.catalogo
 * @param {Pick<ReturnType<typeof import('../fuentes/estado-fuentes.js').createEstadoFuentes>,
 *   'alCambiar' | 'obtener'>} deps.estadoFuentes
 * @param {import('../infra/reloj.js').Reloj} deps.reloj
 * @param {import('../infra/log.js').Log} deps.log
 * @param {number} deps.arrancadoEn ms: prefijo de los ids (base 36)
 * @param {number} [deps.ventanaAvisoMin] `AVISO_VENTANA_MIN`
 * @param {number} [deps.maxClientes] `SSE_MAX_CLIENTES`
 * @param {(sismo: Sismo) => ReadonlyArray<CodigoPais>} [deps.paisesDe] país y candidatos
 * @param {() => boolean} [deps.enCargaInicial] mientras sea `true`, nada es notificable
 * @param {number} [deps.maxPendienteBytes]
 * @param {number} [deps.historialMax]
 * @param {number} [deps.historialMs]
 */
export function createDifusor({
  catalogo,
  estadoFuentes,
  reloj,
  log,
  arrancadoEn,
  ventanaAvisoMin = AVISO_VENTANA_MIN_POR_DEFECTO,
  maxClientes = MAX_CLIENTES,
  paisesDe = (s) => [s.pais],
  enCargaInicial = () => false,
  maxPendienteBytes = MAX_PENDIENTE_BYTES,
  historialMax = HISTORIAL_MAX,
  historialMs = HISTORIAL_MS,
}) {
  const prefijo = Math.trunc(arrancadoEn).toString(36);
  const encoder = new TextEncoder();
  let seq = 0;
  let cerrado = false;
  let contador = 0;

  /** @type {Entrada[]} */
  const historial = [];
  /** Cambios del lote en curso, en orden (el último cambio de una clave va al final). */
  /** @type {Map<string, { clase: 'sismo', cambio: CambioSismo } | { clase: 'estado', estado: EstadoFuente }>} */
  const pendientes = new Map();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tLote = null;

  /**
   * @typedef {object} Cliente
   * @property {number} n
   * @property {FiltroCliente} filtro
   * @property {ReadableStreamDefaultController<Uint8Array>} controller
   * @property {boolean} cerrado
   * @property {number} toleranciaBytes exceso admitido por el reenvío inicial
   */
  /** @type {Set<Cliente>} */
  const clientes = new Set();

  const idDe = (/** @type {number} */ n) => `${prefijo}-${n}`;

  // ---------------------------------------------------------------------------------------
  // Entrada: catálogo y estados

  /**
   * @param {string} idSismo
   * @param {Sismo | null} anterior
   * @param {Sismo | null} actual
   * @param {string | null} motivo
   * @param {string | null} reemplazadoPor
   */
  function encolarSismo(idSismo, anterior, actual, motivo, reemplazadoPor) {
    const clave = `s:${idSismo}`;
    const previo = pendientes.get(clave);
    pendientes.delete(clave);
    const antes = previo && previo.clase === 'sismo' ? previo.cambio.anterior : anterior;
    // Alta y baja en el mismo lote: ningún cliente llegó a verlo.
    if (antes === null && actual === null) return;
    pendientes.set(clave, {
      clase: 'sismo',
      cambio: { idSismo, anterior: antes, actual, motivo, reemplazadoPor },
    });
    programarLote();
  }

  const desuscribir = [
    catalogo.on(EVENTOS_CATALOGO.ALTA, ({ sismo }) =>
      encolarSismo(sismo.id, null, sismo, null, null),
    ),
    catalogo.on(EVENTOS_CATALOGO.ACTUALIZACION, ({ sismo, anterior }) =>
      encolarSismo(sismo.id, anterior, sismo, null, null),
    ),
    catalogo.on(EVENTOS_CATALOGO.BAJA, ({ id, motivo, reemplazadoPor, anterior }) =>
      encolarSismo(id, anterior, null, motivo, reemplazadoPor ?? null),
    ),
    estadoFuentes.alCambiar((estado) => {
      const clave = `f:${estado.fuente}`;
      pendientes.delete(clave);
      pendientes.set(clave, { clase: 'estado', estado });
      programarLote();
    }),
  ];

  function programarLote() {
    if (tLote === null && !cerrado) tLote = setTimeout(vaciarLote, LOTE_MS);
  }

  // ---------------------------------------------------------------------------------------
  // Lote → historial → clientes

  function vaciarLote() {
    tLote = null;
    if (pendientes.size === 0) return;
    const ahora = reloj.ahora();
    const cargaInicial = enCargaInicial();
    /** @type {Entrada[]} */
    const nuevas = [];
    for (const p of pendientes.values()) {
      seq += 1;
      /** @type {Entrada} */
      const entrada = {
        seq,
        id: idDe(seq),
        ocurridoEn: ahora,
        sismo: null,
        estado: null,
        cache: new Map(),
      };
      if (p.clase === 'estado') {
        entrada.estado = p.estado;
      } else {
        const c = p.cambio;
        entrada.sismo = {
          ...c,
          // ADR-0004: se calcula al emitir; los reenvíos conservan el valor original.
          notificable:
            c.actual !== null && !cargaInicial && esNotificable(c.actual, ahora, ventanaAvisoMin),
          cambios: c.anterior && c.actual ? calcularCambios(c.anterior, c.actual) : [],
          paisesAnterior: c.anterior ? paisesDe(c.anterior) : [],
          paisesActual: c.actual ? paisesDe(c.actual) : [],
        };
      }
      historial.push(entrada);
      nuevas.push(entrada);
    }
    pendientes.clear();
    recortarHistorial(ahora);
    for (const cliente of [...clientes]) {
      let texto = '';
      for (const e of nuevas) texto += mensajePara(e, cliente.filtro, ahora);
      enviar(cliente, texto);
    }
  }

  /** @param {number} ahora */
  function recortarHistorial(ahora) {
    let quitar = Math.max(0, historial.length - historialMax);
    while (quitar < historial.length && historial[quitar].ocurridoEn < ahora - historialMs) {
      quitar += 1;
    }
    if (quitar > 0) historial.splice(0, quitar);
  }

  /**
   * Mensaje SSE de una entrada para un filtro, o `''` si no le corresponde nada.
   * @param {Entrada} e
   * @param {FiltroCliente} filtro
   * @param {number} ahora
   * @returns {string}
   */
  function mensajePara(e, filtro, ahora) {
    if (e.estado) return cacheado(e, TIPOS_EVENTO.ESTADO, () => e.estado);
    const s = /** @type {NonNullable<Entrada['sismo']>} */ (e.sismo);
    const antes = s.anterior !== null && cumpleFiltro(s.anterior, s.paisesAnterior, filtro, ahora);
    if (s.actual === null) {
      // Baja: se avisa a quien pudo tenerlo (país marcado), aunque ya no cumpla la magnitud o
      // el periodo. Quitar algo que no se tiene es inocuo; con `fusionado` la página traslada
      // el «ya notificado» a `reemplazadoPor`.
      if (!s.paisesAnterior.some((p) => filtro.paises.includes(p))) return '';
      return cacheado(e, TIPOS_EVENTO.ELIMINADO, () => ({
        id: s.idSismo,
        motivo: s.motivo ?? 'retirado',
        reemplazadoPor: s.reemplazadoPor,
      }));
    }
    const despues = cumpleFiltro(s.actual, s.paisesActual, filtro, ahora);
    if (despues && antes) {
      return cacheado(e, TIPOS_EVENTO.ACTUALIZADO, () => ({
        sismo: s.actual,
        notificable: s.notificable,
        cambios: s.cambios,
      }));
    }
    if (despues) {
      return cacheado(e, TIPOS_EVENTO.NUEVO, () => ({
        sismo: s.actual,
        notificable: s.notificable,
        cambios: s.cambios,
      }));
    }
    if (antes) {
      return cacheado(e, `${TIPOS_EVENTO.ELIMINADO}|filtro`, () => ({
        id: s.idSismo,
        motivo: 'fuera-de-filtro',
        reemplazadoPor: null,
      }));
    }
    return '';
  }

  /**
   * @param {Entrada} e
   * @param {string} clave tipo de evento (con sufijo `|…` para variantes)
   * @param {() => object | null} datos
   */
  function cacheado(e, clave, datos) {
    let texto = e.cache.get(clave);
    if (texto === undefined) {
      const tipo = clave.split('|')[0];
      texto = formatearMensaje(e.id, tipo, sobre(tipo, e.ocurridoEn, datos() ?? {}));
      e.cache.set(clave, texto);
    }
    return texto;
  }

  // ---------------------------------------------------------------------------------------
  // Clientes

  /**
   * @param {Cliente} cliente
   * @param {string} texto
   * @returns {number} bytes encolados
   */
  function enviar(cliente, texto) {
    if (cliente.cerrado || texto === '') return 0;
    const bytes = encoder.encode(texto);
    try {
      cliente.controller.enqueue(bytes);
    } catch {
      quitar(cliente, 'error');
      return 0;
    }
    // El reenvío inicial (hasta 2 000 eventos) puede superar 1 MiB por sí solo: se tolera ese
    // exceso, pero no que crezca lo pendiente después.
    const libre = cliente.controller.desiredSize;
    if (libre !== null && libre < -cliente.toleranciaBytes) {
      // AM-13: más de 1 MiB pendiente → se desconecta y se libera la memoria.
      log.warn('sse.cliente-lento', { maxBytes: maxPendienteBytes, clientes: clientes.size - 1 });
      quitar(cliente, 'lento', new Error('Cliente SSE lento'));
    }
    return bytes.byteLength;
  }

  /**
   * @param {Cliente} cliente
   * @param {string} motivo
   * @param {Error} [error] con error se descarta lo pendiente; sin él, se cierra tras enviarlo
   */
  function quitar(cliente, motivo, error) {
    if (cliente.cerrado) return;
    cliente.cerrado = true;
    clientes.delete(cliente);
    try {
      if (error) cliente.controller.error(error);
      else cliente.controller.close();
    } catch {
      // El consumidor ya canceló el flujo.
    }
    log.debug('sse.desconexion', { cliente: cliente.n, motivo, clientes: clientes.size });
  }

  /**
   * Decide cómo reanudar a partir del id que trae el cliente.
   * @param {string | null | undefined} ultimoId
   * @returns {{ tipo: 'nada' } | { tipo: 'reenviar', desde: number } |
   *   { tipo: 'reiniciar', motivo: 'arranque-distinto' | 'historial-insuficiente' }}
   */
  function planReanudacion(ultimoId) {
    if (ultimoId === null || ultimoId === undefined || ultimoId === '') return { tipo: 'nada' };
    // AM-14: longitud y forma acotadas antes de mirar nada más; nunca lanza.
    const m = ultimoId.length <= 32 ? PATRON_ID_EVENTO.exec(ultimoId) : null;
    if (!m || m[1] !== prefijo) return { tipo: 'reiniciar', motivo: 'arranque-distinto' };
    const n = Number(m[2]);
    if (n > seq) return { tipo: 'reiniciar', motivo: 'historial-insuficiente' };
    if (n === seq) return { tipo: 'nada' };
    recortarHistorial(reloj.ahora());
    const primero = historial.length > 0 ? historial[0].seq : seq + 1;
    if (n + 1 < primero) return { tipo: 'reiniciar', motivo: 'historial-insuficiente' };
    return { tipo: 'reenviar', desde: n };
  }

  const heartbeat = setInterval(() => {
    recortarHistorial(reloj.ahora());
    for (const cliente of [...clientes]) enviar(cliente, ': ping\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  return Object.freeze({
    /**
     * Abre una conexión. Devuelve `null` si no quedan plazas (AM-13) o el difusor está cerrado.
     * @param {object} opciones
     * @param {FiltroCliente} opciones.filtro ya validado en la frontera
     * @param {string | null} [opciones.ultimoId] `Last-Event-ID` o `ultimoId`
     * @returns {{ cuerpo: ReadableStream<Uint8Array>, cerrar: () => void } | null}
     */
    conectar({ filtro, ultimoId = null }) {
      if (cerrado || clientes.size >= maxClientes) return null;
      contador += 1;
      /** @type {Cliente} */
      const cliente = /** @type {any} */ ({
        n: contador,
        filtro,
        cerrado: false,
        toleranciaBytes: Number.POSITIVE_INFINITY,
      });
      const cuerpo = new ReadableStream(
        {
          start(controller) {
            cliente.controller = controller;
          },
          cancel() {
            quitar(cliente, 'desconexion');
          },
        },
        new ByteLengthQueuingStrategy({ highWaterMark: maxPendienteBytes }),
      );
      clientes.add(cliente);

      const ahora = reloj.ahora();
      const plan = planReanudacion(ultimoId);
      let texto = `retry: ${RETRY_MS}\n\n`;
      if (plan.tipo === 'reiniciar') {
        texto += formatearMensaje(
          idDe(seq),
          TIPOS_EVENTO.REINICIAR,
          sobre(TIPOS_EVENTO.REINICIAR, ahora, { motivo: plan.motivo }),
        );
      } else if (plan.tipo === 'reenviar') {
        for (const e of historial) if (e.seq > plan.desde) texto += mensajePara(e, filtro, ahora);
      }
      // Al conectar, un `estado.fuente` por fuente con el id del último evento: tras él, el
      // cliente está al día (lo pendiente del lote llegará con ids mayores).
      for (const estado of estadoFuentes.obtener()) {
        texto += formatearMensaje(
          idDe(seq),
          TIPOS_EVENTO.ESTADO,
          sobre(TIPOS_EVENTO.ESTADO, ahora, estado),
        );
      }
      log.info('sse.conexion', {
        cliente: cliente.n,
        clientes: clientes.size,
        reanudacion: plan.tipo,
      });
      cliente.toleranciaBytes = Math.max(0, enviar(cliente, texto) - maxPendienteBytes);
      return { cuerpo, cerrar: () => quitar(cliente, 'desconexion') };
    },

    /** Id del último evento emitido (`ultimoEventoId` de `GET /api/sismos`). */
    ultimoId() {
      return idDe(seq);
    },

    contarClientes() {
      return clientes.size;
    },

    /** Vacía el lote en curso ya (pruebas y apagado). */
    vaciar() {
      if (tLote) clearTimeout(tLote);
      vaciarLote();
    },

    /** Apagado ordenado: envía lo pendiente, cierra las conexiones y se desuscribe. */
    cerrar() {
      if (cerrado) return;
      if (tLote) clearTimeout(tLote);
      vaciarLote();
      cerrado = true;
      clearInterval(heartbeat);
      for (const quitarSuscripcion of desuscribir) quitarSuscripcion();
      for (const cliente of [...clientes]) quitar(cliente, 'apagado');
    },
  });
}
