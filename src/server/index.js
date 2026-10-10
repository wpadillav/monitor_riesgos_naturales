/**
 * Arranque (`npm start`): valida la configuración y el proceso, escucha solo en loopback
 * y apaga de forma ordenada con SIGINT/SIGTERM (HU-12, RNF-09, AM-09, AM-31).
 */

import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { NOMBRE_APLICACION } from '../shared/constantes.js';
import { createApp } from './app.js';
import { ConfigError, checkProcess, loadConfig } from './config.js';
import { createLog } from './infra/log.js';
import { systemClock } from './infra/reloj.js';

/** @param {string} mensaje */
function abortStartup(mensaje) {
  process.stderr.write(`${mensaje}\n`);
  process.exit(1);
}

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) abortStartup(err.message);
  throw err;
}

const motivos = checkProcess({ env: process.env, uid: process.getuid?.() });
if (motivos.length > 0) abortStartup(`No se puede arrancar:\n- ${motivos.join('\n- ')}`);

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const log = createLog({ formato: config.logFormato, nivel: config.logNivel, version });
const arrancadoEn = systemClock.ahora();

const app = createApp({ port: config.port, version, log, reloj: systemClock, arrancadoEn });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => {
  // Primera línea en texto plano en los dos formatos (arquitectura §8.3, HU-12).
  process.stdout.write(`${NOMBRE_APLICACION} en http://localhost:${config.port}\n`);
  log.info('servidor.escuchando', {
    host: config.host,
    puerto: config.port,
    nodo: process.version,
  });
});

server.on('error', (err) => {
  if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EADDRINUSE') {
    abortStartup(
      `El puerto ${config.port} está ocupado. Usa otro con la variable de entorno PORT, por ejemplo: PORT=3100 npm start`,
    );
  }
  log.error('error', { mensaje: err.message, pila: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (motivo) => {
  log.error('error', { mensaje: motivo instanceof Error ? motivo.message : String(motivo) });
});

/** @param {NodeJS.Signals} senal */
function shutdown(senal) {
  log.info('servidor.parando', { senal });
  server.close(() => process.exit(0));
  // Si alguna conexión no se cierra en 5 s, se fuerza la salida.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
