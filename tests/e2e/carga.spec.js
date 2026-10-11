import { AHORA, expect, filas, muchosSismos, simular, sismo, test } from './apoyo.js';

test.describe('carga inicial con datos simulados', () => {
  test('pide los filtros por defecto y muestra lista, estado, mapa y pie', async ({ page }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');

    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    await expect(page.locator('#h-sismos')).toHaveText('Sismos (5)');
    await expect(filas(page)).toHaveCount(5);
    expect(peticiones[0].toString()).toBe('paises=ES%2CCO%2CPA&magMin=2.0&periodo=24h');
    await expect(page.locator('#estado-complemento')).toContainText('5 sismos');

    // HU-07: magnitud, lugar, «hace X», hora local con zona, profundidad y país.
    const primera = filas(page).first();
    await expect(primera).toContainText('Magnitud 2.7');
    await expect(primera).toContainText('Canary Islands, Spain Region');
    await expect(primera).toContainText('España · 14 km de profundidad');
    await expect(primera).toContainText('hace 30 min · 13:00 (hora de Canarias)');

    await expect(page.locator('.aviso-ppal')).toHaveText(
      'Solo informativo. No es un sistema de alerta temprana: sigue siempre los canales oficiales de tu país.',
    );
    await expect(page.locator('.atribucion')).toContainText(
      'Datos: EMSC / seismicportal.eu (CC BY 4.0) y U.S. Geological Survey (USGS). Mapa: Esri.',
    );
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Teselas © Esri');
    await expect(page.locator('.leaflet-control-zoom-in')).toHaveAttribute('aria-label', 'Acercar');
    await expect(page.locator('.leaflet-control-zoom-out')).toHaveAttribute('aria-label', 'Alejar');
    await expect(page.locator('#mapa')).toHaveAttribute(
      'aria-label',
      'Mapa de sismos. La lista de sismos contiene la misma información.',
    );
  });

  test('hora local por zona (HU-08) y textos de reserva', async ({ page }) => {
    await simular(page);
    await page.goto('/');
    const lista = page.locator('#lista-sismos');
    await expect(lista).toContainText('hace 35 min · 06:55 (hora de Colombia)');
    await expect(lista).toContainText('hace 2 h 30 min · 12:00 (hora peninsular)');
    await expect(lista).toContainText('Lugar sin nombre');
    await expect(lista).toContainText('Colombia · profundidad desconocida');
    await page.locator('#periodo').selectOption('7d');
    await expect(lista).toContainText('hace 1 día · 14/07 05:00 (hora de Panamá)');
  });

  test('texto malicioso: literal en la lista y la ventana, sin enlace ni script (AM-01, AM-02)', async ({
    page,
  }) => {
    await simular(page);
    await page.goto('/');
    const fila = filas(page).filter({ hasText: '<img src=x onerror=alert(1)>' });
    await expect(fila).toHaveCount(1);
    await fila.click();
    const ventana = page.locator('.leaflet-popup');
    await expect(ventana.locator('h2')).toHaveText(/M 3\.4 · <img src=x onerror=alert\(1\)>/);
    await expect(ventana).toContainText('autor: <b onmouseover=alert(1)>IGN</b>');
    await expect(ventana.locator('a[href^="javascript"]')).toHaveCount(0);
    await expect(ventana.locator('.p-enlaces')).toHaveCount(0);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
  });

  test('ventana emergente: fuente, autor, hora completa y enlace seguro (HU-07)', async ({
    page,
  }) => {
    await simular(page);
    await page.goto('/');
    await filas(page).filter({ hasText: 'Northern Colombia' }).click();
    const ventana = page.locator('.leaflet-popup');
    await expect(ventana.locator('h2')).toHaveText(/M 4\.2 · Northern Colombia/);
    await expect(ventana).toContainText('Fuente: EMSC · autor: IGC');
    await expect(ventana).toContainText('15/07/2026 06:55:00 (hora de Colombia)');
    await expect(ventana).toContainText('12 km');
    await expect(ventana).toContainText('8.31, -76.95');
    const enlace = ventana.getByRole('link', { name: /Más info en EMSC/ });
    await expect(enlace).toHaveAttribute(
      'href',
      'https://www.seismicportal.eu/eventdetails.html?unid=uraba',
    );
    await expect(enlace).toHaveAttribute('rel', /noopener/);
    await expect(enlace).toHaveAttribute('target', '_blank');
    await expect(ventana.locator('.leaflet-popup-close-button')).toHaveAttribute(
      'aria-label',
      'Cerrar',
    );
    await expect(filas(page).filter({ hasText: 'Northern Colombia' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('fuente caída: «USGS no disponible» (HU-02)', async ({ page }) => {
    await simular(page, {
      fuentes: [
        { fuente: 'emsc-fdsn', estado: 'ok', cambiadoEn: new Date(AHORA).toISOString() },
        { fuente: 'usgs', estado: 'caida', cambiadoEn: new Date(AHORA).toISOString() },
      ],
    });
    await page.goto('/');
    await expect(page.locator('#linea-fuente')).toBeVisible();
    await expect(page.locator('#linea-fuente')).toHaveText('USGS no disponible');
    await expect(filas(page)).toHaveCount(5);
  });

  test.describe('errores', () => {
    test.use({ erroresPermitidos: [/status of 500/] });

    test('error del servidor sin datos: mensaje, reintento manual y recuperación', async ({
      page,
    }) => {
      await simular(page, { estadoHttp: (n) => (n === 1 ? 500 : undefined) });
      await page.goto('/');
      const vacio = page.locator('#lista-vacio');
      await expect(vacio).toContainText('No se han podido cargar los sismos');
      await expect(vacio).toContainText('El servidor local ha devuelto un error.');
      await expect(vacio).toContainText(/Volveremos a intentarlo en \d+ s\./);
      await vacio.getByRole('button', { name: 'Reintentar ahora' }).click();
      await expect(filas(page)).toHaveCount(5);
      await expect(vacio).toBeHidden();
      await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    });
  });

  test('lista virtualizada con 10 000 sismos (RNF-03)', async ({ page }) => {
    // Tiempo medido **dentro de la página**, desde que llega la respuesta de /api/sismos hasta
    // que la lista muestra los 10 000 (T5.1). Antes se medía el reloj de pared de la prueba, que
    // incluye pasar ~7 MB por el protocolo de Playwright (`route.fulfill`) y la carga de la
    // máquina con varios workers: fallaba a veces sin que la aplicación fuese más lenta. El
    // tiempo de respuesta del servidor es RNF-04, y la medición formal de RNF-03 (panel
    // Rendimiento, tareas > 200 ms) es T5.4.
    await page.addInitScript(() => {
      const w = /** @type {any} */ (window);
      const original = w.fetch.bind(w);
      w.fetch = async (/** @type {RequestInfo | URL} */ r, /** @type {RequestInit} */ o) => {
        const respuesta = await original(r, o);
        if (String(r).startsWith('/api/sismos')) w.__respuestaEn = performance.now();
        return respuesta;
      };
      new MutationObserver((_, observador) => {
        if (document.getElementById('h-sismos')?.textContent === 'Sismos (10.000)') {
          w.__pintadoEn = performance.now();
          observador.disconnect();
        }
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await simular(page, { sismos: muchosSismos(10_000) });
    const inicio = Date.now();
    await page.goto('/');
    await expect(page.locator('#h-sismos')).toHaveText('Sismos (10.000)');
    const pared = Date.now() - inicio;
    const { respuestaEn, pintadoEn } = await page.evaluate(() => ({
      respuestaEn: /** @type {any} */ (window).__respuestaEn,
      pintadoEn: /** @type {any} */ (window).__pintadoEn,
    }));
    const enPagina = pintadoEn - respuestaEn;
    test.info().annotations.push({
      type: 'RNF-03',
      description: `respuesta → lista: ${Math.round(enPagina)} ms; reloj de pared: ${pared} ms`,
    });
    expect(enPagina).toBeGreaterThan(0);
    expect(enPagina).toBeLessThan(3_000);
    const pintadas = await page.locator('#lista-sismos > li').count();
    expect(pintadas).toBeGreaterThan(3);
    expect(pintadas).toBeLessThan(80);

    await filas(page).first().focus();
    await page.keyboard.press('End');
    const enfocada = page.locator('#lista-sismos button.item:focus');
    await expect(enfocada).toContainText('Sintetico 10000');
    await expect(page.locator('#lista-sismos > li:has(button:focus)')).toHaveAttribute(
      'aria-posinset',
      '10000',
    );
    await expect(page.locator('#lista-sismos > li').first()).toHaveAttribute(
      'aria-setsize',
      '10000',
    );
  });

  test('un sismo de la última hora lleva halo; uno antiguo no', async ({ page }) => {
    await simular(page, {
      sismos: [
        sismo({ unid: 'reciente', tiempo: new Date(AHORA - 5 * 60_000).toISOString() }),
        sismo({ unid: 'viejo', tiempo: new Date(AHORA - 5 * 3_600_000).toISOString(), lat: 39 }),
      ],
    });
    await page.goto('/');
    await expect(filas(page)).toHaveCount(2);
    await expect(page.locator('path.marcador-halo')).toHaveCount(1);
  });
});
