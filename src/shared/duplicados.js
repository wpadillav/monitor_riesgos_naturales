/**
 * Eliminación de duplicados entre fuentes (ADR-0004, PRD E1): reglas puras. El catálogo del
 * servidor (`src/server/dominio/catalogo.js`) guarda el estado, los índices y la fusión tardía;
 * aquí se decide si dos registros son el mismo sismo y cuál es el mejor candidato.
 */

import { UMBRALES_DEDUP } from './constantes.js';
import { distanciaKm } from './geo.js';

/**
 * @typedef {object} Umbrales
 * @property {number} dtS diferencia máxima de hora de origen, en segundos (`DEDUP_DT_S`).
 * @property {number} ddKm distancia máxima entre epicentros, en km (`DEDUP_DD_KM`).
 * @property {number} dm diferencia máxima de magnitud (`DEDUP_DM`).
 */

/**
 * Lo mínimo que hace falta para comparar: un registro o los valores preferidos de un sismo.
 * @typedef {object} PuntoSismo
 * @property {number} tiempo ms UTC
 * @property {number} lat
 * @property {number} lon
 * @property {number} magnitud
 */

/**
 * Sismo canónico candidato a absorber un registro nuevo.
 * @typedef {object} CandidatoDedup
 * @property {string} id
 * @property {ReadonlyArray<string>} fuentes fuentes que ya tiene (`emsc`, `usgs`).
 * @property {PuntoSismo} preferido valores de nivel superior del sismo.
 * @property {number} recibidoEn ms UTC; desempata a favor del más antiguo.
 */

/**
 * Tolerancia para la aritmética en coma flotante: 4.5 − 3.5 da 1.0000000000000004 y no debe
 * quedar fuera de un umbral de 1.0. Es muy inferior a la resolución de las fuentes (0,01).
 */
const EPSILON = 1e-9;

/**
 * Valida unos umbrales (p. ej. leídos de variables de entorno). Devuelve los errores en español.
 * @param {Partial<Record<keyof Umbrales, unknown>>} umbrales
 * @returns {string[]} vacío si son válidos.
 */
export function validarUmbrales(umbrales) {
  const errores = [];
  const reglas = [
    ['dtS', 'DEDUP_DT_S', 600],
    ['ddKm', 'DEDUP_DD_KM', 1000],
    ['dm', 'DEDUP_DM', 5],
  ];
  for (const [clave, variable, max] of reglas) {
    const v = umbrales[clave];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > max) {
      errores.push(`${variable} debe ser un número mayor que 0 y como máximo ${max}.`);
    }
  }
  return errores;
}

/**
 * Diferencias entre dos puntos: segundos, km y magnitud (valores absolutos).
 * @param {PuntoSismo} a
 * @param {PuntoSismo} b
 * @returns {{dtS: number, ddKm: number, dm: number}}
 */
export function diferencias(a, b) {
  return {
    dtS: Math.abs(a.tiempo - b.tiempo) / 1000,
    ddKm: distanciaKm(a.lat, a.lon, b.lat, b.lon),
    dm: Math.abs(a.magnitud - b.magnitud),
  };
}

/**
 * ¿Cumplen los dos puntos las tres condiciones (Δt, Δd y ΔM)? No mira la fuente.
 * @param {PuntoSismo} a
 * @param {PuntoSismo} b
 * @param {Umbrales} [umbrales]
 * @returns {boolean}
 */
export function cumpleUmbrales(a, b, umbrales = UMBRALES_DEDUP) {
  const d = diferencias(a, b);
  return (
    d.dtS <= umbrales.dtS + EPSILON &&
    d.ddKm <= umbrales.ddKm + EPSILON &&
    d.dm <= umbrales.dm + EPSILON
  );
}

/**
 * ¿Son el mismo sismo dos registros de fuentes **distintas**? Dos registros de la misma fuente
 * nunca lo son por cercanía: solo por id (ADR-0004, regla 5).
 * @param {PuntoSismo & {fuente: string}} a
 * @param {PuntoSismo & {fuente: string}} b
 * @param {Umbrales} [umbrales]
 * @returns {boolean}
 */
export function sonDuplicados(a, b, umbrales = UMBRALES_DEDUP) {
  return a.fuente !== b.fuente && cumpleUmbrales(a, b, umbrales);
}

/**
 * Puntuación de un emparejamiento: `Δt/dtS + Δd/ddKm + ΔM/dm`. Menor es mejor.
 * @param {PuntoSismo} a
 * @param {PuntoSismo} b
 * @param {Umbrales} [umbrales]
 * @returns {number}
 */
export function puntuacion(a, b, umbrales = UMBRALES_DEDUP) {
  const d = diferencias(a, b);
  return d.dtS / umbrales.dtS + d.ddKm / umbrales.ddKm + d.dm / umbrales.dm;
}

/**
 * Elige el sismo al que se asocia un registro nuevo por cercanía (ADR-0004, pasos 2 y 3): solo
 * los candidatos sin registro de su fuente y que cumplen los umbrales; gana la menor
 * puntuación y, en empate, el `recibidoEn` más antiguo (y después el id, para ser determinista).
 * @template {CandidatoDedup} C
 * @param {PuntoSismo & {fuente: string}} registro
 * @param {Iterable<C>} candidatos
 * @param {Umbrales} [umbrales]
 * @returns {C | null}
 */
export function elegirCandidato(registro, candidatos, umbrales = UMBRALES_DEDUP) {
  let mejor = null;
  let puntosMejor = Number.POSITIVE_INFINITY;
  for (const candidato of candidatos) {
    if (candidato.fuentes.includes(registro.fuente)) continue;
    if (!cumpleUmbrales(registro, candidato.preferido, umbrales)) continue;
    const puntos = puntuacion(registro, candidato.preferido, umbrales);
    if (
      mejor === null ||
      puntos < puntosMejor - EPSILON ||
      (Math.abs(puntos - puntosMejor) <= EPSILON &&
        (candidato.recibidoEn < mejor.recibidoEn ||
          (candidato.recibidoEn === mejor.recibidoEn && candidato.id < mejor.id)))
    ) {
      mejor = candidato;
      puntosMejor = puntos;
    }
  }
  return mejor;
}

/**
 * ¿Se pueden fusionar dos sismos canónicos (fusión tardía, ADR-0004 paso 4)? Solo si sus
 * fuentes no se solapan y sus valores preferidos cumplen los umbrales.
 * @param {Pick<CandidatoDedup, 'fuentes' | 'preferido'>} a
 * @param {Pick<CandidatoDedup, 'fuentes' | 'preferido'>} b
 * @param {Umbrales} [umbrales]
 * @returns {boolean}
 */
export function sePuedenFusionar(a, b, umbrales = UMBRALES_DEDUP) {
  if (a.fuentes.some((f) => b.fuentes.includes(f))) return false;
  return cumpleUmbrales(a.preferido, b.preferido, umbrales);
}
