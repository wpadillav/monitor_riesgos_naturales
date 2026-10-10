import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { CSP, SECURITY_HEADERS } from '../../src/server/http/middlewares.js';

const PORT = 3000;
const HOST_OK = `localhost:${PORT}`;
const ARRANQUE = Date.parse('2026-10-10T06:00:00.000Z');

function buildApp(overrides = {}) {
  return createApp({
    port: PORT,
    version: '2.0.0',
    reloj: { ahora: () => ARRANQUE + 3_660_500 },
    arrancadoEn: ARRANQUE,
    medirMemoriaRssMb: () => 92.44,
    ...overrides,
  });
}

/**
 * @param {import('hono').Hono} app
 * @param {string} ruta
 * @param {RequestInit & { headers?: Record<string, string> }} [init]
 */
function request(app, ruta, init = {}) {
  return app.request(ruta, { ...init, headers: { host: HOST_OK, ...init.headers } });
}

describe('GET /api/salud', () => {
  it('responde 200 con el esquema Salud del contrato', async () => {
    const res = await request(buildApp(), '/api/salud');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      estado: 'ok',
      version: '2.0.0',
      arrancadoEn: '2026-10-10T06:00:00.000Z',
      segundosActivo: 3660,
      fuentes: [],
      sismosEnMemoria: 0,
      clientesSse: 0,
      memoriaRssMb: 92.4,
    });
  });

  it('devuelve «degradado» si alguna fuente no está ok', async () => {
    const fuentes = [
      { fuente: 'emsc-ws', estado: 'ok', cambiadoEn: '2026-10-10T06:00:01.000Z' },
      { fuente: 'usgs', estado: 'caida', cambiadoEn: '2026-10-10T06:58:30.000Z' },
    ];
    const res = await request(buildApp({ obtenerFuentes: () => fuentes }), '/api/salud');

    const cuerpo = await res.json();
    expect(cuerpo.estado).toBe('degradado');
    expect(cuerpo.fuentes).toEqual(fuentes);
  });

  it('atiende HEAD sin cuerpo', async () => {
    const res = await request(buildApp(), '/api/salud', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

describe('lista blanca de Host (AM-10)', () => {
  it.each(['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'LOCALHOST:3000'])(
    'admite %s',
    async (host) => {
      const res = await buildApp().request('/api/salud', { headers: { host } });
      expect(res.status).toBe(200);
    },
  );

  it.each([
    ['/', 'evil.test'],
    ['/', 'evil.example:3000'],
    ['/api/salud', 'evil.example:3000'],
    ['/api/sismos', 'evil.example:3000'],
    ['/api/stream', 'evil.example:3000'],
    ['/vendor/leaflet/leaflet.js', 'localhost'],
    ['/', 'localhost:3001'],
    ['/', '127.0.0.1.nip.io:3000'],
  ])('responde 421 en %s con Host %s', async (ruta, host) => {
    const res = await buildApp().request(ruta, { headers: { host } });

    expect(res.status).toBe(421);
    expect(res.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(await res.json()).toMatchObject({
      type: 'urn:terremotos:problema:host-no-permitido',
      status: 421,
    });
  });

  it('responde 421 sin cabecera Host', async () => {
    const res = await buildApp().request('/');
    expect(res.status).toBe(421);
  });
});

describe('Origin y Sec-Fetch-Site en /api/* (AM-11)', () => {
  it.each([
    { origin: 'https://evil.example' },
    { origin: 'http://localhost' },
    { origin: 'http://localhost:3001' },
    { origin: 'http://127.0.0.1:3000' },
    { origin: 'null' },
    { 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'cross-site' },
  ])('responde 403 con %o', async (cabeceras) => {
    const res = await request(buildApp(), '/api/salud', { headers: cabeceras });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      type: 'urn:terremotos:problema:origen-no-permitido',
      status: 403,
    });
  });

  it.each([
    {},
    { origin: 'http://localhost:3000' },
    { 'sec-fetch-site': 'same-origin' },
    { 'sec-fetch-site': 'none' },
    { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' },
  ])('admite %o', async (cabeceras) => {
    const res = await request(buildApp(), '/api/salud', { headers: cabeceras });
    expect(res.status).toBe(200);
  });

  it('acepta el origen propio cuando se entra por 127.0.0.1', async () => {
    const res = await buildApp().request('/api/salud', {
      headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
    });
    expect(res.status).toBe(200);
  });

  it('no envía cabeceras CORS', async () => {
    const res = await request(buildApp(), '/api/salud', {
      headers: { origin: 'http://localhost:3000' },
    });
    const cors = [...res.headers.keys()].filter((k) => k.startsWith('access-control-'));
    expect(cors).toEqual([]);
  });

  it('no aplica la comprobación de Origin a los estáticos', async () => {
    const res = await request(buildApp(), '/', { headers: { 'sec-fetch-site': 'cross-site' } });
    expect(res.status).toBe(200);
  });
});

describe('cabeceras de seguridad (AM-19, AM-21)', () => {
  it('la CSP es la literal del modelo de amenazas §7.1', () => {
    expect(CSP).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://server.arcgisonline.com; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it.each([
    ['/', HOST_OK],
    ['/api/salud', HOST_OK],
    ['/no-existe', HOST_OK],
    ['/', 'evil.test'],
  ])('%s (Host %s) lleva la CSP y las cabeceras de §7.2', async (ruta, host) => {
    const res = await buildApp().request(ruta, { headers: { host } });

    expect(res.headers.get('content-security-policy')).toBe(CSP);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(res.headers.get('permissions-policy')).toBe(SECURITY_HEADERS['Permissions-Policy']);
    expect(res.headers.get('permissions-policy')).toContain('geolocation=()');
    expect(res.headers.has('strict-transport-security')).toBe(false);
    expect(res.headers.has('cross-origin-embedder-policy')).toBe(false);
    expect(res.headers.has('x-powered-by')).toBe(false);
  });

  it('los estáticos no llevan Cache-Control no-store', async () => {
    const res = await request(buildApp(), '/');
    expect(res.headers.get('cache-control')).not.toBe('no-store');
  });
});

describe('métodos (AM-12)', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])('%s da 405 con Allow', async (method) => {
    const res = await request(buildApp(), '/api/sismos', { method });

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
    expect(await res.json()).toMatchObject({
      type: 'urn:terremotos:problema:metodo-no-permitido',
    });
  });

  it('POST a un estático también da 405', async () => {
    const res = await request(buildApp(), '/', { method: 'POST' });
    expect(res.status).toBe(405);
  });
});

describe('estáticos (AM-20, AM-30)', () => {
  it('sirve la página con el título y el aviso', async () => {
    const res = await request(buildApp(), '/');
    const html = (await res.text()).replace(/\s+/g, ' ');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    expect(html).toContain('<title>Monitor de Riesgos Naturales</title>');
    expect(html).toContain(
      'Solo informativo. No es un sistema de alerta temprana: sigue siempre los canales oficiales de tu país.',
    );
    expect(html).toContain('<script src="/js/tema-inicial.js"></script>');
  });

  it('la página no tiene scripts, estilos ni manejadores inline, ni recursos externos', async () => {
    const res = await request(buildApp(), '/');
    const html = await res.text();

    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/<style\b/);
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/\son[a-z]+=/);
    // AM-20: ningún recurso externo (script, hoja de estilo, imagen…). Los enlaces <a> a los
    // canales oficiales del pie sí son externos: https, otra pestaña y sin opener ni referrer.
    expect(html).not.toMatch(/\ssrc="https?:/);
    expect(html).not.toMatch(/<link\b[^>]*\shref="https?:/);
    const enlaces = [...html.matchAll(/<a\b[^>]*\shref="(https?:[^"]*)"[^>]*>/g)];
    for (const [etiqueta, url] of enlaces) {
      expect(url).toMatch(/^https:\/\//);
      expect(etiqueta).toContain('rel="noopener noreferrer"');
    }
  });

  it.each([
    'leaflet.js',
    'leaflet.css',
    'images/layers.png',
    'images/layers-2x.png',
    'images/marker-icon.png',
    'images/marker-icon-2x.png',
    'images/marker-shadow.png',
  ])('sirve Leaflet: /vendor/leaflet/%s', async (archivo) => {
    const res = await request(buildApp(), `/vendor/leaflet/${archivo}`);
    expect(res.status).toBe(200);
  });

  it('sirve src/shared en /shared/ como JavaScript', async () => {
    const res = await request(buildApp(), '/shared/constantes.js');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/javascript/);
    expect(await res.text()).toContain('NOMBRE_APLICACION');
  });

  it.each([
    '/..%2f.env',
    '/%2e%2e/package.json',
    '/..\\package.json',
    '/.git/HEAD',
    '/.env',
    '/.env.example',
    '/.npmrc',
    '/vendor/leaflet/../../package.json',
    '/vendor/leaflet/leaflet-src.js',
    '/vendor/leaflet/leaflet.js.map',
    '/node_modules/hono/package.json',
    '/package.json',
    '/src/server/index.js',
    '/shared/',
    '/shared/../server/index.js',
    '/shared/..%2fserver%2findex.js',
    '/shared/constantes.json',
    '/api/no-existe',
  ])('%s da 404', async (ruta) => {
    const res = await request(buildApp(), ruta);
    expect(res.status).toBe(404);
  });
});

describe('errores (AM-28)', () => {
  it('una excepción da 500 problem+json sin trazas ni rutas, y va al log', async () => {
    const errores = [];
    const log = {
      error: (evento, campos) => errores.push({ evento, campos }),
      warn() {},
      info() {},
      debug() {},
    };
    const app = buildApp({ log });
    app.get('/api/explota', () => {
      throw new Error('fallo en /home/usuario/secreto.js');
    });

    const res = await request(app, '/api/explota');
    const texto = await res.text();

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(JSON.parse(texto)).toMatchObject({ type: 'urn:terremotos:problema:error-interno' });
    expect(texto).not.toContain('at ');
    expect(texto).not.toContain('/home/');
    expect(errores).toHaveLength(1);
    expect(errores[0].campos.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('registra los rechazos como mucho una vez por minuto y por código', async () => {
    const avisos = [];
    let ahora = ARRANQUE;
    const log = {
      error() {},
      warn: (evento, campos) => avisos.push({ evento, campos }),
      info() {},
      debug() {},
    };
    const app = buildApp({ log, reloj: { ahora: () => ahora } });

    for (let i = 0; i < 5; i += 1) await app.request('/', { headers: { host: 'evil.test' } });
    ahora += 61_000;
    await app.request('/', { headers: { host: 'evil.test' } });

    expect(avisos).toEqual([
      { evento: 'http.rechazo', campos: { status: 421, cuenta: 1 } },
      { evento: 'http.rechazo', campos: { status: 421, cuenta: 5 } },
    ]);
  });
});
