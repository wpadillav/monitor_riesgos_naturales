/**
 * Errores de la API en `application/problem+json` (RFC 9457) con `type`
 * `urn:terremotos:problema:<codigo>` (arquitectura §8.2, contrato `Problema`).
 */

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

/** Catálogo cerrado de problemas: título y detalle fijos, sin datos de la petición. */
export const PROBLEMAS = Object.freeze({
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
 * Construye la respuesta problem+json.
 * @param {keyof typeof PROBLEMAS} codigo
 * @param {Record<string, string>} [cabeceras]
 * @returns {Response}
 */
export function problemResponse(codigo, cabeceras = {}) {
  const { status, title, detail } = PROBLEMAS[codigo];
  const cuerpo = { type: `urn:terremotos:problema:${codigo}`, title, status, detail };
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': PROBLEM_CONTENT_TYPE, ...cabeceras },
  });
}
