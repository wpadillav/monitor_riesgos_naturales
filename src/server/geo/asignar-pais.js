/**
 * Asignación de país en el servidor (ADR-0005): conecta la lógica pura de `src/shared/pais.js`
 * con las dos primitivas de Turf que fija el STACK.lock. `src/shared` no puede importar
 * paquetes npm (arquitectura §5.8), así que la dependencia se expone aquí.
 */

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import pointToPolygonDistance from '@turf/point-to-polygon-distance';

import { crearAsignadorPais } from '../../shared/pais.js';
import { META_ZONAS, ZONAS } from '../../shared/zonas.js';

/** Franja marina con la que se generaron las zonas (se registra al arrancar). */
export const FRANJA_KM = META_ZONAS.franjaKm;

/**
 * `asignarPais(lat, lon)` → `{ pais, zona, zonaHoraria, paisesCandidatos }` o `null`.
 * @type {(lat: number, lon: number) => import('../../shared/modelo.js').UbicacionPais | null}
 */
export const asignarPais = crearAsignadorPais({
  zonas: ZONAS,
  puntoEnPoligono: (punto, poligono) => booleanPointInPolygon(punto, poligono),
  distanciaAPoligono: (punto, poligono) =>
    pointToPolygonDistance(punto, poligono, { units: 'kilometers' }),
});
