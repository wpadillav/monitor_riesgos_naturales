/**
 * Errores de la API en `application/problem+json` (RFC 9457) con `type`
 * `urn:terremotos:problema:<codigo>` (arquitectura §8.2, contrato `Problema`).
 */

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

/** Catálogo cerrado de problemas: título y detalle fijos, sin datos de la petición. */
export const PROBLEMAS = Object.freeze({
  'parametro-invalido': {
    status: 400,
    title: 'Parámetro no válido',
    detail: 'Algún parámetro de la consulta no es válido. El detalle está en «errors».',
  },
  'origen-no-permitido': {
    status: 403,
    title: 'Origen no permitido',
    detail: 'La API solo atiende peticiones de la propia aplicación.',
  },
  'no-encontrado': {
    status: 404,
    title: 'No encontrado',
    detail: 'El recurso solicitado no existe.',
  },
  'metodo-no-permitido': {
    status: 405,
    title: 'Método no permitido',
    detail: 'Solo se admiten GET y HEAD.',
  },
  'host-no-permitido': {
    status: 421,
    title: 'Host no permitido',
    detail: 'La aplicación solo atiende peticiones dirigidas a localhost.',
  },
  'error-interno': {
    status: 500,
    title: 'Error interno',
    detail: 'Se produjo un error inesperado. Consulta la consola del servidor.',
  },
});

/**
 * Error de un parámetro (contrato `Problema.errors[]`). `parametro` y `mensaje` son textos
 * fijos del servidor: nunca se refleja lo que llegó en la petición.
 * @typedef {{ parametro: string, mensaje: string }} ErrorParametro
 */

/**
 * Construye la respuesta problem+json.
 * @param {keyof typeof PROBLEMAS} codigo
 * @param {Record<string, string>} [cabeceras]
 * @param {{ instance?: string, errors?: ErrorParametro[] }} [extra]
 * @returns {Response}
 */
export function problemResponse(codigo, cabeceras = {}, extra = {}) {
  const { status, title, detail } = PROBLEMAS[codigo];
  /** @type {Record<string, unknown>} */
  const cuerpo = { type: `urn:terremotos:problema:${codigo}`, title, status, detail };
  if (extra.instance) cuerpo.instance = extra.instance;
  if (extra.errors) cuerpo.errors = extra.errors;
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': PROBLEM_CONTENT_TYPE, ...cabeceras },
  });
}
