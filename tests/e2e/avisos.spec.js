// Avisos del navegador (T4.7; PRD HU-10 y HU-11; textos.md §8; AM-07, AM-22, AM-23, AM-27).

import {
  AHORA,
  avisos,
  espiarNotificaciones,
  expect,
  filas,
  simular,
  sismo,
  test,
} from './apoyo.js';

const MIN = 60_000;

// Se ejecuta en el proyecto `chromium-avisos` (modo sin interfaz nuevo; ver playwright.config.js).

/**
 * Sismo en Colombia de hace 1 min (07:29 hora de Colombia).
 * @param {Record<string, unknown>} campos
 */
const colombiano = (campos) =>
  sismo({
    tiempo: new Date(AHORA - MIN).toISOString(),
    lat: 8.31,
    lon: -76.95,
    lugar: 'Golfo de Urabá',
    pais: 'CO',
    zona: 'CO-CONT',
    zonaHoraria: 'America/Bogota',
    autor: 'IGC',
    profundidadKm: 12,
    ...campos,
  });

/**
 * @param {Record<string, unknown>} campos
 * @param {{ notificable?: boolean, cambios?: string[] }} [opciones]
 */
const datos = (campos, { notificable = true, cambios = [] } = {}) => ({
  sismo: colombiano(campos),
  notificable,
  cambios,
});

/**
 * Página cargada con los avisos activados (permiso concedido por el contexto de Playwright).
 * @param {import('@playwright/test').Page} page
 * @param {import('./sse-simulado.js').SseSimulado} sse
 */
async function conAvisosActivados(page, sse) {
  await espiarNotificaciones(page);
  await simular(page);
  await page.goto('/');
  await expect(page.locator('#estado-texto')).toHaveText('En vivo');
  await page.getByRole('button', { name: 'Activar avisos' }).click();
  await expect(page.locator('.avisos')).toContainText('Avisos activados');
  await expect.poll(() => sse.conexiones.at(-1)?.query.get('avisoMin')).toBe('4.5');
  await expect.poll(() => sse.clientes).toBe(1);
  await expect(page.locator('#estado-texto')).toHaveText('En vivo');
}

test.describe('permiso y estados del bloque «Avisos» (HU-10)', () => {
  test('no se pide permiso al cargar; al conceder: «Avisos activados» con el umbral', async ({
    page,
    sse,
  }) => {
    await espiarNotificaciones(page, { permiso: 'default', respuesta: 'granted' });
    await simular(page);
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    const bloque = page.locator('.avisos');
    await expect(bloque).toContainText(
      'Te avisaremos de los sismos nuevos de magnitud 4.5 o más en los países marcados, aunque esta pestaña esté en segundo plano. Déjala abierta.',
    );
    expect(await page.evaluate(() => /** @type {any} */ (window).__peticionesPermiso)).toBe(0);

    await page.getByRole('button', { name: 'Activar avisos' }).click();
    expect(await page.evaluate(() => /** @type {any} */ (window).__peticionesPermiso)).toBe(1);
    await expect(bloque).toContainText('Avisos activados');
    await expect(bloque).toContainText(
      'Solo sismos nuevos en los países marcados. Funciona mientras esta pestaña esté abierta.',
    );
    const umbral = page.getByLabel('Avisar desde');
    await expect(umbral).toHaveValue('4.5');
    // El foco pasa al control equivalente (wireframes §9.1).
    await expect(umbral).toBeFocused();
    await expect(page.locator('#anuncios')).toHaveText(
      'Avisos activados para sismos de magnitud 4.5 o más.',
    );
    await expect(page.getByRole('button', { name: 'Probar aviso' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Desactivar avisos' })).toBeVisible();
    // El stream se reabre con `avisoMin` y sigue desde el último id.
    await expect.poll(() => sse.conexiones.at(-1)?.query.get('avisoMin')).toBe('4.5');

    // Cambiar el umbral: se guarda, se anuncia y se aplica al stream.
    await umbral.selectOption('5.0');
    await expect(page.locator('#anuncios')).toHaveText('Umbral de avisos: 5.0 o más.');
    await expect.poll(() => sse.conexiones.at(-1)?.query.get('avisoMin')).toBe('5.0');
    expect(await page.evaluate(() => localStorage.getItem('avisos'))).toBe(
      '{"activos":true,"umbral":"5.0"}',
    );

    // Desactivar: no se toca el permiso; el stream deja de pedir `avisoMin`.
    await page.getByRole('button', { name: 'Desactivar avisos' }).click();
    await expect(bloque).toContainText('Avisos desactivados');
    await expect(bloque).toContainText('No recibirás avisos hasta que los actives.');
    await expect(page.locator('#anuncios')).toHaveText('Avisos desactivados.');
    await expect(page.getByRole('button', { name: 'Activar avisos' })).toBeFocused();
    await expect.poll(() => sse.conexiones.at(-1)?.query.has('avisoMin')).toBe(false);

    // Tras recargar la página se conserva el umbral (el permiso simulado vuelve a «sin decidir»).
    await page.reload();
    await expect(bloque).toContainText('de magnitud 5.0 o más en los países marcados');
  });

  test('denegar: «Avisos bloqueados en el navegador» con instrucciones; el resto funciona', async ({
    page,
  }) => {
    await espiarNotificaciones(page, { permiso: 'default', respuesta: 'denied' });
    await simular(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Activar avisos' }).click();
    const bloque = page.locator('.avisos');
    await expect(bloque).toContainText('Avisos bloqueados en el navegador');
    await expect(bloque).toContainText(
      'Para recibirlos, pulsa el icono que hay a la izquierda de la dirección (candado o ajustes), busca «Notificaciones», elige «Permitir» y pulsa «Comprobar de nuevo». El resto de la aplicación funciona igual.',
    );
    await expect(page.locator('#anuncios')).toHaveText('Avisos bloqueados en el navegador.');
    const comprobar = page.getByRole('button', { name: 'Comprobar de nuevo' });
    await expect(comprobar).toBeFocused();
    await expect(filas(page)).toHaveCount(5);

    // El usuario lo permite en el navegador y pulsa «Comprobar de nuevo».
    await page.evaluate(() => /** @type {any} */ (window).__cambiarPermiso('granted'));
    await comprobar.click();
    await expect(bloque).toContainText('Avisos activados');
  });

  test('cerrar el diálogo sin responder: «No has respondido al permiso…»', async ({ page }) => {
    await espiarNotificaciones(page, { permiso: 'default', respuesta: 'default' });
    await simular(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Activar avisos' }).click();
    await expect(page.locator('.avisos')).toContainText(
      'No has respondido al permiso. Pulsa «Activar avisos» para volver a intentarlo.',
    );
    await expect(page.getByRole('button', { name: 'Activar avisos' })).toBeFocused();
  });

  test('navegador sin avisos: «Avisos no disponibles»', async ({ page }) => {
    await espiarNotificaciones(page, { soportado: false });
    await simular(page);
    await page.goto('/');
    const bloque = page.locator('.avisos');
    await expect(bloque).toContainText('Avisos no disponibles');
    await expect(bloque).toContainText(
      'Este navegador no permite avisos. Prueba con Chrome o Firefox de escritorio actualizados. El resto de la aplicación funciona igual.',
    );
    await expect(bloque.getByRole('button')).toHaveCount(0);
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
  });

  test('preferencia de avisos corrupta: valores por defecto, sin errores (AM-27)', async ({
    page,
  }) => {
    await espiarNotificaciones(page, { permiso: 'granted' });
    await page.addInitScript(() => localStorage.setItem('avisos', '{"activos":true,"umbral":"9"}'));
    await simular(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Activar avisos' })).toBeVisible();
    await page.getByRole('button', { name: 'Activar avisos' }).click();
    await expect(page.getByLabel('Avisar desde')).toHaveValue('4.5');
  });
});

test.describe('notificaciones con el permiso concedido (HU-11)', () => {
  test.use({ permissions: ['notifications'] });

  test('texto exacto, ventana sin mover el foco y clic que abre el sismo', async ({
    page,
    sse,
  }) => {
    await conAvisosActivados(page, sse);
    const foco = page.getByLabel('Avisar desde');
    await expect(foco).toBeFocused();

    sse.enviar('sismo.nuevo', datos({ unid: 'uraba52', magnitud: 5.2 }));
    await expect.poll(async () => (await avisos(page)).length).toBe(1);
    const [aviso] = await avisos(page);
    expect(aviso.title).toBe('M 5.2 · Golfo de Urabá · 07:29 (hora de Colombia)');
    expect(aviso.body).toBe(
      'Colombia · 12 km de profundidad. Pulsa para verlo en el mapa.\nFuente: EMSC · autor: IGC. Solo informativo.',
    );
    expect(aviso.tag).toBe('emsc:uraba52');
    expect(aviso.lang).toBe('es');
    expect(aviso.icon).toMatch(/\/favicon\.svg$/);

    // Con la pestaña a la vista: se abre su ventana sin mover el foco y se anuncia (§8.4).
    await expect(page.locator('.leaflet-popup h2')).toContainText('M 5.2 · Golfo de Urabá');
    await expect(foco).toBeFocused();
    await expect(page.locator('#anuncios')).toHaveText(
      'Nuevo sismo: magnitud 5.2, Golfo de Urabá, Colombia.',
    );

    // Clic en la notificación: ventana del sismo con el foco en su título.
    await page.locator('.leaflet-popup-close-button').click();
    await page.evaluate(() =>
      /** @type {any} */ (window).__avisos[0].dispatchEvent(
        new Event('click', { cancelable: true }),
      ),
    );
    await expect(page.locator('.leaflet-popup h2')).toBeFocused();
    await expect(page.locator('.leaflet-popup h2')).toContainText('M 5.2 · Golfo de Urabá');
  });

  test('límite del umbral (4.5 se avisa, 4.44 no, 4.46 sí), país desmarcado y alta tardía', async ({
    page,
    sse,
  }) => {
    await conAvisosActivados(page, sse);
    sse.enviar('sismo.nuevo', datos({ unid: 'exacto', magnitud: 4.5 }));
    sse.enviar('sismo.nuevo', datos({ unid: 'debajo', magnitud: 4.44 }));
    sse.enviar('sismo.nuevo', datos({ unid: 'redondeo', magnitud: 4.46 }));
    // País no marcado (Panamá se desmarca abajo) y alta tardía de hace 3 h (`notificable: false`).
    sse.enviar('sismo.nuevo', datos({ unid: 'tardio', magnitud: 5.0 }, { notificable: false }));
    await expect
      .poll(async () => (await avisos(page)).map((a) => a.tag))
      .toEqual(['emsc:exacto', 'emsc:redondeo']);
    expect((await avisos(page))[1].title).toMatch(/^M 4\.5 · /);

    await page.getByRole('checkbox', { name: 'Panamá' }).uncheck();
    await expect.poll(() => sse.conexiones.at(-1)?.query.get('paises')).toBe('ES,CO');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    sse.enviar(
      'sismo.nuevo',
      datos({
        unid: 'panama',
        magnitud: 5.0,
        pais: 'PA',
        zona: 'PA',
        zonaHoraria: 'America/Panama',
        lugar: 'PANAMA',
      }),
    );
    // La recarga por el cambio de países trae la lista del servidor; llega uno de control.
    sse.enviar('sismo.nuevo', datos({ unid: 'control', magnitud: 4.0 }));
    await expect(filas(page).filter({ hasText: 'Golfo de Urabá' })).toHaveCount(1);
    expect(await avisos(page)).toHaveLength(2);
  });

  test('por debajo del filtro de la lista sí se avisa; sin duplicados por revisión o fusión', async ({
    page,
    sse,
  }) => {
    await conAvisosActivados(page, sse);
    await page.locator('#magnitud').selectOption('5.0');
    await expect.poll(() => sse.conexiones.at(-1)?.query.get('magMin')).toBe('5.0');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');

    sse.enviar('sismo.nuevo', datos({ unid: 'bajo', magnitud: 4.7 }));
    await expect.poll(async () => (await avisos(page)).length).toBe(1);
    await expect(page.locator('#lista-sismos')).not.toContainText('Golfo de Urabá');

    // Revisión y fusión con otro id: no se vuelve a avisar.
    sse.enviar(
      'sismo.actualizado',
      datos({ unid: 'bajo', magnitud: 4.9, revision: 2 }, { cambios: ['magnitud'] }),
    );
    sse.enviar('sismo.eliminado', {
      id: 'emsc:bajo',
      motivo: 'fusionado',
      reemplazadoPor: 'emsc:fusion',
    });
    sse.enviar('sismo.nuevo', datos({ unid: 'fusion', magnitud: 4.8 }));
    // Revisión que cruza el umbral: 4.3 → 4.8 se avisa una vez, con la magnitud anterior.
    sse.enviar('sismo.nuevo', datos({ unid: 'cruza', magnitud: 4.3 }));
    sse.enviar(
      'sismo.actualizado',
      datos({ unid: 'cruza', magnitud: 4.8, revision: 2 }, { cambios: ['magnitud'] }),
    );
    await expect.poll(async () => (await avisos(page)).length).toBe(2);
    expect((await avisos(page))[1].body).toBe(
      'Colombia · 12 km de profundidad · magnitud revisada (antes 4.3). Pulsa para verlo en el mapa.\nFuente: EMSC · autor: IGC. Solo informativo.',
    );

    // Clic en el aviso de un sismo que no está en la lista: se abre su ventana igualmente.
    await page.evaluate(() =>
      /** @type {any} */ (window).__avisos[0].dispatchEvent(
        new Event('click', { cancelable: true }),
      ),
    );
    await expect(page.locator('.leaflet-popup h2')).toBeFocused();
    await expect(page.locator('.leaflet-popup h2')).toContainText('M 4.7 · Golfo de Urabá');
  });

  test('agrupación: más de 3 avisos en 60 s → 3 avisos y 1 resumen (AM-22)', async ({
    page,
    sse,
  }) => {
    await conAvisosActivados(page, sse);
    const magnitudes = [4.6, 4.7, 4.8, 5.6, 4.9, 4.5];
    magnitudes.forEach((m, i) => sse.enviar('sismo.nuevo', datos({ unid: `r${i}`, magnitud: m })));
    await expect(filas(page).filter({ hasText: 'Golfo de Urabá' })).toHaveCount(6);
    expect((await avisos(page)).map((a) => a.tag)).toEqual(['emsc:r0', 'emsc:r1', 'emsc:r2']);

    await page.clock.fastForward(61_000);
    await expect.poll(async () => (await avisos(page)).length).toBe(4);
    const resumen = (await avisos(page))[3];
    expect(resumen.title).toBe('3 sismos de magnitud 4.5 o más');
    expect(resumen.body).toBe(
      'El mayor: M 5.6 · Golfo de Urabá. Pulsa para verlos en la lista.\nSolo informativo.',
    );

    // Pulsar el resumen lleva el foco a la lista.
    await page.evaluate(() =>
      /** @type {any} */ (window).__avisos[3].dispatchEvent(
        new Event('click', { cancelable: true }),
      ),
    );
    await expect(page.locator('#lista-sismos button.item:focus')).toHaveCount(1);
  });

  test('«Probar aviso» envía la notificación de prueba', async ({ page, sse }) => {
    await conAvisosActivados(page, sse);
    await page.getByRole('button', { name: 'Probar aviso' }).click();
    await expect.poll(async () => (await avisos(page)).length).toBe(1);
    const [prueba] = await avisos(page);
    expect(prueba.title).toBe('Aviso de prueba');
    expect(prueba.body).toBe('Así verás los avisos de sismos de magnitud 4.5 o más.');
  });

  test('la carga inicial y los avisos desactivados no notifican', async ({ page, sse }) => {
    await espiarNotificaciones(page);
    await simular(page, {
      sismos: [
        colombiano({ unid: 'grande', magnitud: 6.3, tiempo: new Date(AHORA - MIN).toISOString() }),
      ],
    });
    await page.addInitScript(() =>
      localStorage.setItem('avisos', '{"activos":true,"umbral":"4.5"}'),
    );
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    await expect(page.locator('.avisos')).toContainText('Avisos activados');
    // Una revisión de un sismo de la carga que ya superaba el umbral tampoco avisa.
    sse.enviar(
      'sismo.actualizado',
      datos({ unid: 'grande', magnitud: 6.4, revision: 2 }, { cambios: ['magnitud'] }),
    );
    await expect(page.locator('#lista-sismos')).toContainText('Magnitud 6.4');
    expect(await avisos(page)).toHaveLength(0);

    await page.getByRole('button', { name: 'Desactivar avisos' }).click();
    await expect.poll(() => sse.conexiones.at(-1)?.query.has('avisoMin')).toBe(false);
    sse.enviar('sismo.nuevo', datos({ unid: 'otro', magnitud: 5.5 }));
    await expect(filas(page)).toHaveCount(2);
    expect(await avisos(page)).toHaveLength(0);
  });
});
