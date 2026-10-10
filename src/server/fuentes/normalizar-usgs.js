/**
 * Normalizador de USGS FDSN (`format=geojson`). Extrae los valores crudos según la tabla del
 * ADR-0004 y delega la validación en `crearRegistro` de `src/shared/modelo.js` (AM-05).
 */

import { crearRegistro, profundidadPositiva } from '../../shared/modelo.js';
import { elemento, idValido, propia, recorrerColeccion } from './normalizar-comun.js';

/**
 * `ids` de USGS llega como `",pt26282001,us6000u19w,"`. Devuelve los no vacíos; la validación
 * de cada id la hace `crearRegistro`.
 * @param {unknown} ids
 * @returns {string[]}
 */
export function separarIds(ids) {
  if (typeof ids !== 'string' || ids.length > 2000) return [];
  return ids.split(',').filter((id) => id !== '');
}

/**
 * Normaliza un `Feature` de USGS.
 * @param {unknown} feature
 * @param {number} ahora ms (reloj inyectado)
 * @returns {{ ok: true, registro: Readonly<import('../../shared/modelo.js').RegistroFuente> } |
 *   { ok: false, motivo: string, retirado?: string | null }}
 */
export function normalizarFeatureUsgs(feature, ahora) {
  const p = propia(feature, 'properties');
  if (p === undefined) return { ok: false, motivo: 'entrada' };

  const id = propia(feature, 'id');
  if (propia(p, 'type') !== 'earthquake') {
    return { ok: false, motivo: 'tipo', retirado: idValido(id) };
  }
  const mag = propia(p, 'mag');
  if (mag === null || mag === undefined) return { ok: false, motivo: 'sin-magnitud' };

  const coordenadas = propia(propia(feature, 'geometry'), 'coordinates');
  const net = propia(p, 'net');
  return crearRegistro(
    {
      fuente: 'usgs',
      idFuente: id,
      ids: separarIds(propia(p, 'ids')),
      tiempo: propia(p, 'time'),
      actualizadoEn: propia(p, 'updated'),
      lat: elemento(coordenadas, 1),
      lon: elemento(coordenadas, 0),
      // En USGS `coordinates[2]` ya es la profundidad positiva hacia abajo.
      profundidadKm: profundidadPositiva(elemento(coordenadas, 2)),
      magnitud: mag,
      magnitudTipo: propia(p, 'magType'),
      autor: typeof net === 'string' ? net.toUpperCase() : net,
      lugar: propia(p, 'place'),
    },
    ahora,
  );
}

/**
 * Normaliza una respuesta FDSN de USGS.
 * @param {unknown} datos
 * @param {number} ahora
 * @returns {import('./normalizar-comun.js').ResultadoNormalizacion}
 * @throws {import('./http-cliente.js').FuenteError} si no es una FeatureCollection
 */
export function normalizarRespuestaUsgs(datos, ahora) {
  return recorrerColeccion(datos, (f) => normalizarFeatureUsgs(f, ahora));
}
