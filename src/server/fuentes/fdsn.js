/**
 * Adaptador FDSN genérico (EMSC y USGS comparten el protocolo `fdsnws/event/1/query`). La URL
 * base es una constante del código y los parámetros se construyen con `URLSearchParams` a
 * partir de valores tipados, nunca con texto de la petición ni de los datos (AM-06, AM-08).
 */

import { MAX_BYTES_FDSN } from './http-cliente.js';
import { MAX_FEATURES } from './normalizar-comun.js';

/**
 * Instante FDSN: `YYYY-MM-DDTHH:MM:SS` en UTC (sin milisegundos ni zona: los dos servicios lo
 * interpretan como UTC).
 * @param {number} ms
 * @returns {string}
 */
export function instanteFdsn(ms) {
  return new Date(ms).toISOString().slice(0, 19);
}

/** @param {number} x */
const numero = (x) => {
  if (!Number.isFinite(x)) throw new TypeError('Parámetro FDSN no numérico.');
  return String(x);
};

/**
 * @typedef {object} DefinicionFdsn
 * @property {'emsc-fdsn' | 'usgs'} canal
 * @property {'emsc' | 'usgs'} fuente
 * @property {string} urlBase constante `https://…/fdsnws/event/1/query`
 * @property {string} formato `json` (EMSC) o `geojson` (USGS)
 * @property {{ minLat: string, maxLat: string, minLon: string, maxLon: string, magMin: string }}
 *   parametros nombres de los parámetros en cada servicio
 * @property {(datos: unknown, ahora: number) =>
 *   import('./normalizar-comun.js').ResultadoNormalizacion} normalizar
 */

/**
 * @param {DefinicionFdsn} definicion
 * @param {object} deps
 * @param {ReturnType<typeof import('./http-cliente.js').createHttpClient>} deps.http
 * @param {import('../infra/reloj.js').Reloj} deps.reloj
 * @param {number} [deps.maxBytes]
 * @returns {import('./puerto.js').FuenteConsulta}
 */
export function createFuenteFdsn(definicion, { http, reloj, maxBytes = MAX_BYTES_FDSN }) {
  if (!definicion.urlBase.startsWith('https://')) {
    throw new Error('Las URL de las fuentes deben ser https:// (AM-06).');
  }
  const nombres = definicion.parametros;

  /** @param {import('./puerto.js').ParametrosConsulta} p */
  function construirUrl({ rectangulo, magMin, desde, actualizadoDesde }) {
    const q = new URLSearchParams();
    q.set('format', definicion.formato);
    q.set('starttime', instanteFdsn(desde));
    q.set(nombres.minLat, numero(rectangulo.minLat));
    q.set(nombres.maxLat, numero(rectangulo.maxLat));
    q.set(nombres.minLon, numero(rectangulo.minLon));
    q.set(nombres.maxLon, numero(rectangulo.maxLon));
    if (magMin !== null) q.set(nombres.magMin, numero(magMin));
    if (actualizadoDesde !== null) q.set('updatedafter', instanteFdsn(actualizadoDesde));
    q.set('orderby', 'time');
    q.set('limit', String(MAX_FEATURES));
    return `${definicion.urlBase}?${q}`;
  }

  return Object.freeze({
    canal: definicion.canal,
    fuente: definicion.fuente,
    construirUrl,
    async consultar(parametros, { timeoutMs, signal } = {}) {
      const { datos } = await http.getJson(construirUrl(parametros), {
        maxBytes,
        timeoutMs,
        signal,
      });
      const recibidoEn = reloj.ahora();
      const normalizado = definicion.normalizar(datos, recibidoEn);
      return { ...normalizado, recibidoEn };
    },
  });
}
