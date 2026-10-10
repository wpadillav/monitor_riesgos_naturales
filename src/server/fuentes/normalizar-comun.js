/**
 * Utilidades comunes a los normalizadores por fuente (AM-05). Solo **leen** propiedades
 * propias de los objetos externos: nunca los copian ni los fusionan.
 */

import { PATRON_ID_FUENTE } from '../../shared/enlaces.js';
import { FuenteError } from './http-cliente.js';

/** Máximo de `features` que se procesan por respuesta: el `limit` de FDSN (AM-04). */
export const MAX_FEATURES = 20_000;

/**
 * Lee una propiedad **propia** de un objeto externo; `undefined` si no es un objeto o no la
 * tiene (protege frente a `__proto__`, `constructor` y similares).
 * @param {unknown} obj
 * @param {string} clave
 * @returns {unknown}
 */
export function propia(obj, clave) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  return Object.hasOwn(obj, clave)
    ? /** @type {Record<string, unknown>} */ (obj)[clave]
    : undefined;
}

/**
 * Elemento `i` de un array externo, o `undefined`.
 * @param {unknown} arr
 * @param {number} i
 * @returns {unknown}
 */
export function elemento(arr, i) {
  return Array.isArray(arr) && i < arr.length ? arr[i] : undefined;
}

/**
 * Id válido para `retirar` (solo si cumple el patrón), o `null`.
 * @param {unknown} id
 * @returns {string | null}
 */
export function idValido(id) {
  return typeof id === 'string' && PATRON_ID_FUENTE.test(id) ? id : null;
}

/**
 * @typedef {import('../../shared/modelo.js').RegistroFuente} RegistroFuente
 *
 * @typedef {object} ResultadoNormalizacion
 * @property {Readonly<RegistroFuente>[]} registros válidos, en el orden de la respuesta
 * @property {string[]} retirados ids de la fuente que ya no son sismos (`evtype`/`type`), para
 *   retirarlos del catálogo si estaban (ADR-0004)
 * @property {Record<string, number>} descartes cuenta por motivo (AM-05, AM-34)
 */

/**
 * Recorre una FeatureCollection externa con un normalizador por *feature*. `null` (204 de
 * EMSC) es una colección vacía. Lo que no es una colección lanza `FuenteError('FORMATO')`.
 * @param {unknown} datos
 * @param {(feature: unknown) => ({ ok: true, registro: Readonly<RegistroFuente> } |
 *   { ok: false, motivo: string, retirado?: string | null })} normalizarFeature
 * @returns {ResultadoNormalizacion}
 */
export function recorrerColeccion(datos, normalizarFeature) {
  /** @type {ResultadoNormalizacion} */
  const resultado = { registros: [], retirados: [], descartes: {} };
  if (datos === null) return resultado;
  const features = propia(datos, 'features');
  if (!Array.isArray(features)) throw new FuenteError('FORMATO');

  const contar = (motivo, n = 1) => {
    resultado.descartes[motivo] = (resultado.descartes[motivo] ?? 0) + n;
  };

  const limite = Math.min(features.length, MAX_FEATURES);
  for (let i = 0; i < limite; i += 1) {
    const r = normalizarFeature(features[i]);
    if (r.ok) {
      resultado.registros.push(r.registro);
    } else {
      contar(r.motivo);
      if (r.retirado) resultado.retirados.push(r.retirado);
    }
  }
  if (features.length > MAX_FEATURES) contar('limite', features.length - MAX_FEATURES);
  return resultado;
}
