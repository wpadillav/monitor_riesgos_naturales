/**
 * Log estructurado: una línea por evento en stdout (arquitectura §8.3).
 * Nunca se registran textos libres de las fuentes ni datos personales (AM-29).
 */

const PESO = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

/**
 * @typedef {'error' | 'warn' | 'info' | 'debug'} NivelLog
 * @typedef {Record<string, string | number | boolean | null | undefined>} CamposLog
 * @typedef {{
 *   error: (evento: string, campos?: CamposLog) => void,
 *   warn: (evento: string, campos?: CamposLog) => void,
 *   info: (evento: string, campos?: CamposLog) => void,
 *   debug: (evento: string, campos?: CamposLog) => void,
 * }} Log
 */

/**
 * @param {object} opciones
 * @param {'texto' | 'json'} [opciones.formato]
 * @param {NivelLog} [opciones.nivel]
 * @param {string} [opciones.version]
 * @param {{ write: (linea: string) => unknown }} [opciones.salida]
 * @param {() => number} [opciones.ahora]
 * @returns {Log}
 */
export function createLog({
  formato = 'texto',
  nivel = 'info',
  version = '',
  salida = process.stdout,
  ahora = Date.now,
} = {}) {
  const umbral = PESO[nivel];

  /** @param {NivelLog} nivelEvento */
  const escribir =
    (nivelEvento) =>
    (/** @type {string} */ evento, campos = {}) => {
      if (PESO[nivelEvento] > umbral) return;
      const ts = new Date(ahora()).toISOString();
      if (formato === 'json') {
        salida.write(`${JSON.stringify({ ts, nivel: nivelEvento, evento, version, ...campos })}\n`);
        return;
      }
      const pares = Object.entries(campos)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ');
      salida.write(`${ts} ${nivelEvento.toUpperCase()} ${evento}${pares ? ` ${pares}` : ''}\n`);
    };

  return Object.freeze({
    error: escribir('error'),
    warn: escribir('warn'),
    info: escribir('info'),
    debug: escribir('debug'),
  });
}

/** Log que descarta todo (pruebas). @type {Log} */
export const silentLog = Object.freeze({
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
});
