/**
 * Agrupa los cambios del estado para repintar como mucho una vez por frame (P-01, RNF-01).
 *
 * `EventSource` entrega cada mensaje en su propia tarea y entre una y otra se vacían las
 * microtareas, así que `queueMicrotask` no agrupaba nada: una ráfaga de 1 000 sismos eran 1 000
 * repintados completos. Aquí los cambios se anotan (ids afectados) y se pintan en el siguiente
 * `requestAnimationFrame`, una sola vez, solo con lo que ha cambiado.
 *
 * - Un `reemplazo` (carga) o demasiados ids sueltos convierten el lote en «completo».
 * - La memoria está acotada: como mucho `limite` ids; por encima, el lote pasa a completo.
 * - `vaciar()` pinta en el acto lo pendiente (antes de usar la lista o el mapa por un clic).
 * - Si `pintar` lanza (N-01), los ids del lote ya se han soltado: el siguiente lote se marca como
 *   completo para resincronizar todo, se reprograma otro frame y el error se registra. El error no
 *   se propaga, para no romper al que llamó a `vaciar()` (un clic) ni el bucle de frames.
 */

/** Por encima de estos ids sueltos en un frame se repinta entero (es más barato). */
export const LIMITE_IDS = 2_000;

/**
 * @typedef {{ completo: boolean, ids: ReadonlySet<string> }} Lote
 */

/**
 * @param {object} opciones
 * @param {(lote: Lote) => void} opciones.pintar
 * @param {(fn: () => void) => unknown} [opciones.programar] por defecto, `requestAnimationFrame`
 * @param {number} [opciones.limite]
 */
export function crearAgrupador({
  pintar,
  programar = (fn) => requestAnimationFrame(fn),
  limite = LIMITE_IDS,
}) {
  let completo = false;
  /** @type {Set<string>} */
  let ids = new Set();
  let programado = false;
  let hayCambios = false;

  function programarFrame() {
    if (programado) return;
    programado = true;
    programar(() => {
      if (programado) vaciar();
    });
  }

  function vaciar() {
    programado = false;
    if (!hayCambios) return;
    const lote = { completo, ids };
    completo = false;
    ids = new Set();
    hayCambios = false;
    try {
      pintar(lote);
    } catch (err) {
      // El mapa o la lista pueden haber quedado a medias: el próximo pintado es completo (N-01).
      completo = true;
      ids = new Set();
      hayCambios = true;
      programarFrame();
      console.error('agrupador: falló el pintado; se repintará entero en el siguiente frame', err);
    }
  }

  return Object.freeze({
    /**
     * @param {{ tipo: string, ids: ReadonlyArray<string> }} cambio de `estado.suscribir`
     */
    anotar(cambio) {
      hayCambios = true;
      if (!completo) {
        if (cambio.tipo === 'reemplazo' || ids.size + cambio.ids.length > limite) {
          completo = true;
          ids = new Set();
        } else {
          for (const id of cambio.ids) ids.add(id);
        }
      }
      programarFrame();
    },

    /** Pinta ya lo pendiente (si lo hay); el frame programado ya no hace nada. */
    vaciar,

    /** @returns {boolean} hay cambios sin pintar */
    get pendiente() {
      return hayCambios;
    },
  });
}
