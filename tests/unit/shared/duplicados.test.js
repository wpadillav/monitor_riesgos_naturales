import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UMBRALES_DEDUP } from '../../../src/shared/constantes.js';
import {
  cumpleUmbrales,
  diferencias,
  elegirCandidato,
  puntuacion,
  sePuedenFusionar,
  sonDuplicados,
  validarUmbrales,
} from '../../../src/shared/duplicados.js';
import { RADIO_TIERRA_KM } from '../../../src/shared/geo.js';
import { crearRegistro } from '../../../src/shared/modelo.js';

const FIXTURE = JSON.parse(
  readFileSync(new URL('../../fixtures/dedup/pares-usgs-emsc.json', import.meta.url), 'utf8'),
);
const AHORA = Date.parse('2026-10-11T00:00:00Z');

/** Pasa cada lado del par por el normalizador común, como hará el servidor. */
function registrosDelPar(par) {
  const usgs = crearRegistro(
    {
      fuente: 'usgs',
      idFuente: par.usgs.id,
      tiempo: par.usgs.tiempo,
      lat: par.usgs.lat,
      lon: par.usgs.lon,
      profundidadKm: par.usgs.profundidadKm,
      magnitud: par.usgs.magnitud,
      magnitudTipo: par.usgs.magnitudTipo,
      autor: 'US',
    },
    AHORA,
  );
  const emsc = crearRegistro(
    {
      fuente: 'emsc',
      idFuente: par.emsc.unid,
      tiempo: par.emsc.tiempo,
      lat: par.emsc.lat,
      lon: par.emsc.lon,
      profundidadKm: par.emsc.profundidadKm,
      magnitud: par.emsc.magnitud,
      magnitudTipo: par.emsc.magnitudTipo,
      autor: par.emsc.auth,
    },
    AHORA,
  );
  expect(usgs.ok && emsc.ok).toBe(true);
  return { usgs: usgs.registro, emsc: emsc.registro };
}

const PARES = FIXTURE.pares.map((par) => ({ par, ...registrosDelPar(par) }));

/** Punto desplazado `km` hacia el norte. */
const alNorte = (p, km) => ({ ...p, lat: p.lat + (km / RADIO_TIERRA_KM) * (180 / Math.PI) });

describe('calibración con los 54 pares reales USGS↔EMSC (ADR-0004)', () => {
  it('el fixture tiene los 54 pares', () => {
    expect(PARES).toHaveLength(54);
  });

  it.each(PARES.map(({ par, usgs, emsc }) => [par.usgs.id, par.emsc.unid, usgs, emsc]))(
    '%s y %s se fusionan',
    (_u, _e, usgs, emsc) => {
      expect(sonDuplicados(usgs, emsc)).toBe(true);
      expect(sonDuplicados(emsc, usgs)).toBe(true);
    },
  );

  it('las diferencias reproducen el resumen del fixture (Δt 9,16 s, Δd 35,3 km, ΔM 0,9)', () => {
    const d = PARES.map(({ usgs, emsc }) => diferencias(usgs, emsc));
    expect(Math.max(...d.map((x) => x.dtS))).toBeCloseTo(FIXTURE.resumen.deltaSegundosMax, 2);
    expect(Math.max(...d.map((x) => x.ddKm))).toBeCloseTo(FIXTURE.resumen.distanciaKmMax, 1);
    expect(Math.max(...d.map((x) => x.dm))).toBeCloseTo(FIXTURE.resumen.deltaMagnitudMax, 9);
  });

  it('el par con ΔM 0,9 (mb 4.5 frente a ML 3.6 del IGC) se fusiona con ΔM = 1.0', () => {
    const { usgs, emsc } = PARES.find(({ par }) => par.usgs.id === 'us6000u1ck');
    expect(diferencias(usgs, emsc).dm).toBeCloseTo(0.9, 9);
    expect(sonDuplicados(usgs, emsc, UMBRALES_DEDUP)).toBe(true);
  });

  it('ningún cruce entre pares distintos se fusiona (54 × 53 combinaciones)', () => {
    const falsos = [];
    for (const a of PARES) {
      for (const b of PARES) {
        if (a !== b && sonDuplicados(a.usgs, b.emsc)) falsos.push([a.usgs.idFuente, b.emsc.idFuente]);
      }
    }
    expect(falsos).toEqual([]);
  });

  it('cada registro USGS tiene un único candidato EMSC entre todos los del fixture', () => {
    const candidatos = PARES.map(({ emsc }) => ({
      id: `emsc:${emsc.idFuente}`,
      fuentes: ['emsc'],
      preferido: emsc,
      recibidoEn: emsc.tiempo,
    }));
    for (const { usgs, emsc } of PARES) {
      expect(elegirCandidato(usgs, candidatos)?.id).toBe(`emsc:${emsc.idFuente}`);
      expect(candidatos.filter((c) => cumpleUmbrales(usgs, c.preferido))).toHaveLength(1);
    }
  });

  it.each(FIXTURE.eventosDistintosCercanosEnTiempo.map((e) => [e.emscA, e.emscB, e]))(
    'los sismos distintos %s y %s no se fusionan ni siendo de fuentes distintas',
    (_a, _b, e) => {
      const a = { fuente: 'usgs', tiempo: 0, lat: 8, lon: -80, magnitud: e.magnitudes[0] };
      const b = {
        ...alNorte(a, e.distanciaKm),
        fuente: 'emsc',
        tiempo: e.deltaSegundos * 1000,
        magnitud: e.magnitudes[1],
      };
      expect(sonDuplicados(a, b)).toBe(false);
    },
  );
});

describe('umbrales configurables', () => {
  const base = { fuente: 'usgs', tiempo: 0, lat: 36, lon: -3, magnitud: 4 };
  const otro = (cambio) => ({ ...base, fuente: 'emsc', ...cambio });

  it('los valores iniciales son 30 s, 100 km y ΔM 1.0', () => {
    expect(UMBRALES_DEDUP).toEqual({ dtS: 30, ddKm: 100, dm: 1.0 });
  });

  it.each([
    ['Δt = 30 s (en el límite)', base, otro({ tiempo: 30_000 }), true],
    ['Δt = 30,001 s', base, otro({ tiempo: 30_001 }), false],
    ['Δd = 99,9 km', base, { ...alNorte(base, 99.9), fuente: 'emsc' }, true],
    ['Δd = 100,1 km', base, { ...alNorte(base, 100.1), fuente: 'emsc' }, false],
    ['ΔM = 1.0 en coma flotante (4.5 − 3.5)', { ...base, magnitud: 4.5 }, otro({ magnitud: 3.5 }), true],
    ['ΔM = 1.1', base, otro({ magnitud: 2.9 }), false],
  ])('%s', (_caso, a, b, esperado) => {
    expect(sonDuplicados(a, b)).toBe(esperado);
  });

  it('se pueden cambiar sin tocar el código', () => {
    const b = otro({ tiempo: 45_000 });
    expect(sonDuplicados(base, b)).toBe(false);
    expect(sonDuplicados(base, b, { dtS: 60, ddKm: 100, dm: 1 })).toBe(true);
  });

  it('dos registros de la misma fuente nunca son duplicados por cercanía', () => {
    expect(sonDuplicados(base, { ...base })).toBe(false);
    expect(sonDuplicados({ ...base, fuente: 'emsc' }, otro({}))).toBe(false);
  });

  it('valida los umbrales leídos de la configuración', () => {
    expect(validarUmbrales(UMBRALES_DEDUP)).toEqual([]);
    expect(validarUmbrales({ dtS: 0, ddKm: Number.NaN, dm: '1' })).toEqual([
      'DEDUP_DT_S debe ser un número mayor que 0 y como máximo 600.',
      'DEDUP_DD_KM debe ser un número mayor que 0 y como máximo 1000.',
      'DEDUP_DM debe ser un número mayor que 0 y como máximo 5.',
    ]);
  });
});

describe('elegirCandidato (ADR-0004, pasos 2 y 3)', () => {
  const registro = { fuente: 'usgs', tiempo: 0, lat: 8, lon: -80, magnitud: 4.5 };
  const candidato = (id, cambio, extra = {}) => ({
    id,
    fuentes: ['emsc'],
    preferido: { ...registro, ...cambio },
    recibidoEn: 1000,
    ...extra,
  });

  it('elige el de menor puntuación Δt/30 + Δd/100 + ΔM/1', () => {
    const cerca = candidato('emsc:cerca', { tiempo: 2000, magnitud: 4.4 });
    const lejos = candidato('emsc:lejos', { tiempo: 20_000, magnitud: 4.5 });
    expect(puntuacion(registro, cerca.preferido)).toBeLessThan(
      puntuacion(registro, lejos.preferido),
    );
    expect(elegirCandidato(registro, [lejos, cerca])).toBe(cerca);
  });

  it('en empate gana el recibido antes y, después, el id menor', () => {
    const a = candidato('emsc:b', { tiempo: 3000 }, { recibidoEn: 2000 });
    const b = candidato('emsc:a', { tiempo: 3000 }, { recibidoEn: 1000 });
    const c = candidato('emsc:0', { tiempo: 3000 }, { recibidoEn: 1000 });
    expect(elegirCandidato(registro, [a, b])).toBe(b);
    expect(elegirCandidato(registro, [a, b, c])).toBe(c);
  });

  it('descarta los candidatos que ya tienen un registro de la misma fuente', () => {
    const ocupado = candidato('usgs:x', {}, { fuentes: ['usgs'] });
    const mixto = candidato('emsc:y', {}, { fuentes: ['emsc', 'usgs'] });
    expect(elegirCandidato(registro, [ocupado, mixto])).toBeNull();
  });

  it('devuelve null si ninguno cumple los umbrales', () => {
    expect(elegirCandidato(registro, [candidato('emsc:z', { tiempo: 31_000 })])).toBeNull();
    expect(elegirCandidato(registro, [])).toBeNull();
  });
});

describe('sePuedenFusionar (fusión tardía, ADR-0004 paso 4)', () => {
  const p = { tiempo: 0, lat: 8, lon: -80, magnitud: 4 };

  it('fusiona sismos con fuentes disjuntas que cumplen los umbrales', () => {
    expect(
      sePuedenFusionar({ fuentes: ['emsc'], preferido: p }, { fuentes: ['usgs'], preferido: p }),
    ).toBe(true);
  });

  it('no fusiona si comparten alguna fuente', () => {
    expect(
      sePuedenFusionar(
        { fuentes: ['emsc'], preferido: p },
        { fuentes: ['emsc', 'usgs'], preferido: p },
      ),
    ).toBe(false);
  });

  it('no fusiona si no cumplen los umbrales', () => {
    expect(
      sePuedenFusionar(
        { fuentes: ['emsc'], preferido: p },
        { fuentes: ['usgs'], preferido: { ...p, magnitud: 5.5 } },
      ),
    ).toBe(false);
  });
});
