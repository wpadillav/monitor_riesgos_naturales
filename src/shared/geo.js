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
 * Distancia aproximada, en km, de un punto al **borde** de un multipolígono GeoJSON (P-02).
 *
 * Proyecta los vértices en un plano tangente al punto (equirrectangular local) y busca el
 * segmento más cercano, sin crear objetos. A las distancias de la franja marina (≤ 150 km) el
 * error frente a la distancia geodésica de `@turf/point-to-polygon-distance` es inferior al 1 %
 * (contrastado en las pruebas). No distingue dentro de fuera: devuelve siempre un valor ≥ 0.
 * Pensado para comparar distancias cercanas entre sí; el desempate exacto lo hace Turf
 * (`src/shared/pais.js`).
 * @param {number} lat
 * @param {number} lon
 * @param {ReadonlyArray<ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>>} multipoligono
 *   `coordinates` de un `MultiPolygon` ([lon, lat])
 * @returns {number}
 */
export function distanciaABordeKm(lat, lon, multipoligono) {
  const ky = RAD * RADIO_TIERRA_KM;
  const kx = ky * Math.cos(lat * RAD);
  let minimo = Number.POSITIVE_INFINITY;
  for (const poligono of multipoligono) {
    for (const anillo of poligono) {
      let ax = (anillo[0][0] - lon) * kx;
      let ay = (anillo[0][1] - lat) * ky;
      for (let i = 1; i < anillo.length; i += 1) {
        const bx = (anillo[i][0] - lon) * kx;
        const by = (anillo[i][1] - lat) * ky;
        const vx = bx - ax;
        const vy = by - ay;
        const largo2 = vx * vx + vy * vy;
        // Proyección del origen (el punto) sobre el segmento, limitada a [0, 1].
        const t = largo2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * vx + ay * vy) / largo2));
        const px = ax + t * vx;
        const py = ay + t * vy;
        const d2 = px * px + py * py;
        if (d2 < minimo) minimo = d2;
        ax = bx;
        ay = by;
      }
    }
  }
  return Math.sqrt(minimo);
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
