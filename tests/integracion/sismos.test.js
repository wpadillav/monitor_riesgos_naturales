// GET /api/sismos y /api/salud con catálogo, planificador y fuentes simuladas (sin red):
// filtros, validación problem+json (AM-08), fuente caída (AM-03) y esquema del contrato.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZONAS_POR_PAIS, createApp } from '../../src/server/app.js';
import { createCatalogo } from '../../src/server/dominio/catalogo.js';
import { createCobertura } from '../../src/server/dominio/cobertura.js';
import { createConsultaSismos } from '../../src/server/dominio/consulta-sismos.js';
import { createEmscFdsn } from '../../src/server/fuentes/emsc-fdsn.js';
import { createEstadoFuentes } from '../../src/server/fuentes/estado-fuentes.js';
import { createHttpClient } from '../../src/server/fuentes/http-cliente.js';
import { createPlanificador } from '../../src/server/fuentes/planificador.js';
import { createUsgsFdsn } from '../../src/server/fuentes/usgs-fdsn.js';
import { parsearConsultaSismos, serializarRespuesta } from '../../src/server/http/rutas-sismos.js';
import { asignarPais } from '../../src/server/geo/asignar-pais.js';
import { ZONAS } from '../../src/shared/zonas.js';

const PORT = 3000;
const AHORA = Date.parse('2026-10-10T08:00:00.000Z');
const ARRANQUE = AHORA - 3_600_000;
const ID_EVENTO = /^[0-9a-z]{1,16}-[0-9]{1,15}$/;

const leer = (ruta) => readFileSync(new URL(`../fixtures/${ruta}`, import.meta.url), 'utf8');

const FIXTURE_EMSC_ES = leer('emsc/fdsn-query-espana.json');
const FIXTURE_EMSC_PA = leer('emsc/fdsn-query-panama-colombia.json');
const FIXTURE_USGS_PA = leer('usgs/fdsn-query-panama.geojson');

/**
 * USGS de Panamá: el fixture real más la versión USGS del M6.0 que EMSC publica como
 * `20261010_0000077` (autor NEIC), para comprobar la fusión entre fuentes.
 */
const USGS_PA_CON_PAR = (() => {
  const datos = JSON.parse(FIXTURE_USGS_PA);
  datos.features.push({
    type: 'Feature',
    id: 'us6000u1cf',
    geometry: { type: 'Point', coordinates: [-80.5985, 7.5068, 10] },
    properties: {
      mag: 6.0,
      place: 'Panama',
      time: Date.parse('2026-10-10T04:14:01.786Z'),
      updated: Date.parse('2026-10-10T05:00:00.000Z'),
      net: 'us',
      ids: ',us6000u1cf,',
      magType: 'mww',
      type: 'earthquake',
    },
  });
  return JSON.stringify(datos);
})();

/**
 * `fetch` simulado que enruta por host y rectángulo. `caidas` contiene hosts que fallan:
 * - `usgs-html`: responde el 504 HTML de CloudFront;
 * - `usgs-truncado`: JSON cortado a la mitad;
 * - `emsc-timeout`: no responde nunca.
 */
function fetchSimulado(caidas = new Set()) {
  return vi.fn(async (url, init) => {
    const u = new URL(url);
    const esUsgs = u.host === 'earthquake.usgs.gov';
    const minLat = Number(u.searchParams.get(esUsgs ? 'minlatitude' : 'minlat'));
    if (esUsgs && caidas.has('usgs-html')) {
      return new Response(leer('ign/georss-504-cloudfront.html'), {
        status: 504,
        headers: { 'content-type': 'text/html' },
      });
    }
    if (esUsgs && caidas.has('usgs-truncado')) {
      return new Response(FIXTURE_USGS_PA.slice(0, 500), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (!esUsgs && caidas.has('emsc-timeout')) {
      return new Promise((_ok, ko) =>
        init.signal.addEventListener('abort', () => ko(new DOMException('a', 'AbortError'))),
      );
    }
    const json = (cuerpo) =>
      new Response(cuerpo, { headers: { 'content-type': 'application/json' } });
    // ES-PEN (minLat ≈ 34.9) y PA (minLat ≈ 6.2) con datos; el resto vacío.
    if (!esUsgs && minLat > 34) return json(FIXTURE_EMSC_ES);
    if (!esUsgs && minLat > 6 && minLat < 7) return json(FIXTURE_EMSC_PA);
    if (esUsgs && minLat > 6 && minLat < 7) return json(USGS_PA_CON_PAR);
    if (!esUsgs) return new Response(null, { status: 204 });
    return json('{"type":"FeatureCollection","features":[]}');
  });
}

/** Monta la aplicación completa (salvo la red) con reloj simulado. */
async function montar({ caidas, arrancar = true } = {}) {
  const reloj = { ahora: () => Date.now() };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const fetch = fetchSimulado(caidas);
  const http = createHttpClient({
    fetch,
    userAgent: 'TerremotosEnVivo/2.0.0 (uso local; sin contacto)',
  });
  const catalogo = createCatalogo({ asignarPais, log });
  const estado = createEstadoFuentes({ canales: ['emsc-fdsn', 'usgs'], reloj, log });
  const planificador = createPlanificador({
    fuentes: [
      { adaptador: createEmscFdsn({ http, reloj }), intervaloMs: 30_000, escalonMs: 6_000 },
      { adaptador: createUsgsFdsn({ http, reloj }), intervaloMs: 60_000, escalonMs: 12_000 },
    ],
    zonas: ZONAS.map((z) => ({ id: z.id, rectangulo: z.rectangulo })),
    catalogo,
    cobertura: createCobertura(),
    estado,
    reloj,
    log,
    metricas: { registrar: vi.fn() },
  });
  const app = createApp({
    port: PORT,
    version: '2.0.0',
    reloj,
    arrancadoEn: ARRANQUE,
    obtenerFuentes: estado.obtener,
    contarSismos: catalogo.contar,
    medirMemoriaRssMb: () => 90,
    consultaSismos: createConsultaSismos({
      catalogo,
      planificador,
      obtenerFuentes: estado.obtener,
      obtenerUltimoEventoId: () => `${ARRANQUE.toString(36)}-0`,
      zonas: ZONAS_POR_PAIS,
      reloj,
    }),
  });
  if (arrancar) {
    const carga = planificador.arrancar();
    await vi.advanceTimersByTimeAsync(11_000);
    await carga;
  }
  return { app, planificador, fetch, catalogo, log };
}

/** Petición con Host válido; avanza los temporizadores simulados hasta que responde. */
async function get(app, ruta) {
  const promesa = app.request(ruta, { headers: { host: `localhost:${PORT}` } });
  let respuesta;
  promesa.then((r) => (respuesta = r));
  for (let i = 0; i < 20 && !respuesta; i += 1) await vi.advanceTimersByTimeAsync(1_000);
  return promesa;
}

let entorno;
beforeEach(() => {
  vi.useFakeTimers({ now: AHORA });
});
afterEach(() => {
  entorno?.planificador.detener();
  entorno = undefined;
  vi.useRealTimers();
});

describe('GET /api/sismos: respuesta y filtros', () => {
  it('devuelve RespuestaSismos con filtro.desde, fuentes y sismos ordenados (contrato)', async () => {
    entorno = await montar();
    const res = await get(entorno.app, '/api/sismos?paises=ES,CO,PA&magMin=2.0&periodo=30d');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cuerpo = await res.json();
    expect(Object.keys(cuerpo).sort()).toEqual(
      [
        'completo',
        'filtro',
        'fuentes',
        'generadoEn',
        'sismos',
        'total',
        'truncado',
        'ultimoEventoId',
      ].sort(),
    );
    expect(cuerpo.filtro).toEqual({
      paises: ['ES', 'CO', 'PA'],
      magMin: 2,
      periodo: '30d',
      desde: new Date(Date.parse(cuerpo.generadoEn) - 30 * 86_400_000).toISOString(),
    });
    expect(cuerpo.ultimoEventoId).toMatch(ID_EVENTO);
    expect(cuerpo.completo).toBe(true);
    expect(cuerpo.truncado).toBe(false);
    expect(cuerpo.total).toBe(cuerpo.sismos.length);
    expect(cuerpo.fuentes.map((f) => [f.fuente, f.estado])).toEqual([
      ['emsc-fdsn', 'ok'],
      ['usgs', 'ok'],
    ]);
    const tiempos = cuerpo.sismos.map((s) => Date.parse(s.tiempo));
    expect(tiempos).toEqual([...tiempos].sort((a, b) => b - a));
    for (const s of cuerpo.sismos) {
      expect(['ES', 'CO', 'PA']).toContain(s.pais);
      expect(s.magnitud).toBeGreaterThanOrEqual(2);
      expect(s.id).toMatch(/^(emsc|usgs):[A-Za-z0-9_.-]{1,64}$/);
      expect(s.revision).toBeGreaterThanOrEqual(1);
      expect(s.fuentes.length).toBeGreaterThanOrEqual(1);
      // R-01: el contrato publica los países candidatos; siempre incluyen `pais`.
      expect(s.paisesCandidatos).toContain(s.pais);
    }
  });

  it('el sismo de Panamá con EMSC (IGC) y USGS sale una sola vez con dos fuentes', async () => {
    entorno = await montar();
    const cuerpo = await (await get(entorno.app, '/api/sismos?paises=PA&periodo=30d')).json();

    const m60 = cuerpo.sismos.filter((s) => s.tiempo === '2026-10-10T04:14:01.786Z');
    expect(m60).toHaveLength(1);
    expect(m60[0]).toMatchObject({ id: 'emsc:20261010_0000077', fuentePreferida: 'emsc' });
    expect(m60[0].fuentes.map((f) => f.idFuente)).toEqual(['20261010_0000077', 'us6000u1cf']);
  });

  it('filtra por país', async () => {
    entorno = await montar();
    const es = await (await get(entorno.app, '/api/sismos?paises=ES&periodo=30d')).json();
    const pa = await (await get(entorno.app, '/api/sismos?paises=PA&periodo=30d')).json();

    expect(es.sismos.length).toBeGreaterThan(0);
    expect(es.sismos.every((s) => s.pais === 'ES')).toBe(true);
    expect(pa.sismos.every((s) => s.pais === 'PA')).toBe(true);
  });

  it('filtra por magnitud mínima (incluida)', async () => {
    entorno = await montar();
    const todas = await (await get(entorno.app, '/api/sismos?paises=ES,CO,PA&periodo=30d')).json();
    const m45 = await (
      await get(entorno.app, '/api/sismos?paises=ES,CO,PA&periodo=30d&magMin=4.5')
    ).json();

    expect(todas.filtro.magMin).toBeNull();
    expect(m45.sismos.every((s) => s.magnitud >= 4.5)).toBe(true);
    expect(m45.sismos.length).toBeLessThan(todas.sismos.length);
  });

  it('filtra por periodo; 24h por defecto', async () => {
    entorno = await montar();
    const porDefecto = await (await get(entorno.app, '/api/sismos?paises=ES,CO,PA')).json();
    const h1 = await (await get(entorno.app, '/api/sismos?paises=ES,CO,PA&periodo=1h')).json();

    expect(porDefecto.filtro.periodo).toBe('24h');
    const desde24 = Date.parse(porDefecto.filtro.desde);
    expect(Date.parse(porDefecto.generadoEn) - desde24).toBe(86_400_000);
    for (const s of porDefecto.sismos) expect(Date.parse(s.tiempo)).toBeGreaterThanOrEqual(desde24);
    expect(h1.sismos.length).toBeLessThanOrEqual(porDefecto.sismos.length);
  });

  it('una magnitud no cubierta («todas») consulta antes las fuentes una vez por zona', async () => {
    entorno = await montar();
    const antes = entorno.fetch.mock.calls.length;

    await Promise.all(
      Array.from({ length: 20 }, () => get(entorno.app, '/api/sismos?paises=PA&periodo=7d')),
    );

    // Solo las cargas completas (sin updatedafter): los ciclos periódicos siguen su calendario.
    const nuevas = entorno.fetch.mock.calls
      .slice(antes)
      .map(([url]) => new URL(url))
      .filter((u) => !u.searchParams.has('updatedafter'));
    // PA cae en un solo rectángulo: 1 consulta por fuente (single-flight, AM-18).
    expect(nuevas.map((u) => u.host).sort()).toEqual([
      'earthquake.usgs.gov',
      'www.seismicportal.eu',
    ]);
    for (const u of nuevas) {
      expect(u.searchParams.has('minmag') || u.searchParams.has('minmagnitude')).toBe(false);
    }
  });
});

describe('GET /api/sismos: fuente caída (AM-03)', () => {
  it.each([
    ['usgs-html', 'Respuesta HTTP no válida (504)'],
    ['usgs-truncado', 'JSON no válido'],
  ])(
    'con USGS %s responde 200 con EMSC, completo: false y el estado de USGS',
    async (caida, mensaje) => {
      entorno = await montar({ caidas: new Set([caida]) });
      const res = await get(entorno.app, '/api/sismos?paises=ES,PA&periodo=30d');

      expect(res.status).toBe(200);
      const cuerpo = await res.json();
      expect(cuerpo.completo).toBe(false);
      expect(cuerpo.sismos.length).toBeGreaterThan(0);
      expect(cuerpo.sismos.every((s) => s.fuentes.every((f) => f.fuente === 'emsc'))).toBe(true);
      const usgs = cuerpo.fuentes.find((f) => f.fuente === 'usgs');
      expect(usgs).toMatchObject({ estado: 'caida', mensaje });
      expect(cuerpo.fuentes.find((f) => f.fuente === 'emsc-fdsn').estado).toBe('ok');
    },
  );

  it('con EMSC sin responder, contesta en ≤ 10 s con lo que hay (RNF-04)', async () => {
    entorno = await montar({ caidas: new Set(['emsc-timeout']), arrancar: false });
    entorno.planificador.arrancar();
    const inicio = Date.now();

    const res = await get(entorno.app, '/api/sismos?paises=PA&periodo=30d');

    expect(Date.now() - inicio).toBeLessThanOrEqual(10_000);
    const cuerpo = await res.json();
    expect(res.status).toBe(200);
    expect(cuerpo.completo).toBe(false);
  });

  it('sin fuentes activas responde 200 vacío y completo: false', async () => {
    const app = createApp({ port: PORT, arrancadoEn: ARRANQUE });
    const res = await get(app, '/api/sismos?paises=ES');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      completo: false,
      total: 0,
      sismos: [],
      ultimoEventoId: `${ARRANQUE.toString(36)}-0`,
    });
  });
});

describe('GET /api/sismos: parámetros inválidos (AM-08)', () => {
  const app = createApp({ port: PORT });

  it.each([
    ['/api/sismos', 'paises'],
    ['/api/sismos?paises=', 'paises'],
    ['/api/sismos?paises=XX', 'paises'],
    ['/api/sismos?paises=FR', 'paises'],
    ['/api/sismos?paises=es', 'paises'],
    ['/api/sismos?paises=ES,ES', 'paises'],
    ['/api/sismos?paises=ES,CO,PA,ES', 'paises'],
    ['/api/sismos?paises=ES&paises=ES', 'paises'],
    ['/api/sismos?paises=ES&magMin=2', 'magMin'],
    ['/api/sismos?paises=ES&magMin=1e400', 'magMin'],
    ['/api/sismos?paises=ES&magMin=2%26format=xml', 'magMin'],
    ['/api/sismos?paises=ES&magMin=', 'magMin'],
    ['/api/sismos?paises=ES&magMin=todas', 'magMin'],
    ['/api/sismos?paises=ES&periodo=999d', 'periodo'],
    ['/api/sismos?paises=ES&periodo=2026-10-01', 'periodo'],
    ['/api/sismos?paises=ES&radio=10', 'desconocido'],
    ['/api/sismos?paises=ES&minmag=2', 'desconocido'],
    ['/api/sismos?paises=ES&avisoMin=4.5', 'desconocido'],
    ['/api/sismos?paises=ES&__proto__=x', 'desconocido'],
    [`/api/sismos?paises=ES&periodo=24h&x=${'a'.repeat(512)}`, 'consulta'],
  ])('%s → 400 problem+json en «%s»', async (ruta, parametro) => {
    const res = await app.request(ruta, { headers: { host: `localhost:${PORT}` } });

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cuerpo = await res.json();
    expect(cuerpo).toMatchObject({
      type: 'urn:terremotos:problema:parametro-invalido',
      title: 'Parámetro no válido',
      status: 400,
      instance: '/api/sismos',
    });
    expect(cuerpo.errors.map((e) => e.parametro)).toContain(parametro);
    // Nunca se refleja la entrada.
    const texto = JSON.stringify(cuerpo);
    for (const reflejo of ['XX', 'FR', '1e400', 'format=xml', '999d', 'radio', '__proto__']) {
      expect(texto).not.toContain(reflejo);
    }
  });

  it('acumula los errores de varios parámetros', async () => {
    const res = await app.request('/api/sismos?paises=XX&magMin=9&periodo=1y', {
      headers: { host: `localhost:${PORT}` },
    });
    expect((await res.json()).errors.map((e) => e.parametro)).toEqual([
      'paises',
      'magMin',
      'periodo',
    ]);
  });

  it.each(['1.0', '2.0', '2.5', '3.0', '4.0', '4.5', '5.0'])('magMin=%s es válido', async (m) => {
    const res = await app.request(`/api/sismos?paises=ES,CO,PA&magMin=${m}&periodo=7d`, {
      headers: { host: `localhost:${PORT}` },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).filtro.magMin).toBe(Number(m));
  });

  it('el límite es de 512 bytes: 512 pasa el control de tamaño y 513 no', () => {
    const relleno = (n) => `paises=ES&x=${'a'.repeat(n - 'paises=ES&x='.length)}`;
    expect(relleno(512)).toHaveLength(512);
    const r512 = parsearConsultaSismos(`?${relleno(512)}`);
    const r513 = parsearConsultaSismos(`?${relleno(513)}`);
    expect(r512.ok || r512.errors.map((e) => e.parametro)).toEqual(['desconocido']);
    expect(r513.ok || r513.errors.map((e) => e.parametro)).toEqual(['consulta']);
  });

  it('las protecciones de Host y Origin siguen delante (421 y 403)', async () => {
    const r421 = await app.request('/api/sismos?paises=ES', { headers: { host: 'evil.test' } });
    expect(r421.status).toBe(421);
    const r403 = await app.request('/api/sismos?paises=ES', {
      headers: { host: `localhost:${PORT}`, origin: 'https://evil.test' },
    });
    expect(r403.status).toBe(403);
  });
});

describe('GET /api/salud con fuentes', () => {
  it('rellena fuentes y sismosEnMemoria', async () => {
    entorno = await montar({ caidas: new Set(['usgs-html']) });
    const res = await get(entorno.app, '/api/salud');
    const cuerpo = await res.json();

    expect(cuerpo.estado).toBe('degradado');
    expect(cuerpo.sismosEnMemoria).toBe(entorno.catalogo.contar());
    expect(cuerpo.sismosEnMemoria).toBeGreaterThan(0);
    expect(cuerpo.fuentes).toEqual([
      expect.objectContaining({ fuente: 'emsc-fdsn', estado: 'ok' }),
      expect.objectContaining({
        fuente: 'usgs',
        estado: 'caida',
        proximoIntentoEn: expect.any(String),
      }),
    ]);
  });
});

describe('HEAD /api/sismos (R-21)', () => {
  it('valida la query y responde 200 sin cuerpo y sin consultar fuentes ni catálogo', async () => {
    const consultar = vi.fn();
    const app = createApp({ port: PORT, consultaSismos: { consultar } });
    const res = await app.request('/api/sismos?paises=ES&periodo=30d', {
      method: 'HEAD',
      headers: { host: `localhost:${PORT}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('');
    expect(consultar).not.toHaveBeenCalled();
  });

  it('una query inválida sigue dando 400', async () => {
    const consultar = vi.fn();
    const app = createApp({ port: PORT, consultaSismos: { consultar } });
    const res = await app.request('/api/sismos?paises=XX', {
      method: 'HEAD',
      headers: { host: `localhost:${PORT}` },
    });
    expect(res.status).toBe(400);
    expect(consultar).not.toHaveBeenCalled();
  });
});

describe('serializarRespuesta (P-03)', () => {
  const leerTodo = async (flujo) => new Response(flujo).text();
  const cuerpo = (n) => ({
    generadoEn: '2026-10-10T08:00:00.000Z',
    total: n,
    sismos: Array.from({ length: n }, (_, i) => ({ id: `emsc:${i}`, lugar: `Lugar ñ ${i}` })),
  });

  it.each([0, 1, 7, 200])('con %s sismos produce el mismo JSON que JSON.stringify', async (n) => {
    const c = cuerpo(n);
    expect(await leerTodo(serializarRespuesta(c, 64))).toBe(JSON.stringify(c));
  });

  it('trocea la respuesta: un trozo por petición del consumidor', async () => {
    const lector = serializarRespuesta(cuerpo(200), 256).getReader();
    let trozos = 0;
    for (let r = await lector.read(); !r.done; r = await lector.read()) {
      trozos += 1;
      // ~256 caracteres más, como mucho, un sismo.
      expect(r.value.byteLength).toBeLessThan(512);
    }
    expect(trozos).toBeGreaterThan(10);
  });
});
