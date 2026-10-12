// GET /api/stream a través de la aplicación Hono: cabeceras, validación (AM-08), Origin (AM-11),
// plazas con 503 (AM-13), Last-Event-ID, y de punta a punta catálogo → SSE. Incluye un servidor
// HTTP real para comprobar la desconexión y el cierre limpio.
import { serve } from '@hono/node-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { createCatalogo } from '../../src/server/dominio/catalogo.js';
import { createEstadoFuentes } from '../../src/server/fuentes/estado-fuentes.js';
import { asignarPais } from '../../src/server/geo/asignar-pais.js';
import { silentLog } from '../../src/server/infra/log.js';
import { createDifusor } from '../../src/server/stream/difusor.js';
import { crearRegistro } from '../../src/shared/modelo.js';
import { crearLector, eventos, parsearSse } from '../ayudas/sse.js';

const PORT = 3000;
const HOST = `localhost:${PORT}`;
const ARRANQUE = Date.parse('2026-10-10T06:00:00.000Z');
const PREFIJO = ARRANQUE.toString(36);

/** @type {Array<() => unknown>} */
const limpiezas = [];

function montar({ maxClientes } = {}) {
  const reloj = { ahora: () => Date.now() };
  const catalogo = createCatalogo({ asignarPais });
  const estadoFuentes = createEstadoFuentes({
    canales: ['emsc-ws', 'emsc-fdsn', 'usgs'],
    reloj,
    log: silentLog,
  });
  const difusor = createDifusor({
    catalogo,
    estadoFuentes,
    reloj,
    log: silentLog,
    arrancadoEn: ARRANQUE,
    maxClientes,
  });
  limpiezas.push(() => difusor.cerrar());
  const app = createApp({
    port: PORT,
    reloj,
    arrancadoEn: ARRANQUE,
    obtenerFuentes: estadoFuentes.obtener,
    contarSismos: catalogo.contar,
    difusor,
  });
  return { app, catalogo, difusor, estadoFuentes };
}

/** @param {import('hono').Hono} app @param {string} ruta @param {Record<string, string>} [cabeceras] */
async function abrir(app, ruta, cabeceras = {}, metodo = 'GET') {
  const res = await app.request(ruta, { method: metodo, headers: { host: HOST, ...cabeceras } });
  if (res.status === 200 && res.body) {
    const lector = crearLector(res.body);
    limpiezas.push(() => lector.cancelar().catch(() => {}));
    return { res, lector };
  }
  return { res, lector: null };
}

let n = 0;
/** Registro de EMSC normalizado en Granada (ES) o frente a Panamá (PA). */
function registro({ pais = 'PA', magnitud = 3.0, haceMin = 5, lugar } = {}) {
  n += 1;
  const ahora = Date.now();
  const r = crearRegistro(
    {
      fuente: 'emsc',
      idFuente: `20261010_${String(n).padStart(7, '0')}`,
      tiempo: ahora - haceMin * 60_000,
      actualizadoEn: ahora - 2000,
      lat: pais === 'ES' ? 37.18 : 7.81,
      lon: pais === 'ES' ? -3.6 : -80.5,
      profundidadKm: 10,
      magnitud,
      magnitudTipo: 'ml',
      autor: pais === 'ES' ? 'IGN' : 'IGC',
      lugar: lugar ?? (pais === 'ES' ? 'SPAIN' : 'PANAMA'),
    },
    ahora,
  );
  if (!r.ok) throw new Error(r.motivo);
  return r.registro;
}

/**
 * Envía ya el lote en curso, sin esperar a su temporizador de 250 ms (N-06: antes se esperaban
 * 300 ms fijos, un margen de 50 ms que una máquina cargada puede no cumplir). El temporizador del
 * lote lo prueban las unitarias del difusor.
 * @param {{ vaciar: () => void }} difusor
 */
const lote = (difusor) => difusor.vaciar();

beforeEach(() => {
  n = 0;
});
afterEach(async () => {
  for (const f of limpiezas.splice(0).reverse()) await f();
  vi.useRealTimers();
});

describe('GET /api/stream', () => {
  it('abre un flujo text/event-stream con no-store, CSP y retry: 3000', async () => {
    const { app } = montar();
    const { res, lector } = await abrir(app, '/api/stream?paises=ES,CO,PA');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect([...res.headers.keys()].some((k) => k.startsWith('access-control-'))).toBe(false);

    const texto = await lector.leer();
    expect(texto.startsWith('retry: 3000\n\n')).toBe(true);
    expect(eventos(texto).map((m) => m.datos.datos.fuente)).toEqual([
      'emsc-ws',
      'emsc-fdsn',
      'usgs',
    ]);
  });

  it('de punta a punta: una alta del catálogo llega filtrada por país y magnitud', async () => {
    const { app, catalogo, difusor } = montar();
    const pa = (await abrir(app, '/api/stream?paises=PA&magMin=2.0&avisoMin=4.5')).lector;
    const es = (await abrir(app, '/api/stream?paises=ES&magMin=4.0')).lector;
    await pa.leer();
    await es.leer();

    catalogo.ingerirLote(
      [registro({ pais: 'PA', magnitud: 4.5 }), registro({ pais: 'ES', magnitud: 3.1 })],
      { recibidoEn: Date.now() },
    );
    lote(difusor);

    const recibidos = eventos(await pa.leer());
    expect(recibidos.map((m) => [m.event, m.datos.datos.sismo.pais])).toEqual([
      ['sismo.nuevo', 'PA'],
    ]);
    expect(recibidos[0].datos.datos.notificable).toBe(true);
    expect(recibidos[0].id).toBe(`${PREFIJO}-1`);
    expect(await es.leer()).toBe('');
  });

  it('ultimoEventoId de /api/sismos encadena con el stream sin huecos', async () => {
    const { app, catalogo, difusor } = montar();
    catalogo.ingerirLote([registro()], { recibidoEn: Date.now() });
    lote(difusor);
    const carga = await (
      await app.request('/api/sismos?paises=PA&magMin=2.0', { headers: { host: HOST } })
    ).json();
    expect(carga.ultimoEventoId).toBe(`${PREFIJO}-1`);

    // Llega otro sismo entre la carga y la suscripción.
    catalogo.ingerirLote([registro()], { recibidoEn: Date.now() });
    lote(difusor);
    const { lector } = await abrir(
      app,
      `/api/stream?paises=PA&magMin=2.0&ultimoId=${carga.ultimoEventoId}`,
    );

    const lista = eventos(await lector.leer()).filter((m) => m.event === 'sismo.nuevo');
    expect(lista.map((m) => m.id)).toEqual([`${PREFIJO}-2`]);
  });

  it('Last-Event-ID gana a ultimoId; un id ajeno produce flujo.reiniciar', async () => {
    const { app, catalogo, difusor } = montar();
    catalogo.ingerirLote([registro(), registro()], { recibidoEn: Date.now() });
    lote(difusor);

    const reanuda = (
      await abrir(app, `/api/stream?paises=PA&ultimoId=lx3k9a-1`, {
        'Last-Event-ID': `${PREFIJO}-1`,
      })
    ).lector;
    expect(eventos(await reanuda.leer()).map((m) => m.event)).toEqual([
      'sismo.nuevo',
      'estado.fuente',
      'estado.fuente',
      'estado.fuente',
    ]);

    const reinicia = (await abrir(app, '/api/stream?paises=PA', { 'Last-Event-ID': 'lx3k9a-1' }))
      .lector;
    expect(eventos(await reinicia.leer())[0]).toMatchObject({
      event: 'flujo.reiniciar',
      datos: { datos: { motivo: 'arranque-distinto' } },
    });
  });

  it('un lugar malicioso llega como un solo evento con el texto literal (AM-15)', async () => {
    const { app, catalogo, difusor } = montar();
    const { lector } = await abrir(app, '/api/stream?paises=PA');
    await lector.leer();

    catalogo.ingerirLote([registro({ lugar: 'X event: hack data: {}' })], {
      recibidoEn: Date.now(),
    });
    lote(difusor);
    const mensajes = parsearSse(await lector.leer());
    expect(mensajes).toHaveLength(1);
    expect(mensajes[0].datos.datos.sismo.lugar).toBe('X event: hack data: {}');
  });

  it('HEAD responde 200 sin abrir flujo ni ocupar plaza', async () => {
    const { app, difusor } = montar();
    const { res } = await abrir(app, '/api/stream?paises=PA', {}, 'HEAD');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(difusor.contarClientes()).toBe(0);
  });
});

describe('validación de la query (AM-08)', () => {
  it.each([
    ['sin paises', '/api/stream', 'paises'],
    ['país desconocido', '/api/stream?paises=FR', 'paises'],
    ['paises repetido', '/api/stream?paises=ES&paises=ES', 'paises'],
    ['magMin fuera de lista', '/api/stream?paises=ES&magMin=1e400', 'magMin'],
    ['periodo libre', '/api/stream?paises=ES&periodo=999d', 'periodo'],
    ['avisoMin fuera de lista', '/api/stream?paises=ES&avisoMin=4.7', 'avisoMin'],
    ['avisoMin repetido', '/api/stream?paises=ES&avisoMin=4.5&avisoMin=5.0', 'avisoMin'],
    ['parámetro desconocido', '/api/stream?paises=ES&radio=10', 'desconocido'],
    ['query de más de 512 B', `/api/stream?paises=ES&ultimoId=${'a'.repeat(600)}`, 'consulta'],
  ])('%s → 400 problem+json', async (_caso, ruta, parametro) => {
    const { app, difusor } = montar();
    const { res } = await abrir(app, ruta);

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    const cuerpo = await res.json();
    expect(cuerpo).toMatchObject({
      type: 'urn:terremotos:problema:parametro-invalido',
      status: 400,
      instance: '/api/stream',
    });
    expect(cuerpo.errors.map((e) => e.parametro)).toContain(parametro);
    expect(difusor.contarClientes()).toBe(0);
  });

  it('un ultimoId mal formado no da error: flujo.reiniciar', async () => {
    const { app } = montar();
    const { res, lector } = await abrir(app, '/api/stream?paises=ES&ultimoId=%3Cscript%3E');
    expect(res.status).toBe(200);
    expect(eventos(await lector.leer())[0].event).toBe('flujo.reiniciar');
  });
});

describe('Origin y plazas (AM-11, AM-13)', () => {
  it.each([
    [{ origin: 'http://localhost' }],
    [{ origin: 'https://evil.example' }],
    [{ origin: 'http://localhost:3001' }],
    [{ 'sec-fetch-site': 'same-site' }],
    [{ 'sec-fetch-site': 'cross-site' }],
  ])('%o → 403 sin ocupar plaza', async (cabeceras) => {
    const { app, difusor } = montar();
    const { res } = await abrir(app, '/api/stream?paises=PA', cabeceras);

    expect(res.status).toBe(403);
    expect((await res.json()).type).toBe('urn:terremotos:problema:origen-no-permitido');
    expect(difusor.contarClientes()).toBe(0);
  });

  it('admite el Origin propio con Sec-Fetch-Site same-origin', async () => {
    const { app } = montar();
    const { res } = await abrir(app, '/api/stream?paises=PA', {
      origin: `http://${HOST}`,
      'sec-fetch-site': 'same-origin',
    });
    expect(res.status).toBe(200);
  });

  it('el noveno cliente recibe 503 con Retry-After: 10; al cerrar uno entra otro', async () => {
    const { app, difusor } = montar();
    const abiertos = [];
    for (let i = 0; i < 8; i += 1) abiertos.push(await abrir(app, '/api/stream?paises=PA'));
    expect(abiertos.every((a) => a.res.status === 200)).toBe(true);

    const noveno = (await abrir(app, '/api/stream?paises=PA')).res;
    expect(noveno.status).toBe(503);
    expect(noveno.headers.get('retry-after')).toBe('10');
    expect(await noveno.json()).toMatchObject({
      type: 'urn:terremotos:problema:demasiadas-conexiones',
      title: 'Demasiadas conexiones en vivo',
      status: 503,
    });

    await abiertos[0].lector.cancelar();
    expect(difusor.contarClientes()).toBe(7);
    expect((await abrir(app, '/api/stream?paises=PA')).res.status).toBe(200);

    const salud = await (await app.request('/api/salud', { headers: { host: HOST } })).json();
    expect(salud.clientesSse).toBe(8);

    for (const a of abiertos.slice(1)) await a.lector.cancelar();
    expect(difusor.contarClientes()).toBe(1);
  });

  it('HEAD da 503 con Retry-After cuando no hay plazas, sin ocupar ninguna', async () => {
    const { app, difusor } = montar({ maxClientes: 2 });
    const a = await abrir(app, '/api/stream?paises=PA');
    expect((await abrir(app, '/api/stream?paises=PA', {}, 'HEAD')).res.status).toBe(200);
    await abrir(app, '/api/stream?paises=PA');
    expect(difusor.contarClientes()).toBe(2);

    const { res } = await abrir(app, '/api/stream?paises=PA', {}, 'HEAD');
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('10');
    expect(res.headers.get('content-type')).toMatch(/^application\/problem\+json/);
    expect(await res.text()).toBe('');
    expect(difusor.contarClientes()).toBe(2);

    await a.lector.cancelar();
    expect((await abrir(app, '/api/stream?paises=PA', {}, 'HEAD')).res.status).toBe(200);
    expect(difusor.contarClientes()).toBe(1);
  });

  it('HEAD valida los parámetros como GET (400)', async () => {
    const { app } = montar();
    const { res } = await abrir(app, '/api/stream?paises=FR', {}, 'HEAD');
    expect(res.status).toBe(400);
  });
});

describe('latido de punta a punta', () => {
  it('llega como evento «latido» con el id del último evento y la hora del servidor', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { app } = montar();
    const { lector } = await abrir(app, '/api/stream?paises=PA');
    await lector.leer();
    vi.advanceTimersByTime(20_000);
    const [latido] = eventos(await lector.leer());
    expect(latido).toMatchObject({
      id: `${PREFIJO}-0`,
      event: 'latido',
      datos: { tipo: 'latido', version: 1, datos: {} },
    });
    expect(Number.isNaN(Date.parse(latido.datos.ocurridoEn))).toBe(false);
  });
});

describe('servidor HTTP real', () => {
  it('detecta la desconexión del navegador y libera la plaza', async () => {
    const { app, difusor } = montar();
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    await new Promise((ok) => server.once('listening', ok));
    limpiezas.push(() => new Promise((ok) => server.close(ok)));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());

    // La lista blanca de Host es la del puerto configurado (3000): se envía ese Host.
    const { request } = await import('node:http');
    const req = request({
      host: '127.0.0.1',
      port,
      path: '/api/stream?paises=PA',
      headers: { host: HOST },
    });
    const res = await new Promise((ok, ko) => {
      req.on('response', ok);
      req.on('error', ko);
      req.end();
    });
    expect(res.statusCode).toBe(200);
    let texto = '';
    res.on('data', (d) => (texto += d));
    await vi.waitFor(() => expect(texto).toContain('retry: 3000'));
    expect(difusor.contarClientes()).toBe(1);

    req.destroy();
    await vi.waitFor(() => expect(difusor.contarClientes()).toBe(0));
  });

  it('el apagado (difusor.cerrar) termina las respuestas y deja cerrar el servidor', async () => {
    const { app, difusor } = montar();
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    await new Promise((ok) => server.once('listening', ok));
    const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());

    const { request } = await import('node:http');
    const req = request({
      host: '127.0.0.1',
      port,
      path: '/api/stream?paises=PA',
      headers: { host: HOST },
    });
    const res = await new Promise((ok, ko) => {
      req.on('response', ok);
      req.on('error', ko);
      req.end();
    });
    const fin = new Promise((ok) => res.on('end', ok));
    res.resume();
    await vi.waitFor(() => expect(difusor.contarClientes()).toBe(1));

    difusor.cerrar();
    await fin;
    await new Promise((ok) => server.close(ok));
    expect(difusor.contarClientes()).toBe(0);
  });
});
