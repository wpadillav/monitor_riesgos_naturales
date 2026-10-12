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
 * @callback DistanciaAproximada
 * @param {[number, number]} punto [lon, lat]
 * @param {GeometriaMultiPoligono} poligono
 * @returns {number} km hasta el borde, ≥ 0 (barata, sin signo).
 */

/** Margen de empate de la distancia aproximada: 1 km más un 2 % (P-02). */
export const MARGEN_EMPATE = Object.freeze({ km: 1, fraccion: 0.02 });

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
 * **Coste (P-02).** La distancia exacta de Turf cuesta decenas de ms por llamada en la franja
 * CO-PA. Si se inyecta `distanciaAproximada`, el desempate la usa primero (con signo: negativa
 * dentro de la `tierra`) y solo recurre a `distanciaAPoligono` cuando las dos mejores quedan a
 * menos de `MARGEN_EMPATE`: así el resultado es el mismo que con Turf, pero Turf solo se llama
 * cerca de la línea equidistante.
 *
 * El resultado está congelado: se puede compartir entre llamadas (caché del servidor).
 *
 * @param {object} deps
 * @param {ReadonlyArray<ZonaPais>} deps.zonas
 * @param {PuntoEnPoligono} deps.puntoEnPoligono
 * @param {DistanciaAPoligono} deps.distanciaAPoligono exacta, con signo
 * @param {DistanciaAproximada} [deps.distanciaAproximada] barata, sin signo
 * @returns {(lat: number, lon: number) => Readonly<UbicacionPais> | null}
 */
export function crearAsignadorPais({
  zonas,
  puntoEnPoligono,
  distanciaAPoligono,
  distanciaAproximada,
}) {
  /**
   * @param {[number, number]} punto
   * @param {ReadonlyArray<ZonaPais>} candidatas
   * @param {(punto: [number, number], zona: ZonaPais) => number} distancia
   * @returns {{ elegida: ZonaPais, mejor: number, segunda: number }}
   */
  function masCercana(punto, candidatas, distancia) {
    let elegida = candidatas[0];
    let mejor = distancia(punto, elegida);
    let segunda = Number.POSITIVE_INFINITY;
    for (const zona of candidatas.slice(1)) {
      const d = distancia(punto, zona);
      if (d < mejor) {
        segunda = mejor;
        mejor = d;
        elegida = zona;
      } else if (d < segunda) {
        segunda = d;
      }
    }
    return { elegida, mejor, segunda };
  }

  const exacta = (punto, zona) => distanciaAPoligono(punto, zona.tierra);
  const aproximada = (punto, zona) => {
    const d = /** @type {DistanciaAproximada} */ (distanciaAproximada)(punto, zona.tierra);
    return puntoEnPoligono(punto, zona.tierra) ? -d : d;
  };

  /** @param {[number, number]} punto @param {ReadonlyArray<ZonaPais>} candidatas */
  function desempatar(punto, candidatas) {
    if (distanciaAproximada) {
      const r = masCercana(punto, candidatas, aproximada);
      const margen = MARGEN_EMPATE.km + MARGEN_EMPATE.fraccion * Math.abs(r.segunda);
      if (r.segunda - r.mejor > margen) return r.elegida;
    }
    return masCercana(punto, candidatas, exacta).elegida;
  }

  return function asignarPais(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    /** @type {[number, number]} */
    const punto = [lon, lat];
    const candidatas = zonas.filter(
      (z) => enRectangulo(z.rectangulo, lat, lon) && puntoEnPoligono(punto, z.zona),
    );
    if (candidatas.length === 0) return null;

    const elegida = candidatas.length > 1 ? desempatar(punto, candidatas) : candidatas[0];
    const paisesCandidatos = [...new Set(candidatas.map((z) => z.pais))];
    return Object.freeze({
      pais: elegida.pais,
      zona: elegida.id,
      zonaHoraria: elegida.zonaHoraria,
      paisesCandidatos: Object.freeze(paisesCandidatos),
    });
  };
}
