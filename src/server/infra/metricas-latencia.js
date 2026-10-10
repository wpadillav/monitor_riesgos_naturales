/**
 * Métricas de latencia por fuente y canal (RNF-02, RNF-15; arquitectura §8.3).
 *
 * - `publicacionARecepcionMs` = recepción − `lastupdate` (EMSC) o `updated` (USGS).
 * - `origenARecepcionMs` = recepción − hora de origen.
 *
 * Las muestras de la última hora se guardan en memoria (como mucho unos miles de números) y
 * `resumir()` escribe una línea `latencia.resumen` por fuente y canal con `n`, p50 y p95, y las
 * vacía (una serie ya vista sigue resumiéndose con `n=0`). El temporizador horario lo pone el arranque.
 */

/** Tope de muestras por fuente y canal entre dos resúmenes (memoria acotada, AM-16). */
export const MAX_MUESTRAS = 20_000;

/**
 * Percentil por rango más cercano sobre una lista **ordenada** ascendente.
 * @param {number[]} ordenadas
 * @param {number} p entre 0 y 100
 * @returns {number | null} `null` si no hay muestras
 */
export function percentil(ordenadas, p) {
  if (ordenadas.length === 0) return null;
  const rango = Math.ceil((p / 100) * ordenadas.length);
  return ordenadas[Math.min(ordenadas.length, Math.max(1, rango)) - 1];
}

/**
 * @typedef {object} MuestraLatencia
 * @property {string} fuente `emsc` o `usgs`
 * @property {string} canal `fdsn` (T4.3) o `ws` (T4.6)
 * @property {number} publicacionARecepcionMs
 * @property {number} origenARecepcionMs
 */

/**
 * @param {object} deps
 * @param {import('./log.js').Log} deps.log
 * @returns {{ registrar: (m: MuestraLatencia) => void, resumir: () => void }}
 */
export function createMetricasLatencia({ log }) {
  /** @type {Map<string, { fuente: string, canal: string, pub: number[], origen: number[] }>} */
  const series = new Map();

  return Object.freeze({
    registrar({ fuente, canal, publicacionARecepcionMs, origenARecepcionMs }) {
      const clave = `${fuente}|${canal}`;
      let serie = series.get(clave);
      if (!serie) {
        serie = { fuente, canal, pub: [], origen: [] };
        series.set(clave, serie);
      }
      if (serie.pub.length >= MAX_MUESTRAS) return;
      serie.pub.push(publicacionARecepcionMs);
      serie.origen.push(origenARecepcionMs);
    },

    resumir() {
      for (const serie of series.values()) {
        const pub = serie.pub.toSorted((a, b) => a - b);
        const origen = serie.origen.toSorted((a, b) => a - b);
        log.info('latencia.resumen', {
          fuente: serie.fuente,
          canal: serie.canal,
          n: pub.length,
          publicacionARecepcionP50Ms: percentil(pub, 50),
          publicacionARecepcionP95Ms: percentil(pub, 95),
          origenARecepcionP50Ms: percentil(origen, 50),
          origenARecepcionP95Ms: percentil(origen, 95),
        });
        // Se conservan las series ya vistas: la hora siguiente sin sismos se resume con n=0.
        serie.pub = [];
        serie.origen = [];
      }
    },
  });
}
