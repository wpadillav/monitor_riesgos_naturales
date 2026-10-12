// Escritorio de poca altura (C7 de la revisión T5.5; DEF-02 y DEF-03 de T5.1). Por debajo de
// 900 px de alto, el panel «Filtros y avisos» se pliega como en móvil: la lista muestra al menos
// 5 filas y la rejilla no desborda. Con 1080 px o más, el panel sigue siempre abierto.

import {
  abrirFiltros,
  espiarNotificaciones,
  expect,
  filas,
  muchosSismos,
  simular,
  test,
} from './apoyo.js';

/**
 * Filas de la lista que se ven (todas o en parte) dentro de `#lista-scroll`. Con la fuente de
 * reserva de Chromium sin interfaz, la línea de la hora hace salto de línea y cada fila mide unos
 * 100 px (82 px en el diseño): a 1280 × 720 caben 4,5 filas enteras y se ven 5.
 * @param {import('@playwright/test').Page} page
 */
function filasVisibles(page) {
  return page.evaluate(() => {
    const caja = /** @type {HTMLElement} */ (
      document.getElementById('lista-scroll')
    ).getBoundingClientRect();
    return [...document.querySelectorAll('#lista-sismos button.item')].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.height > 0 && r.top < caja.bottom - 1 && r.bottom > caja.top + 1;
    }).length;
  });
}

/**
 * Píxeles que desborda la rejilla `.app` (0 si cabe entera).
 * @param {import('@playwright/test').Page} page
 */
function desbordeApp(page) {
  return page.evaluate(() => {
    const app = /** @type {HTMLElement} */ (document.querySelector('.app'));
    return app.scrollHeight - app.clientHeight;
  });
}

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
]) {
  test.describe(`ventana de ${viewport.width} × ${viewport.height}: panel plegable`, () => {
    test.use({ viewport });

    test('panel plegado con resumen, al menos 5 filas y sin desborde (DEF-03)', async ({
      page,
    }) => {
      await simular(page, { sismos: muchosSismos(40) });
      await page.goto('/');
      await expect(page.locator('#h-sismos')).toHaveText('Sismos (40)');
      const boton = page.getByRole('button', { name: /Filtros y avisos/ });
      await expect(boton).toBeVisible();
      await expect(boton).toHaveAttribute('aria-expanded', 'false');
      await expect(boton).toContainText('3 países · 2.0 o más · Últimas 24 h');
      await expect(page.locator('#magnitud')).toBeHidden();
      await expect.poll(() => filasVisibles(page)).toBeGreaterThanOrEqual(5);
      expect(await desbordeApp(page)).toBeLessThanOrEqual(0);
      // El aviso «Solo informativo» y la atribución siguen a la vista.
      await expect(page.locator('.aviso-ppal')).toBeInViewport();
      await expect(page.locator('.leaflet-control-attribution')).toBeInViewport();
    });

    test('se abre, se cierra con Esc y «Ver n sismos» lleva a la lista', async ({ page }) => {
      await simular(page);
      await page.goto('/');
      await expect(filas(page)).toHaveCount(5);
      const boton = page.getByRole('button', { name: /Filtros y avisos/ });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#magnitud')).toBeVisible();
      await page.locator('#magnitud').focus();
      await page.keyboard.press('Escape');
      await expect(boton).toHaveAttribute('aria-expanded', 'false');
      await expect(boton).toBeFocused();
      await expect(page.locator('#magnitud')).toBeHidden();

      await boton.click();
      await page.getByRole('button', { name: 'Ver 5 sismos' }).click();
      await expect(boton).toHaveAttribute('aria-expanded', 'false');
      await expect(filas(page).first()).toBeFocused();
    });
  });
}

test.describe('ventana de 1280 × 720: estados y teclado', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('con el panel plegado, Tab va del botón «Filtros y avisos» a la lista', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    await page.locator('#btn-filtros').focus();
    await page.keyboard.press('Tab');
    await expect(filas(page).first()).toBeFocused();
  });

  test('ningún país: el mensaje vacío se ve entero y ofrece «Abrir filtros» (DEF-02)', async ({
    page,
  }) => {
    await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    await abrirFiltros(page);
    for (const pais of ['España', 'Colombia', 'Panamá']) {
      await page.getByRole('checkbox', { name: pais }).uncheck();
    }
    const vacio = page.locator('#lista-vacio');
    await expect(vacio).toContainText('Selecciona al menos un país');
    // `#lista-scroll` no recorta el mensaje (no es una región desplazable sin foco).
    const recorte = await page.evaluate(() => {
      const s = /** @type {HTMLElement} */ (document.getElementById('lista-scroll'));
      return s.scrollHeight - s.clientHeight;
    });
    expect(recorte).toBeLessThanOrEqual(0);

    // Con el panel plegado, «Abrir filtros» lo despliega y lleva el foco a «España».
    await page.keyboard.press('Escape');
    await expect(page.locator('#btn-filtros')).toHaveAttribute('aria-expanded', 'false');
    const abrir = vacio.getByRole('button', { name: 'Abrir filtros' });
    await expect(abrir).toBeVisible();
    await abrir.click();
    await expect(page.getByRole('checkbox', { name: 'España' })).toBeFocused();
  });

  test('C8: con los avisos activados, el resumen lo dice', async ({ page }) => {
    await espiarNotificaciones(page, { permiso: 'default', respuesta: 'granted' });
    await simular(page);
    await page.goto('/');
    const resumen = page.locator('#resumen-filtros');
    await expect(resumen).toHaveText('3 países · 2.0 o más · Últimas 24 h');
    await abrirFiltros(page);
    await page.getByRole('button', { name: 'Activar avisos' }).click();
    await expect(page.locator('.avisos')).toContainText('Avisos activados');
    await expect(resumen).toHaveText('3 países · 2.0 o más · Últimas 24 h · Avisos activados');
    await page.getByRole('button', { name: 'Desactivar avisos' }).click();
    await expect(resumen).toHaveText('3 países · 2.0 o más · Últimas 24 h');
  });
});

test.describe('ventana de 1920 × 1080: panel siempre abierto', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('sin botón de plegar, filtros a la vista, al menos 5 filas y sin desborde', async ({
    page,
  }) => {
    await simular(page, { sismos: muchosSismos(40) });
    await page.goto('/');
    await expect(page.locator('#h-sismos')).toHaveText('Sismos (40)');
    await expect(page.locator('#btn-filtros')).toBeHidden();
    await expect(page.locator('#btn-ver')).toBeHidden();
    await expect(page.locator('#magnitud')).toBeVisible();
    await expect.poll(() => filasVisibles(page)).toBeGreaterThanOrEqual(5);
    expect(await desbordeApp(page)).toBeLessThanOrEqual(0);
  });
});
