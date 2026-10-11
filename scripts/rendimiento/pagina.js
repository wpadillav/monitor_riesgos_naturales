/* global window, document, EventSource, requestAnimationFrame, MutationObserver */
// Las funciones que se pasan a `page.evaluate` y `addInitScript` se ejecutan en el navegador.
/**
 * Mediciones de la página con Playwright + Chromium (T5.4; RNF-01, RNF-03, Core Web Vitals).
 *
 * Escenarios (primer argumento):
 * - `carga`    : tiempo hasta lista y mapa utilizables con los datos del servidor (RNF-03), tareas
 *                largas durante la carga, desplazamiento de la lista y zoom/arrastre del mapa.
 *                `CPU_X=4` aplica ralentización de CPU por CDP (equipo más lento).
 * - `soak`     : `MINUTOS` (10) con un sismo nuevo por segundo por el stream real (SSE del
 *                servidor sintético); heap tras GC, nodos DOM y oyentes cada 30 s; coste por evento.
 * - `rafaga`   : RNF-01 de extremo a extremo en la página: ráfagas de 50 sismos de uno en uno y
 *                de 1 000 en un lote por el stream real; latencia `recibidoEn` → frame pintado.
 * - `filtros`  : `CAMBIOS` (50) cambios de filtros (con más de 50, muestra cada 50); heap, nodos, oyentes y conexiones SSE antes y después.
 * - `cwv`      : LCP, CLS e INP aproximado de la carga normal (filtros por defecto), `RONDAS` (5)
 *                veces, escritorio y móvil, con teselas reales de Esri.
 *
 * El servidor debe estar en marcha en `BASE` (por defecto http://127.0.0.1:3008):
 * `servidor-sintetico.js` para `carga`, `soak` y `filtros` (control en 3009); el servidor real
 * (`npm start` con `PORT=3008`) o el sintético para `cwv`.
 *
 * Uso: `node scripts/rendimiento/pagina.js carga > docs/rendimiento/datos/pagina-carga.json`
 */

import { chromium, devices } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3008';
const CONTROL = `http://127.0.0.1:${process.env.CONTROL_PORT ?? 3009}`;
const ESCENARIO = process.argv[2] ?? 'carga';
const PERIODO = process.env.PERIODO ?? '30d';
const CPU_X = Number(process.env.CPU_X ?? 1);
const MINUTOS = Number(process.env.MINUTOS ?? 10);
const RONDAS = Number(process.env.RONDAS ?? 5);
const CAMBIOS = Number(process.env.CAMBIOS ?? 50);
const TESELAS_REALES = process.env.TESELAS_REALES === 'si' || ESCENARIO === 'cwv';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Instrumentación que se inyecta antes de cargar la página. */
function instrumentar() {
  const p = {
    lt: [],
    loaf: [],
    lcp: null,
    cls: 0,
    eventos: [],
    datosEn: null,
    pintadoEn: null,
    frames: null,
    rnf01: [],
  };
  // RNF-01: de `recibidoEn` (servidor) al frame pintado tras aplicar cada `sismo.nuevo`.
  if (window.EventSource) {
    const original = EventSource.prototype.addEventListener;
    EventSource.prototype.addEventListener = function (tipo, fn, opciones) {
      if (tipo !== 'sismo.nuevo' || typeof fn !== 'function')
        return original.call(this, tipo, fn, opciones);
      const envuelta = function (e) {
        const r = fn.call(this, e);
        try {
          const recibido = Date.parse(JSON.parse(e.data).datos.sismo.recibidoEn);
          requestAnimationFrame(() => setTimeout(() => p.rnf01.push(Date.now() - recibido), 0));
        } catch {
          // no es un sismo
        }
        return r;
      };
      return original.call(this, tipo, envuelta, opciones);
    };
  }
  /** @type {any} */ (window).__perf = p;
  const obs = (tipo, fn, extra = {}) => {
    try {
      new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({
        type: tipo,
        buffered: true,
        ...extra,
      });
    } catch {
      // tipo no soportado
    }
  };
  obs('longtask', (e) => p.lt.push([Math.round(e.startTime), Math.round(e.duration)]));
  obs('long-animation-frame', (e) =>
    p.loaf.push([Math.round(e.startTime), Math.round(e.duration), Math.round(e.blockingDuration)]),
  );
  obs('largest-contentful-paint', (e) => {
    p.lcp = {
      t: Math.round(e.startTime),
      elemento: e.element ? `${e.element.tagName}#${e.element.id}.${e.element.className}` : null,
      tam: e.size,
    };
  });
  // CLS: máxima ventana de sesión (1 s de hueco, 5 s de máximo), como web-vitals.
  let sesion = 0;
  let primero = 0;
  let ultimo = 0;
  obs('layout-shift', (e) => {
    if (e.hadRecentInput) return;
    if (sesion && e.startTime - ultimo < 1000 && e.startTime - primero < 5000) sesion += e.value;
    else {
      sesion = e.value;
      primero = e.startTime;
    }
    ultimo = e.startTime;
    p.cls = Math.max(p.cls, sesion);
  });
  obs(
    'event',
    (e) => {
      if (e.interactionId) p.eventos.push([e.name, Math.round(e.duration), e.interactionId]);
    },
    { durationThreshold: 16 },
  );
  // Momento en que la vista muestra los datos: `pintarDatos` escribe el contador justo después
  // de actualizar la lista y sincronizar el mapa (main.js). El siguiente frame es el pintado.
  new MutationObserver(() => {
    const c = document.getElementById('contador');
    if (p.datosEn === null && c && /\d/.test(c.textContent ?? '')) {
      p.datosEn = Math.round(performance.now());
      requestAnimationFrame(() =>
        setTimeout(() => (p.pintadoEn = Math.round(performance.now())), 0),
      );
    }
  }).observe(document, { subtree: true, childList: true, characterData: true });
  /** @type {any} */ (window).__framesIniciar = () => {
    p.frames = [];
    let previo = performance.now();
    const bucle = (t) => {
      if (p.frames === null) return;
      p.frames.push(t - previo);
      previo = t;
      requestAnimationFrame(bucle);
    };
    requestAnimationFrame(bucle);
  };
  /** @type {any} */ (window).__framesParar = () => {
    const f = p.frames ?? [];
    p.frames = null;
    return f;
  };
}

async function nuevaPagina(navegador, { movil = false, filtros = null } = {}) {
  const contexto = await navegador.newContext({
    ...(movil ? devices['Pixel 7'] : { viewport: { width: 1440, height: 900 } }),
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  });
  const page = await contexto.newPage();
  if (!TESELAS_REALES) {
    await page.route('https://server.arcgisonline.com/**', (r) =>
      r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
    );
  }
  if (filtros) {
    await page.addInitScript((f) => localStorage.setItem('filtros', JSON.stringify(f)), filtros);
  }
  await page.addInitScript(instrumentar);
  const cdp = await contexto.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (CPU_X > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_X });
  return { contexto, page, cdp };
}

async function metricas(cdp, gc = true) {
  if (gc) {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
  }
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return {
    heapUsadoMb: Math.round((m.JSHeapUsedSize / 1048576) * 10) / 10,
    heapTotalMb: Math.round((m.JSHeapTotalSize / 1048576) * 10) / 10,
    nodos: m.Nodes,
    oyentes: m.JSEventListeners,
    documentos: m.Documents,
  };
}

const pct = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] * 10) / 10;
};

/** Tareas largas en [desde, hasta) del reloj de la página. */
async function tareasEntre(page, desde, hasta = Infinity) {
  const { lt, loaf } = await page.evaluate(() => /** @type {any} */ (window).__perf);
  const dentro = lt.filter(([t]) => t >= desde && t < hasta);
  const loafDentro = loaf.filter(([t]) => t >= desde && t < hasta);
  return {
    tareasLargas: dentro.length,
    mayorTareaMs: dentro.reduce((m, [, d]) => Math.max(m, d), 0),
    tareasMas200ms: dentro.filter(([, d]) => d > 200).length,
    tiempoBloqueoMs: dentro.reduce((s, [, d]) => s + Math.max(0, d - 50), 0),
    loafMas200ms: loafDentro.filter(([, d]) => d > 200).length,
    mayorLoafMs: loafDentro.reduce((m, [, d]) => Math.max(m, d), 0),
  };
}

const ahoraPagina = (page) => page.evaluate(() => Math.round(performance.now()));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function esperarDatos(page) {
  await page.waitForFunction(() => /** @type {any} */ (window).__perf.pintadoEn !== null, null, {
    timeout: 120_000,
  });
}

/** Espera a una ventana de `ms` sin tareas largas y devuelve el final de la última. */
async function esperarQuietud(page, ms = 1000) {
  for (let i = 0; i < 60; i += 1) {
    const { lt, ahora } = await page.evaluate(() => ({
      lt: /** @type {any} */ (window).__perf.lt,
      ahora: performance.now(),
    }));
    const fin = lt.reduce((m, [t, d]) => Math.max(m, t + d), 0);
    if (ahora - fin >= ms) return Math.round(fin);
    await espera(250);
  }
  return null;
}

// ---------------------------------------------------------------------------------------

async function escenarioCarga(navegador) {
  const filtros = { paises: ['ES', 'CO', 'PA'], magMin: '2.0', periodo: PERIODO };
  const rondas = [];
  for (let r = 0; r < 3; r += 1) {
    const { contexto, page, cdp } = await nuevaPagina(navegador, { filtros });
    await page.goto(BASE, { waitUntil: 'commit' });
    await esperarDatos(page);
    const finUltimaTarea = await esperarQuietud(page, 1000);
    const perf = await page.evaluate(() => /** @type {any} */ (window).__perf);
    const nav = await page.evaluate(() => {
      const n = /** @type {PerformanceNavigationTiming} */ (
        performance.getEntriesByType('navigation')[0]
      );
      const api = performance
        .getEntriesByType('resource')
        .find((e) => e.name.includes('/api/sismos'));
      return {
        dcl: Math.round(n.domContentLoadedEventEnd),
        load: Math.round(n.loadEventEnd),
        api: api
          ? {
              inicio: Math.round(api.startTime),
              fin: Math.round(api.responseEnd),
              kB: Math.round(api.encodedBodySize / 1024),
            }
          : null,
      };
    });
    const contador = await page.textContent('#contador');
    const filas = await page.locator('#lista-sismos button.item').count();
    const tareasCarga = await tareasEntre(page, 0);
    // Utilizable: clic en la 3.ª fila → ventana del mapa abierta.
    const t0 = Date.now();
    await page.locator('#lista-sismos button.item').nth(2).click();
    await page.locator('.leaflet-popup').waitFor({ state: 'visible', timeout: 10_000 });
    const clicVentanaMs = Date.now() - t0;
    await page.keyboard.press('Escape');

    let fluidez = null;
    if (r === 0) fluidez = await medirFluidez(page);
    const mem = await metricas(cdp);
    rondas.push({
      contador,
      filasEnDom: filas,
      ...nav,
      datosPintadosMs: perf.pintadoEn,
      utilizableMs: Math.max(perf.pintadoEn, finUltimaTarea ?? 0),
      clicFilaAVentanaMs: clicVentanaMs,
      tareasCarga,
      tareasLargasDetalle: perf.lt.slice(0, 30),
      fluidez,
      memoria: mem,
    });
    await contexto.close();
  }
  return { periodo: PERIODO, cpuX: CPU_X, rondas };
}

async function medirFluidez(page) {
  // Lista: 100 pasos de rueda de 300 px cada 40 ms y vuelta arriba con saltos grandes.
  const lista = await page.locator('#lista-scroll').boundingBox();
  await page.mouse.move(lista.x + lista.width / 2, lista.y + lista.height / 2);
  let t0 = await ahoraPagina(page);
  await page.evaluate(() => /** @type {any} */ (window).__framesIniciar());
  for (let i = 0; i < 100; i += 1) {
    await page.mouse.wheel(0, 300);
    await espera(40);
  }
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.wheel(0, -20_000);
    await espera(60);
  }
  // Salto al final (Fin con el foco en la lista) y vuelta (Inicio).
  await page.locator('#lista-sismos button.item').first().focus();
  await page.keyboard.press('End');
  await espera(200);
  await page.keyboard.press('Home');
  await espera(500);
  let frames = await page.evaluate(() => /** @type {any} */ (window).__framesParar());
  const listaRes = {
    ...(await tareasEntre(page, t0)),
    frames: frames.length,
    frameP95Ms: pct(frames, 0.95),
    framesMas50ms: frames.filter((f) => f > 50).length,
    scrollTopFinal: await page.evaluate(() => document.getElementById('lista-scroll').scrollTop),
  };

  // Mapa: 5 zooms con rueda hacia dentro, 5 hacia fuera y arrastres.
  const mapa = await page.locator('#mapa').boundingBox();
  const cx = mapa.x + mapa.width / 2;
  const cy = mapa.y + mapa.height / 2;
  await page.mouse.move(cx, cy);
  t0 = await ahoraPagina(page);
  await page.evaluate(() => /** @type {any} */ (window).__framesIniciar());
  for (const delta of [-300, -300, -300, -300, -300, 300, 300, 300, 300, 300]) {
    await page.mouse.wheel(0, delta);
    await espera(400);
  }
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 250 * (i % 2 ? -1 : 1), cy + 120, { steps: 15 });
    await page.mouse.up();
    await espera(300);
  }
  frames = await page.evaluate(() => /** @type {any} */ (window).__framesParar());
  const mapaRes = {
    ...(await tareasEntre(page, t0)),
    frames: frames.length,
    frameP95Ms: pct(frames, 0.95),
    framesMas50ms: frames.filter((f) => f > 50).length,
  };
  return { lista: listaRes, mapa: mapaRes };
}

// ---------------------------------------------------------------------------------------

async function control(ruta) {
  return (await fetch(`${CONTROL}${ruta}`)).json();
}

async function escenarioSoak(navegador) {
  const filtros = { paises: ['ES', 'CO', 'PA'], magMin: '2.0', periodo: PERIODO };
  const { contexto, page, cdp } = await nuevaPagina(navegador, { filtros });
  await page.goto(BASE);
  await esperarDatos(page);
  await page.waitForFunction(
    () => document.getElementById('estado-texto')?.textContent === 'En vivo',
    null,
    { timeout: 30_000 },
  );
  await esperarQuietud(page, 1000);
  const inicio = await metricas(cdp);
  const tInicio = await ahoraPagina(page);
  const muestras = [
    { minuto: 0, ...inicio, sismosServidor: (await control('/estado')).sismosAhora },
  ];
  const fin = Date.now() + MINUTOS * 60_000;
  let siguienteMuestra = Date.now() + 30_000;
  let enviados = 0;
  while (Date.now() < fin) {
    await control('/rafaga?n=1');
    enviados += 1;
    if (Date.now() >= siguienteMuestra) {
      siguienteMuestra += 30_000;
      const m = await metricas(cdp);
      muestras.push({
        minuto: Math.round(((Date.now() - (fin - MINUTOS * 60_000)) / 60_000) * 10) / 10,
        ...m,
        contador: await page.textContent('#contador'),
      });
    }
    await espera(1000);
  }
  await espera(2000);
  const final = await metricas(cdp);
  const tareas = await tareasEntre(page, tInicio);
  const perf = await page.evaluate(() => /** @type {any} */ (window).__perf);
  const durTareas = perf.lt.filter(([t]) => t >= tInicio).map(([, d]) => d);
  const resultado = {
    periodo: PERIODO,
    minutos: MINUTOS,
    sismosEnviados: enviados,
    inicio,
    final,
    contadorFinal: await page.textContent('#contador'),
    estadoFinal: await page.textContent('#estado-texto'),
    crecimientoHeapMb: Math.round((final.heapUsadoMb - inicio.heapUsadoMb) * 10) / 10,
    tareasDuranteSoak: tareas,
    tareaLargaP50Ms: pct(durTareas, 0.5),
    tareaLargaP95Ms: pct(durTareas, 0.95),
    muestras,
  };
  await contexto.close();
  return resultado;
}

// ---------------------------------------------------------------------------------------

async function escenarioRafaga(navegador) {
  const filtros = { paises: ['ES', 'CO', 'PA'], magMin: '2.0', periodo: PERIODO };
  const { contexto, page } = await nuevaPagina(navegador, { filtros });
  await page.goto(BASE);
  await esperarDatos(page);
  await page.waitForFunction(
    () => document.getElementById('estado-texto')?.textContent === 'En vivo',
    null,
    { timeout: 30_000 },
  );
  await esperarQuietud(page, 1000);
  const resultado = {
    periodo: PERIODO,
    cpuX: CPU_X,
    contadorInicial: await page.textContent('#contador'),
    rafagas: [],
  };
  for (const [n, lote] of [
    [50, 1],
    [1000, 1000],
  ]) {
    await page.evaluate(() => {
      /** @type {any} */ (window).__perf.rnf01 = [];
    });
    const t0 = await ahoraPagina(page);
    const r = await control(`/rafaga?n=${n}&lote=${lote}`);
    await page.waitForFunction((k) => /** @type {any} */ (window).__perf.rnf01.length >= k, r.n, {
      timeout: 180_000,
      polling: 200,
    });
    const lat = await page.evaluate(() => /** @type {any} */ (window).__perf.rnf01);
    await esperarQuietud(page, 1000);
    resultado.rafagas.push({
      n: r.n,
      lote,
      ingestaServidorMs: r.ingestaMs,
      recibidos: lat.length,
      latenciaMs: { p50: pct(lat, 0.5), p95: pct(lat, 0.95), max: pct(lat, 1) },
      tareas: await tareasEntre(page, t0),
      contador: await page.textContent('#contador'),
    });
  }
  await contexto.close();
  return resultado;
}

// ---------------------------------------------------------------------------------------

async function escenarioFiltros(navegador) {
  const filtros = { paises: ['ES', 'CO', 'PA'], magMin: '2.0', periodo: PERIODO };
  const { contexto, page, cdp } = await nuevaPagina(navegador, { filtros });
  await page.goto(BASE);
  await esperarDatos(page);
  await page.waitForFunction(
    () => document.getElementById('estado-texto')?.textContent === 'En vivo',
    null,
    { timeout: 30_000 },
  );
  await esperarQuietud(page, 500);
  if (
    (await page.getAttribute('#btn-filtros', 'aria-expanded')) === 'false' &&
    !(await page.locator('#magnitud').isVisible())
  ) {
    await page.click('#btn-filtros');
  }
  const antes = await metricas(cdp);
  const sseAntes = (await control('/estado')).clientesSse;
  const tiempos = [];
  const tInicio = await ahoraPagina(page);
  const magnitudes = ['3.0', '2.0', '4.0', '2.5'];
  const periodos = ['7d', PERIODO, '24h', PERIODO];
  const cada50 = [];
  for (let i = 0; i < CAMBIOS; i += 1) {
    if (i > 0 && i % 50 === 0) cada50.push({ cambios: i, ...(await metricas(cdp)) });
    const t0 = Date.now();
    const respuesta = page.waitForResponse((r) => r.url().includes('/api/sismos'), {
      timeout: 30_000,
    });
    if (i % 2 === 0) await page.selectOption('#magnitud', magnitudes[(i / 2) % 4]);
    else await page.selectOption('#periodo', periodos[((i - 1) / 2) % 4]);
    await respuesta;
    await page.waitForFunction(
      () => document.getElementById('estado-texto')?.textContent === 'En vivo',
      null,
      { timeout: 30_000 },
    );
    tiempos.push(Date.now() - t0);
  }
  // Vuelta a los filtros iniciales para comparar con los mismos datos en pantalla.
  await page.selectOption('#magnitud', '2.0');
  await espera(1500);
  await page.selectOption('#periodo', PERIODO);
  await espera(1500);
  await page.waitForFunction(
    () => document.getElementById('estado-texto')?.textContent === 'En vivo',
    null,
    { timeout: 30_000 },
  );
  await esperarQuietud(page, 1000);
  const despues = await metricas(cdp);
  const sseDespues = (await control('/estado')).clientesSse;
  const resultado = {
    periodo: PERIODO,
    cambios: CAMBIOS,
    cada50,
    antes,
    despues,
    deltaHeapMb: Math.round((despues.heapUsadoMb - antes.heapUsadoMb) * 10) / 10,
    deltaNodos: despues.nodos - antes.nodos,
    deltaOyentes: despues.oyentes - antes.oyentes,
    clientesSseAntes: sseAntes,
    clientesSseDespues: sseDespues,
    cambioHastaEnVivoMs: { p50: pct(tiempos, 0.5), p95: pct(tiempos, 0.95), max: pct(tiempos, 1) },
    tareas: await tareasEntre(page, tInicio),
  };
  await contexto.close();
  return resultado;
}

// ---------------------------------------------------------------------------------------

async function escenarioCwv(navegador) {
  const res = {};
  for (const movil of [false, true]) {
    const rondas = [];
    for (let r = 0; r < RONDAS; r += 1) {
      const { contexto, page } = await nuevaPagina(navegador, { movil });
      await page.goto(BASE, { waitUntil: 'load' });
      await esperarDatos(page);
      await esperarQuietud(page, 1000);
      // Interacciones típicas: abrir/cerrar filtros (móvil), clic en una fila, cambio de tema.
      // En escritorio el panel de filtros está siempre abierto y el botón no se muestra.
      if (await page.locator('#btn-filtros').isVisible()) {
        for (let i = 0; i < 2; i += 1) {
          if (movil) await page.tap('#btn-filtros');
          else await page.click('#btn-filtros');
          await espera(300);
        }
      }
      const fila = page.locator('#lista-sismos button.item').first();
      if (await fila.count()) {
        await fila.scrollIntoViewIfNeeded();
        if (movil) await fila.tap();
        else await fila.click();
        await espera(1500);
        await page.keyboard.press('Escape');
      }
      const tema = page.locator('label.tema-opcion', { has: page.locator('input[value="dia"]') });
      if (movil) await tema.tap();
      else await tema.click();
      await espera(500);
      // Al ocultar la página se cierran LCP y CLS (como web-vitals).
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      const perf = await page.evaluate(() => /** @type {any} */ (window).__perf);
      const porInteraccion = new Map();
      for (const [, d, id] of perf.eventos)
        porInteraccion.set(id, Math.max(porInteraccion.get(id) ?? 0, d));
      const fcp = await page.evaluate(() =>
        Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
      );
      rondas.push({
        fcpMs: fcp,
        lcpMs: perf.lcp?.t ?? null,
        lcpElemento: perf.lcp?.elemento ?? null,
        cls: Math.round(perf.cls * 1000) / 1000,
        inpAproxMs: porInteraccion.size ? Math.max(...porInteraccion.values()) : null,
        interacciones: porInteraccion.size,
        datosPintadosMs: perf.pintadoEn,
        tareasLargas: perf.lt.length,
        contador: await page.textContent('#contador'),
      });
      await contexto.close();
    }
    const mediana = (k) =>
      pct(
        rondas.map((x) => x[k]).filter((x) => x !== null),
        0.5,
      );
    res[movil ? 'movil' : 'escritorio'] = {
      lcpMedianaMs: mediana('lcpMs'),
      clsMediana: mediana('cls'),
      inpAproxMedianaMs: mediana('inpAproxMs'),
      fcpMedianaMs: mediana('fcpMs'),
      rondas,
    };
  }
  return { teselasReales: TESELAS_REALES, ...res };
}

// ---------------------------------------------------------------------------------------

const navegador = await chromium.launch();
try {
  const escenarios = {
    carga: escenarioCarga,
    rafaga: escenarioRafaga,
    soak: escenarioSoak,
    filtros: escenarioFiltros,
    cwv: escenarioCwv,
  };
  const fn = escenarios[ESCENARIO];
  if (!fn) throw new Error(`Escenario desconocido: ${ESCENARIO}`);
  const r = await fn(navegador);
  console.log(
    JSON.stringify(
      { escenario: ESCENARIO, base: BASE, navegador: navegador.version(), ...r },
      null,
      2,
    ),
  );
} finally {
  await navegador.close();
}
