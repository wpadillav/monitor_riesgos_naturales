/**
 * Retención (arquitectura §5.5; AM-16): cada 60 s se purgan del catálogo los sismos con
 * `tiempo` anterior a la retención (`RETENCION_DIAS`, como máximo 30). El tope duro de sismos
 * lo aplica el propio catálogo en cada ingesta.
 */

export const INTERVALO_PURGA_MS = 60_000;

/**
 * @param {object} deps
 * @param {{ purgar: (ahora: number) => number }} deps.catalogo
 * @param {import('../infra/reloj.js').Reloj} deps.reloj
 * @param {import('../infra/log.js').Log} deps.log
 * @param {number} [deps.intervaloMs]
 * @returns {{ arrancar: () => void, detener: () => void, purgarAhora: () => number }}
 */
export function createRetencion({ catalogo, reloj, log, intervaloMs = INTERVALO_PURGA_MS }) {
  /** @type {ReturnType<typeof setInterval> | null} */
  let temporizador = null;

  function purgarAhora() {
    const purgados = catalogo.purgar(reloj.ahora());
    if (purgados > 0) log.info('retencion.purga', { purgados });
    return purgados;
  }

  return Object.freeze({
    arrancar() {
      if (temporizador) return;
      temporizador = setInterval(purgarAhora, intervaloMs);
      temporizador.unref?.();
    },
    detener() {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
    },
    purgarAhora,
  });
}
