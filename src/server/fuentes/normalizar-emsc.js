/**
 * Normalizador de EMSC (FDSN y, en T4.6, WebSocket: comparten el formato de `Feature`).
 * Extrae los valores crudos según la tabla del ADR-0004 y delega la validación en
 * `crearRegistro` de `src/shared/modelo.js` (AM-05).
 */

import { crearRegistro, profundidadPositiva } from '../../shared/modelo.js';
import { elemento, idValido, propia, recorrerColeccion } from './normalizar-comun.js';

/** Tipos de evento que son sismos para el usuario: conocido y sospechado (ADR-0004). */
export const EVTYPES_SISMO = Object.freeze(['ke', 'se']);

/**
 * Normaliza un `Feature` de EMSC.
 * @param {unknown} feature
 * @param {number} ahora ms (reloj inyectado)
 * @returns {{ ok: true, registro: Readonly<import('../../shared/modelo.js').RegistroFuente> } |
 *   { ok: false, motivo: string, retirado?: string | null }}
 */
export function normalizarFeatureEmsc(feature, ahora) {
  const p = propia(feature, 'properties');
  if (p === undefined) return { ok: false, motivo: 'entrada' };

  const unid = propia(p, 'unid');
  const evtype = propia(p, 'evtype');
  if (typeof evtype !== 'string' || !EVTYPES_SISMO.includes(evtype)) {
    // Una reclasificación (voladura, explosión…) retira el sismo si ya estaba (ADR-0004).
    return { ok: false, motivo: 'tipo', retirado: idValido(unid) };
  }
  const mag = propia(p, 'mag');
  if (mag === null || mag === undefined) return { ok: false, motivo: 'sin-magnitud' };

  const coordenadas = propia(propia(feature, 'geometry'), 'coordinates');
  return crearRegistro(
    {
      fuente: 'emsc',
      idFuente: unid,
      tiempo: propia(p, 'time'),
      actualizadoEn: propia(p, 'lastupdate'),
      lat: propia(p, 'lat'),
      lon: propia(p, 'lon'),
      profundidadKm: profundidadPositiva(propia(p, 'depth'), elemento(coordenadas, 2)),
      magnitud: mag,
      magnitudTipo: propia(p, 'magtype'),
      autor: propia(p, 'auth'),
      lugar: propia(p, 'flynn_region'),
    },
    ahora,
  );
}

/**
 * Normaliza una respuesta FDSN de EMSC (`format=json`). `null` (204) es una respuesta vacía.
 * @param {unknown} datos
 * @param {number} ahora
 * @returns {import('./normalizar-comun.js').ResultadoNormalizacion}
 * @throws {import('./http-cliente.js').FuenteError} si no es una FeatureCollection
 */
export function normalizarRespuestaEmsc(datos, ahora) {
  return recorrerColeccion(datos, (f) => normalizarFeatureEmsc(f, ahora));
}
