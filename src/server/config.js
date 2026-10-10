/**
 * Configuración por variables de entorno (arquitectura §8.4). Se valida al arrancar:
 * un valor inválido impide arrancar (HU-12). No hay secretos.
 */

/** Interfaces de bucle local admitidas en `HOST` (RNF-09, AM-09). */
export const HOSTS_LOOPBACK = Object.freeze(['127.0.0.1', '::1']);

const NIVELES_LOG = Object.freeze(['error', 'warn', 'info', 'debug']);
const FORMATOS_LOG = Object.freeze(['texto', 'json']);

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

  if (errores.length > 0) throw new ConfigError(errores);

  return Object.freeze(/** @type {Config} */ ({ port, host, logFormato, logNivel }));
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
