/**
 * Enlaces «Más info» (AM-02). El servidor los construye a partir del id con plantillas fijas; el
 * campo `url` de la fuente no se usa nunca. La página repite la comprobación antes de asignar
 * `href`.
 */

/** Identificador de evento admitido en las plantillas (contrato `UrlFicha`). */
export const PATRON_ID_FUENTE = /^[A-Za-z0-9_.-]{1,64}$/;

const PLANTILLAS = Object.freeze({
  emsc: 'https://www.seismicportal.eu/eventdetails.html?unid=',
  usgs: 'https://earthquake.usgs.gov/earthquakes/eventpage/',
});

/** Mismo patrón que `UrlFicha` en `docs/api/openapi.yaml`. */
const PATRON_URL_FICHA =
  /^https:\/\/(?:www\.seismicportal\.eu\/eventdetails\.html\?unid=|earthquake\.usgs\.gov\/earthquakes\/eventpage\/)[A-Za-z0-9_.-]{1,64}$/;

/**
 * URL de la ficha del evento en su fuente, o `null` si la fuente o el id no son válidos.
 * @param {'emsc' | 'usgs'} fuente
 * @param {string} id
 * @returns {string | null}
 */
export function urlFicha(fuente, id) {
  if (!Object.hasOwn(PLANTILLAS, fuente)) return null;
  if (typeof id !== 'string' || !PATRON_ID_FUENTE.test(id)) return null;
  return PLANTILLAS[fuente] + encodeURIComponent(id);
}

/**
 * Comprueba que una URL es exactamente una ficha de EMSC o USGS construida con las plantillas.
 * Rechaza `javascript:`, `data:`, `//host`, dominios parecidos y cualquier otro prefijo.
 * @param {unknown} url
 * @returns {boolean}
 */
export function esUrlFichaValida(url) {
  return typeof url === 'string' && PATRON_URL_FICHA.test(url);
}
