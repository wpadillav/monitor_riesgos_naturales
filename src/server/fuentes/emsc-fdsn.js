/**
 * EMSC FDSN (`https://www.seismicportal.eu/fdsnws/event/1/query`, CC BY 4.0). Fuente principal
 * de la consulta periódica (cada 30 s por zona, RNF-10). Sin datos responde 204.
 */

import { createFuenteFdsn } from './fdsn.js';
import { normalizarRespuestaEmsc } from './normalizar-emsc.js';

/** URL constante (AM-06). No es configuración. */
export const URL_EMSC_FDSN = 'https://www.seismicportal.eu/fdsnws/event/1/query';

/**
 * @param {Parameters<typeof createFuenteFdsn>[1]} deps
 * @returns {import('./puerto.js').FuenteConsulta}
 */
export function createEmscFdsn(deps) {
  return createFuenteFdsn(
    {
      canal: 'emsc-fdsn',
      fuente: 'emsc',
      urlBase: URL_EMSC_FDSN,
      formato: 'json',
      parametros: {
        minLat: 'minlat',
        maxLat: 'maxlat',
        minLon: 'minlon',
        maxLon: 'maxlon',
        magMin: 'minmag',
      },
      normalizar: normalizarRespuestaEmsc,
    },
    deps,
  );
}
