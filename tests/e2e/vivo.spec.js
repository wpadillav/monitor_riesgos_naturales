// Datos en vivo por SSE (T4.6b; PRD HU-01 y HU-02; wireframes §6). El stream lo sirve el
// servidor SSE simulado de cada prueba (`sse`, en apoyo.js).

import { AHORA, expect, filas, simular, sismo, test } from './apoyo.js';

const MIN = 60_000;

/** @param {Record<string, unknown>} campos */
const datosSismo = (campos, { notificable = true, cambios = [] } = {}) => ({
  sismo: sismo(campos),
  notificable,
  cambios,
});

test.describe('datos en vivo (HU-01, HU-02)', () => {
  test('abre el stream con los filtros y el ultimoEventoId de la carga, e indica «En vivo»', async ({
    page,
    sse,
  }) => {
    await simular(page);
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    await expect(page.locator('#estado-ind')).toHaveClass(/e-ok/);
    await expect(page.locator('#estado-complemento')).toHaveText(
      /^· 5 sismos · actualizado a las \d\d:\d\d:\d\d$/,
    );
    expect(sse.conexiones).toHaveLength(1);
    const q = sse.conexiones[0].query;
    expect(q.get('paises')).toBe('ES,CO,PA');
    expect(q.get('magMin')).toBe('2.0');
    expect(q.get('periodo')).toBe('24h');
    expect(q.get('ultimoId')).toBe('abc-1');
    // Sin avisos activados no se envía `avisoMin` (contrato).
    expect(q.has('avisoMin')).toBe(false);
  });

  test('alta, actualización y eliminación sin recargar la página', async ({ page, sse }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');

    sse.enviar(
      'sismo.nuevo',
      datosSismo({
        unid: 'granada',
        tiempo: new Date(AHORA - MIN).toISOString(),
        lat: 37.18,
        lon: -3.6,
        magnitud: 3.1,
        lugar: 'GRANADA, SPAIN',
      }),
    );
    await expect(filas(page)).toHaveCount(6);
    const primera = filas(page).first();
    await expect(primera).toContainText('Magnitud 3.1');
    await expect(primera).toContainText('Granada, Spain');
    await expect(primera).toContainText('Nuevo');
    await expect(page.locator('#h-sismos')).toHaveText('Sismos (6)');
    await expect(page.locator('#estado-complemento')).toContainText('6 sismos');
    await expect(page.locator('#anuncios')).toHaveText(
      'Nuevo sismo: magnitud 3.1, Granada, Spain, España.',
    );

    // Revisión de la magnitud: el mismo elemento, con «Revisado».
    sse.enviar(
      'sismo.actualizado',
      datosSismo(
        {
          unid: 'granada',
          tiempo: new Date(AHORA - MIN).toISOString(),
          lat: 37.18,
          lon: -3.6,
          magnitud: 3.8,
          lugar: 'GRANADA, SPAIN',
          revision: 2,
        },
        { cambios: ['magnitud'] },
      ),
    );
    await expect(primera).toContainText('Magnitud 3.8');
    await expect(primera).toContainText('Revisado');
    await expect(filas(page)).toHaveCount(6);

    // Un sismo que solo llega por el umbral de aviso (por debajo de la lista) no se pinta.
    sse.enviar('sismo.nuevo', datosSismo({ unid: 'flojo', magnitud: 1.2, lugar: 'FLOJO' }));
    // Eliminación.
    sse.enviar('sismo.eliminado', { id: 'emsc:granada', motivo: 'retirado', reemplazadoPor: null });
    await expect(filas(page)).toHaveCount(5);
    await expect(page.locator('#lista-sismos')).not.toContainText('Granada');
    await expect(page.locator('#lista-sismos')).not.toContainText('Flojo');

    // Todo por el stream: una sola consulta a /api/sismos.
    expect(peticiones).toHaveLength(1);
  });

  test('un evento mal formado se descarta sin errores', async ({ page, sse }) => {
    await simular(page);
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    sse.enviar('sismo.nuevo', { sismo: { id: 'x', lat: 999 }, notificable: true, cambios: [] });
    sse.enviar('sismo.nuevo', datosSismo({ unid: 'bien', lugar: 'BIEN' }));
    await expect(filas(page)).toHaveCount(6);
    await expect(page.locator('#lista-sismos')).toContainText('Bien');
  });

  test('flujo.reiniciar: recarga con /api/sismos y reabre el stream', async ({ page, sse }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    sse.enviar('flujo.reiniciar', { motivo: 'arranque-distinto' });
    await expect.poll(() => peticiones.length).toBe(2);
    await expect.poll(() => sse.conexiones.length).toBe(2);
    expect(sse.conexiones[1].query.get('ultimoId')).toBe('abc-1');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    await expect(filas(page)).toHaveCount(5);
  });

  test.describe('corte de la conexión', () => {
    // El navegador registra el corte de red simulado; es lo que se prueba.
    test.use({ erroresPermitidos: [/net::ERR_(INCOMPLETE_CHUNKED_ENCODING|EMPTY_RESPONSE)/] });

    test('corte: «Reconectando…», a los 10 s «Sin conexión…» y vuelta con Last-Event-ID', async ({
      page,
      sse,
    }) => {
      await simular(page);
      await page.goto('/');
      await expect(page.locator('#estado-texto')).toHaveText('En vivo');
      const id = sse.enviar('sismo.nuevo', datosSismo({ unid: 'antes', lugar: 'ANTES DEL CORTE' }));
      await expect(filas(page)).toHaveCount(6);

      sse.rechazar(true);
      sse.cortar();
      await expect(page.locator('#estado-texto')).toHaveText('Reconectando…');
      await expect(page.locator('#estado-ind')).toHaveClass(/e-aviso/);
      await expect(page.locator('#estado-complemento')).toHaveText(/^· último dato a las /);
      await page.clock.fastForward(10_000);
      await expect(page.locator('#estado-texto')).toHaveText(
        'Sin conexión con el servidor local. Reintentando…',
      );
      await expect(page.locator('#estado-ind')).toHaveClass(/e-error/);
      // Se conservan los sismos (HU-02).
      await expect(filas(page)).toHaveCount(6);

      const antes = sse.conexiones.length;
      sse.rechazar(false);
      await expect(page.locator('#estado-texto')).toHaveText('En vivo', { timeout: 10_000 });
      const reconexion = sse.conexiones.at(-1);
      expect(sse.conexiones.length).toBeGreaterThan(antes);
      expect(reconexion?.lastEventId).toBe(id);

      // Lo que llega después del corte se aplica sin duplicar.
      sse.enviar('sismo.nuevo', datosSismo({ unid: 'despues', lugar: 'DESPUES DEL CORTE' }));
      await expect(filas(page)).toHaveCount(7);
    });
  });

  test('sin mensajes en 45 s, reabre con el último id sin cambiar el indicador', async ({
    page,
    sse,
  }) => {
    await simular(page);
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    const id = sse.enviar('sismo.nuevo', datosSismo({ unid: 'uno', lugar: 'UNO' }));
    await expect(filas(page)).toHaveCount(6);
    await page.clock.fastForward(46_000);
    await expect.poll(() => sse.conexiones.length).toBe(2);
    expect(sse.conexiones[1].query.get('ultimoId')).toBe(id);
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    await expect.poll(() => sse.clientes).toBe(1);
  });

  test('al cambiar los filtros, recarga y reabre el stream con los nuevos', async ({
    page,
    sse,
  }) => {
    const { peticiones } = await simular(page);
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    await page.getByRole('checkbox', { name: 'Panamá' }).uncheck();
    await expect.poll(() => peticiones.length).toBe(2);
    await expect.poll(() => sse.conexiones.length).toBe(2);
    expect(sse.conexiones[1].query.get('paises')).toBe('ES,CO');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    await expect.poll(() => sse.clientes).toBe(1);

    // Sin países no hay stream (el contrato exige `paises`).
    await page.getByRole('checkbox', { name: 'España' }).uncheck();
    await page.getByRole('checkbox', { name: 'Colombia' }).uncheck();
    await expect(page.locator('#estado-texto')).toHaveText('Sin consulta: no hay países marcados');
    await expect.poll(() => sse.clientes).toBe(0);
  });

  test('estado.fuente actualiza la línea de fuentes', async ({ page, sse }) => {
    await simular(page);
    await page.goto('/');
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
    await expect(page.locator('#linea-fuente')).toBeHidden();
    const cambiadoEn = new Date(AHORA).toISOString();
    sse.enviar('estado.fuente', { fuente: 'emsc-ws', estado: 'ok', cambiadoEn });
    sse.enviar('estado.fuente', { fuente: 'emsc-fdsn', estado: 'ok', cambiadoEn });
    sse.enviar('estado.fuente', { fuente: 'usgs', estado: 'caida', cambiadoEn });
    await expect(page.locator('#linea-fuente')).toHaveText('USGS no disponible');
    sse.enviar('estado.fuente', { fuente: 'usgs', estado: 'ok', cambiadoEn });
    await expect(page.locator('#linea-fuente')).toBeHidden();
    await expect(page.locator('#estado-texto')).toHaveText('En vivo');
  });
});
