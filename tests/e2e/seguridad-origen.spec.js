// Abuso cross-site (AM-11, hallazgo S-03 de docs/seguridad/revision-T5.3.md). Una página servida
// por **otro origen local** (otro puerto, como el Apache de `http://localhost:80`) intenta leer
// `/api/sismos` y abrir `/api/stream`. Es el **navegador real** el que pone `Origin` y
// `Sec-Fetch-Site`; el servidor tiene que responder 403 sin cabeceras CORS y la página no puede
// leer nada.
//
// Cada prueba monta la aplicación real (`createApp`, con los mismos middlewares que
// `src/server/index.js`) en un puerto libre de loopback y un servidor estático mínimo para la
// página ajena. La aplicación se sirve envuelta en un registro de peticiones: Chromium no avisa a
// Playwright de las respuestas que bloquea por CORS, así que lo que envió el navegador y lo que
// respondió el servidor se comprueban en el lado del servidor, igual en los dos navegadores.
// No usa `apoyo.js`: su `/api/stream` simulado interceptaría justo la petición que se prueba.

import { createServer } from 'node:http';
import { serve } from '@hono/node-server';
import { test as base, expect } from '@playwright/test';
import { createApp } from '../../src/server/app.js';
import { createLog } from '../../src/server/infra/log.js';

/** Puerto libre en loopback. */
async function puertoLibre() {
  const srv = createServer();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (srv.address());
  await new Promise((ok) => srv.close(() => ok(undefined)));
  return port;
}

/**
 * @typedef {{ ruta: string, peticion: Record<string, string>, status: number,
 *   respuesta: Record<string, string> }} Intercambio
 * @typedef {{ origen: string, registro: Intercambio[], log: string[],
 *   clientesSse: () => Promise<number> }} ServidorApp
 */

const test = base.extend({
  /** Aplicación real en un puerto libre, con registro de peticiones y log. @type {ServidorApp} */
  // Playwright exige desestructurar el primer argumento aunque el fixture no dependa de otros.
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, usar) => {
    const puerto = await puertoLibre();
    /** @type {string[]} */
    const log = [];
    const app = createApp({
      port: puerto,
      version: '2.0.0',
      log: createLog({ nivel: 'warn', salida: { write: (l) => log.push(l) } }),
    });
    /** @type {Intercambio[]} */
    const registro = [];
    const servidor = serve({
      port: puerto,
      hostname: '127.0.0.1',
      fetch: async (req, env) => {
        const res = await app.fetch(req, env);
        const url = new URL(req.url);
        registro.push({
          ruta: `${url.pathname}${url.search}`,
          peticion: Object.fromEntries(req.headers),
          status: res.status,
          respuesta: Object.fromEntries(res.headers),
        });
        return res;
      },
    });
    await new Promise((ok) => servidor.once('listening', ok));
    const origen = `http://localhost:${puerto}`;
    await usar({
      origen,
      registro,
      log,
      // Petición del propio equipo sin `Origin` ni `Sec-Fetch-Site` (como `curl`).
      clientesSse: async () => (await (await fetch(`${origen}/api/salud`)).json()).clientesSse,
    });
    /** @type {import('node:http').Server} */ (servidor).closeAllConnections();
    await new Promise((ok) => servidor.close(() => ok(undefined)));
  },
  /** Servidor estático de la página ajena: un HTML mínimo en cualquier ruta. */
  // eslint-disable-next-line no-empty-pattern
  ajena: async ({}, usar) => {
    const servidor = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html lang="es"><title>Página ajena</title><p>ajena</p></html>');
    });
    await new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(undefined)));
    const { port } = /** @type {import('node:net').AddressInfo} */ (servidor.address());
    await usar({ puerto: port });
    servidor.closeAllConnections();
    await new Promise((ok) => servidor.close(() => ok(undefined)));
  },
});

/**
 * Peticiones a una ruta de la API que hizo el navegador (las de Node no llevan `user-agent` de
 * navegador).
 * @param {Intercambio[]} registro
 * @param {string} prefijo
 */
const delNavegador = (registro, prefijo) =>
  registro.filter((r) => r.ruta.startsWith(prefijo) && /Mozilla/.test(r.peticion['user-agent']));

/** @param {Record<string, string>} cabeceras */
const cabecerasCors = (cabeceras) =>
  Object.keys(cabeceras).filter((k) => k.toLowerCase().startsWith('access-control-'));

// Dos orígenes ajenos: `localhost` en otro puerto es *same-site* (el caso de Apache en el
// puerto 80, que `Origin` sola ya rechaza) y `127.0.0.1` es *cross-site*.
const ORIGENES = [
  { nombre: 'same-site (localhost, otro puerto)', host: 'localhost', sitio: 'same-site' },
  { nombre: 'cross-site (127.0.0.1)', host: '127.0.0.1', sitio: 'cross-site' },
];

test.describe('abuso cross-site desde una página de otro origen (AM-11)', () => {
  /** @type {string[]} */
  let dialogos;
  test.beforeEach(({ page }) => {
    dialogos = [];
    page.on('dialog', (d) => {
      dialogos.push(d.message());
      return d.dismiss();
    });
  });
  test.afterEach(() => {
    expect(dialogos, 'diálogos').toEqual([]);
  });

  for (const origen of ORIGENES) {
    test(`${origen.nombre}: fetch a /api/sismos falla, 403 sin CORS y la página no lee nada`, async ({
      page,
      app,
      ajena,
    }) => {
      const origenAjeno = `http://${origen.host}:${ajena.puerto}`;
      await page.goto(`${origenAjeno}/`);

      const url = `${app.origen}/api/sismos?paises=ES&periodo=30d`;
      const resultado = await page.evaluate(async (u) => {
        /** @param {RequestInit} opciones */
        const intentar = async (opciones) => {
          try {
            const res = await fetch(u, opciones);
            return { leida: true, tipo: res.type, status: res.status, cuerpo: await res.text() };
          } catch (e) {
            return { leida: false, error: /** @type {Error} */ (e).name };
          }
        };
        // `cors` (por defecto) y `no-cors` (GET sin `Origin`: solo queda `Sec-Fetch-Site`).
        return { cors: await intentar({}), noCors: await intentar({ mode: 'no-cors' }) };
      }, url);

      // La página no puede leer la respuesta: CORS cierra `cors`; en `no-cors` la respuesta
      // opaca la bloquea además `Cross-Origin-Resource-Policy: same-origin` (los dos navegadores
      // rechazan la promesa).
      expect(resultado.cors).toEqual({ leida: false, error: 'TypeError' });
      expect(resultado.noCors).toEqual({ leida: false, error: 'TypeError' });

      // Lo que el navegador envió y lo que respondió el servidor.
      const intercambios = delNavegador(app.registro, '/api/sismos');
      expect(intercambios).toHaveLength(2);
      for (const r of intercambios) {
        expect(r.peticion['sec-fetch-site']).toBe(origen.sitio);
        expect(r.status).toBe(403);
        expect(r.respuesta['content-type']).toMatch(/^application\/problem\+json/);
        expect(r.respuesta['cross-origin-resource-policy']).toBe('same-origin');
        expect(cabecerasCors(r.respuesta), 'cabeceras Access-Control-*').toEqual([]);
      }
      // La de modo `cors` lleva el `Origin` de la página ajena.
      expect(intercambios.map((r) => r.peticion.origin)).toContain(origenAjeno);
      // El servidor lo registra (como mucho una línea por minuto y código).
      expect(app.log.join('')).toMatch(/WARN http\.rechazo status=403/);
    });

    test(`${origen.nombre}: EventSource a /api/stream falla, 403 sin CORS y no ocupa plaza`, async ({
      page,
      app,
      ajena,
    }) => {
      const origenAjeno = `http://${origen.host}:${ajena.puerto}`;
      await page.goto(`${origenAjeno}/`);

      const url = `${app.origen}/api/stream?paises=ES`;
      const resultado = await page.evaluate(
        (u) =>
          new Promise((ok) => {
            const es = new EventSource(u);
            let mensajes = 0;
            es.onmessage = () => (mensajes += 1);
            es.addEventListener('flujo.reiniciar', () => (mensajes += 1));
            es.onerror = () => {
              // Una respuesta que no es 200 «falla la conexión»: CLOSED (2), sin reintentos.
              const estado = es.readyState;
              es.close();
              ok({ estado, mensajes });
            };
          }),
        url,
      );

      expect(resultado).toEqual({ estado: 2, mensajes: 0 });
      const intercambios = delNavegador(app.registro, '/api/stream');
      expect(intercambios).toHaveLength(1);
      const [r] = intercambios;
      expect(r.peticion.origin).toBe(origenAjeno);
      expect(r.peticion['sec-fetch-site']).toBe(origen.sitio);
      expect(r.status).toBe(403);
      expect(r.respuesta['content-type']).not.toMatch(/event-stream/);
      expect(cabecerasCors(r.respuesta)).toEqual([]);
      expect(await app.clientesSse()).toBe(0);
      expect(app.log.join('')).toMatch(/WARN http\.rechazo status=403/);
    });
  }

  test('control: desde el mismo origen la página sí lee la API y abre el stream', async ({
    page,
    app,
  }) => {
    // Navegación directa (Sec-Fetch-Site: none) a un recurso del propio servidor.
    await page.goto(`${app.origen}/api/salud`);
    const resultado = await page.evaluate(async () => {
      const res = await fetch('/api/sismos?paises=ES&periodo=24h');
      const cuerpo = await res.json();
      const abierto = await new Promise((ok) => {
        const es = new EventSource('/api/stream?paises=ES');
        es.onopen = () => {
          es.close();
          ok(true);
        };
        es.onerror = () => {
          es.close();
          ok(false);
        };
      });
      return { status: res.status, sismos: Array.isArray(cuerpo.sismos), abierto };
    });
    expect(resultado).toEqual({ status: 200, sismos: true, abierto: true });
    const sismos = delNavegador(app.registro, '/api/sismos');
    expect(sismos.map((r) => r.peticion['sec-fetch-site'])).toEqual(['same-origin']);
  });
});
