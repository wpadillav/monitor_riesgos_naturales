/**
 * Cliente HTTP de las fuentes (arquitectura §4; amenazas AM-03, AM-04, AM-06, AM-35).
 *
 * - `fetch` nativo inyectable (las pruebas no usan red).
 * - Solo `https:`; la verificación TLS es la de Node y nunca se desactiva (AM-06).
 * - `redirect: 'error'`: una redirección es un fallo de la fuente (AM-06).
 * - Tiempo límite por petición con `AbortController` + `setTimeout` (10 s por defecto, AM-04).
 * - Límite de bytes: se rechaza de antemano si `Content-Length` lo supera y se aborta al
 *   superarlo leyendo el cuerpo en *streaming* (32 MiB en FDSN, AM-04).
 * - Se comprueban `status` y `Content-Type` antes de parsear; `JSON.parse` va en `try/catch`
 *   (AM-03).
 * - `User-Agent` identificable sin datos personales (AM-35).
 */

/** 32 MiB: 20 000 eventos FDSN ocupan unos 20–25 MB (AM-04). */
export const MAX_BYTES_FDSN = 32 * 1024 * 1024;

/** Tiempo límite por defecto de cada petición (`FUENTE_TIMEOUT_MS`, AM-04). */
export const TIMEOUT_POR_DEFECTO_MS = 10_000;

/** Tipos de contenido JSON admitidos (EMSC: `application/json`; USGS: con `charset`). */
const TIPOS_JSON = Object.freeze([
  'application/json',
  'application/geo+json',
  'application/vnd.geo+json',
]);

/** Códigos de error del cliente; cada uno tiene un mensaje breve en español sin URL ni trazas. */
export const CODIGOS_ERROR = Object.freeze({
  TIMEOUT: 'Tiempo de espera agotado',
  LIMITE_TAMANO: 'Respuesta demasiado grande',
  HTTP_STATUS: 'Respuesta HTTP no válida',
  CONTENT_TYPE: 'Tipo de contenido inesperado',
  JSON_INVALIDO: 'JSON no válido',
  FORMATO: 'Formato de respuesta inesperado',
  REDIRECCION: 'Redirección no permitida',
  RED: 'Error de red',
  URL_NO_SEGURA: 'URL de fuente no segura',
  CANCELADA: 'Consulta cancelada',
});

/** Error de una consulta a una fuente. No lleva la URL ni el cuerpo (logs sin datos externos). */
export class FuenteError extends Error {
  /**
   * @param {keyof typeof CODIGOS_ERROR} codigo
   * @param {object} [extra]
   * @param {number} [extra.status]
   * @param {number | null} [extra.retryAfterMs]
   */
  constructor(codigo, { status, retryAfterMs = null } = {}) {
    super(status ? `${CODIGOS_ERROR[codigo]} (${status})` : CODIGOS_ERROR[codigo]);
    this.name = 'FuenteError';
    this.codigo = codigo;
    this.status = status ?? null;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Interpreta `Retry-After` (segundos o fecha HTTP). Devuelve ms o `null`. Se acota a 1 h para
 * que un valor absurdo no deje la fuente parada para siempre.
 * @param {string | null} valor
 * @param {number} ahora ms
 * @returns {number | null}
 */
export function parsearRetryAfter(valor, ahora) {
  if (!valor) return null;
  const MAX = 3_600_000;
  if (/^\d{1,7}$/.test(valor.trim())) return Math.min(Number(valor.trim()) * 1000, MAX);
  const fecha = Date.parse(valor);
  if (!Number.isFinite(fecha)) return null;
  return Math.min(Math.max(0, fecha - ahora), MAX);
}

/**
 * @typedef {object} RespuestaJson
 * @property {number} status 200 o 204
 * @property {unknown} datos JSON parseado; `null` con 204 (EMSC: sin datos)
 * @property {number} bytes bytes leídos del cuerpo
 */

/**
 * @typedef {object} OpcionesPeticion
 * @property {number} [maxBytes]
 * @property {number} [timeoutMs]
 * @property {AbortSignal} [signal] cancelación externa (p. ej. al apagar)
 */

/**
 * @param {object} deps
 * @param {typeof fetch} [deps.fetch]
 * @param {string} deps.userAgent sin datos personales
 * @param {number} [deps.timeoutMs]
 * @param {() => number} [deps.ahora]
 * @returns {{ getJson: (url: string, opciones?: OpcionesPeticion) => Promise<RespuestaJson> }}
 */
export function createHttpClient({
  fetch: fetchFn = globalThis.fetch,
  userAgent,
  timeoutMs: timeoutPorDefecto = TIMEOUT_POR_DEFECTO_MS,
  ahora = Date.now,
}) {
  return Object.freeze({
    async getJson(url, { maxBytes = MAX_BYTES_FDSN, timeoutMs, signal } = {}) {
      if (typeof url !== 'string' || !url.startsWith('https://')) {
        throw new FuenteError('URL_NO_SEGURA');
      }
      const controlador = new AbortController();
      let porTiempo = false;
      const temporizador = setTimeout(() => {
        porTiempo = true;
        controlador.abort();
      }, timeoutMs ?? timeoutPorDefecto);
      const alCancelar = () => controlador.abort();
      if (signal?.aborted) controlador.abort();
      signal?.addEventListener('abort', alCancelar, { once: true });

      const errorDeAborto = () => new FuenteError(porTiempo ? 'TIMEOUT' : 'CANCELADA');

      try {
        let res;
        try {
          res = await fetchFn(url, {
            method: 'GET',
            redirect: 'error',
            signal: controlador.signal,
            headers: { 'User-Agent': userAgent, Accept: 'application/json' },
          });
        } catch {
          // Con `redirect: 'error'` una redirección llega aquí como TypeError: es un fallo
          // de red de la fuente, igual que DNS o TLS. No se registra el detalle (puede llevar
          // la URL).
          if (controlador.signal.aborted) throw errorDeAborto();
          throw new FuenteError('RED');
        }

        if (res.status >= 300 && res.status < 400) {
          await descartarCuerpo(res);
          throw new FuenteError('REDIRECCION', { status: res.status });
        }
        if (res.status === 204) {
          await descartarCuerpo(res);
          return { status: 204, datos: null, bytes: 0 };
        }
        if (res.status !== 200) {
          await descartarCuerpo(res);
          throw new FuenteError('HTTP_STATUS', {
            status: res.status,
            retryAfterMs:
              res.status === 429 || res.status === 503
                ? parsearRetryAfter(res.headers.get('retry-after'), ahora())
                : null,
          });
        }

        const tipo = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
        if (!TIPOS_JSON.includes(tipo)) {
          await descartarCuerpo(res);
          throw new FuenteError('CONTENT_TYPE');
        }

        const longitud = Number(res.headers.get('content-length'));
        if (Number.isFinite(longitud) && longitud > maxBytes) {
          await descartarCuerpo(res);
          throw new FuenteError('LIMITE_TAMANO');
        }

        const { texto, bytes } = await leerConLimite(res, maxBytes, controlador.signal).catch(
          (err) => {
            if (err instanceof FuenteError) throw err;
            if (controlador.signal.aborted) throw errorDeAborto();
            throw new FuenteError('RED');
          },
        );
        if (controlador.signal.aborted) throw errorDeAborto();

        let datos;
        try {
          datos = JSON.parse(texto);
        } catch {
          throw new FuenteError('JSON_INVALIDO');
        }
        return { status: 200, datos, bytes };
      } finally {
        clearTimeout(temporizador);
        signal?.removeEventListener('abort', alCancelar);
      }
    },
  });
}

/**
 * Lee el cuerpo por trozos y aborta en cuanto supera `maxBytes` (AM-04). Si la señal se aborta
 * (tiempo límite), cancela el lector aunque la fuente no envíe más datos.
 * @param {Response} res
 * @param {number} maxBytes
 * @param {AbortSignal} signal
 * @returns {Promise<{ texto: string, bytes: number }>}
 */
async function leerConLimite(res, maxBytes, signal) {
  if (!res.body) return { texto: '', bytes: 0 };
  const lector = res.body.getReader();
  const cancelar = () => {
    lector.cancel().catch(() => {});
  };
  signal.addEventListener('abort', cancelar, { once: true });
  const decodificador = new TextDecoder('utf-8');
  const partes = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (signal.aborted) throw new Error('abortado');
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        cancelar();
        throw new FuenteError('LIMITE_TAMANO');
      }
      partes.push(decodificador.decode(value, { stream: true }));
    }
    partes.push(decodificador.decode());
    return { texto: partes.join(''), bytes };
  } finally {
    signal.removeEventListener('abort', cancelar);
  }
}

/** Libera la conexión sin leer el cuerpo. @param {Response} res */
async function descartarCuerpo(res) {
  try {
    await res.body?.cancel();
  } catch {
    // Nada que hacer: la respuesta ya se descarta.
  }
}
