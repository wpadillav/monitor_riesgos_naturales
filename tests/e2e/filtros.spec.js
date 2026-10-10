import { expect, filas, simular, test } from './apoyo.js';

test.describe('filtros aplicados al momento (HU-03 a HU-06)', () => {
  test('valores por defecto: tres países, 2.0 o más y últimas 24 h', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    for (const pais of ['España', 'Colombia', 'Panamá']) {
      await expect(page.getByRole('checkbox', { name: pais })).toBeChecked();
    }
    await expect(page.locator('#magnitud')).toHaveValue('2.0');
    await expect(page.locator('#periodo')).toHaveValue('24h');
    await expect(page.locator('#magnitud option')).toHaveText([
      'Todas',
      '1.0 o más',
      '2.0 o más',
      '2.5 o más',
      '3.0 o más',
      '4.0 o más',
      '4.5 o más',
      '5.0 o más',
    ]);
    await expect(page.locator('#periodo option')).toHaveText([
      'Última hora',
      'Últimas 24 h',
      '7 días',
      '30 días',
    ]);
    await expect(page.locator('#restablecer')).toBeHidden();
  });

  test('desmarcar Colombia pide los datos sin Colombia y los quita de la lista', async ({
    page,
  }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    await page.getByRole('checkbox', { name: 'Colombia' }).uncheck();
    await expect.poll(() => peticiones.length).toBe(2);
    expect(peticiones[1].get('paises')).toBe('ES,PA');
    await expect(filas(page)).toHaveCount(3);
    await expect(page.locator('#lista-sismos')).not.toContainText('Colombia');
    await expect(page.locator('#anuncios')).toHaveText('Mostrando 3 sismos.');
  });

  test('magnitud 3.0: la petición la incluye y no hay sismos menores', async ({ page }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await page.locator('#magnitud').selectOption('3.0');
    await expect.poll(() => peticiones.length).toBe(2);
    expect(peticiones[1].get('magMin')).toBe('3.0');
    await expect(filas(page)).toHaveCount(3);
    for (const texto of await filas(page).locator('.insignia').allInnerTexts()) {
      expect(Number(texto.replace(/[^\d.]/g, ''))).toBeGreaterThanOrEqual(3);
    }
  });

  test('«Todas» omite magMin y «30 días» pide periodo=30d', async ({ page }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await page.locator('#magnitud').selectOption('todas');
    await expect.poll(() => peticiones.length).toBe(2);
    expect(peticiones[1].has('magMin')).toBe(false);
    await page.locator('#periodo').selectOption('30d');
    await expect.poll(() => peticiones.length).toBe(3);
    expect(peticiones[2].get('periodo')).toBe('30d');
    await expect(filas(page)).toHaveCount(6);
  });

  test('cambios seguidos se agrupan en una sola consulta (espera de 400 ms)', async ({ page }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    await page.locator('#magnitud').selectOption('3.0');
    await page.locator('#periodo').selectOption('7d');
    await page.getByRole('checkbox', { name: 'Panamá' }).uncheck();
    await expect.poll(() => peticiones.length).toBe(2);
    await page.waitForTimeout(800);
    expect(peticiones).toHaveLength(2);
    expect(peticiones[1].toString()).toBe('paises=ES%2CCO&magMin=3.0&periodo=7d');
  });

  test('ningún país marcado: no consulta y lo dice (HU-03)', async ({ page }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    for (const pais of ['España', 'Colombia', 'Panamá']) {
      await page.getByRole('checkbox', { name: pais }).uncheck();
    }
    await expect(page.locator('#lista-vacio')).toContainText('Selecciona al menos un país');
    await expect(page.locator('#error-paises')).toBeVisible();
    await expect(page.locator('#estado-texto')).toHaveText('Sin consulta: no hay países marcados');
    await expect(filas(page)).toHaveCount(0);
    await page.waitForTimeout(600);
    expect(peticiones).toHaveLength(1);
  });

  test('sin resultados: mensaje del PRD y «Restablecer filtros»', async ({ page }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await page.locator('#magnitud').selectOption('5.0');
    await page.locator('#periodo').selectOption('1h');
    const vacio = page.locator('#lista-vacio');
    await expect(vacio).toContainText('No hay sismos con estos filtros');
    await vacio.getByRole('button', { name: 'Restablecer filtros' }).click();
    await expect(page.locator('#magnitud')).toHaveValue('2.0');
    await expect(page.locator('#periodo')).toHaveValue('24h');
    await expect(page.getByRole('checkbox', { name: 'España' })).toBeFocused();
    await expect(filas(page)).toHaveCount(5);
    expect(peticiones.at(-1)?.toString()).toBe('paises=ES%2CCO%2CPA&magMin=2.0&periodo=24h');
  });

  test('recuerda los filtros al recargar (HU-06)', async ({ page }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await page.getByRole('checkbox', { name: 'España' }).uncheck();
    await page.getByRole('checkbox', { name: 'Colombia' }).uncheck();
    await page.locator('#magnitud').selectOption('3.0');
    await page.locator('#periodo').selectOption('7d');
    await expect.poll(() => peticiones.length).toBeGreaterThan(1);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Panamá' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'España' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Colombia' })).not.toBeChecked();
    await expect(page.locator('#magnitud')).toHaveValue('3.0');
    await expect(page.locator('#periodo')).toHaveValue('7d');
    await expect(page.locator('#restablecer')).toBeVisible();
    await expect.poll(() => peticiones.at(-1)?.toString()).toBe('paises=PA&magMin=3.0&periodo=7d');
  });

  test('preferencias dañadas: valores por defecto sin error visible (HU-06)', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('filtros', '{"paises":["FR"],"magMin":"9","periodo":"1a"');
      localStorage.setItem('tema', '<script>');
    });
    const { peticiones } = await simular(page);
    await page.goto('/');
    await expect(filas(page)).toHaveCount(5);
    expect(peticiones[0].toString()).toBe('paises=ES%2CCO%2CPA&magMin=2.0&periodo=24h');
    await expect(page.locator('#lista-vacio')).toBeHidden();
  });
});
