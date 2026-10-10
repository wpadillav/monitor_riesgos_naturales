/**
 * Cobertura de la memoria (arquitectura §5.6): qué magnitud mínima está cargada para cada canal
 * y zona. Si un filtro de `/api/sismos` pide una magnitud menor que la cargada, hay que
 * consultar las fuentes antes de responder; si no, la respuesta sale solo de la memoria.
 *
 * `null` significa «todas las magnitudes». Una cobertura nunca sube: bajar la magnitud amplía
 * lo que se tiene; subirla no quita nada de la memoria.
 */

/**
 * ¿Cubre una magnitud cargada (`cargada`) lo que se pide (`pedida`)?
 * @param {number | null | undefined} cargada `undefined` = nada cargado aún
 * @param {number | null} pedida `null` = todas
 * @returns {boolean}
 */
export function cubre(cargada, pedida) {
  if (cargada === undefined) return false;
  if (cargada === null) return true;
  return pedida !== null && cargada <= pedida;
}

/**
 * La menor de dos magnitudes mínimas (`null` = todas es la menor).
 * @param {number | null} a
 * @param {number | null} b
 * @returns {number | null}
 */
export function minimaMagnitud(a, b) {
  if (a === null || b === null) return null;
  return Math.min(a, b);
}

/** Mapa canal|zona → magnitud mínima cargada. */
export function createCobertura() {
  /** @type {Map<string, number | null>} */
  const cargadas = new Map();
  const clave = (/** @type {string} */ canal, /** @type {string} */ zona) => `${canal}|${zona}`;

  return Object.freeze({
    /** @param {string} canal @param {string} zona @returns {number | null | undefined} */
    obtener(canal, zona) {
      return cargadas.get(clave(canal, zona));
    },

    /** @param {string} canal @param {string} zona @param {number | null} magMin */
    cubre(canal, zona, magMin) {
      return cubre(cargadas.get(clave(canal, zona)), magMin);
    },

    /**
     * Registra una carga correcta con `magMin`; solo baja la cobertura, nunca la sube.
     * @param {string} canal @param {string} zona @param {number | null} magMin
     */
    registrar(canal, zona, magMin) {
      const k = clave(canal, zona);
      const actual = cargadas.get(k);
      cargadas.set(k, actual === undefined ? magMin : minimaMagnitud(actual, magMin));
    },
  });
}
