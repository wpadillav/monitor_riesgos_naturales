import { expect, simular, test } from './apoyo.js';

const html = (/** @type {import('@playwright/test').Page} */ page) => page.locator('html');

test.describe('tema Sistema / Oscuro / Día (HU-09)', () => {
  test.use({ colorScheme: 'light' });

  test('primera visita: sigue al sistema (claro) con teselas grises claras', async ({ page }) => {
    const { teselas } = await simular(page);
    await page.goto('/');
    await expect(html(page)).toHaveAttribute('data-tema', 'dia');
    await expect(page.getByRole('radio', { name: 'Sistema' })).toBeChecked();
    await expect.poll(() => teselas.some((u) => u.includes('World_Light_Gray_Base'))).toBe(true);
    expect(teselas.some((u) => u.includes('Dark_Gray'))).toBe(false);
  });

  test('elegir «Oscuro» cambia interfaz y teselas, y se mantiene al recargar sin parpadeo', async ({
    page,
  }) => {
    const { teselas } = await simular(page);
    await page.goto('/');
    await page.getByRole('radio', { name: 'Oscuro' }).check();
    await expect(html(page)).toHaveAttribute('data-tema', 'oscuro');
    await expect.poll(() => teselas.some((u) => u.includes('World_Dark_Gray_Base'))).toBe(true);
    const fondo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(fondo).toBe('rgb(15, 17, 21)');

    // Registra todos los valores que toma data-tema desde el primer instante de la carga.
    await page.addInitScript(() => {
      /** @type {any} */ (window).__temas = [];
      // Aún no existe <html>: se observa el documento entero.
      new MutationObserver(() => {
        const tema = document.documentElement?.dataset.tema;
        const temas = /** @type {any} */ (window).__temas;
        if (tema !== undefined && temas.at(-1) !== tema) temas.push(tema);
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-tema'] });
    });
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Oscuro' })).toBeChecked();
    const temas = await page.evaluate(() => /** @type {any} */ (window).__temas);
    expect(temas[0]).toBe('oscuro');
    expect(new Set(temas)).toEqual(new Set(['oscuro']));
  });

  test('«Día» con el sistema oscuro y vuelta a «Sistema», que sigue sus cambios', async ({
    page,
  }) => {
    await simular(page);
    // Firefox: la cabecera `Cross-Origin-Opener-Policy: same-origin` hace que la primera
    // navegación desde about:blank cambie de grupo de contextos, y Playwright 1.64 pierde ahí la
    // emulación de `prefers-color-scheme` (también la de `test.use({ colorScheme })`). Por eso se
    // emula después de la primera carga y se recarga: la recarga es del mismo origen y la
    // conserva. Comprobado en T5.1 quitando la cabecera COOP: sin ella, Firefox respeta la
    // emulación. No es un defecto de la aplicación.
    await page.goto('/');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-tema', 'oscuro');
    await page.getByRole('radio', { name: 'Día' }).check();
    await expect(html(page)).toHaveAttribute('data-tema', 'dia');
    expect(await page.evaluate(() => localStorage.getItem('tema'))).toBe('dia');
    await page.getByRole('radio', { name: 'Sistema' }).check();
    await expect(html(page)).toHaveAttribute('data-tema', 'oscuro');
    expect(await page.evaluate(() => localStorage.getItem('tema'))).toBeNull();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(html(page)).toHaveAttribute('data-tema', 'dia');
  });

  test('el script del tema es externo, bloqueante y va antes de las hojas de estilo', async ({
    page,
  }) => {
    await simular(page);
    const respuesta = await page.goto('/');
    const cuerpo = (await respuesta?.text()) ?? '';
    const script = cuerpo.indexOf('<script src="/js/tema-inicial.js"></script>');
    expect(script).toBeGreaterThan(0);
    expect(script).toBeLessThan(cuerpo.indexOf('rel="stylesheet"'));
    expect(cuerpo).not.toMatch(/<script>|style="/);
  });
});
