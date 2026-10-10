/**
 * Configuración por variables de entorno (arquitectura §8.4). Se valida al arrancar:
 * un valor inválido impide arrancar (HU-12). No hay secretos.
 */

import { validarUmbrales } from '../shared/duplicados.js';

/** Interfaces de bucle local admitidas en `HOST` (RNF-09, AM-09). */
export const HOSTS_LOOPBACK = Object.freeze(['127.0.0.1', '::1']);

const NIVELES_LOG = Object.freeze(['error', 'warn', 'info', 'debug']);
const FORMATOS_LOG = Object.freeze(['texto', 'json']);

/** Opciones de `INGESTA_MAG_MIN`: las de magnitud de la página (D5); `todas` = sin mínimo. */
export const OPCIONES_INGESTA_MAG_MIN = Object.freeze([
  'todas',
  '1.0',
  '2.0',
  '2.5',
  '3.0',
  '4.0',
  '4.5',
  '5.0',
]);

const NUMERO_DECIMAL = /^\d{1,6}(?:\.\d{1,6})?$/;
const ENTERO = /^\d{1,7}$/;

/** Error de configuración: el mensaje va en español y se muestra tal cual en la consola. */
export class ConfigError extends Error {
  /** @param {string[]} errores */
  constructor(errores) {
    super(`Configuración no válida:\n- ${errores.join('\n- ')}`);
    this.name = 'ConfigError';
    this.errores = errores;
  }
}

/**
 * @typedef {object} Config
 * @property {number} port
 * @property {'127.0.0.1' | '::1'} host
 * @property {'texto' | 'json'} logFormato
 * @property {'error' | 'warn' | 'info' | 'debug'} logNivel
 * @property {Readonly<import('../shared/duplicados.js').Umbrales>} umbralesDedup
 *   `DEDUP_DT_S`, `DEDUP_DD_KM`, `DEDUP_DM` (ADR-0004)
 * @property {number | null} ingestaMagMin `INGESTA_MAG_MIN`; `null` = todas
 * @property {number} emscIntervaloMs `EMSC_FDSN_INTERVALO_S` (≥ 30 s, RNF-10)
 * @property {number} usgsIntervaloMs `USGS_INTERVALO_S` (≥ 60 s, RNF-10)
 * @property {number} fuenteTimeoutMs `FUENTE_TIMEOUT_MS` (1000–15000, AM-04)
 * @property {number} retencionDias `RETENCION_DIAS` (1–30)
 * @property {boolean} fuentesActivas `FUENTES_ACTIVAS` (`si`/`no`): con `no` no se consulta
 *   ninguna fuente (pruebas de arranque y trabajo sin red)
 */

/**
 * Lee y valida la configuración.
 * @param {Record<string, string | undefined>} env
 * @returns {Readonly<Config>}
 * @throws {ConfigError}
 */
export function loadConfig(env) {
  const errores = [];

  const portTexto = valor(env.PORT, '3000');
  const port = /^\d{1,5}$/.test(portTexto) ? Number(portTexto) : Number.NaN;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    errores.push(`PORT debe ser un entero entre 1024 y 65535 (recibido: «${portTexto}»).`);
  }

  const host = valor(env.HOST, '127.0.0.1');
  if (!HOSTS_LOOPBACK.includes(host)) {
    errores.push(
      `HOST solo admite ${HOSTS_LOOPBACK.join(' o ')}: la aplicación solo atiende al propio equipo (recibido: «${host}»).`,
    );
  }

  const logFormato = valor(env.LOG_FORMATO, 'texto');
  if (!FORMATOS_LOG.includes(logFormato)) {
    errores.push(`LOG_FORMATO debe ser ${FORMATOS_LOG.join(' o ')} (recibido: «${logFormato}»).`);
  }

  const logNivel = valor(env.LOG_NIVEL, 'info');
  if (!NIVELES_LOG.includes(logNivel)) {
    errores.push(`LOG_NIVEL debe ser ${NIVELES_LOG.join(', ')} (recibido: «${logNivel}»).`);
  }

  const umbralesDedup = {
    dtS: decimal(env.DEDUP_DT_S, '30'),
    ddKm: decimal(env.DEDUP_DD_KM, '100'),
    dm: decimal(env.DEDUP_DM, '1.0'),
  };
  errores.push(...validarUmbrales(umbralesDedup));

  const ingestaTexto = valor(env.INGESTA_MAG_MIN, '2.0');
  if (!OPCIONES_INGESTA_MAG_MIN.includes(ingestaTexto)) {
    errores.push(
      `INGESTA_MAG_MIN debe ser una de ${OPCIONES_INGESTA_MAG_MIN.join(', ')} (recibido: «${ingestaTexto}»).`,
    );
  }
  const ingestaMagMin = ingestaTexto === 'todas' ? null : Number(ingestaTexto);

  const emscIntervaloS = entero(env.EMSC_FDSN_INTERVALO_S, '30');
  if (!(emscIntervaloS >= 30 && emscIntervaloS <= 3600)) {
    errores.push('EMSC_FDSN_INTERVALO_S debe ser un entero de 30 a 3600 segundos (RNF-10).');
  }
  const usgsIntervaloS = entero(env.USGS_INTERVALO_S, '60');
  if (!(usgsIntervaloS >= 60 && usgsIntervaloS <= 3600)) {
    errores.push('USGS_INTERVALO_S debe ser un entero de 60 a 3600 segundos (RNF-10).');
  }
  const fuenteTimeoutMs = entero(env.FUENTE_TIMEOUT_MS, '10000');
  if (!(fuenteTimeoutMs >= 1000 && fuenteTimeoutMs <= 15000)) {
    errores.push('FUENTE_TIMEOUT_MS debe ser un entero de 1000 a 15000 (AM-04).');
  }
  const retencionDias = entero(env.RETENCION_DIAS, '30');
  if (!(retencionDias >= 1 && retencionDias <= 30)) {
    errores.push('RETENCION_DIAS debe ser un entero de 1 a 30.');
  }
  const fuentesTexto = valor(env.FUENTES_ACTIVAS, 'si');
  if (fuentesTexto !== 'si' && fuentesTexto !== 'no') {
    errores.push(`FUENTES_ACTIVAS debe ser si o no (recibido: «${fuentesTexto}»).`);
  }

  if (errores.length > 0) throw new ConfigError(errores);

  return Object.freeze(
    /** @type {Config} */ ({
      port,
      host,
      logFormato,
      logNivel,
      umbralesDedup: Object.freeze(umbralesDedup),
      ingestaMagMin,
      emscIntervaloMs: emscIntervaloS * 1000,
      usgsIntervaloMs: usgsIntervaloS * 1000,
      fuenteTimeoutMs,
      retencionDias,
      fuentesActivas: fuentesTexto === 'si',
    }),
  );
}

/**
 * Comprobaciones del proceso antes de escuchar (AM-31, AM-06).
 * @param {object} entorno
 * @param {Record<string, string | undefined>} entorno.env
 * @param {number | undefined} entorno.uid `process.getuid?.()`
 * @returns {string[]} motivos para no arrancar; vacío si todo está bien
 */
export function checkProcess({ env, uid }) {
  const errores = [];
  if (uid === 0) {
    errores.push('No se ejecuta como root. Arranca la aplicación con tu usuario normal.');
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    errores.push(
      'NODE_TLS_REJECT_UNAUTHORIZED=0 desactiva la verificación TLS de las fuentes. Quita esa variable.',
    );
  }
  return errores;
}

/**
 * @param {string | undefined} bruto
 * @param {string} porDefecto
 */
function valor(bruto, porDefecto) {
  const limpio = bruto?.trim();
  return limpio ? limpio : porDefecto;
}

/**
 * Número decimal no negativo; `NaN` si el texto no lo es (lo rechaza la validación).
 * @param {string | undefined} bruto
 * @param {string} porDefecto
 */
function decimal(bruto, porDefecto) {
  const texto = valor(bruto, porDefecto);
  return NUMERO_DECIMAL.test(texto) ? Number(texto) : Number.NaN;
}

/**
 * Entero no negativo; `NaN` si el texto no lo es.
 * @param {string | undefined} bruto
 * @param {string} porDefecto
 */
function entero(bruto, porDefecto) {
  const texto = valor(bruto, porDefecto);
  return ENTERO.test(texto) ? Number(texto) : Number.NaN;
}
