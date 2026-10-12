/**
 * Saneado de textos externos (AM-05, AM-23). Común al servidor y a la página.
 */

/**
 * Caracteres que se eliminan: C0 (salvo los espacios en blanco, que se convierten en espacio),
 * DEL, C1 y marcas de dirección bidi (U+061C, U+200E/F, U+202A–202E, U+2066–2069). Todos van
 * escritos como escapes `\u…`: así se ven en una revisión de código (R-20, S-06).
 */
const PROHIBIDOS =
  // eslint-disable-next-line no-control-regex -- es justo lo que hay que quitar
  /[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
// eslint-disable-next-line no-control-regex -- tabuladores y saltos de línea pasan a espacio
const ESPACIOS = /[\u0009-\u000D\s]+/g;

/**
 * Devuelve el texto sin caracteres de control ni marcas bidi, con los espacios colapsados y
 * recortado a `max` puntos de código (sin partir pares sustitutos). Si no es una cadena,
 * devuelve `''`.
 * @param {unknown} texto
 * @param {number} max longitud máxima en puntos de código (entero ≥ 0)
 * @returns {string}
 */
export function sanear(texto, max) {
  if (typeof texto !== 'string') return '';
  const limpio = texto.replace(PROHIBIDOS, '').replace(ESPACIOS, ' ').trim();
  const puntos = Array.from(limpio);
  return puntos.length > max ? puntos.slice(0, max).join('').trimEnd() : limpio;
}
