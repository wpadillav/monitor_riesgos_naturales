// La página filtra, pinta y avisa con las mismas reglas que el servidor (`src/shared/reglas.js`;
// R-01 y R-02 de la revisión T5.2). Las notificaciones son simuladas (`espiarNotificaciones` con
// permiso concedido), así que corren en Chromium y en Firefox.

import {
  AHORA,
  ESCRITORIO_ALTO,
  avisos,
  espiarNotificaciones,
  expect,
  filas,
  simular,
  sismo,
  test,
} from './apoyo.js';

const MIN = 60_000;

test.use({ viewport: ESCRITORIO_ALTO });

/**
 * Sismo de la franja CO-PA: en 9.5, −77.1 el país asignado es Panamá, pero cuenta también para
 * Colombia (`paisesCandidatos: [CO, PA]`, HU-03, ADR-0005).
 * @param {Record<string, unknown>} campos
 */
const deLaFranja = (campos) =>
  sismo({
    lat: 9.5,
    lon: -77.1,
    lugar: 'PANAMA-COLOMBIA BORDER REGION',
    pais: 'PA',
    paisesCandidatos: ['CO', 'PA'],
    zona: 'PA',
    zonaHoraria: 'America/Panama',
    autor: 'IGC',
    ...campos,
  });

/**
 * Preferencias guardadas antes de cargar: filtros y avisos activados con umbral 4.5.
 * @param {import('@playwright/test').Page} page
 * @param {{ paises: string[], magMin: string, periodo: string }} filtros
 */
async function preferencias(page, filtros) {
  await page.addInitScript((f) => {
    localStorage.setItem('filtros', JSON.stringify(f));
    localStorage.setItem('avisos', '{"activos":true,"umbral":"4.5"}');
  }, filtros);
}

/**
 * Espera a que la página esté «En vivo» con los avisos activados y una sola conexión al stream.
 * @param {import('@playwright/test').Page} page
 * @param {import('./sse-simulado.js').SseSimulado} sse
 */
async function enVivoConAvisos(page, sse) {
  await expect(page.locator('#estado-texto')).toHaveText('En vivo');
  await expect(page.locator('.avisos')).toContainText('Avisos activados');
  await expect.poll(() => sse.conexiones.at(-1)?.query.get('avisoMin')).toBe('4.5');
  await expect.poll(() => sse.clientes).toBe(1);
}

test('R-01: con solo Colombia, un sismo en 9.5, −77.1 (PA, candidatos [CO, PA]) se carga, sigue tras una revisión, llega en vivo y avisa', async ({
  page,
  sse,
}) => {
  await espiarNotificaciones(page, { permiso: 'granted' });
  await preferencias(page, { paises: ['CO'], magMin: '2.0', periodo: '24h' });
  const cargado = deLaFranja({ unid: 'franja', magnitud: 3.0 });
  const { peticiones } = await simular(page, {
    sismos: [cargado, sismo({ unid: 'madrid', lugar: 'MADRID, SPAIN', magnitud: 3.5 })],
  });
  await page.goto('/');
  await enVivoConAvisos(page, sse);
  expect(peticiones.at(-1)?.get('paises')).toBe('CO');
  expect(sse.conexiones.at(-1)?.query.get('paises')).toBe('CO');

  // 1. Aparece en la carga.
  await expect(filas(page)).toHaveCount(1);
  const fila = filas(page).first();
  await expect(fila).toContainText('Panama-Colombia Border Region');
  await expect(fila).toContainText('Magnitud 3.0');

  // 2. Sigue en la lista tras un `sismo.actualizado` (antes se borraba).
  sse.enviar('sismo.actualizado', {
    sismo: { ...cargado, magnitud: 3.3, revision: 2 },
    notificable: true,
    cambios: ['magnitud'],
  });
  await expect(fila).toContainText('Magnitud 3.3');
  await expect(fila).toContainText('Revisado');
  await expect(filas(page)).toHaveCount(1);

  // 3. Otro de la franja llega en vivo: se pinta y, como supera el umbral, se avisa.
  sse.enviar('sismo.nuevo', {
    sismo: deLaFranja({
      unid: 'franja-vivo',
      tiempo: new Date(AHORA - MIN).toISOString(),
      magnitud: 4.8,
    }),
    notificable: true,
    cambios: [],
  });
  await expect(filas(page)).toHaveCount(2);
  await expect(filas(page).first()).toContainText('Magnitud 4.8');
  await expect(filas(page).first()).toContainText('Nuevo');
  await expect
    .poll(async () => (await avisos(page)).map((a) => a.tag))
    .toEqual(['emsc:franja-vivo']);
  const [aviso] = await avisos(page);
  expect(aviso.title).toMatch(/^M 4\.8 · Panama-Colombia Border Region · /);
});

test('R-02: con magMin 5.0 y avisoMin 4.5, un M 4.96 avisa pero no entra en la lista, ni antes ni después de recargar', async ({
  page,
  sse,
}) => {
  await espiarNotificaciones(page, { permiso: 'granted' });
  await preferencias(page, { paises: ['ES', 'CO', 'PA'], magMin: '5.0', periodo: '24h' });
  const casiCinco = sismo({
    unid: 'casi-cinco',
    tiempo: new Date(AHORA - MIN).toISOString(),
    magnitud: 4.96,
    lugar: 'CASI CINCO',
  });
  const barrera = sismo({
    unid: 'barrera',
    tiempo: new Date(AHORA - MIN / 2).toISOString(),
    magnitud: 5.2,
    lugar: 'BARRERA',
  });
  // El servidor también tiene el M 4.96 en su catálogo: al recargar, decide con la magnitud cruda.
  const catalogo = [sismo({ unid: 'cinco', magnitud: 5.0, lugar: 'CINCO JUSTO' }), casiCinco];
  await simular(page, { sismos: catalogo });
  await page.goto('/');
  await enVivoConAvisos(page, sse);
  await expect(filas(page)).toHaveCount(1);
  await expect(filas(page).first()).toContainText('Cinco Justo');

  sse.enviar('sismo.nuevo', { sismo: casiCinco, notificable: true, cambios: [] });
  // El aviso usa la magnitud redondeada (D1): 4.96 → 5.0 ≥ 4.5.
  await expect
    .poll(async () => (await avisos(page)).map((a) => a.tag))
    .toEqual(['emsc:casi-cinco']);
  expect((await avisos(page))[0].title).toMatch(/^M 5\.0 · Casi Cinco · /);
  // La lista usa la magnitud cruda (R-02): 4.96 < 5.0. Un M 5.2 enviado después sirve de
  // barrera: los eventos se procesan en orden, así que cuando aparece, el M 4.96 ya se decidió.
  catalogo.push(barrera);
  sse.enviar('sismo.nuevo', { sismo: barrera, notificable: true, cambios: [] });
  await expect(filas(page)).toHaveCount(2);
  await expect(filas(page).first()).toContainText('Barrera');
  await expect(page.locator('#lista-sismos')).not.toContainText('Casi Cinco');

  // Tras recargar, la lista es la misma: no aparece ni desaparece nada.
  await page.reload();
  await expect(page.locator('#estado-texto')).toHaveText('En vivo');
  await expect(filas(page)).toHaveCount(2);
  await expect(filas(page).nth(0)).toContainText('Barrera');
  await expect(filas(page).nth(1)).toContainText('Cinco Justo');
  await expect(page.locator('#lista-sismos')).not.toContainText('Casi Cinco');
});
