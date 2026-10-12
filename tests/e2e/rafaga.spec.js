// Regresión de P-01 (informe T5.4): una ráfaga de 1 000 sismos por el stream, con 10 000 en
// pantalla, no congela la página. Antes, cada evento repintaba la lista y el mapa enteros: una
// sola tarea de 8,5 s. Ahora se agrupa por frame y el mapa solo toca los marcadores nuevos.
//
// Es un **detector de regresiones groseras**, no la medición de RNF-01 ni de RNF-03. Sus umbrales
// dejan un margen amplio frente al estado roto (en este escenario, con 10 000 en pantalla: 10 s
// de latencia y una tarea de 8,5 s) y frente a una máquina cargada. Con el mismo código y 3
// procesos `node -e "for(;;){}"` más otros agentes (carga media de 13 a 18 en 4 núcleos), 20
// ejecuciones dieron como máximo: latencia 1 069 ms, 518 ms de scripts en un frame y una tarea
// entera de 1 469 ms (E-QA). Se mide **dentro de la página**, desde que llega el primer evento
// hasta que la lista muestra los 11 000:
// - la latencia de ese intervalo: < 2 s (roto: 4 a 11 s);
// - en Chromium, el tiempo de los scripts de la página en cada frame largo
//   (`long-animation-frame`, con su estilo y maquetación forzados): ≤ 1,5 s (roto: 3 a 9 s);
// - ninguna tarea entera (`longtask`) llega a 3 s (roto: 8,5 s). Con el reloj simulado de
//   Playwright, `requestAnimationFrame` corre como `setTimeout`, y en Chromium sin interfaz la
//   confirmación del frame al compositor (canvas rasterizado por SwiftShader) varía de 150 ms a
//   1,5 s con la carga de la máquina, con el mismo código.
//
// **La verificación estricta de RNF-01 y RNF-03 (≤ 200 ms por tarea) no se hace aquí**, sino con
// `scripts/rendimiento/pagina.js rafaga` (y `carga`) sobre el servidor sintético y con la
// máquina descargada: `npm run perf:pagina -- rafaga` (ver README, «Pruebas y verificaciones»).
// Si el trabajo por frame supera los 200 ms, la prueba lo anota (`RNF-03 estricto`) sin fallar.

import { AHORA, expect, muchosSismos, simular, sismo, test } from './apoyo.js';

const N_BASE = 10_000;
const N_RAFAGA = 1_000;
/** Regresión grosera: scripts de la página por frame (roto: 3 a 9 s; cargada: hasta ~520 ms). */
const TRABAJO_MAX_MS = 1_500;
/** Cifra estricta de RNF-03; aquí solo se anota. La verifica `pagina.js rafaga`. */
const TRABAJO_ESTRICTO_MS = 200;
/** Regresión grosera: ninguna tarea entera llega a esto (roto: 8,5 s; cargada: hasta ~1,5 s). */
const TAREA_MAX_MS = 3_000;
/** Del primer evento recibido a la lista con todos (roto: 4 a 11 s; RNF-01: p95 < 2 s). */
const LATENCIA_MAX_MS = 2_000;

/**
 * Espera a que los observadores de rendimiento no entreguen entradas nuevas entre dos consultas
 * seguidas (las de un frame llegan después de pintarlo). Espera por condición, no pausa fija.
 * @param {import('@playwright/test').Page} page
 */
async function esperarSinEntradasNuevas(page) {
  let anterior = -1;
  await expect
    .poll(
      async () => {
        const n = await page.evaluate(() => {
          const w = /** @type {any} */ (window);
          w.__recoger();
          return w.__tareas.length + w.__trabajo.length;
        });
        const estable = n === anterior;
        anterior = n;
        return estable;
      },
      { intervals: [100, 250, 500], timeout: 15_000 },
    )
    .toBe(true);
}

test('ráfaga de 1 000 sismos sobre 10 000: sin frames de más de 1,5 s de scripts y todos en < 2 s (regresión de P-01)', async ({
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
      /** @type {Array<{ o: PerformanceObserver, fn: (l: PerformanceEntry[]) => void }>} */
      const observadores = [];
      // Entrega ya las entradas que los observadores tengan en cola (`takeRecords`).
      w.__recoger = () => {
        for (const { o, fn } of observadores) fn(o.takeRecords());
      };
      /** @param {string} tipo @param {(e: any) => void} anotar */
      const observar = (tipo, anotar) => {
        const fn = (/** @type {PerformanceEntry[]} */ entradas) => entradas.forEach(anotar);
        const o = new PerformanceObserver((l) => fn(l.getEntries()));
        o.observe({ type: tipo });
        observadores.push({ o, fn });
      };
      try {
        observar('longtask', (e) => w.__tareas.push(Math.round(e.duration)));
        observar('long-animation-frame', (e) => {
          let scripts = 0;
          for (const x of e.scripts) scripts += x.duration;
          w.__trabajo.push(Math.round(scripts));
        });
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
  // Fuera de la medición lo que haya costado la carga inicial: se espera por condición (N-06) a
  // que el mapa tenga los halos de la última hora, a que acaben los pulsos de la carga (así se
  // reconoce cuándo el mapa aplica la ráfaga) y a que los observadores no entreguen más entradas.
  const mapa = page.locator('#mapa');
  await expect(mapa).toHaveAttribute('data-halos', /^[1-9]\d*$/);
  await expect(mapa).toHaveAttribute('data-pulsos', '0', { timeout: 20_000 });
  await esperarSinEntradasNuevas(page);
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
  // El mapa ha aplicado la ráfaga cuando arrancan sus pulsos (los de la carga ya acabaron); luego
  // se esperan las últimas entradas de los observadores, sin pausas fijas (N-06).
  await expect(mapa).not.toHaveAttribute('data-pulsos', '0');
  await esperarSinEntradasNuevas(page);
  const { tareas, trabajo, primerEvento, completa } = await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__recoger();
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
  const mayorTrabajo = Math.max(0, ...trabajo);
  if (mayorTrabajo > TRABAJO_ESTRICTO_MS) {
    test.info().annotations.push({
      type: 'RNF-03 estricto',
      description:
        `${mayorTrabajo} ms de scripts en un frame (> ${TRABAJO_ESTRICTO_MS} ms). No falla aquí: ` +
        'si se repite con la máquina descargada, medir con `npm run perf:pagina -- rafaga`.',
    });
  }
  expect(latencia).toBeGreaterThanOrEqual(0);
  expect(latencia).toBeLessThan(LATENCIA_MAX_MS);
  expect(mayorTrabajo).toBeLessThanOrEqual(TRABAJO_MAX_MS);
  expect(Math.max(0, ...tareas)).toBeLessThan(TAREA_MAX_MS);
  // La primera fila es el sismo más reciente de la ráfaga.
  await expect(page.locator('#lista-sismos button.item').first()).toContainText('Rafaga 1');
});
