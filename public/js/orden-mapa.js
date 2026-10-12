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

/**
 * Registro de los pulsos vivos por id de sismo (N-04). Cada pulso dura `duracionMs` y después se
 * retira solo; si el sismo se quita antes (baja, purga o deja de estar entre los filtrados), se
 * retira en el acto y se cancela su temporizador. El recuento (`activos`) es siempre el número
 * de pulsos en el mapa, así que el límite de P-06 no se queda ocupado por pulsos huérfanos.
 *
 * Sin Leaflet ni DOM: la capa la crean y la retiran las funciones inyectadas.
 * @template D, C
 * @param {object} opciones
 * @param {(datos: D) => C} opciones.crear añade el pulso al mapa y devuelve su capa
 * @param {(capa: C) => void} opciones.retirar
 * @param {number} opciones.duracionMs
 * @param {() => void} [opciones.alTerminar] tras retirar un pulso por fin de su animación
 * @param {(fn: () => void, ms: number) => unknown} [opciones.programar]
 * @param {(t: any) => void} [opciones.cancelar]
 */
export function crearPulsos({
  crear,
  retirar,
  duracionMs,
  alTerminar = () => {},
  programar = (fn, ms) => setTimeout(fn, ms),
  cancelar = (t) => clearTimeout(t),
}) {
  /** @type {Map<string, { capa: C, temporizador: unknown }>} */
  const vivos = new Map();

  /**
   * @param {string} id
   * @returns {boolean} había un pulso y se ha retirado
   */
  function quitar(id) {
    const pulso = vivos.get(id);
    if (!pulso) return false;
    vivos.delete(id);
    cancelar(pulso.temporizador);
    retirar(pulso.capa);
    return true;
  }

  return Object.freeze({
    /**
     * @param {string} id
     * @param {D} datos
     */
    lanzar(id, datos) {
      quitar(id);
      const capa = crear(datos);
      const temporizador = programar(() => {
        if (vivos.get(id)?.capa !== capa) return;
        vivos.delete(id);
        retirar(capa);
        alTerminar();
      }, duracionMs);
      vivos.set(id, { capa, temporizador });
    },

    quitar,

    /**
     * Retira los pulsos de los ids que ya no están (sincronización completa).
     * @param {ReadonlySet<string>} vigentes
     */
    retenerSolo(vigentes) {
      for (const id of [...vivos.keys()]) if (!vigentes.has(id)) quitar(id);
    },

    /**
     * @param {string} id
     * @returns {C | undefined} capa del pulso vivo del sismo
     */
    capa(id) {
      return vivos.get(id)?.capa;
    },

    /** Pulsos en el mapa ahora mismo. */
    get activos() {
      return vivos.size;
    },
  });
}
