/* global document */
// Las funciones que se pasan a `page.evaluate` y `addInitScript` se ejecutan en el navegador.
/**
 * Perfil de CPU de la carga de la página (T5.4): atribuye el tiempo del hilo principal a las
 * funciones de `public/js` y de Leaflet durante la carga con 10 000 sismos y, opcionalmente,
 * durante una ráfaga de sismos por el stream (`RAFAGA=200`: 200 sismos de uno en uno).
 *
 * Guarda el perfil en `docs/rendimiento/datos/pagina-<fase>.cpuprofile` (se abre en Chrome
 * DevTools → Performance) y escribe en stdout las funciones con más tiempo propio e inclusivo.
 *
 * Uso: `node scripts/rendimiento/perfil-pagina.js` (con `servidor-sintetico.js` en marcha)
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3008';
const CONTROL = `http://127.0.0.1:${process.env.CONTROL_PORT ?? 3009}`;
const RAFAGA = Number(process.env.RAFAGA ?? 200);
const DATOS = fileURLToPath(new URL('../../docs/rendimiento/datos/', import.meta.url));
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Resumen de un perfil: tiempo propio e inclusivo por función. */
function resumir(perfil, top = 20) {
  const porId = new Map(perfil.nodes.map((n) => [n.id, n]));
  const padre = new Map();
  for (const n of perfil.nodes) for (const c of n.children ?? []) padre.set(c, n.id);
  const dt = new Map();
  perfil.samples.forEach((s, i) => dt.set(s, (dt.get(s) ?? 0) + (perfil.timeDeltas[i] ?? 0)));
  const nombre = (n) =>
    `${n.callFrame.functionName || '(anónima)'} ${n.callFrame.url.split('/').slice(-1)[0]}:${n.callFrame.lineNumber + 1}`;
  const propio = new Map();
  const inclusivo = new Map();
  let total = 0;
  for (const n of perfil.nodes) {
    const v = dt.get(n.id) ?? 0;
    if (!v) continue;
    total += v;
    propio.set(nombre(n), (propio.get(nombre(n)) ?? 0) + v);
    const vistos = new Set();
    for (let id = n.id; id !== undefined; id = padre.get(id)) {
      const k = nombre(porId.get(id));
      if (!vistos.has(k)) inclusivo.set(k, (inclusivo.get(k) ?? 0) + v);
      vistos.add(k);
    }
  }
  const ordenar = (m) =>
    [...m]
      .filter(([k]) => !/^\((root|program|idle)\)/.test(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([k, v]) => ({ funcion: k, ms: Math.round(v / 1000) }));
  return {
    totalMs: Math.round(total / 1000),
    propio: ordenar(propio),
    inclusivo: ordenar(inclusivo),
  };
}

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const page = await contexto.newPage();
await page.route('https://server.arcgisonline.com/**', (r) =>
  r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
);
await page.addInitScript(() =>
  localStorage.setItem(
    'filtros',
    JSON.stringify({ paises: ['ES', 'CO', 'PA'], magMin: '2.0', periodo: '30d' }),
  ),
);
const cdp = await contexto.newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });

const salida = {};
await cdp.send('Profiler.start');
await page.goto(BASE);
await page.waitForFunction(
  () => /\d/.test(document.getElementById('contador')?.textContent ?? ''),
  null,
  { timeout: 120_000 },
);
await page.waitForFunction(
  () => document.getElementById('estado-texto')?.textContent === 'En vivo',
  null,
  { timeout: 30_000 },
);
await page.waitForTimeout(2000);
let { profile } = await cdp.send('Profiler.stop');
writeFileSync(`${DATOS}pagina-carga.cpuprofile`, JSON.stringify(profile));
salida.carga = resumir(profile);

if (RAFAGA > 0) {
  await cdp.send('Profiler.start');
  await (await fetch(`${CONTROL}/rafaga?n=${RAFAGA}&lote=1`)).json();
  await page.waitForTimeout(4000);
  ({ profile } = await cdp.send('Profiler.stop'));
  writeFileSync(`${DATOS}pagina-rafaga.cpuprofile`, JSON.stringify(profile));
  salida.rafaga = { sismos: RAFAGA, ...resumir(profile) };
}
await navegador.close();
console.log(JSON.stringify(salida, null, 2));
