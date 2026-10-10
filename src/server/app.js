/**
 * `createApp(deps)`: construye la aplicación Hono sin abrir puertos, para que las pruebas
 * la ejerciten con `app.request()` (arquitectura §1.5).
 */

import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { problemResponse } from './http/errores.js';
import { registerStatic } from './http/estaticos.js';
import {
  createRejectionLogger,
  hostAllowlist,
  readOnlyMethods,
  sameOriginOnly,
  securityHeaders,
} from './http/middlewares.js';
import { registerHealthRoutes } from './http/rutas-salud.js';
import { silentLog } from './infra/log.js';
import { systemClock } from './infra/reloj.js';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * @typedef {object} AppDeps
 * @property {number} port puerto de escucha: define la lista blanca de `Host`
 * @property {string} [version]
 * @property {import('./infra/log.js').Log} [log]
 * @property {import('./infra/reloj.js').Reloj} [reloj]
 * @property {number} [arrancadoEn]
 * @property {() => import('./http/rutas-salud.js').EstadoFuente[]} [obtenerFuentes]
 * @property {() => number} [contarSismos]
 * @property {() => number} [contarClientesSse]
 * @property {() => number} [medirMemoriaRssMb]
 * @property {string} [projectRoot]
 */

/**
 * @param {AppDeps} deps
 * @returns {Hono}
 */
export function createApp(deps) {
  const log = deps.log ?? silentLog;
  const reloj = deps.reloj ?? systemClock;
  const onReject = createRejectionLogger(log, reloj);

  const app = new Hono();

  app.use('*', securityHeaders());
  app.use('*', hostAllowlist({ port: deps.port, onReject }));
  app.use('/api/*', sameOriginOnly({ onReject }));
  app.use('*', readOnlyMethods({ onReject }));

  // Hasta T4.3/T4.6 no hay fuentes, catálogo ni SSE: valores neutros.
  registerHealthRoutes(app, {
    version: deps.version ?? '0.0.0',
    arrancadoEn: deps.arrancadoEn ?? reloj.ahora(),
    reloj,
    obtenerFuentes: deps.obtenerFuentes ?? (() => []),
    contarSismos: deps.contarSismos ?? (() => 0),
    contarClientesSse: deps.contarClientesSse ?? (() => 0),
    medirMemoriaRssMb: deps.medirMemoriaRssMb ?? (() => process.memoryUsage.rss() / 1048576),
  });

  registerStatic(app, deps.projectRoot ?? PROJECT_ROOT);

  app.notFound(() => problemResponse('no-encontrado'));

  // AM-28: nunca trazas ni rutas en la respuesta; el detalle va al log con un requestId.
  app.onError((err, c) => {
    const requestId = crypto.randomUUID();
    log.error('error', {
      requestId,
      ruta: c.req.path,
      mensaje: err instanceof Error ? err.message : String(err),
      pila: err instanceof Error ? err.stack : undefined,
    });
    return problemResponse('error-interno');
  });

  return app;
}
