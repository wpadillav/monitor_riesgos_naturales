/**
 * Estáticos (AM-20, AM-30): solo `public/`, `src/shared` en `/shared/` (solo `.js`) y
 * Leaflet con una ruta explícita por archivo. Nunca `node_modules` entero ni archivos ocultos.
 *
 * Recorrido de rutas: `@hono/node-server` construye la URL con `new URL()`, que resuelve los
 * segmentos `..` (también `%2e%2e`) **antes** de que Hono vea la ruta. Así,
 * `/shared/../shared/x.js` llegaba como `/shared/x.js` y se servía. Por eso se mira además la
 * ruta **cruda** de la petición (`incoming.url`) y se rechaza con 404 cualquier segmento que
 * empiece por punto, barra invertida o NUL, en claro o codificado (hasta 3 capas).
 */

import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';

/** Archivos de Leaflet publicados en /vendor/leaflet/ (relativos a node_modules/leaflet/dist). */
export const LEAFLET_FILES = Object.freeze([
  'leaflet.js',
  'leaflet.css',
  'images/layers.png',
  'images/layers-2x.png',
  'images/marker-icon.png',
  'images/marker-icon-2x.png',
  'images/marker-shadow.png',
]);

/** Algún segmento empieza por punto: `.git`, `.env`, `..`… */
const HIDDEN_SEGMENT = /(?:^|\/)\./;

/** Capas de codificación que se deshacen como máximo (`%252e` → `%2e` → `.`). */
const MAX_DECODIFICACIONES = 3;

/**
 * ¿La ruta cruda de la petición intenta un recorrido o un archivo oculto? Función pura.
 * Solo mira la ruta (no la *query*). Se rechaza si algún segmento empieza por punto (`.`, `..`,
 * `.env`), si hay barra invertida o NUL, si la codificación está mal formada o si tiene más de
 * {@link MAX_DECODIFICACIONES} capas.
 * @param {string} objetivo destino de la petición tal como llegó (`/ruta?query`)
 * @returns {boolean}
 */
export function esRutaCrudaPeligrosa(objetivo) {
  // Forma absoluta (`GET http://host/ruta`): se quita el esquema y la autoridad.
  let ruta = objetivo.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '');
  const corte = ruta.search(/[?#]/);
  if (corte !== -1) ruta = ruta.slice(0, corte);
  for (let capa = 0; capa <= MAX_DECODIFICACIONES; capa += 1) {
    if (ruta.includes('\\') || ruta.includes('\0') || HIDDEN_SEGMENT.test(ruta)) return true;
    if (!ruta.includes('%')) return false;
    let decodificada;
    try {
      decodificada = decodeURIComponent(ruta);
    } catch {
      return true;
    }
    if (decodificada === ruta) return false;
    ruta = decodificada;
  }
  return true;
}

/**
 * Middleware: 404 sin tocar el disco si la ruta cruda es sospechosa (AM-30). Con
 * `@hono/node-server` la ruta cruda está en `c.env.incoming.url`; sin él (pruebas con
 * `app.request`), se usa la URL de la petición.
 * @returns {import('hono').MiddlewareHandler}
 */
export function rechazarRutasPeligrosas() {
  return async (c, next) => {
    const cruda = /** @type {{ incoming?: { url?: unknown } } | undefined} */ (c.env)?.incoming
      ?.url;
    const objetivo = typeof cruda === 'string' ? cruda : new URL(c.req.url).pathname;
    if (esRutaCrudaPeligrosa(objetivo)) return c.notFound();
    await next();
  };
}

/**
 * @param {import('hono').Hono} app
 * @param {string} projectRoot ruta absoluta de la raíz del proyecto
 */
export function registerStatic(app, projectRoot) {
  const publicDir = join(projectRoot, 'public');
  const sharedDir = join(projectRoot, 'src', 'shared');
  const leafletDir = join(projectRoot, 'node_modules', 'leaflet', 'dist');

  // Rutas ocultas: 404 sin tocar el disco.
  app.use('*', async (c, next) => {
    if (HIDDEN_SEGMENT.test(c.req.path)) return c.notFound();
    await next();
  });

  for (const archivo of LEAFLET_FILES) {
    app.get(`/vendor/leaflet/${archivo}`, serveStatic({ path: join(leafletDir, archivo) }));
  }

  app.use('/shared/*', async (c, next) => {
    if (!c.req.path.endsWith('.js')) return c.notFound();
    await next();
  });
  app.get(
    '/shared/*',
    serveStatic({
      root: sharedDir,
      rewriteRequestPath: (ruta) => ruta.slice('/shared'.length),
    }),
  );

  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/shared/')) return next();
    return serveStatic({ root: publicDir })(c, next);
  });
}
