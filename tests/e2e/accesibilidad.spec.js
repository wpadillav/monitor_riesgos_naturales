// Accesibilidad automática con axe-core (T5.1; PRD RNF-11 y RNF-12: WCAG 2.2 AA en ambos temas).
// Se analiza la página entera en sus estados principales con las etiquetas WCAG 2.0 A/AA,
// 2.1 AA y 2.2 AA. Se exige **0 violaciones** de cualquier impacto (RNF-11 pide 0 graves o
// críticas; aquí se es más estricto para no acumular deuda).
//
// Exclusiones (solo elementos de terceros fuera de nuestro control, ver `analizar`): ninguna por
// ahora. Si hiciera falta, se añaden con su justificación junto al selector.

import AxeBuilder from '@axe-core/playwright';
import { espiarNotificaciones, expect, filas, simular, test } from './apoyo.js';

const ETIQUETAS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

/**
 * Analiza la página y devuelve un resumen legible de las violaciones (regla, impacto y nodos).
 * @param {import('@playwright/test').Page} page
 */
async function analizar(page) {
  const { violations } = await new AxeBuilder({ page }).withTags(ETIQUETAS).analyze();
  return violations.map((v) => ({
    regla: v.id,
    impacto: v.impact,
    ayuda: v.help,
    nodos: v.nodes.map((n) => `${n.target.join(' ')} → ${n.failureSummary?.split('\n')[1] ?? ''}`),
  }));
}

test.describe('axe: WCAG 2.2 AA en los estados principales (RNF-11)', () => {
  test('carga con datos (tema del sistema: claro)', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    expect(await analizar(page)).toEqual([]);
  });

  test('tema oscuro elegido', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    await page.getByRole('radio', { name: 'Oscuro' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
    await expect(filas(page)).toHaveCount(5);
    expect(await analizar(page)).toEqual([]);
  });

  test('tema día elegido', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    await page.getByRole('radio', { name: 'Día' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-tema', 'dia');
    await expect(filas(page)).toHaveCount(5);
    expect(await analizar(page)).toEqual([]);
  });

  test('estado vacío: sin resultados con «Restablecer filtros»', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    await page.locator('#magnitud').selectOption('5.0');
    await page.locator('#periodo').selectOption('1h');
    await expect(page.locator('#lista-vacio')).toContainText('No hay sismos con estos filtros');
    expect(await analizar(page)).toEqual([]);
  });

  test('estado vacío: ningún país marcado', async ({ page }) => {
    test.fixme(
      true,
      'DEF-02 (T5.1): axe «scrollable-region-focusable» (serious) en #lista-scroll: el mensaje ' +
        'de estado vacío desborda el contenedor (88 px de alto a 1280 × 720) y no hay nada ' +
        'enfocable dentro en escritorio.',
    );
    await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    for (const pais of ['España', 'Colombia', 'Panamá']) {
      await page.getByRole('checkbox', { name: pais }).uncheck();
    }
    await expect(page.locator('#error-paises')).toBeVisible();
    expect(await analizar(page)).toEqual([]);
  });

  test.describe('error', () => {
    test.use({ erroresPermitidos: [/status of 500/] });

    test('error del servidor sin datos', async ({ page }) => {
      await simular(page, { estadoHttp: () => 500 });
      await page.goto('/');
      await expect(page.locator('#lista-vacio')).toContainText(
        'No se han podido cargar los sismos',
      );
      expect(await analizar(page)).toEqual([]);
    });
  });

  test('ventana emergente abierta', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    await filas(page).filter({ hasText: 'Northern Colombia' }).click();
    await expect(page.locator('.leaflet-popup h2')).toHaveText(/Northern Colombia/);
    expect(await analizar(page)).toEqual([]);
  });

  test('avisos activados', async ({ page }) => {
    await espiarNotificaciones(page, { permiso: 'default', respuesta: 'granted' });
    await simular(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Activar avisos' }).click();
    await expect(page.locator('.avisos')).toContainText('Avisos activados');
    expect(await analizar(page)).toEqual([]);
  });

  test.describe('móvil (360 × 740)', () => {
    test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

    test('filtros desplegados', async ({ page }) => {
      await simular(page);
      await page.goto('/');
      await expect(filas(page)).toHaveCount(5);
      const boton = page.getByRole('button', { name: /Filtros y avisos/ });
      await boton.click();
      await expect(boton).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#magnitud')).toBeVisible();
      expect(await analizar(page)).toEqual([]);
    });

    test('filtros desplegados en tema oscuro', async ({ page }) => {
      await simular(page);
      await page.goto('/');
      const boton = page.getByRole('button', { name: /Filtros y avisos/ });
      await boton.click();
      await page.getByRole('radio', { name: 'Oscuro' }).check();
      await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
      await expect(filas(page)).toHaveCount(5);
      expect(await analizar(page)).toEqual([]);
    });
  });
});
