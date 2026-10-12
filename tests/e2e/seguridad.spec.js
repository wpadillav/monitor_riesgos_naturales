// Pruebas de seguridad de la página (D-2, hallazgo S-03 de docs/seguridad/revision-T5.3.md).
// - AM-01 y AM-02 (RNF-07): los payloads de `tests/fixtures/maliciosos/xss.json` llegan por la
//   carga inicial y por el stream; nada se ejecuta, el texto sale literal en la lista, en la
//   ventana emergente y en la región de anuncios, y no queda ningún enlace peligroso.
//   La vigilancia de `apoyo.js` (diálogos, CSP, consola y `pageerror`) se aplica a cada prueba.
// - AM-11: ver `seguridad-origen.spec.js` (servidor real y página de otro origen).

import { readFileSync } from 'node:fs';
import { AHORA, expect, filas, simular, sismo, test } from './apoyo.js';

/** @type {{ lugar: string[], autor: string, url: string[] }} */
const XSS = JSON.parse(
  readFileSync(new URL('../fixtures/maliciosos/xss.json', import.meta.url), 'utf8'),
);

const MIN = 60_000;
const URL_VALIDA = 'https://www.seismicportal.eu/eventdetails.html?unid=control';

/**
 * Fuentes con todas las URL maliciosas del fixture, alternando EMSC y USGS (AM-02).
 * @param {string} unid
 * @param {number} magnitud
 */
function fuentesMaliciosas(unid, magnitud) {
  return XSS.url.map((url, k) => ({
    fuente: k % 2 === 0 ? 'emsc' : 'usgs',
    idFuente: unid,
    autor: XSS.autor,
    magnitud,
    magnitudTipo: 'ml',
    url,
    actualizadoEn: new Date(AHORA - 5 * MIN).toISOString(),
  }));
}

/**
 * Sismo con el payload `i` del fixture en `lugar`, el autor malicioso y todas las URL malas.
 * @param {number} i
 * @param {number} [haceMin]
 */
function sismoMalicioso(i, haceMin = 20 + i) {
  const unid = `xss${i}`;
  const magnitud = Math.round((3.5 + i / 10) * 10) / 10;
  return sismo({
    unid,
    tiempo: new Date(AHORA - haceMin * MIN).toISOString(),
    lat: 37 + i / 2,
    lon: -3.5,
    magnitud,
    lugar: XSS.lugar[i],
    autor: XSS.autor,
    url: XSS.url[i % XSS.url.length],
    fuentes: fuentesMaliciosas(unid, magnitud),
  });
}

/** Sismo de control: una ficha válida y otra con `javascript:`. Solo debe quedar la válida. */
function sismoControl() {
  return sismo({
    unid: 'control',
    tiempo: new Date(AHORA - 60 * MIN).toISOString(),
    lat: 39,
    lon: -1,
    magnitud: 2.9,
    lugar: 'VALENCIA, SPAIN',
    fuentes: [
      {
        fuente: 'emsc',
        idFuente: 'control',
        autor: 'IGN',
        magnitud: 2.9,
        magnitudTipo: 'ml',
        url: URL_VALIDA,
        actualizadoEn: new Date(AHORA - 5 * MIN).toISOString(),
      },
      {
        fuente: 'usgs',
        idFuente: 'control',
        autor: 'IGN',
        magnitud: 2.9,
        magnitudTipo: 'ml',
        url: XSS.url[0],
        actualizadoEn: new Date(AHORA - 5 * MIN).toISOString(),
      },
    ],
  });
}

/**
 * Comprueba en todo el documento que no hay restos de una inyección: ni atributos `on*`, ni
 * `<script>` inline, ni la imagen o el `svg` del payload, ni enlaces con protocolos peligrosos o
 * hacia el dominio del atacante.
 * @param {import('@playwright/test').Page} page
 */
async function sinRastrosDeInyeccion(page) {
  const rastros = await page.evaluate(() => {
    const todos = [...document.querySelectorAll('*')];
    return {
      atributosOn: todos.flatMap((el) =>
        [...el.attributes]
          .filter((a) => a.name.toLowerCase().startsWith('on'))
          .map((a) => `${el.tagName}[${a.name}]`),
      ),
      scriptsInline: [...document.scripts].filter((s) => !s.src).length,
      imgX: document.querySelectorAll('img[src="x"]').length,
      svgOnload: document.querySelectorAll('svg[onload]').length,
      negritaInyectada: document.querySelectorAll('#lista-sismos b, .leaflet-popup b').length,
      enlaces: [...document.querySelectorAll('a[href]')].map((a) => ({
        href: a.getAttribute('href') ?? '',
        protocolo: /** @type {HTMLAnchorElement} */ (a).protocol,
      })),
    };
  });
  expect(rastros.atributosOn, 'atributos on* en el DOM').toEqual([]);
  expect(rastros.scriptsInline, '<script> inline').toBe(0);
  expect(rastros.imgX).toBe(0);
  expect(rastros.svgOnload).toBe(0);
  expect(rastros.negritaInyectada).toBe(0);
  for (const { href, protocolo } of rastros.enlaces) {
    expect(['http:', 'https:', 'mailto:'], `protocolo de ${href}`).toContain(protocolo);
    expect(href).not.toMatch(/evil\.example|java\s*script|vbscript|^\s*data:/i);
  }
}

test.describe('XSS almacenado y enlaces maliciosos (AM-01, AM-02, RNF-07)', () => {
  test('el fixture trae los tres payloads de «lugar» que pide el modelo (AM-01)', () => {
    expect(XSS.lugar).toEqual([
      '<img src=x onerror=alert(1)>',
      '"><svg onload=alert(1)>',
      '<script>alert(1)</script>',
    ]);
    // Se compone para no disparar `no-script-url` (como en apoyo.js).
    expect(XSS.url).toContain(['javascript', 'alert(1)'].join(':'));
  });

  for (const [i, payload] of XSS.lugar.entries()) {
    test(`carga inicial, payload ${i + 1} (${payload}): literal en la lista y en la ventana, sin ejecución ni enlace`, async ({
      page,
    }) => {
      await simular(page, { sismos: [sismoMalicioso(i), sismoControl()] });
      await page.goto('/');

      const fila = filas(page).filter({ hasText: payload });
      await expect(fila).toHaveCount(1);
      expect(await fila.textContent()).toContain(payload);

      await fila.click();
      const ventana = page.locator('.leaflet-popup');
      const magnitud = (3.5 + i / 10).toFixed(1);
      await expect(ventana.locator('h2 > span').last()).toHaveText(`M ${magnitud} · ${payload}`);
      await expect(ventana.locator('.p-fuente')).toHaveText(`Fuente: EMSC · autor: ${XSS.autor}`);
      // Ninguna de las 10 URL maliciosas produce enlace (AM-02).
      await expect(ventana.locator('.p-enlaces')).toHaveCount(0);
      await expect(ventana.locator('a[href]:not(.leaflet-popup-close-button)')).toHaveCount(0);

      await sinRastrosDeInyeccion(page);
    });
  }

  test('ficha con una URL válida y otra con javascript:: solo queda el enlace válido (AM-02)', async ({
    page,
  }) => {
    await simular(page, { sismos: [sismoControl()] });
    await page.goto('/');
    await filas(page).filter({ hasText: 'Valencia, Spain' }).click();

    const enlaces = page.locator('.leaflet-popup .p-enlaces a');
    await expect(enlaces).toHaveCount(1);
    await expect(enlaces).toHaveAttribute('href', URL_VALIDA);
    await expect(enlaces).toHaveAttribute('rel', /noopener/);
    await expect(enlaces).toHaveAttribute('rel', /noreferrer/);
    await sinRastrosDeInyeccion(page);
  });

  test('por el stream (sismo.nuevo): los tres payloads salen literales en la lista, la ventana y los anuncios', async ({
    page,
    sse,
  }) => {
    await simular(page, { sismos: [sismoControl()] });
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');

    for (const [i, payload] of XSS.lugar.entries()) {
      sse.enviar('sismo.nuevo', {
        sismo: sismoMalicioso(i, 5 - i),
        notificable: false,
        cambios: [],
      });
      const fila = filas(page).filter({ hasText: payload });
      await expect(fila).toHaveCount(1);
      // Los anuncios en vivo salen como mucho uno cada 10 s (textos.md §10): se adelanta el reloj.
      if (i > 0) await page.clock.fastForward(10_000);
      await expect(page.locator('#anuncios')).toContainText(payload);

      await fila.click();
      await expect(page.locator('.leaflet-popup h2 > span').last()).toHaveText(
        `M ${(3.5 + i / 10).toFixed(1)} · ${payload}`,
      );
      await expect(page.locator('.leaflet-popup .p-enlaces')).toHaveCount(0);
    }
    await expect(filas(page)).toHaveCount(4);
    await sinRastrosDeInyeccion(page);
  });
});
