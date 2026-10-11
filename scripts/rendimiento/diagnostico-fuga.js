/* global document */
// Las funciones que se pasan a `page.waitForFunction` se ejecutan en el navegador.
/**
 * Diagnóstico de la retención de memoria al cambiar filtros (T5.4, P-xx). Cuenta, con
 * `Runtime.queryObjects` (CDP), las instancias vivas de `L.CircleMarker`, `L.Popup` y de los
 * otros objetos tras GC, al cargar y cada 50 cambios de periodo (24 h ↔ 30 días), siempre en el
 * mismo estado (30 días).
 *
 * Uso: `CAMBIOS=100 node scripts/rendimiento/diagnostico-fuga.js` (servidor sintético en marcha)
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3008';
const CAMBIOS = Number(process.env.CAMBIOS ?? 100);
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

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
await cdp.send('Performance.enable');
const enVivo = () =>
  page.waitForFunction(
    () => document.getElementById('estado-texto')?.textContent === 'En vivo',
    null,
    { timeout: 60_000 },
  );

async function contar() {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const r = {};
  for (const [nombre, expr] of [
    ['CircleMarker', 'L.CircleMarker.prototype'],
    ['Popup', 'L.Popup.prototype'],
    ['AbortController', 'AbortController.prototype'],
    ['EventSource', 'EventSource.prototype'],
    ['HTMLLIElement', 'HTMLLIElement.prototype'],
    ['Map', 'Map.prototype'],
    ['Set', 'Set.prototype'],
    ['Array', 'Array.prototype'],
  ]) {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: expr,
      objectGroup: 'diag',
    });
    const { objects } = await cdp.send('Runtime.queryObjects', {
      prototypeObjectId: result.objectId,
      objectGroup: 'diag',
    });
    const { result: n } = await cdp.send('Runtime.callFunctionOn', {
      objectId: objects.objectId,
      functionDeclaration: 'function () { return this.length; }',
      returnByValue: true,
    });
    r[nombre] = n.value;
    // Sin liberar el grupo, CDP retiene los objetos encontrados y falsea la siguiente cuenta.
    await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'diag' });
  }
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  r.heapMb =
    Math.round((metrics.find((m) => m.name === 'JSHeapUsedSize').value / 1048576) * 10) / 10;
  return r;
}

await page.goto(BASE);
await enVivo();
await page.waitForTimeout(1500);
const muestras = [{ cambios: 0, ...(await contar()) }];
for (let i = 1; i <= CAMBIOS; i += 1) {
  const resp = page.waitForResponse((r) => r.url().includes('/api/sismos'));
  await page.selectOption('#periodo', i % 2 ? '24h' : '30d');
  await resp;
  await enVivo();
  if (i % 50 === 0) muestras.push({ cambios: i, ...(await contar()) });
}
await navegador.close();
console.log(JSON.stringify(muestras, null, 2));
