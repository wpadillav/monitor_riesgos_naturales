/**
 * Asignación de país en el servidor (ADR-0005): conecta la lógica pura de `src/shared/pais.js`
 * con las dos primitivas de Turf que fija el STACK.lock. `src/shared` no puede importar
 * paquetes npm (arquitectura §5.8), así que la dependencia se expone aquí.
 *
 * Coste (P-02, informe T5.4):
 * - el desempate de la franja CO-PA usa primero la distancia aproximada propia
 *   (`distanciaABordeKm`) y solo llama a `pointToPolygonDistance` de Turf cerca de la línea
 *   equidistante;
 * - el resultado se guarda en una caché LRU por posición: el catálogo y la recomposición de un
 *   sismo piden varias veces la misma posición.
 */

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import pointToPolygonDistance from '@turf/point-to-polygon-distance';

import { distanciaABordeKm } from '../../shared/geo.js';
import { crearAsignadorPais } from '../../shared/pais.js';
import { META_ZONAS, ZONAS } from '../../shared/zonas.js';

/** Franja marina con la que se generaron las zonas (se registra al arrancar). */
export const FRANJA_KM = META_ZONAS.franjaKm;

/** Posiciones recordadas por la caché (unos 150 bytes cada una: ~1,5 MB como máximo). */
export const CACHE_POSICIONES = 10_000;

/**
 * @typedef {import('../../shared/modelo.js').UbicacionPais} UbicacionPais
 * @typedef {(lat: number, lon: number) => Readonly<UbicacionPais> | null} AsignarPais
 */

/**
 * Envuelve una función de asignación con una caché LRU por `(lat, lon)`. Los resultados están
 * congelados (`crearAsignadorPais`), así que se pueden compartir.
 * @param {AsignarPais} asignar
 * @param {number} [maximo]
 * @returns {AsignarPais & { tamano: () => number }}
 */
export function conCache(asignar, maximo = CACHE_POSICIONES) {
  /** @type {Map<string, Readonly<UbicacionPais> | null>} */
  const cache = new Map();
  const conCacheLru = (/** @type {number} */ lat, /** @type {number} */ lon) => {
    const clave = `${lat},${lon}`;
    if (cache.has(clave)) {
      const valor = /** @type {Readonly<UbicacionPais> | null} */ (cache.get(clave));
      // Al final del orden de inserción: el más reciente.
      cache.delete(clave);
      cache.set(clave, valor);
      return valor;
    }
    const valor = asignar(lat, lon);
    cache.set(clave, valor);
    if (cache.size > maximo) cache.delete(/** @type {string} */ (cache.keys().next().value));
    return valor;
  };
  return Object.assign(conCacheLru, { tamano: () => cache.size });
}

/** Asignador sin caché (pruebas y mediciones). */
export const asignarPaisSinCache = crearAsignadorPais({
  zonas: ZONAS,
  puntoEnPoligono: (punto, poligono) => booleanPointInPolygon(punto, poligono),
  distanciaAPoligono: (punto, poligono) =>
    pointToPolygonDistance(punto, poligono, { units: 'kilometers' }),
  distanciaAproximada: ([lon, lat], poligono) => distanciaABordeKm(lat, lon, poligono.coordinates),
});

/**
 * `asignarPais(lat, lon)` → `{ pais, zona, zonaHoraria, paisesCandidatos }` o `null`.
 * @type {AsignarPais}
 */
export const asignarPais = conCache(asignarPaisSinCache);
