/**
 * Log estructurado: una línea por evento en stdout (arquitectura §8.3).
 * Nunca se registran textos libres de las fuentes ni datos personales (AM-29).
 */

const PESO = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

/**
 * DEL, C1 (U+0080–U+009F, incluido U+009B, el CSI de 8 bits) y los separadores de línea
 * Unicode: `JSON.stringify` no los escapa (S-01, AM-29). C0 y `\n` ya salen escapados.
 */
const NO_IMPRIMIBLES = /[\u007f-\u009f\u2028\u2029]/g;

/**
 * Escapa los caracteres no imprimibles que deja pasar `JSON.stringify` como `\uXXXX`. Se aplica
 * a la línea ya serializada, en los dos formatos.
 * @param {string} linea
 * @returns {string}
 */
export function escaparNoImprimibles(linea) {
  return linea.replace(
    NO_IMPRIMIBLES,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

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
        const json = JSON.stringify({ ts, nivel: nivelEvento, evento, version, ...campos });
        salida.write(`${escaparNoImprimibles(json)}\n`);
        return;
      }
      const pares = Object.entries(campos)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(' ');
      const linea = `${ts} ${nivelEvento.toUpperCase()} ${evento}${pares ? ` ${pares}` : ''}`;
      salida.write(`${escaparNoImprimibles(linea)}\n`);
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
