/**
 * Estáticos (AM-20, AM-30): solo `public/`, `src/shared` en `/shared/` (solo `.js`) y
 * Leaflet con una ruta explícita por archivo. Nunca `node_modules` entero ni archivos ocultos.
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
