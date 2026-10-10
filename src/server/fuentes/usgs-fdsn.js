/**
 * USGS FDSN (`https://earthquake.usgs.gov/fdsnws/event/1/query`, dominio público).
 * Complemento de EMSC (cada 60 s por zona, RNF-10). Sin datos responde 200 con 0 `features`.
 */

import { createFuenteFdsn } from './fdsn.js';
import { normalizarRespuestaUsgs } from './normalizar-usgs.js';

/** URL constante (AM-06). No es configuración. */
export const URL_USGS_FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

/**
 * @param {Parameters<typeof createFuenteFdsn>[1]} deps
 * @returns {import('./puerto.js').FuenteConsulta}
 */
export function createUsgsFdsn(deps) {
  return createFuenteFdsn(
    {
      canal: 'usgs',
      fuente: 'usgs',
      urlBase: URL_USGS_FDSN,
      formato: 'geojson',
      parametros: {
        minLat: 'minlatitude',
        maxLat: 'maxlatitude',
        minLon: 'minlongitude',
        maxLon: 'maxlongitude',
        magMin: 'minmagnitude',
      },
      normalizar: normalizarRespuestaUsgs,
    },
    deps,
  );
}
