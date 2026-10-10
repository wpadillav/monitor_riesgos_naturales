// Normalizadores de EMSC y USGS contra los fixtures reales de T1.2 (ADR-0004, AM-05).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  normalizarFeatureEmsc,
  normalizarRespuestaEmsc,
} from '../../../../src/server/fuentes/normalizar-emsc.js';
import {
  normalizarFeatureUsgs,
  normalizarRespuestaUsgs,
  separarIds,
} from '../../../../src/server/fuentes/normalizar-usgs.js';
import { MAX_FEATURES } from '../../../../src/server/fuentes/normalizar-comun.js';

const fixture = (ruta) =>
  JSON.parse(readFileSync(new URL(`../../../fixtures/${ruta}`, import.meta.url), 'utf8'));

const AHORA = Date.parse('2026-10-10T08:00:00.000Z');

/** Feature EMSC mínima válida, para variar un campo cada vez. */
function emsc(props = {}, coords = [2.26, 38.45, -20.9]) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: {
      unid: '20261010_0000120',
      time: '2026-10-10T06:52:38.51Z',
      lastupdate: '2026-10-10T07:12:21.832403Z',
      lat: 38.4468,
      lon: 2.2609,
      depth: 20.9,
      evtype: 'ke',
      auth: 'IGN',
      mag: 2.4,
      magtype: 'ml',
      flynn_region: 'BALEARIC ISLANDS, SPAIN',
      ...props,
    },
  };
}

function usgs(props = {}, coords = [-81.4687, 7.7176, 10], id = 'us6000u19w') {
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: coords },
    properties: {
      mag: 6.6,
      place: '14 km W of Río Grande, Panama',
      time: 1791577539080,
      updated: 1791599377126,
      net: 'us',
      ids: ',pt26282001,us6000u19w,',
      magType: 'mww',
      type: 'earthquake',
      ...props,
    },
  };
}

describe('normalizarRespuestaEmsc con fixtures reales', () => {
  it('España: 3 eventos (IGN, EMSC, ReNaSS) sin descartes', () => {
    const r = normalizarRespuestaEmsc(fixture('emsc/fdsn-query-espana.json'), AHORA);

    expect(r.descartes).toEqual({});
    expect(r.retirados).toEqual([]);
    expect(r.registros.map((x) => x.autor)).toEqual(['IGN', 'EMSC', 'ReNaSS']);
    expect(r.registros[0]).toEqual({
      fuente: 'emsc',
      idFuente: '20261010_0000120',
      ids: ['20261010_0000120'],
      tiempo: Date.parse('2026-10-10T06:52:38.510Z'),
      actualizadoEn: Date.parse('2026-10-10T07:12:21.832Z'),
      lat: 38.4468,
      lon: 2.2609,
      profundidadKm: 20.9,
      magnitud: 2.4,
      magnitudTipo: 'ml',
      autor: 'IGN',
      lugar: 'BALEARIC ISLANDS, SPAIN',
      url: 'https://www.seismicportal.eu/eventdetails.html?unid=20261010_0000120',
    });
  });

  it('Panamá y Colombia: 4 eventos (IGC, NEIC, UNA, QUI) sin descartes y con profundidad positiva', () => {
    const r = normalizarRespuestaEmsc(fixture('emsc/fdsn-query-panama-colombia.json'), AHORA);

    expect(r.descartes).toEqual({});
    expect(r.registros).toHaveLength(4);
    expect(r.registros.map((x) => x.autor).sort()).toEqual(['IGC', 'NEIC', 'QUI', 'UNA']);
    for (const reg of r.registros) {
      expect(reg.profundidadKm).toBeGreaterThanOrEqual(0);
      expect(reg.url).toMatch(/^https:\/\/www\.seismicportal\.eu\/eventdetails\.html\?unid=/);
    }
  });

  it('204 (null) es una respuesta vacía', () => {
    expect(normalizarRespuestaEmsc(null, AHORA)).toEqual({
      registros: [],
      retirados: [],
      descartes: {},
    });
  });

  it.each([[[]], ['x'], [{ features: 'x' }], [{}], [42]])(
    'lo que no es una FeatureCollection (%j) lanza FORMATO (AM-03)',
    (datos) => {
      expect(() => normalizarRespuestaEmsc(datos, AHORA)).toThrow(
        expect.objectContaining({ codigo: 'FORMATO' }),
      );
    },
  );
});

describe('normalizarFeatureEmsc', () => {
  it('toma la profundidad de -coordinates[2] si falta depth (PRD E1)', () => {
    const f = emsc({ depth: undefined }, [2.26, 38.45, -10]);
    delete f.properties.depth;
    const r = normalizarFeatureEmsc(f, AHORA);
    expect(r.ok && r.registro.profundidadKm).toBe(10);
  });

  it('acepta evtype "se" (sismo sospechado)', () => {
    expect(normalizarFeatureEmsc(emsc({ evtype: 'se' }), AHORA).ok).toBe(true);
  });

  it.each(['qb', 'ex', 'uk', undefined, null, 7])(
    'descarta evtype %j como tipo y devuelve el unid para retirarlo',
    (evtype) => {
      expect(normalizarFeatureEmsc(emsc({ evtype }), AHORA)).toEqual({
        ok: false,
        motivo: 'tipo',
        retirado: '20261010_0000120',
      });
    },
  );

  it('no devuelve un id para retirar si el unid no es válido', () => {
    const r = normalizarFeatureEmsc(emsc({ evtype: 'qb', unid: '../../x' }), AHORA);
    expect(r).toMatchObject({ ok: false, motivo: 'tipo', retirado: null });
  });

  it.each([
    [{ mag: null }, 'sin-magnitud'],
    [{ mag: 'grande' }, 'magnitud'],
    [{ mag: 11 }, 'magnitud'],
    [{ lat: 999 }, 'lat'],
    [{ lon: 'x' }, 'lon'],
    [{ time: '2026-10-10T09:00:00Z' }, 'tiempo-futuro'],
    [{ time: 'ayer' }, 'tiempo'],
    [{ unid: 'a'.repeat(65) }, 'id'],
    [{ depth: 900 }, 'profundidad'],
    [{ auth: '' }, 'autor'],
  ])('descarta %j (%s)', (props, motivo) => {
    expect(normalizarFeatureEmsc(emsc(props), AHORA)).toMatchObject({ ok: false, motivo });
  });

  it('normaliza la longitud ±360 de EMSC a [−180, 180]', () => {
    const r = normalizarFeatureEmsc(emsc({ lon: 278.944, lat: 7.81 }), AHORA);
    expect(r.ok && r.registro.lon).toBeCloseTo(-81.056, 6);
  });

  it('sanea el lugar y no copia propiedades extra ni contamina el prototipo (AM-05)', () => {
    const f = JSON.parse(
      '{"type":"Feature","geometry":{"coordinates":[2,38,-5]},"properties":{"__proto__":{"polluted":1},' +
        '"unid":"20261010_0000001","time":"2026-10-10T06:00:00Z","lastupdate":"2026-10-10T06:01:00Z",' +
        '"lat":38,"lon":2,"depth":5,"evtype":"ke","auth":"IGN","mag":2,"magtype":"ml",' +
        '"flynn_region":"SPAIN\\u202e\\u001b[2J<img src=x onerror=alert(1)>","extra":"x"}}',
    );
    const r = normalizarFeatureEmsc(f, AHORA);
    expect(r.ok).toBe(true);
    expect(r.ok && r.registro.lugar).toBe('SPAIN[2J<img src=x onerror=alert(1)>');
    expect(r.ok && Object.keys(r.registro)).not.toContain('extra');
    expect({}.polluted).toBeUndefined();
  });

  it('una feature que no es un objeto se descarta como entrada', () => {
    expect(normalizarFeatureEmsc(null, AHORA)).toMatchObject({ ok: false, motivo: 'entrada' });
    expect(normalizarFeatureEmsc([1, 2], AHORA)).toMatchObject({ ok: false, motivo: 'entrada' });
  });
});

describe('normalizarRespuestaUsgs con fixtures reales', () => {
  it('Panamá: M7.7, M6.6 y otro, con autor US, ids alternativos y profundidad positiva', () => {
    const r = normalizarRespuestaUsgs(fixture('usgs/fdsn-query-panama.geojson'), AHORA);

    expect(r.descartes).toEqual({});
    expect(r.registros).toHaveLength(3);
    const m66 = r.registros.find((x) => x.idFuente === 'us6000u19w');
    expect(m66).toEqual({
      fuente: 'usgs',
      idFuente: 'us6000u19w',
      ids: ['us6000u19w', 'pt26282001', 'attmnq2s', 'usauto6000u19w'],
      tiempo: 1791577539080,
      actualizadoEn: 1791599377126,
      lat: 7.7176,
      lon: -81.4687,
      profundidadKm: 10,
      magnitud: 6.6,
      magnitudTipo: 'mww',
      autor: 'US',
      lugar: '14 km W of Río Grande, Panama',
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000u19w',
    });
  });

  it('España 30 días: 1 evento', () => {
    const r = normalizarRespuestaUsgs(fixture('usgs/fdsn-query-espana-30d.geojson'), AHORA);
    expect(r.descartes).toEqual({});
    expect(r.registros).toHaveLength(1);
  });

  it('summary 4.5_day: el mismo formato se normaliza sin descartes', () => {
    const r = normalizarRespuestaUsgs(fixture('usgs/summary-4.5_day.geojson'), AHORA);
    expect(r.descartes).toEqual({});
    expect(r.registros).toHaveLength(3);
  });
});

describe('normalizarFeatureUsgs', () => {
  it.each(['quarry blast', 'explosion', 'ice quake', undefined])(
    'type %j no es un sismo: se descarta y se devuelve el id para retirarlo',
    (type) => {
      expect(normalizarFeatureUsgs(usgs({ type }), AHORA)).toEqual({
        ok: false,
        motivo: 'tipo',
        retirado: 'us6000u19w',
      });
    },
  );

  it.each([
    [{ mag: null }, 'sin-magnitud'],
    [{ time: 'x' }, 'tiempo'],
    [{ net: 42 }, 'autor'],
  ])('descarta %j (%s)', (props, motivo) => {
    expect(normalizarFeatureUsgs(usgs(props), AHORA)).toMatchObject({ ok: false, motivo });
  });

  it('descarta coordenadas fuera de rango o ausentes', () => {
    expect(normalizarFeatureUsgs(usgs({}, [-81, 95, 10]), AHORA)).toMatchObject({
      ok: false,
      motivo: 'lat',
    });
    expect(normalizarFeatureUsgs(usgs({}, 'x'), AHORA)).toMatchObject({ ok: false });
  });

  it('profundidad null si falta coordinates[2]', () => {
    const r = normalizarFeatureUsgs(usgs({}, [-81.4, 7.7]), AHORA);
    expect(r.ok && r.registro.profundidadKm).toBeNull();
  });

  it('separarIds ignora vacíos y entradas que no son texto', () => {
    expect(separarIds(',pt1,us2,,')).toEqual(['pt1', 'us2']);
    expect(separarIds(['us1'])).toEqual([]);
    expect(separarIds(null)).toEqual([]);
  });
});

describe('límite de features por respuesta (AM-04 c)', () => {
  it('con 25 000 features procesa como máximo 20 000 y cuenta el resto', () => {
    const features = Array.from({ length: 25_000 }, (_, i) =>
      emsc({ unid: `20261010_${String(i).padStart(7, '0')}` }),
    );
    const r = normalizarRespuestaEmsc({ type: 'FeatureCollection', features }, AHORA);

    expect(MAX_FEATURES).toBe(20_000);
    expect(r.registros).toHaveLength(20_000);
    expect(r.descartes).toEqual({ limite: 5_000 });
  });
});
