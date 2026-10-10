import { expect, filas, simular, test } from './apoyo.js';

test.describe('móvil (360 × 740, por debajo de 700 px)', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test('mapa encima de la lista, filtros plegados con resumen y pie visible', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);

    const boton = page.getByRole('button', { name: /Filtros y avisos/ });
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await expect(boton).toContainText('3 países · 2.0 o más · Últimas 24 h');
    await expect(page.locator('#magnitud')).toBeHidden();

    const mapa = await page.locator('#mapa').boundingBox();
    const lista = await page.locator('.lis').boundingBox();
    expect(mapa && lista && mapa.y < lista.y).toBe(true);
    expect(mapa?.height ?? 0).toBeGreaterThanOrEqual(240);

    await expect(page.locator('.aviso-ppal')).toBeInViewport();
    await expect(page.locator('.atribucion')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Leyenda' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desborde).toBeLessThanOrEqual(0);
  });

  test('desplegar filtros, cambiar un país y «Ver n sismos» lleva a la lista', async ({ page }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    const boton = page.getByRole('button', { name: /Filtros y avisos/ });
    await boton.click();
    await expect(boton).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('checkbox', { name: 'Panamá' }).uncheck();
    await expect(boton).toContainText('España y Colombia · 2.0 o más · Últimas 24 h');
    await expect.poll(() => peticiones.length).toBe(2);
    const ver = page.getByRole('button', { name: 'Ver 5 sismos' });
    await expect(ver).toBeVisible();
    await ver.click();
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await expect(filas(page).first()).toBeFocused();
  });

  test('Esc pliega el panel y devuelve el foco al botón', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    const boton = page.getByRole('button', { name: /Filtros y avisos/ });
    await boton.click();
    await page.locator('#magnitud').focus();
    await page.keyboard.press('Escape');
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await expect(boton).toBeFocused();
  });

  test('«Fuentes y canales oficiales» despliega los enlaces y la nota de Colombia', async ({
    page,
  }) => {
    await simular(page);
    await page.goto('/');
    const fuentes = page.getByRole('button', { name: 'Fuentes y canales oficiales' });
    await expect(page.locator('#nota-colombia')).toBeHidden();
    await fuentes.click();
    await expect(fuentes).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#nota-colombia')).toBeVisible();
    await expect(page.getByRole('link', { name: /SINAPROC/ })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });
});
