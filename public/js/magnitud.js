/**
 * Presentación de la magnitud: escala de colores, texto, radio y borde (tokens.md §3). Fija: no
 * depende del umbral de avisos. Se distingue por número, tamaño y grosor del borde, además del
 * color (WCAG 1.4.1). El redondeo a un decimal es el compartido con el servidor (`redondear1` de
 * `src/shared/reglas.js`, D1): aquí no hay ninguna regla propia.
 */

import { redondear1 } from '/shared/reglas.js';

/** Colores de relleno por banda (`--mag-1` … `--mag-5`), iguales en los dos temas. */
export const COLOR_BANDA = Object.freeze(['#4a5568', '#f2c94c', '#f08a3c', '#c62828', '#6a1b9a']);

/** Textos de la leyenda por banda (textos.md §7). */
export const TEXTO_BANDA = Object.freeze([
  'Menos de 3.0',
  '3.0 a 3.9',
  '4.0 a 4.4',
  '4.5 a 5.9',
  '6.0 o más',
]);

/**
 * Magnitud tal como se muestra: punto decimal y un decimal («4.2», «5.0»).
 * @param {number} magnitud
 * @returns {string}
 */
export function formatearMagnitud(magnitud) {
  if (!Number.isFinite(magnitud)) return '?';
  return redondear1(magnitud).toFixed(1);
}

/**
 * Banda de 1 a 5 según la magnitud redondeada.
 * @param {number} magnitud
 * @returns {1 | 2 | 3 | 4 | 5}
 */
export function bandaMagnitud(magnitud) {
  const m = redondear1(magnitud);
  if (!(m >= 3)) return 1;
  if (m < 4) return 2;
  if (m < 4.5) return 3;
  if (m < 6) return 4;
  return 5;
}

/**
 * Radio del marcador en píxeles: `M × 2.6`, con un mínimo de 4 px.
 * @param {number} magnitud
 * @returns {number}
 */
export function radioMarcador(magnitud) {
  const m = redondear1(magnitud);
  return Number.isFinite(m) ? Math.max(4, m * 2.6) : 4;
}

/**
 * Grosor del borde del marcador: 1 px (B1–B3), 2 px (B4) y 3 px (B5).
 * @param {number} magnitud
 * @returns {number}
 */
export function bordeMarcador(magnitud) {
  const banda = bandaMagnitud(magnitud);
  if (banda === 5) return 3;
  if (banda === 4) return 2;
  return 1;
}
