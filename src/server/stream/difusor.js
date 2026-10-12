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
 * - **Mantenimiento:** `retry: 3000` al conectar, un evento `latido` cada 20 s (visible para
 *   `EventSource`, a diferencia de un comentario: así la página sabe que la conexión sigue viva
 *   y no la reabre en reposo), como máximo 8 clientes y desconexión del cliente que acumula más
 *   de 1 MiB sin leer. El `latido` no consume secuencia: lleva el id del último evento emitido,
 *   como el `estado.fuente` inicial.
 * - **Formato seguro (AM-15):** `id` y `event` son internos; `data` es `JSON.stringify` en una
 *   sola línea.
 */

import {
  MAX_ID_EVENTO,
  PATRON_ID_EVENTO,
  algunPaisMarcado,
  cumpleFiltroStream,
} from '../../shared/reglas.js';
import { AVISO_VENTANA_MIN_POR_DEFECTO, esNotificable } from '../dominio/aviso.js';
import { EVENTOS_CATALOGO, calcularCambios } from '../dominio/catalogo.js';

export const RETRY_MS = 3000;
export const LOTE_MS = 250;
export const HEARTBEAT_MS = 20_000;
export const HISTORIAL_MAX = 2000;
export const HISTORIAL_MS = 15 * 60_000;
export const MAX_PENDIENTE_BYTES = 1024 * 1024;
export const MAX_CLIENTES = 8;

/** Tipos de evento (lista cerrada del contrato `Evento.tipo`). */
export const TIPOS_EVENTO = Object.freeze({
  NUEVO: 'sismo.nuevo',
  ACTUALIZADO: 'sismo.actualizado',
  ELIMINADO: 'sismo.eliminado',
  ESTADO: 'estado.fuente',
  REINICIAR: 'flujo.reiniciar',
  LATIDO: 'latido',
});

/**
 * @typedef {import('../../shared/modelo.js').Sismo} Sismo
 * @typedef {import('../../shared/modelo.js').CodigoPais} CodigoPais
 * @typedef {import('../http/rutas-salud.js').EstadoFuente} EstadoFuente
 *
 * @typedef {object} FiltroCliente
 * @property {ReadonlyArray<CodigoPais>} paises
 * @property {number | null} magMin `null` = todas
 * @property {import('../../shared/reglas.js').Periodo} periodo
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
 * @property {(CambioSismo & { notificable: boolean, cambios: string[] }) | null} sismo
 * @property {EstadoFuente | null} estado
 * @property {Map<string, string>} cache mensajes ya serializados por tipo
 */

/**
 * ¿Cumple el sismo el filtro del cliente? (arquitectura §5.7, contrato: algún país marcado entre
 * los `paisesCandidatos` y además lista —magnitud cruda y periodo— o aviso —magnitud redondeada
 * ≥ `avisoMin`—). Es `cumpleFiltroStream` de `src/shared/reglas.js` (R-01, R-02, R-11).
 * @param {Sismo} sismo
 * @param {FiltroCliente} filtro
 * @param {number} ahora ms
 * @returns {boolean}
 */
export function cumpleFiltro(sismo, filtro, ahora) {
  return cumpleFiltroStream(sismo, filtro, ahora);
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

  /** @param {unknown} err */
  const mensajeError = (err) => (err instanceof Error ? err.message : String(err));

  /**
   * Vacía el lote: historial y envío a cada cliente. Nunca lanza (R-04): un cambio que no se
   * puede preparar se descarta con un log y un cliente que falla se desconecta, sin afectar al
   * resto ni llegar a `uncaughtException` desde el temporizador.
   */
  function vaciarLote() {
    tLote = null;
    if (pendientes.size === 0) return;
    try {
      const ahora = reloj.ahora();
      const cargaInicial = enCargaInicial();
      const lote = [...pendientes.values()];
      pendientes.clear();
      /** @type {Entrada[]} */
      const nuevas = [];
      for (const p of lote) {
        try {
          nuevas.push(prepararEntrada(p, ahora, cargaInicial));
        } catch (err) {
          log.error('error', { mensaje: `Difusor, lote: ${mensajeError(err)}` });
        }
      }
      for (const entrada of nuevas) historial.push(entrada);
      recortarHistorial(ahora);
      for (const cliente of [...clientes]) {
        try {
          let texto = '';
          for (const e of nuevas) texto += mensajePara(e, cliente.filtro, ahora);
          enviar(cliente, texto);
        } catch (err) {
          log.error('error', { mensaje: `Difusor, envío: ${mensajeError(err)}` });
          quitar(cliente, 'error', err instanceof Error ? err : new Error(String(err)));
        }
      }
    } catch (err) {
      log.error('error', { mensaje: `Difusor: ${mensajeError(err)}` });
    }
  }

  /**
   * @param {{ clase: 'sismo', cambio: CambioSismo } | { clase: 'estado', estado: EstadoFuente }} p
   * @param {number} ahora
   * @param {boolean} cargaInicial
   * @returns {Entrada}
   */
  function prepararEntrada(p, ahora, cargaInicial) {
    /** @type {Entrada} */
    const entrada = {
      seq: seq + 1,
      id: idDe(seq + 1),
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
      };
    }
    // La secuencia solo avanza si la entrada se ha podido preparar.
    seq += 1;
    return entrada;
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
    const antes = s.anterior !== null && cumpleFiltro(s.anterior, filtro, ahora);
    if (s.actual === null) {
      // Baja: se avisa a quien pudo tenerlo (país marcado), aunque ya no cumpla la magnitud o
      // el periodo. Quitar algo que no se tiene es inocuo; con `fusionado` la página traslada
      // el «ya notificado» a `reemplazadoPor`.
      if (s.anterior === null || !algunPaisMarcado(s.anterior, filtro.paises)) return '';
      return cacheado(e, TIPOS_EVENTO.ELIMINADO, () => ({
        id: s.idSismo,
        motivo: s.motivo ?? 'retirado',
        reemplazadoPor: s.reemplazadoPor,
      }));
    }
    const despues = cumpleFiltro(s.actual, filtro, ahora);
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
    // R-13: la tolerancia del reenvío inicial se reduce a medida que el cliente lee. Nunca
    // vuelve a crecer: en cuanto lo pendiente baja de 1 MiB, el límite normal vuelve a regir.
    // (Durante el envío inicial la tolerancia es infinita: la fija `conectar` con lo enviado.)
    const previo = cliente.controller.desiredSize;
    if (previo !== null && Number.isFinite(cliente.toleranciaBytes)) {
      cliente.toleranciaBytes = Math.min(cliente.toleranciaBytes, Math.max(0, -previo));
    }
    const bytes = encoder.encode(texto);
    try {
      cliente.controller.enqueue(bytes);
    } catch {
      quitar(cliente, 'error');
      return 0;
    }
    // El reenvío inicial (hasta 2 000 eventos) puede superar 1 MiB por sí solo: se tolera ese
    // exceso mientras se vacía, pero no que crezca lo pendiente después.
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
    const m = ultimoId.length <= MAX_ID_EVENTO ? PATRON_ID_EVENTO.exec(ultimoId) : null;
    if (!m || m[1] !== prefijo) return { tipo: 'reiniciar', motivo: 'arranque-distinto' };
    const n = Number(m[2]);
    if (n > seq) return { tipo: 'reiniciar', motivo: 'historial-insuficiente' };
    if (n === seq) return { tipo: 'nada' };
    recortarHistorial(reloj.ahora());
    const primero = historial.length > 0 ? historial[0].seq : seq + 1;
    if (n + 1 < primero) return { tipo: 'reiniciar', motivo: 'historial-insuficiente' };
    return { tipo: 'reenviar', desde: n };
  }

  /** Latido: nunca lanza (R-04), para no llegar a `uncaughtException` desde el intervalo. */
  function latir() {
    try {
      const ahora = reloj.ahora();
      recortarHistorial(ahora);
      if (clientes.size === 0) return;
      // Mismo texto para todos: sin datos del cliente ni de las fuentes (AM-15).
      const latido = formatearMensaje(
        idDe(seq),
        TIPOS_EVENTO.LATIDO,
        sobre(TIPOS_EVENTO.LATIDO, ahora, {}),
      );
      for (const cliente of [...clientes]) enviar(cliente, latido);
    } catch (err) {
      log.error('error', { mensaje: `Difusor, latido: ${mensajeError(err)}` });
    }
  }
  const heartbeat = setInterval(latir, HEARTBEAT_MS);
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

    /** ¿Admitiría ahora una conexión más? (`HEAD /api/stream`, sin ocupar plaza). */
    hayPlaza() {
      return !cerrado && clientes.size < maxClientes;
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
