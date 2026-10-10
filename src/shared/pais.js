/**
 * Pertenencia de una posición a un país mediante las zonas generadas (ADR-0005).
 *
 * `src/shared` no puede importar paquetes npm (§5.8) y el ADR-0005 fija
 * `@turf/boolean-point-in-polygon` y `@turf/point-to-polygon-distance` para la ejecución. Por eso
 * las dos primitivas geométricas se **inyectan**: el servidor pasa las de Turf
 * (`src/server/geo/asignar-pais.js`) y la lógica de decisión (rectángulo, contorno, desempate en
 * la frontera) queda aquí, pura y probada.
 */

/**
 * @typedef {import('./modelo.js').CodigoPais} CodigoPais
 * @typedef {import('./modelo.js').Zona} Zona
 * @typedef {import('./modelo.js').UbicacionPais} UbicacionPais
 */

/**
 * @typedef {object} GeometriaMultiPoligono
 * @property {'MultiPolygon'} type
 * @property {number[][][][]} coordinates [lon, lat]
 */

/**
 * Zona generada por `scripts/generar-zonas.js` (`zonas.js`).
 * @typedef {object} ZonaPais
 * @property {Zona} id
 * @property {CodigoPais} pais
 * @property {string} zonaHoraria
 * @property {{minLat: number, maxLat: number, minLon: number, maxLon: number}} rectangulo
 *   rectángulo de consulta a las fuentes; contiene `zona`.
 * @property {GeometriaMultiPoligono} zona territorio más franja marina, sin tierra de vecinos.
 * @property {GeometriaMultiPoligono} tierra territorio propio, para desempatar en la frontera.
 */

/**
 * @callback PuntoEnPoligono
 * @param {[number, number]} punto [lon, lat]
 * @param {GeometriaMultiPoligono} poligono
 * @returns {boolean}
 */

/**
 * @callback DistanciaAPoligono
 * @param {[number, number]} punto [lon, lat]
 * @param {GeometriaMultiPoligono} poligono
 * @returns {number} km (negativa si el punto está dentro).
 */

/**
 * ¿Está el punto dentro del rectángulo (bordes incluidos)?
 * @param {ZonaPais['rectangulo']} r
 * @param {number} lat
 * @param {number} lon
 * @returns {boolean}
 */
export function enRectangulo(r, lat, lon) {
  return lat >= r.minLat && lat <= r.maxLat && lon >= r.minLon && lon <= r.maxLon;
}

/**
 * Crea la función de asignación de país.
 *
 * Regla (ADR-0005 y HU-03):
 * 1. candidatas = zonas cuyo rectángulo y cuyo contorno contienen el punto;
 * 2. sin candidatas → `null` (no pertenece a ningún país);
 * 3. una candidata → su país, zona y zona horaria;
 * 4. varias (frontera CO-PA en el mar) → la de `tierra` más cercana; `paisesCandidatos` lleva
 *    todos los países, porque el sismo se muestra si cualquiera está marcado.
 *
 * @param {object} deps
 * @param {ReadonlyArray<ZonaPais>} deps.zonas
 * @param {PuntoEnPoligono} deps.puntoEnPoligono
 * @param {DistanciaAPoligono} deps.distanciaAPoligono
 * @returns {(lat: number, lon: number) => UbicacionPais | null}
 */
export function crearAsignadorPais({ zonas, puntoEnPoligono, distanciaAPoligono }) {
  return function asignarPais(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    /** @type {[number, number]} */
    const punto = [lon, lat];
    const candidatas = zonas.filter(
      (z) => enRectangulo(z.rectangulo, lat, lon) && puntoEnPoligono(punto, z.zona),
    );
    if (candidatas.length === 0) return null;

    let elegida = candidatas[0];
    if (candidatas.length > 1) {
      let mejor = distanciaAPoligono(punto, elegida.tierra);
      for (const zona of candidatas.slice(1)) {
        const d = distanciaAPoligono(punto, zona.tierra);
        if (d < mejor) {
          mejor = d;
          elegida = zona;
        }
      }
    }
    const paisesCandidatos = [...new Set(candidatas.map((z) => z.pais))];
    return {
      pais: elegida.pais,
      zona: elegida.id,
      zonaHoraria: elegida.zonaHoraria,
      paisesCandidatos: Object.freeze(paisesCandidatos),
    };
  };
}
