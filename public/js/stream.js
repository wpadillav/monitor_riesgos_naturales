/**
 * Datos en vivo por Server-Sent Events (T4.6b; PRD HU-01 y HU-02; contrato `GET /api/stream`;
 * wireframes §6).
 *
 * - `EventSource` sobre `/api/stream` con los filtros actuales, `avisoMin` si los avisos están
 *   activados y, en la primera conexión, `ultimoId` = `ultimoEventoId` de la última carga: así no
 *   se pierde ni se duplica nada entre la carga y la suscripción.
 * - El navegador reconecta solo y reenvía `Last-Event-ID`. Si el servidor no puede reanudar,
 *   envía `flujo.reiniciar`: se recarga con `GET /api/sismos` y se reabre.
 * - Indicador: «En vivo» al abrir; «Reconectando…» al cortarse; «Sin conexión con el servidor
 *   local. Reintentando…» si a los 10 s sigue sin conexión (HU-02).
 * - El servidor envía un evento `latido` cada 20 s: reinicia la vigilancia y renueva el
 *   «actualizado a las…» (textos.md §3). Si no llega nada en 45 s (ni un latido), se cierra y se
 *   reabre sin cambiar el indicador, con el último id recibido (contrato).
 * - Si el navegador se rinde (`EventSource` en CLOSED: respuesta HTTP no válida), se pregunta
 *   con `HEAD /api/stream` si es por falta de plazas (503): `EventSource` no expone el código
 *   HTTP y `HEAD` no abre flujo ni ocupa plaza. Con 503 se muestra «sin plazas» (los datos de
 *   `/api/sismos` siguen ahí) y se reintenta al cabo de `Retry-After`; en otro caso, espera
 *   creciente y «Reconectando…».
 *
 * La lógica pura (URL, validación de eventos y aplicación al estado) se exporta aparte para las
 * pruebas unitarias.
 */

import { OPCIONES_AVISO_MIN, esIdEvento } from '/shared/reglas.js';
import { construirQuery, cumpleFiltros } from './filtros.js';
import { esSismoValido } from './estado.js';
import { formatearLugar, nombrePais } from './formato.js';
import { formatearMagnitud } from './magnitud.js';

/** Tipos de evento del contrato (`Evento.tipo`). */
export const TIPOS_EVENTO = Object.freeze([
  'sismo.nuevo',
  'sismo.actualizado',
  'sismo.eliminado',
  'estado.fuente',
  'flujo.reiniciar',
  'latido',
]);

/** Sin ningún mensaje en este tiempo, se cierra y se reabre (contrato, «Mantenimiento»). */
export const SIN_DATOS_MS = 45_000;
/** Tiempo en «Reconectando…» antes de pasar a «Sin conexión…» (HU-02: ≤ 10 s). */
export const SIN_CONEXION_MS = 10_000;
/** Esperas de los reintentos manuales (cuando `EventSource` se rinde, p. ej. con un 503). */
export const ESPERAS_S = Object.freeze([5, 10, 20, 40, 60]);
/** Más de estos `flujo.reiniciar` por minuto: se espera antes de recargar (evita un bucle). */
export const MAX_REINICIOS_MINUTO = 3;
/** Tamaño máximo de `data` que se intenta parsear (los mensajes reales ocupan < 4 KiB). */
export const MAX_DATA = 256 * 1024;
/** Margen para agrupar los `estado.fuente` que llegan juntos al conectar. */
const AGRUPAR_FUENTES_MS = 100;
/** `Retry-After` del 503 si no viene o no es válido (contrato: 10 s). */
export const RETRY_AFTER_POR_DEFECTO_S = 10;
/** Límites del `Retry-After` que se acepta (no se confía en el valor recibido). */
export const RETRY_AFTER_MIN_S = 1;
export const RETRY_AFTER_MAX_S = 300;
/** Tiempo máximo de la comprobación `HEAD /api/stream`. */
export const COMPROBAR_PLAZAS_MS = 5000;

/**
 * @typedef {import('./estado.js').Sismo} Sismo
 * @typedef {import('./filtros.js').Filtros} Filtros
 *
 * @typedef {{ tipo: 'sismo.nuevo' | 'sismo.actualizado', sismo: Sismo, notificable: boolean,
 *   cambios: string[] }} EventoSismo
 * @typedef {{ tipo: 'sismo.eliminado', id: string, motivo: string,
 *   reemplazadoPor: string | null }} EventoEliminado
 * @typedef {{ tipo: 'estado.fuente', fuente: { fuente: string, estado: string,
 *   cambiadoEn?: string } }} EventoFuente
 * @typedef {{ tipo: 'flujo.reiniciar', motivo: string }} EventoReiniciar
 * @typedef {{ tipo: 'latido' }} EventoLatido
 * @typedef {EventoSismo | EventoEliminado | EventoFuente | EventoReiniciar | EventoLatido} Evento
 *
 * @typedef {{ sinPlazas: true, reintentarS: number } | { sinPlazas: false }} Diagnostico
 *
 * @typedef {{ tipo: 'sismo.nuevo' | 'sismo.actualizado', sismo: Sismo, notificable: boolean,
 *   cambios: string[], enLista: boolean, alta: boolean }} ResultadoSismo
 * @typedef {ResultadoSismo | (EventoEliminado & { quitado: boolean })} Resultado
 */

/**
 * URL de `/api/stream`, o `null` si no hay países (el contrato exige `paises`).
 * @param {Filtros} filtros
 * @param {{ avisoMin?: string | null, ultimoId?: string | null }} [opciones]
 * @returns {string | null}
 */
export function urlStream(filtros, { avisoMin = null, ultimoId = null } = {}) {
  const query = construirQuery(filtros);
  if (query === null) return null;
  const q = new URLSearchParams(query);
  if (avisoMin !== null && OPCIONES_AVISO_MIN.includes(avisoMin)) q.set('avisoMin', avisoMin);
  if (esIdEvento(ultimoId)) q.set('ultimoId', ultimoId);
  return `/api/stream?${q.toString()}`;
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
const esObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Valida un mensaje SSE (`event` + `data`) contra el contrato (`Evento`). Lo que no cumple se
 * descarta (`null`): la página nunca confía en la forma de lo que llega (defensa en
 * profundidad, AM-05).
 * @param {string} tipo campo `event`
 * @param {unknown} data campo `data` (texto JSON)
 * @returns {Evento | null}
 */
export function parsearEvento(tipo, data) {
  if (!TIPOS_EVENTO.includes(tipo) || typeof data !== 'string' || data.length > MAX_DATA) {
    return null;
  }
  /** @type {unknown} */
  let sobre;
  try {
    sobre = JSON.parse(data);
  } catch {
    return null;
  }
  if (!esObjeto(sobre) || sobre.tipo !== tipo || sobre.version !== 1) return null;
  const datos = sobre.datos;
  if (!esObjeto(datos)) return null;

  switch (tipo) {
    case 'sismo.nuevo':
    case 'sismo.actualizado': {
      if (!esSismoValido(datos.sismo)) return null;
      const cambios = Array.isArray(datos.cambios)
        ? datos.cambios.filter((c) => typeof c === 'string')
        : [];
      return { tipo, sismo: datos.sismo, notificable: datos.notificable === true, cambios };
    }
    case 'sismo.eliminado': {
      const { id, motivo, reemplazadoPor } = datos;
      if (typeof id !== 'string' || id.length === 0 || id.length > 80) return null;
      return {
        tipo,
        id,
        motivo: typeof motivo === 'string' ? motivo : '',
        reemplazadoPor:
          typeof reemplazadoPor === 'string' && reemplazadoPor.length <= 80 ? reemplazadoPor : null,
      };
    }
    case 'estado.fuente': {
      if (typeof datos.fuente !== 'string' || typeof datos.estado !== 'string') return null;
      return {
        tipo,
        fuente: {
          fuente: datos.fuente,
          estado: datos.estado,
          ...(typeof datos.cambiadoEn === 'string' ? { cambiadoEn: datos.cambiadoEn } : {}),
        },
      };
    }
    case 'latido':
      return { tipo };
    default:
      return {
        tipo: 'flujo.reiniciar',
        motivo: typeof datos.motivo === 'string' ? datos.motivo : '',
      };
  }
}

/**
 * Segundos de un `Retry-After` en segundos (la forma de fecha no se usa en esta API), acotados
 * a [{@link RETRY_AFTER_MIN_S}, {@link RETRY_AFTER_MAX_S}]. Sin valor válido, el del contrato.
 * @param {string | null} valor
 * @returns {number}
 */
export function leerRetryAfter(valor) {
  if (valor === null || !/^\s*\d{1,6}\s*$/.test(valor)) return RETRY_AFTER_POR_DEFECTO_S;
  return Math.min(RETRY_AFTER_MAX_S, Math.max(RETRY_AFTER_MIN_S, Number(valor)));
}

/**
 * Pregunta con `HEAD` a la misma URL del stream si hay plazas. Nunca lanza: si la comprobación
 * falla (red, tiempo agotado) se trata como un corte normal.
 * @param {string} url de `/api/stream` con sus filtros (los valida el servidor igual)
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Diagnostico>}
 */
export async function comprobarPlazas(url, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(url, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: AbortSignal.timeout(COMPROBAR_PLAZAS_MS),
    });
    if (res.status !== 503) return { sinPlazas: false };
    return { sinPlazas: true, reintentarS: leerRetryAfter(res.headers.get('retry-after')) };
  } catch {
    return { sinPlazas: false };
  }
}

/**
 * Aplica un evento de sismo al estado de la vista:
 * - si cumple los filtros de la lista (`cumpleFiltroLista` de `src/shared/reglas.js`: algún país
 *   marcado entre sus `paisesCandidatos` y magnitud cruda ≥ `magMin`, R-01 y R-02), alta o
 *   actualización (con la etiqueta «Nuevo»);
 * - si no los cumple (llega solo por el umbral de aviso, o una revisión lo saca), no se pinta y,
 *   si estaba, se quita;
 * - `sismo.eliminado` lo quita.
 * @param {EventoSismo | EventoEliminado} evento
 * @param {{ estado: import('./estado.js').Estado, filtros: Filtros, ahora: number }} contexto
 * @returns {Resultado}
 */
export function aplicarEvento(evento, { estado, filtros, ahora }) {
  if (evento.tipo === 'sismo.eliminado') {
    return { ...evento, quitado: estado.eliminarSismo(evento.id) };
  }
  const { sismo } = evento;
  let enLista = false;
  let alta = false;
  if (cumpleFiltros(sismo, filtros, ahora)) {
    alta = estado.aplicarSismo(sismo, { nuevo: true }) === 'nuevo';
    enLista = true;
  } else {
    estado.eliminarSismo(sismo.id);
  }
  return { ...evento, enLista, alta };
}

/**
 * Anuncios de sismos llegados en vivo (textos.md §10): como mucho uno cada 10 s; si llegan
 * varios en ese tiempo, «{n} sismos nuevos.».
 * @param {object} deps
 * @param {(texto: string) => void} deps.anunciar
 * @param {(fn: () => void, ms: number) => unknown} [deps.programar]
 * @param {number} [deps.intervaloMs]
 */
export function crearAnunciadorNuevos({
  anunciar,
  programar = (fn, ms) => setTimeout(fn, ms),
  intervaloMs = 10_000,
}) {
  let enVentana = false;
  /** @type {Sismo[]} */
  let pendientes = [];

  /** @param {Sismo} s */
  const texto = (s) => {
    const pais = nombrePais(s.pais);
    const lugar = formatearLugar(s.lugar);
    return `Nuevo sismo: magnitud ${formatearMagnitud(s.magnitud)}, ${lugar}${pais ? `, ${pais}` : ''}.`;
  };

  function abrirVentana() {
    enVentana = true;
    programar(() => {
      const lote = pendientes;
      pendientes = [];
      if (lote.length === 0) {
        enVentana = false;
        return;
      }
      anunciar(lote.length === 1 ? texto(lote[0]) : `${lote.length} sismos nuevos.`);
      abrirVentana();
    }, intervaloMs);
  }

  return Object.freeze({
    /** @param {Sismo} s */
    nuevo(s) {
      if (enVentana) {
        pendientes.push(s);
        return;
      }
      anunciar(texto(s));
      abrirVentana();
    },
  });
}

/**
 * @typedef {object} EventSourceMinimo
 * @property {number} readyState
 * @property {((e: Event) => void) | null} onopen
 * @property {((e: Event) => void) | null} onerror
 * @property {(tipo: string, oyente: (e: MessageEvent) => void) => void} addEventListener
 * @property {() => void} close
 */

/**
 * Conexión en vivo con el servidor local.
 * @param {object} deps
 * @param {import('./estado.js').Estado} deps.estado
 * @param {{ poner: (e: any, d?: { n?: number, hora?: number | null }) => void,
 *   readonly estado: string }} deps.barra
 * @param {() => Filtros} deps.obtenerFiltros
 * @param {() => string | null} deps.obtenerUltimoEventoId
 * @param {() => string | null} deps.obtenerAvisoMin
 * @param {() => void} deps.recargar `GET /api/sismos` silencioso; al terminar, la página llama a
 *   `abrir()`
 * @param {(fuentes: unknown[]) => void} deps.ponerFuentes
 * @param {(resultado: Resultado) => void} [deps.alEvento]
 * @param {new (url: string) => EventSourceMinimo} [deps.EventSourceImpl]
 * @param {(url: string) => Promise<Diagnostico>} [deps.diagnosticar] por qué se rindió
 *   `EventSource` (por defecto, {@link comprobarPlazas})
 * @param {() => number} [deps.ahora]
 * @param {(fn: () => void, ms: number) => unknown} [deps.programar]
 * @param {(t: unknown) => void} [deps.cancelar]
 * @param {(fn: () => void) => void} [deps.programarPintado] agrupa la renovación del indicador
 *   (por defecto, en el siguiente frame): en una ráfaga no se reescribe por cada sismo (P-01)
 */
export function crearConexionVivo({
  estado,
  barra,
  obtenerFiltros,
  obtenerUltimoEventoId,
  obtenerAvisoMin,
  recargar,
  ponerFuentes,
  alEvento = () => {},
  EventSourceImpl = /** @type {any} */ (globalThis.EventSource),
  diagnosticar = (url) => comprobarPlazas(url),
  ahora = () => Date.now(),
  programar = (fn, ms) => setTimeout(fn, ms),
  cancelar = (t) => clearTimeout(/** @type {any} */ (t)),
  programarPintado = (fn) => {
    if (typeof globalThis.requestAnimationFrame === 'function') requestAnimationFrame(fn);
    else queueMicrotask(fn);
  },
}) {
  /** @type {EventSourceMinimo | null} */
  let es = null;
  let activa = false;
  let abierta = false;
  /** @type {string | null} último id recibido (para reabrir sin perder nada) */
  let ultimoId = null;
  /** @type {number | null} */
  let ultimoDato = null;
  let intentos = 0;
  /** @type {number[]} */
  let reinicios = [];
  /** Sube con cada conexión y cierre: descarta diagnósticos que llegan tarde. */
  let generacion = 0;
  /** @type {Map<string, EventoFuente['fuente']>} */
  const fuentes = new Map();
  /** @type {Record<string, unknown>} */
  const t = { sinConexion: null, vigilancia: null, reintento: null, fuentes: null, recarga: null };

  /** @param {keyof typeof t} nombre */
  function parar(nombre) {
    if (t[nombre] !== null) cancelar(t[nombre]);
    t[nombre] = null;
  }

  function ponerEnVivo() {
    barra.poner('en-vivo', { n: estado.tamano, hora: ultimoDato });
  }

  let indicadorPendiente = false;
  /** Renueva «En vivo · n sismos · actualizado a las…» una vez por frame como mucho. */
  function renovarIndicador() {
    if (indicadorPendiente) return;
    indicadorPendiente = true;
    programarPintado(() => {
      indicadorPendiente = false;
      if (abierta && barra.estado === 'en-vivo') ponerEnVivo();
    });
  }

  function cerrarFuente() {
    if (es) {
      es.onopen = null;
      es.onerror = null;
      es.close();
    }
    es = null;
    abierta = false;
    parar('vigilancia');
  }

  function vigilar() {
    parar('vigilancia');
    t.vigilancia = programar(() => {
      t.vigilancia = null;
      // Nada en 45 s, ni un latido: se reabre sin tocar el indicador (si falla, `onerror` lo
      // cambia).
      cerrarFuente();
      conectar();
    }, SIN_DATOS_MS);
  }

  function marcarDato() {
    ultimoDato = ahora();
    vigilar();
  }

  function entrarEnReconexion() {
    const e = barra.estado;
    if (e !== 'reconectando' && e !== 'sin-conexion') {
      barra.poner('reconectando', { hora: ultimoDato });
    }
    if (t.sinConexion === null && e !== 'sin-conexion') {
      t.sinConexion = programar(() => {
        t.sinConexion = null;
        if (activa && !abierta) barra.poner('sin-conexion', { hora: ultimoDato });
      }, SIN_CONEXION_MS);
    }
  }

  /** @param {number} ms */
  function programarReintento(ms) {
    parar('reintento');
    t.reintento = programar(() => {
      t.reintento = null;
      if (activa) conectar();
    }, ms);
  }

  /**
   * El navegador se rindió (CLOSED): ¿falta de plazas (503) u otro fallo?
   * @param {string} url
   * @param {number} gen
   */
  async function diagnosticarRechazo(url, gen) {
    /** @type {Diagnostico} */
    let d = { sinPlazas: false };
    try {
      d = await diagnosticar(url);
    } catch {
      // Se trata como un corte normal.
    }
    if (gen !== generacion || !activa) return;
    if (d.sinPlazas) {
      // El servidor responde (no es «Sin conexión…»): se espera lo que pide y se reintenta.
      parar('sinConexion');
      barra.poner('sin-plazas', { n: estado.tamano, hora: ultimoDato });
      programarReintento(d.reintentarS * 1000);
      return;
    }
    entrarEnReconexion();
    const espera = ESPERAS_S[Math.min(intentos, ESPERAS_S.length - 1)];
    intentos += 1;
    programarReintento(espera * 1000);
  }

  function conectar() {
    generacion += 1;
    const url = urlStream(obtenerFiltros(), { avisoMin: obtenerAvisoMin(), ultimoId });
    if (url === null || !EventSourceImpl) {
      activa = false;
      return;
    }
    const gen = generacion;
    const fuente = new EventSourceImpl(url);
    es = fuente;
    fuente.onopen = () => {
      if (es !== fuente) return;
      abierta = true;
      intentos = 0;
      parar('sinConexion');
      marcarDato();
      ponerEnVivo();
    };
    fuente.onerror = () => {
      if (es !== fuente) return;
      abierta = false;
      parar('vigilancia');
      // CONNECTING (0): el navegador reconecta solo (corte de red).
      if (fuente.readyState !== 2) {
        entrarEnReconexion();
        return;
      }
      // CLOSED (2): el navegador no volverá a intentarlo (respuesta HTTP no válida, p. ej. 503
      // por falta de plazas). Se averigua el motivo antes de cambiar el indicador.
      cerrarFuente();
      diagnosticarRechazo(url, gen);
    };
    for (const tipo of TIPOS_EVENTO) {
      fuente.addEventListener(tipo, (e) => {
        if (es === fuente) manejar(tipo, e);
      });
    }
  }

  /**
   * @param {string} tipo
   * @param {MessageEvent} e
   */
  function manejar(tipo, e) {
    marcarDato();
    if (esIdEvento(e.lastEventId)) {
      ultimoId = e.lastEventId;
    }
    const evento = parsearEvento(tipo, e.data);
    if (evento === null) return;

    if (evento.tipo === 'latido') {
      // «Actualizado» = último mensaje del servidor, sismo o latido (textos.md §3).
      if (barra.estado === 'en-vivo') ponerEnVivo();
      return;
    }

    if (evento.tipo === 'flujo.reiniciar') {
      reiniciar();
      return;
    }
    if (evento.tipo === 'estado.fuente') {
      fuentes.set(evento.fuente.fuente, evento.fuente);
      if (t.fuentes === null) {
        t.fuentes = programar(() => {
          t.fuentes = null;
          ponerFuentes([...fuentes.values()]);
        }, AGRUPAR_FUENTES_MS);
      }
      return;
    }
    const resultado = aplicarEvento(evento, {
      estado,
      filtros: obtenerFiltros(),
      ahora: ahora(),
    });
    renovarIndicador();
    alEvento(resultado);
  }

  /** `flujo.reiniciar`: recarga y reabre; si se repite mucho, espera antes (sin bucles). */
  function reiniciar() {
    cerrar();
    ultimoId = null;
    const hace = ahora() - 60_000;
    reinicios = reinicios.filter((x) => x > hace);
    reinicios.push(ahora());
    if (reinicios.length <= MAX_REINICIOS_MINUTO) {
      recargar();
      return;
    }
    const espera = ESPERAS_S[Math.min(reinicios.length - MAX_REINICIOS_MINUTO - 1, 4)];
    t.recarga = programar(() => {
      t.recarga = null;
      recargar();
    }, espera * 1000);
  }

  function cerrar() {
    generacion += 1;
    activa = false;
    cerrarFuente();
    parar('sinConexion');
    parar('reintento');
    parar('recarga');
  }

  // El contador del indicador sigue al estado (altas, bajas y sismos que salen del periodo).
  estado.suscribir(() => {
    if (abierta && barra.estado === 'en-vivo') renovarIndicador();
  });

  return Object.freeze({
    /**
     * Abre (o reabre) el stream tras una carga: `ultimoId` es el de esa carga.
     */
    abrir() {
      cerrar();
      activa = true;
      intentos = 0;
      ultimoId = obtenerUltimoEventoId();
      conectar();
    },

    /**
     * Reabre con los mismos datos (cambia `avisoMin`): sigue desde el último id recibido.
     */
    reabrir() {
      if (!activa) return;
      cerrarFuente();
      parar('reintento');
      conectar();
    },

    cerrar,

    get abierta() {
      return abierta;
    },

    /** @returns {string | null} */
    get ultimoId() {
      return ultimoId;
    },
  });
}
