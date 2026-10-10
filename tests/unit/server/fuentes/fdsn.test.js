// Adaptadores FDSN: URL exacta con URLSearchParams y valores tipados (AM-06, AM-08), y
// consulta con `fetch` simulado contra fixtures reales.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createEmscFdsn, URL_EMSC_FDSN } from '../../../../src/server/fuentes/emsc-fdsn.js';
import { createFuenteFdsn, instanteFdsn } from '../../../../src/server/fuentes/fdsn.js';
import { createHttpClient } from '../../../../src/server/fuentes/http-cliente.js';
import { createUsgsFdsn, URL_USGS_FDSN } from '../../../../src/server/fuentes/usgs-fdsn.js';
import { ZONAS } from '../../../../src/shared/zonas.js';

const AHORA = Date.parse('2026-10-10T08:00:00.000Z');
const reloj = { ahora: () => AHORA };
const ES_PEN = ZONAS.find((z) => z.id === 'ES-PEN').rectangulo;

const leer = (ruta) => readFileSync(new URL(`../../../fixtures/${ruta}`, import.meta.url), 'utf8');

function http(cuerpo, status = 200) {
  const fetch = vi.fn(
    async () =>
      new Response(status === 204 ? null : cuerpo, {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
  return { fetch, http: createHttpClient({ fetch, userAgent: 'TerremotosEnVivo/test' }) };
}

describe('URL de las fuentes', () => {
  it('las URL base son constantes https (AM-06)', () => {
    expect(URL_EMSC_FDSN).toBe('https://www.seismicportal.eu/fdsnws/event/1/query');
    expect(URL_USGS_FDSN).toBe('https://earthquake.usgs.gov/fdsnws/event/1/query');
  });

  it('EMSC: la URL para {ES-PEN, 3.0, 24 h, sin updatedafter} es exactamente la esperada (AM-08)', () => {
    const fuente = createEmscFdsn({ http: http('{}').http, reloj });
    const url = fuente.construirUrl({
      rectangulo: ES_PEN,
      magMin: 3.0,
      desde: AHORA - 86_400_000,
      actualizadoDesde: null,
    });
    expect(url).toBe(
      'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&starttime=2026-10-09T08%3A00%3A00' +
        '&minlat=34.9&maxlat=44.8&minlon=-10.7&maxlon=5.7&minmag=3&orderby=time&limit=20000',
    );
  });

  it('USGS: nombres largos, updatedafter y sin minmagnitude cuando es «todas»', () => {
    const fuente = createUsgsFdsn({ http: http('{}').http, reloj });
    const url = new URL(
      fuente.construirUrl({
        rectangulo: ES_PEN,
        magMin: null,
        desde: AHORA - 30 * 86_400_000,
        actualizadoDesde: Date.parse('2026-10-10T07:58:00.123Z'),
      }),
    );
    expect(url.origin + url.pathname).toBe(URL_USGS_FDSN);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'geojson',
      starttime: '2026-09-10T08:00:00',
      minlatitude: '34.9',
      maxlatitude: '44.8',
      minlongitude: '-10.7',
      maxlongitude: '5.7',
      updatedafter: '2026-10-10T07:58:00',
      orderby: 'time',
      limit: '20000',
    });
  });

  it('rechaza valores no numéricos en vez de concatenarlos', () => {
    const fuente = createEmscFdsn({ http: http('{}').http, reloj });
    expect(() =>
      fuente.construirUrl({
        rectangulo: { ...ES_PEN, minLat: '1&format=xml' },
        magMin: 2,
        desde: AHORA,
        actualizadoDesde: null,
      }),
    ).toThrow(TypeError);
  });

  it('no admite una URL base que no sea https', () => {
    expect(() =>
      createFuenteFdsn(
        { canal: 'usgs', fuente: 'usgs', urlBase: 'http://x.test/q', formato: 'geojson' },
        { http: http('{}').http, reloj },
      ),
    ).toThrow(/https/);
  });

  it('instanteFdsn da segundos UTC sin zona', () => {
    expect(instanteFdsn(Date.parse('2026-10-10T07:05:09.999Z'))).toBe('2026-10-10T07:05:09');
  });
});

describe('consultar()', () => {
  it('EMSC: devuelve registros normalizados y la hora de recepción', async () => {
    const { http: cliente, fetch } = http(leer('emsc/fdsn-query-espana.json'));
    const fuente = createEmscFdsn({ http: cliente, reloj });
    const params = { rectangulo: ES_PEN, magMin: 2, desde: AHORA - 1000, actualizadoDesde: null };

    const r = await fuente.consultar(params);

    expect(fetch).toHaveBeenCalledWith(fuente.construirUrl(params), expect.any(Object));
    expect(r.recibidoEn).toBe(AHORA);
    expect(r.registros).toHaveLength(3);
    expect(fuente.canal).toBe('emsc-fdsn');
    expect(fuente.fuente).toBe('emsc');
  });

  it('EMSC: 204 sin datos es una consulta correcta y vacía', async () => {
    const fuente = createEmscFdsn({ http: http('', 204).http, reloj });
    const r = await fuente.consultar({
      rectangulo: ES_PEN,
      magMin: 2,
      desde: AHORA,
      actualizadoDesde: AHORA,
    });
    expect(r.registros).toEqual([]);
  });

  it('USGS: normaliza el fixture de Panamá', async () => {
    const fuente = createUsgsFdsn({ http: http(leer('usgs/fdsn-query-panama.geojson')).http, reloj });
    const r = await fuente.consultar({
      rectangulo: ZONAS.find((z) => z.id === 'PA').rectangulo,
      magMin: 2,
      desde: AHORA,
      actualizadoDesde: null,
    });
    expect(r.registros.map((x) => x.idFuente)).toContain('us6000u18k');
    expect(fuente.canal).toBe('usgs');
  });

  it('un JSON con forma inesperada lanza FORMATO', async () => {
    const fuente = createUsgsFdsn({ http: http('{"features":"x"}').http, reloj });
    await expect(
      fuente.consultar({ rectangulo: ES_PEN, magMin: 2, desde: AHORA, actualizadoDesde: null }),
    ).rejects.toMatchObject({ codigo: 'FORMATO' });
  });
});
