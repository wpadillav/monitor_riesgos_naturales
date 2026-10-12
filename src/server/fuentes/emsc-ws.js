/**
 * Cliente del WebSocket de EMSC (ADR-0002; arquitectura §4, §5.2, §5.3 y §7; amenazas AM-03,
 * AM-05, AM-06 y AM-17).
 *
 * - **Conexión** con `ws` a `wss://…/standing_order/websocket`: TLS verificado, sin seguir
 *   redirecciones, `maxPayload` de 64 KiB (un frame mayor cierra la conexión sin parsearse) y
 *   tiempo límite del *handshake*.
 * - **Vigilancia:** *ping* cada 15 s; sin *pong* en 10 s → `terminate()` y reconexión.
 * - **Reconexión** con espera creciente: 1 s, 2 s, 4 s… hasta 60 s, con ±20 % de *jitter*
 *   (nunca por encima de 60 s, RNF-06). La espera vuelve a 1 s tras 60 s de conexión estable.
 * - **Estado** del canal `emsc-ws`: `open` → `ok`; cierre → `degradada`; sin reconectar en 30 s
 *   → `caida` (arquitectura §5.3). Un fallo de `ingerirLote` también lo deja en `degradada`
 *   hasta la siguiente ingesta buena (N-07). Se ve en `/api/salud` y llega a la página por `estado.fuente`.
 * - **Ingesta por lotes:** cada frame se mide antes de parsear (≤ 64 KiB) y entra en una cola
 *   acotada a 1 000 mensajes. La cola se vacía en el siguiente turno del bucle de eventos: se
 *   parsea con `try/catch`, se normaliza con `normalizarFeatureEmsc`, se descarta lo que cae
 *   fuera de los rectángulos de las zonas y el resto entra en el catálogo con `ingerirLote`.
 *   Si la cola se desborda, se descarta lo que sobra y se pide una resincronización por FDSN
 *   (`updatedafter`), que recupera lo perdido (AM-17).
 * - **Acciones:** `create` y `update` siguen el mismo camino (el catálogo decide por id y
 *   `lastupdate`); `delete` y las reclasificaciones (`evtype` no sísmico) retiran el registro.
 * - **Latencia** por sismo (RNF-15): línea `sismo.recibido` con `canal: 'ws'` y muestra en las
 *   métricas horarias.
 *
 * Los huecos mientras el WebSocket está caído los cubre la consulta FDSN cada 30 s: al
 * reconectar no se hace nada especial (ADR-0002).
 */

import WebSocket from 'ws';

import { enRectangulo } from '../../shared/pais.js';
import { idValido, propia } from './normalizar-comun.js';
import { normalizarFeatureEmsc } from './normalizar-emsc.js';
import { createLimitadorDescartes } from './planificador.js';

/** URL fija (AM-06): solo `wss:`. No es configuración. */
export const URL_EMSC_WS = 'wss://www.seismicportal.eu/standing_order/websocket';

/** Canal operativo (contrato `IdFuenteOperativa`). */
export const CANAL_EMSC_WS = 'emsc-ws';

/** Tamaño máximo de un frame (AM-17): los reales ocupan menos de 1 KiB. */
export const MAX_FRAME_BYTES = 64 * 1024;

/** Mensajes como máximo en la cola de entrada (AM-17). */
export const MAX_COLA = 1000;

export const PING_MS = 15_000;
export const PONG_TIMEOUT_MS = 10_000;
export const HANDSHAKE_TIMEOUT_MS = 10_000;
export const ESPERA_BASE_MS = 1000;
export const ESPERA_MAX_MS = 60_000;
export const JITTER = 0.2;
/** Conexión estable: a partir de aquí la espera vuelve a 1 s. */
export const ESTABLE_MS = 60_000;
/** Sin reconectar durante este tiempo, el canal pasa a `caida`. */
export const CAIDA_MS = 30_000;

/** Motivos de descarte que son normales (el WebSocket emite todo el mundo): solo en `debug`. */
const DESCARTES_NORMALES = Object.freeze(['fuera-de-zonas']);

const MENSAJE_CERRADA = 'Conexión cerrada; reintentando';
const MENSAJE_CAIDA = 'Sin conexión con el WebSocket de EMSC';
/** N-07: la ingesta falló; el catálogo lo repara la siguiente consulta FDSN (arquitectura §7). */
export const MENSAJE_INGESTA_FALLIDA =
  'Error al guardar sismos del tiempo real; la consulta periódica los recupera';

/**
 * Espera antes del intento `intento` (0 = primer reintento): 1 s · 2^intento, como máximo 60 s,
 * con ±20 % de *jitter* y sin pasar nunca de 60 s.
 * @param {number} intento entero ≥ 0
 * @param {() => number} [aleatorio] en [0, 1)
 * @returns {number} ms
 */
export function calcularEspera(intento, aleatorio = Math.random) {
  const base = Math.min(ESPERA_MAX_MS, ESPERA_BASE_MS * 2 ** Math.min(intento, 16));
  const factor = 1 + (aleatorio() * 2 - 1) * JITTER;
  return Math.min(ESPERA_MAX_MS, Math.max(0, Math.round(base * factor)));
}

/**
 * @typedef {import('../../shared/modelo.js').RegistroFuente} RegistroFuente
 *
 * @typedef {{ tipo: 'registro', accion: 'create' | 'update', registro: Readonly<RegistroFuente> }
 *   | { tipo: 'retiro', accion: string, idFuente: string }
 *   | { tipo: 'descarte', motivo: string }} MensajeInterpretado
 */

/**
 * Interpreta un frame del WebSocket. Función pura salvo por `ahora`. Mide el tamaño **antes**
 * de parsear y nunca lanza (AM-03, AM-17).
 * @param {Buffer | ArrayBuffer | Buffer[] | string} datos
 * @param {boolean} esBinario
 * @param {number} ahora ms
 * @returns {MensajeInterpretado}
 */
export function interpretarMensaje(datos, esBinario, ahora) {
  if (esBinario) return { tipo: 'descarte', motivo: 'binario' };
  const buffer = aBuffer(datos);
  if (buffer === null) return { tipo: 'descarte', motivo: 'entrada' };
  if (buffer.byteLength > MAX_FRAME_BYTES) return { tipo: 'descarte', motivo: 'tamano' };

  let mensaje;
  try {
    mensaje = JSON.parse(buffer.toString('utf8'));
  } catch {
    return { tipo: 'descarte', motivo: 'json' };
  }
  const accion = propia(mensaje, 'action');
  const data = propia(mensaje, 'data');

  if (accion === 'delete') {
    // Formato no observado en vivo (riesgo R6): se acepta el `unid` de las propiedades o el `id`.
    const id = idValido(propia(propia(data, 'properties'), 'unid')) ?? idValido(propia(data, 'id'));
    return id === null
      ? { tipo: 'descarte', motivo: 'id' }
      : { tipo: 'retiro', accion: 'delete', idFuente: id };
  }
  if (accion !== 'create' && accion !== 'update') return { tipo: 'descarte', motivo: 'accion' };

  const r = normalizarFeatureEmsc(data, ahora);
  if (r.ok) return { tipo: 'registro', accion, registro: r.registro };
  if (r.retirado) return { tipo: 'retiro', accion, idFuente: r.retirado };
  return { tipo: 'descarte', motivo: r.motivo };
}

/** @param {unknown} datos @returns {Buffer | null} */
function aBuffer(datos) {
  if (typeof datos === 'string') return Buffer.from(datos, 'utf8');
  if (Buffer.isBuffer(datos)) return datos;
  if (datos instanceof ArrayBuffer) return Buffer.from(datos);
  if (Array.isArray(datos) && datos.every((d) => Buffer.isBuffer(d))) return Buffer.concat(datos);
  return null;
}

/**
 * Socket mínimo que usa el cliente (el de `ws` o un doble en las pruebas).
 * @typedef {object} SocketEmsc
 * @property {(evento: string, oyente: (...args: any[]) => void) => unknown} on
 * @property {() => void} ping
 * @property {() => void} terminate
 * @property {(codigo?: number, motivo?: string) => void} close
 */

/**
 * @param {object} deps
 * @param {Pick<ReturnType<typeof import('../dominio/catalogo.js').createCatalogo>,
 *   'ingerirLote' | 'retirar' | 'conoce' | 'obtener'>} deps.catalogo
 * @param {Pick<ReturnType<typeof import('./estado-fuentes.js').createEstadoFuentes>,
 *   'registrarExito' | 'registrarEstado'>} deps.estado
 * @param {import('../infra/reloj.js').Reloj} deps.reloj
 * @param {import('../infra/log.js').Log} deps.log
 * @param {{ registrar: (m: import('../infra/metricas-latencia.js').MuestraLatencia) => void }}
 *   deps.metricas
 * @param {ReadonlyArray<{ id: string, rectangulo: import('./puerto.js').Rectangulo }>} deps.zonas
 * @param {string} [deps.url] solo las pruebas la cambian
 * @param {string} [deps.userAgent]
 * @param {(url: string, opciones: object) => SocketEmsc} [deps.crearSocket]
 * @param {() => number} [deps.aleatorio]
 * @param {() => void} [deps.alDesbordar] resincronización por FDSN (AM-17)
 */
export function createEmscWs({
  catalogo,
  estado,
  reloj,
  log,
  metricas,
  zonas,
  url = URL_EMSC_WS,
  userAgent,
  crearSocket = (destino, opciones) => new WebSocket(destino, opciones),
  aleatorio = Math.random,
  alDesbordar = () => {},
}) {
  let detenido = true;
  /** @type {SocketEmsc | null} */
  let socket = null;
  let intento = 0;
  let enCaida = false;
  let abierto = false;
  /** La última ingesta falló y el canal está en `degradada` por ello (N-07). */
  let ingestaFallida = false;
  let ultimoFallo = MENSAJE_CERRADA;

  /** @type {Array<{ datos: any, esBinario: boolean, llegada: number }>} */
  let cola = [];
  /** @type {ReturnType<typeof setImmediate> | null} */
  let drenaje = null;
  let desbordado = false;
  let perdidosEnRafaga = 0;
  const totales = { recibidos: 0, ingeridos: 0, perdidos: 0, descartados: 0, conexiones: 0 };

  /** @type {ReturnType<typeof setTimeout> | null} */
  let tReconexion = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tCaida = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tEstable = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tPong = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let tPing = null;

  const limitarDescartes = createLimitadorDescartes(log, reloj);

  /** @param {string} motivo */
  function contarDescarte(motivo) {
    totales.descartados += 1;
    if (DESCARTES_NORMALES.includes(motivo)) {
      log.debug('normalizacion.descarte', { fuente: 'emsc', canal: 'ws', motivo, cuenta: 1 });
      return;
    }
    limitarDescartes('emsc', motivo, 1);
  }

  function limpiarConexion() {
    if (tPing) clearInterval(tPing);
    if (tPong) clearTimeout(tPong);
    if (tEstable) clearTimeout(tEstable);
    tPing = null;
    tPong = null;
    tEstable = null;
  }

  // ---------------------------------------------------------------------------------------
  // Ciclo de vida de la conexión

  function conectar() {
    tReconexion = null;
    if (detenido) return;
    /** @type {SocketEmsc} */
    let ws;
    try {
      ws = crearSocket(url, {
        maxPayload: MAX_FRAME_BYTES,
        handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
        followRedirects: false,
        headers: userAgent ? { 'User-Agent': userAgent } : {},
      });
    } catch {
      ultimoFallo = 'No se pudo abrir la conexión';
      reprogramar(null);
      return;
    }
    socket = ws;
    ws.on('open', () => {
      if (ws === socket) alAbrir(ws);
    });
    ws.on('message', (datos, esBinario) => {
      if (ws === socket) alMensaje(datos, esBinario === true);
    });
    ws.on('pong', () => {
      if (ws !== socket) return;
      if (tPong) clearTimeout(tPong);
      tPong = null;
    });
    ws.on('error', (err) => {
      if (ws !== socket) return;
      // Nunca se registra el texto del servidor remoto: solo el código del error (AM-29).
      const codigo = /** @type {{ code?: unknown }} */ (err)?.code;
      if (codigo === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH') contarDescarte('tamano');
      ultimoFallo = 'Error de conexión; reintentando';
      log.debug('fuente.error', {
        fuente: CANAL_EMSC_WS,
        codigo: typeof codigo === 'string' ? codigo.slice(0, 40) : 'desconocido',
      });
    });
    ws.on('close', (codigo) => {
      if (ws !== socket) return;
      socket = null;
      reprogramar(typeof codigo === 'number' ? codigo : null);
    });
  }

  /** @param {SocketEmsc} ws */
  function alAbrir(ws) {
    totales.conexiones += 1;
    abierto = true;
    ingestaFallida = false;
    enCaida = false;
    ultimoFallo = MENSAJE_CERRADA;
    if (tCaida) clearTimeout(tCaida);
    tCaida = null;
    estado.registrarExito(CANAL_EMSC_WS);
    log.info('fuente.conectada', { fuente: CANAL_EMSC_WS, intento });

    tPing = setInterval(() => {
      if (tPong) return; // ya hay un ping sin respuesta: decide su temporizador
      // El temporizador va antes del ping: un pong inmediato lo cancela.
      tPong = setTimeout(() => {
        tPong = null;
        log.warn('fuente.sin-pong', { fuente: CANAL_EMSC_WS, esperaMs: PONG_TIMEOUT_MS });
        ws.terminate();
      }, PONG_TIMEOUT_MS);
      try {
        ws.ping();
      } catch {
        // El socket se está cerrando: el evento `close` reprograma.
      }
    }, PING_MS);
    tEstable = setTimeout(() => {
      tEstable = null;
      intento = 0;
    }, ESTABLE_MS);
  }

  /** @param {number | null} codigo código de cierre WebSocket, si lo hay */
  function reprogramar(codigo) {
    abierto = false;
    ingestaFallida = false;
    limpiarConexion();
    if (detenido) return;
    const esperaMs = calcularEspera(intento, aleatorio);
    intento += 1;
    const proximo = reloj.ahora() + esperaMs;
    estado.registrarEstado(
      CANAL_EMSC_WS,
      enCaida ? 'caida' : 'degradada',
      enCaida ? MENSAJE_CAIDA : ultimoFallo,
      proximo,
    );
    if (!enCaida && tCaida === null) {
      tCaida = setTimeout(() => {
        tCaida = null;
        enCaida = true;
        estado.registrarEstado(CANAL_EMSC_WS, 'caida', MENSAJE_CAIDA, null);
      }, CAIDA_MS);
    }
    log.info('fuente.reconexion', {
      fuente: CANAL_EMSC_WS,
      intento,
      esperaMs,
      codigo: codigo ?? undefined,
    });
    tReconexion = setTimeout(conectar, esperaMs);
  }

  // ---------------------------------------------------------------------------------------
  // Mensajes: cola acotada y lotes

  /** @param {any} datos @param {boolean} esBinario */
  function alMensaje(datos, esBinario) {
    totales.recibidos += 1;
    // AM-17: se mide antes de encolar y de parsear.
    const bytes =
      typeof datos === 'string'
        ? Buffer.byteLength(datos)
        : Array.isArray(datos)
          ? datos.reduce((n, d) => n + (d?.byteLength ?? 0), 0)
          : (datos?.byteLength ?? 0);
    if (bytes > MAX_FRAME_BYTES) {
      contarDescarte('tamano');
      return;
    }
    if (cola.length >= MAX_COLA) {
      totales.perdidos += 1;
      perdidosEnRafaga += 1;
      if (!desbordado) {
        desbordado = true;
        log.warn('fuente.cola-llena', { fuente: CANAL_EMSC_WS, max: MAX_COLA });
        try {
          alDesbordar();
        } catch (err) {
          log.error('error', { mensaje: err instanceof Error ? err.message : String(err) });
        }
      }
      return;
    }
    cola.push({ datos, esBinario, llegada: reloj.ahora() });
    if (drenaje === null) drenaje = setImmediate(drenar);
  }

  /** @param {Readonly<RegistroFuente>} r @returns {string | null} */
  function zonaDe(r) {
    for (const z of zonas) if (enRectangulo(z.rectangulo, r.lat, r.lon)) return z.id;
    return null;
  }

  /** @param {string} donde @param {unknown} err */
  function registrarError(donde, err) {
    log.error('error', {
      fuente: CANAL_EMSC_WS,
      mensaje: `${donde}: ${err instanceof Error ? err.message : String(err)}`,
      pila: err instanceof Error ? err.stack : undefined,
    });
  }

  /**
   * Vacía la cola. Nunca lanza (R-04): corre en `setImmediate`, y una excepción del catálogo
   * (ingesta o retiro) llegaría a `uncaughtException` y tiraría el proceso. Cada grupo de
   * ingesta y cada retiro se protege por separado: un fallo se registra y el resto del lote
   * sigue; el WebSocket no se toca. Lo que no entró lo recupera la consulta FDSN (`updatedafter`).
   */
  function drenar() {
    drenaje = null;
    try {
      drenarLote();
    } catch (err) {
      registrarError('Drenaje del WebSocket', err);
    } finally {
      if (desbordado) {
        log.warn('fuente.cola-desbordada', { fuente: CANAL_EMSC_WS, perdidos: perdidosEnRafaga });
        desbordado = false;
        perdidosEnRafaga = 0;
      }
    }
  }

  function drenarLote() {
    const lote = cola;
    cola = [];
    const ahora = reloj.ahora();
    /** @type {Array<{ registro: Readonly<RegistroFuente>, accion: string, llegada: number,
     *   zona: string | null }>} */
    let pendientes = [];

    const ingerir = () => {
      if (pendientes.length === 0) return;
      const grupo = pendientes;
      pendientes = [];
      let resultados;
      try {
        resultados = catalogo.ingerirLote(
          grupo.map((p) => p.registro),
          { recibidoEn: ahora },
        );
      } catch (err) {
        // N-07: el catálogo se considera recuperable (arquitectura §7): no se tira el proceso.
        // El canal pasa a `degradada` hasta la próxima ingesta buena.
        registrarError('Ingesta del WebSocket', err);
        if (abierto && !ingestaFallida) {
          ingestaFallida = true;
          estado.registrarEstado(CANAL_EMSC_WS, 'degradada', MENSAJE_INGESTA_FALLIDA, null);
        }
        return;
      }
      if (ingestaFallida && abierto) {
        ingestaFallida = false;
        estado.registrarExito(CANAL_EMSC_WS);
      }
      resultados.forEach((r, i) => {
        const p = grupo[i];
        const campos = {
          fuente: 'emsc',
          canal: 'ws',
          // La zona asignada (ADR-0005); los rectángulos se solapan (PA y CO-CONT).
          zona: catalogo.obtener(r.id)?.zona ?? p.zona ?? undefined,
          idFuente: p.registro.idFuente,
          accion: r.accion,
          mensaje: p.accion,
          publicacionARecepcionMs: p.llegada - p.registro.actualizadoEn,
          origenARecepcionMs: p.llegada - p.registro.tiempo,
        };
        if (r.accion === 'sin-cambios') {
          log.debug('sismo.recibido', campos);
          return;
        }
        totales.ingeridos += 1;
        log.info('sismo.recibido', campos);
        metricas.registrar({
          fuente: 'emsc',
          canal: 'ws',
          publicacionARecepcionMs: campos.publicacionARecepcionMs,
          origenARecepcionMs: campos.origenARecepcionMs,
        });
      });
    };

    for (const m of lote) {
      const r = interpretarMensaje(m.datos, m.esBinario, ahora);
      if (r.tipo === 'descarte') {
        contarDescarte(r.motivo);
      } else if (r.tipo === 'retiro') {
        ingerir(); // se respeta el orden de llegada
        try {
          if (catalogo.retirar('emsc', r.idFuente)) {
            log.info('sismo.retirado', { fuente: 'emsc', canal: 'ws', idFuente: r.idFuente });
          }
        } catch (err) {
          registrarError('Retiro del WebSocket', err);
        }
      } else {
        const zona = zonaDe(r.registro);
        // Lo de fuera de las zonas se descarta, salvo la revisión de un sismo ya conocido que
        // se ha movido (el catálogo debe enterarse para quitarlo o reubicarlo).
        if (zona === null && !catalogo.conoce('emsc', r.registro.idFuente)) {
          contarDescarte('fuera-de-zonas');
          continue;
        }
        pendientes.push({ registro: r.registro, accion: r.accion, llegada: m.llegada, zona });
      }
    }
    ingerir();
  }

  // ---------------------------------------------------------------------------------------
  // API

  return Object.freeze({
    /** Abre la conexión (idempotente). */
    arrancar() {
      if (!detenido) return;
      detenido = false;
      conectar();
    },

    /** Cierra la conexión y cancela temporizadores y la cola (apagado ordenado). */
    detener() {
      detenido = true;
      abierto = false;
      limpiarConexion();
      for (const t of [tReconexion, tCaida]) if (t) clearTimeout(t);
      tReconexion = null;
      tCaida = null;
      if (drenaje) clearImmediate(drenaje);
      drenaje = null;
      cola = [];
      const ws = socket;
      socket = null;
      if (ws) {
        try {
          ws.close(1000, 'apagado');
        } catch {
          ws.terminate();
        }
        // Si el servidor no completa el cierre, se corta.
        setTimeout(() => ws.terminate(), 2000).unref?.();
      }
    },

    /** Contadores para diagnóstico y pruebas. */
    estadisticas() {
      return { ...totales, cola: cola.length, intento, abierto };
    },
  });
}
