import { espiarNotificaciones, expect, filas, simular, test } from './apoyo.js';

test.describe('navegación con teclado (wireframes §9)', () => {
  test('el primer Tab es «Ir a la lista de sismos» y lleva el foco a la lista', async ({
    page,
  }) => {
    await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    await page.keyboard.press('Tab');
    const saltar = page.getByRole('link', { name: 'Ir a la lista de sismos' });
    await expect(saltar).toBeFocused();
    await expect(saltar).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(filas(page).first()).toBeFocused();
  });

  test('la lista es un único punto de tabulación con flechas, Inicio y Fin', async ({ page }) => {
    // Permiso «sin decidir», como en un navegador recién instalado (Chromium sin interfaz lo
    // deniega por defecto).
    await espiarNotificaciones(page, { permiso: 'default' });
    await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    await expect(page.locator('#lista-sismos button[tabindex="0"]')).toHaveCount(1);

    // Desde «Periodo»: Tab va a «Activar avisos» y el siguiente entra en la lista.
    await page.locator('#periodo').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Activar avisos' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(filas(page).first()).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(filas(page).nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(filas(page).nth(4)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(filas(page).first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(filas(page).first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#lista-sismos button[tabindex="0"]')).toHaveCount(1);

    // Tab sale de la lista; Mayús+Tab vuelve al último elemento visitado.
    await page.keyboard.press('Tab');
    await expect(page.locator('#lista-sismos button:focus')).toHaveCount(0);
    await page.keyboard.press('Shift+Tab');
    await expect(filas(page).nth(1)).toBeFocused();
  });

  test('Intro abre la ventana con el foco en el título; Esc la cierra y devuelve el foco', async ({
    page,
  }) => {
    await simular(page);
    await page.goto('/');
    await filas(page).first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const titulo = page.locator('.leaflet-popup h2');
    await expect(titulo).toBeFocused();
    await expect(titulo).toHaveText(/M 4\.2 · Northern Colombia/);
    await expect(filas(page).nth(1)).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('.leaflet-popup')).toHaveCount(0);
    await expect(filas(page).nth(1)).toBeFocused();
    await expect(filas(page).nth(1)).not.toHaveAttribute('aria-current', 'true');
  });

  test('los controles del mapa están traducidos y son alcanzables', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Acercar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Alejar' })).toBeVisible();
    const leyenda = page.getByRole('button', { name: 'Leyenda' });
    await expect(leyenda).toHaveAttribute('aria-expanded', 'true');
    await leyenda.press('Enter');
    await expect(leyenda).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#leyenda-mapa')).toBeHidden();
  });
});
