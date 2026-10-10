/**
 * Geometría esférica mínima, sin dependencias (arquitectura §5.8 y §12).
 */

/** Radio medio de la Tierra en km: el mismo que usa `@turf/distance` 7.4.0 (6 371 008,8 m). */
export const RADIO_TIERRA_KM = 6371.0088;

const RAD = Math.PI / 180;

/**
 * Distancia de círculo máximo (haversine) entre dos puntos, en km.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Lleva una longitud a [−180, 180]. EMSC admite valores en ±360.
 * @param {number} lon
 * @returns {number}
 */
export function normalizarLongitud(lon) {
  if (lon >= -180 && lon <= 180) return lon;
  const r = ((((lon + 180) % 360) + 360) % 360) - 180;
  return r === -180 && lon > 0 ? 180 : r;
}
