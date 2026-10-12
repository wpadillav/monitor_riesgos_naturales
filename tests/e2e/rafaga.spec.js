// Regresión de P-01 (informe T5.4): una ráfaga de 1 000 sismos por el stream, con 10 000 en
// pantalla, no congela la página. Antes, cada evento repintaba la lista y el mapa enteros: una
// sola tarea de 8,5 s. Ahora se agrupa por frame y el mapa solo toca los marcadores nuevos.
//
// Se mide **dentro de la página**, desde que llega el primer evento hasta que la lista muestra
// los 11 000:
// - la latencia de ese intervalo (RNF-01: < 2 s);
// - en Chromium, el tiempo de los scripts de la página en cada frame largo
//   (`long-animation-frame`, con su estilo y maquetación forzados): ≤ 200 ms;
// - como red gruesa, ninguna tarea entera (`longtask`) llega a 2 s (antes: 8,5 s).
// No se exige que la tarea entera baje de 200 ms: con el reloj simulado de Playwright,
// `requestAnimationFrame` corre como `setTimeout`, y en Chromium sin interfaz la confirmación
// del frame al compositor (canvas rasterizado por SwiftShader) varía de 150 a 700 ms con la
// carga de la máquina, con el mismo código. Ese criterio se mide con
// `scripts/rendimiento/pagina.js rafaga`.

import { AHORA, expect, muchosSismos, simular, sismo, test } from './apoyo.js';

const N_BASE = 10_000;
const N_RAFAGA = 1_000;
/** Scripts de la página por frame (RNF-03). */
const TRABAJO_MAX_MS = 200;
/** Red gruesa: ninguna tarea entera por encima de esto. */
const TAREA_MAX_MS = 2_000;
/** Del primer evento recibido a la lista con todos (RNF-01: p95 < 2 s). */
const LATENCIA_MAX_MS = 2_000;

test('ráfaga de 1 000 sismos sobre 10 000: ≤ 200 ms de trabajo por frame y todos en < 2 s', async ({
  page,
  sse,
  browserName,
}) => {
  test.slow();
  await page.addInitScript(
    ({ total }) => {
      const w = /** @type {any} */ (window);
      w.__tareas = [];
      w.__trabajo = [];
      w.__primerEvento = null;
      w.__completa = null;
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) w.__tareas.push(Math.round(e.duration));
        }).observe({ type: 'longtask' });
        new PerformanceObserver((l) => {
          for (const e of /** @type {any[]} */ (l.getEntries())) {
            let scripts = 0;
            for (const x of e.scripts) scripts += x.duration;
            w.__trabajo.push(Math.round(scripts));
          }
        }).observe({ type: 'long-animation-frame' });
      } catch {
        // Firefox no tiene `longtask` ni `long-animation-frame`: solo se mide la latencia.
      }
      const original = EventSource.prototype.addEventListener;
      EventSource.prototype.addEventListener = function (tipo, fn, opciones) {
        if (tipo !== 'sismo.nuevo' || typeof fn !== 'function') {
          return original.call(this, tipo, fn, opciones);
        }
        const envuelta = function (/** @type {MessageEvent} */ e) {
          if (w.__primerEvento === null) w.__primerEvento = performance.now();
          return fn.call(this, e);
        };
        return original.call(this, tipo, envuelta, opciones);
      };
      const texto = `Sismos (${new Intl.NumberFormat('es').format(total)})`;
      new MutationObserver(() => {
        if (w.__completa === null && document.getElementById('h-sismos')?.textContent === texto) {
          w.__completa = performance.now();
        }
      }).observe(document, { childList: true, subtree: true, characterData: true });
    },
    { total: N_BASE + N_RAFAGA },
  );
  await simular(page, { sismos: muchosSismos(N_BASE) });
  await page.goto('/');
  await expect(page.locator('#h-sismos')).toHaveText('Sismos (10.000)');
  await expect(page.locator('#estado-texto')).toHaveText('En vivo');
  // Fuera de la medición lo que haya costado la carga inicial.
  await page.waitForTimeout(1_000);
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__tareas = [];
    w.__trabajo = [];
  });

  for (let i = 0; i < N_RAFAGA; i += 1) {
    sse.enviar('sismo.nuevo', {
      sismo: sismo({
        unid: `rafaga${i}`,
        tiempo: new Date(AHORA - 1_000 - i).toISOString(),
        lat: 36 + (i % 70) / 10,
        lon: -9 + (i % 110) / 10,
        magnitud: 2 + (i % 45) / 10,
        lugar: `RAFAGA ${i + 1}`,
      }),
      notificable: true,
      cambios: [],
    });
  }

  await expect(page.locator('#h-sismos')).toHaveText('Sismos (11.000)', { timeout: 30_000 });
  await page.waitForTimeout(500);
  const { tareas, trabajo, primerEvento, completa } = await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    return {
      tareas: w.__tareas,
      trabajo: w.__trabajo,
      primerEvento: w.__primerEvento,
      completa: w.__completa,
    };
  });
  const latencia = completa - primerEvento;
  test.info().annotations.push({
    type: 'P-01',
    description:
      `${browserName}: latencia ${Math.round(latencia)} ms; trabajo por frame ` +
      `${JSON.stringify(trabajo)}; tareas largas ${JSON.stringify(tareas)}`,
  });
  expect(latencia).toBeGreaterThanOrEqual(0);
  expect(latencia).toBeLessThan(LATENCIA_MAX_MS);
  expect(Math.max(0, ...trabajo)).toBeLessThanOrEqual(TRABAJO_MAX_MS);
  expect(Math.max(0, ...tareas)).toBeLessThan(TAREA_MAX_MS);
  // La primera fila es el sismo más reciente de la ráfaga.
  await expect(page.locator('#lista-sismos button.item').first()).toContainText('Rafaga 1');
});
