/**
 * Lógica pura del mapa (sin Leaflet ni DOM), para las pruebas unitarias: orden de dibujo de los
 * marcadores (P-01) y límite de pulsos (P-06).
 */

/** Pulsos animados a la vez como máximo (P-06): los de los sismos más recientes. */
export const MAX_PULSOS = 10;

/**
 * Orden de dibujo: los grandes debajo y los pequeños encima; a igual magnitud, el más reciente
 * encima (wireframes §8).
 * @param {{ id: string, magnitud: number, instante: number }} a
 * @param {{ id: string, magnitud: number, instante: number }} b
 */
export function ordenDibujo(a, b) {
  return (
    b.magnitud - a.magnitud || a.instante - b.instante || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Primera posición de `orden` (ordenado con {@link ordenDibujo}) donde `x` no va antes.
 * @template {{ id: string, magnitud: number, instante: number }} T
 * @param {T[]} orden
 * @param {{ id: string, magnitud: number, instante: number }} x
 */
export function posicionDibujo(orden, x) {
  let lo = 0;
  let hi = orden.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ordenDibujo(orden[mid], x) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Qué sismos recientes pulsan (P-06): como mucho `libres`, los más recientes.
 * @template {{ instante: number }} T
 * @param {T[]} candidatos
 * @param {number} libres
 * @returns {T[]}
 */
export function elegirPulsos(candidatos, libres) {
  if (libres <= 0) return [];
  return [...candidatos].sort((a, b) => b.instante - a.instante).slice(0, libres);
}
