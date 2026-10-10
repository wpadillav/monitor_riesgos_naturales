import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  componerSismo,
  crearRegistro,
  idEstable,
  parsearInstante,
  profundidadPositiva,
  rangoPrecedencia,
  registroPreferido,
} from '../../../src/shared/modelo.js';

const FIXTURES = new URL('../../fixtures/', import.meta.url);
const leerJson = (ruta) => JSON.parse(readFileSync(new URL(ruta, FIXTURES), 'utf8'));

const AHORA = Date.parse('2026-10-10T12:00:00Z');

/** Entrada válida de referencia (EMSC, IGN, Baleares). */
const valida = () => ({
  fuente: 'emsc',
  idFuente: '20261010_0000120',
  tiempo: '2026-10-10T06:52:38.51Z',
  actualizadoEn: '2026-10-10T07:12:21.832403Z',
  lat: 38.4468,
  lon: 2.2609,
  profundidadKm: 20.9,
  magnitud: 2.4,
  magnitudTipo: 'ml',
  autor: 'IGN',
  lugar: 'BALEARIC ISLANDS, SPAIN',
});

/** Extracción mínima por fuente, solo para alimentar el normalizador con los fixtures reales. */
const desdeEmsc = (f) => ({
  fuente: 'emsc',
  idFuente: f.properties.unid,
  tiempo: f.properties.time,
  actualizadoEn: f.properties.lastupdate,
  lat: f.properties.lat,
  lon: f.properties.lon,
  profundidadKm: profundidadPositiva(f.properties.depth, f.geometry.coordinates[2]),
  magnitud: f.properties.mag,
  magnitudTipo: f.properties.magtype,
  autor: f.properties.auth,
  lugar: f.properties.flynn_region,
});
const desdeUsgs = (f) => ({
  fuente: 'usgs',
  idFuente: f.id,
  ids: f.properties.ids.split(',').filter(Boolean),
  tiempo: f.properties.time,
  actualizadoEn: f.properties.updated,
  lat: f.geometry.coordinates[1],
  lon: f.geometry.coordinates[0],
  profundidadKm: profundidadPositiva(f.geometry.coordinates[2]),
  magnitud: f.properties.mag,
  magnitudTipo: f.properties.magType,
  autor: String(f.properties.net).toUpperCase(),
  lugar: f.properties.place,
});

describe('crearRegistro: normalizador único (AM-05)', () => {
  it('construye un registro completo con instantes en ms y URL de ficha propia', () => {
    const r = crearRegistro(valida(), AHORA);
    expect(r).toEqual({
      ok: true,
      registro: {
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
      },
    });
    expect(Object.isFrozen(r.registro)).toBe(true);
  });

  it.each([
    ['fuente desconocida', { fuente: 'ign' }, 'fuente'],
    ['id con caracteres no permitidos', { idFuente: '../x' }, 'id'],
    ['id enorme', { idFuente: 'a'.repeat(65) }, 'id'],
    ['id que no es cadena', { idFuente: 123 }, 'id'],
    ['tiempo no parseable', { tiempo: 'ayer' }, 'tiempo'],
    ['tiempo sin zona horaria', { tiempo: '2026-10-10T06:52:38' }, 'tiempo'],
    ['tiempo en el futuro (> ahora + 10 min)', { tiempo: AHORA + 11 * 60_000 }, 'tiempo-futuro'],
    ['tiempo NaN', { tiempo: Number.NaN }, 'tiempo'],
    ['latitud 999', { lat: 999 }, 'lat'],
    ['latitud como cadena', { lat: '38.4' }, 'lat'],
    ['longitud fuera de ±360', { lon: 400 }, 'lon'],
    ['profundidad fuera de [−10, 800]', { profundidadKm: 900 }, 'profundidad'],
    ['profundidad −11', { profundidadKm: -11 }, 'profundidad'],
    ['magnitud como cadena', { magnitud: '4.5' }, 'magnitud'],
    ['magnitud NaN', { magnitud: Number.NaN }, 'magnitud'],
    ['magnitud Infinity', { magnitud: Number.POSITIVE_INFINITY }, 'magnitud'],
    ['magnitud 11', { magnitud: 11 }, 'magnitud'],
    ['magnitud nula', { magnitud: null }, 'magnitud'],
    ['autor vacío tras sanear', { autor: '‮\u0000' }, 'autor'],
    ['actualizadoEn inválido', { actualizadoEn: 'x' }, 'actualizado'],
  ])('descarta: %s', (_caso, cambio, motivo) => {
    expect(crearRegistro({ ...valida(), ...cambio }, AHORA)).toEqual({ ok: false, motivo });
  });

  it.each([null, undefined, 'x', 42])('descarta una entrada que no es objeto (%s)', (entrada) => {
    expect(crearRegistro(entrada, AHORA)).toEqual({ ok: false, motivo: 'entrada' });
  });

  it('no contamina el prototipo con __proto__ ni copia claves desconocidas', () => {
    const crudo = JSON.parse(
      JSON.stringify(valida()).replace(
        /^\{/,
        '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},"extra":"x",',
      ),
    );
    const r = crearRegistro(crudo, AHORA);
    expect(r.ok).toBe(true);
    expect({}.polluted).toBeUndefined();
    expect(Object.getPrototypeOf(r.registro)).toBe(Object.prototype);
    expect(Object.keys(r.registro)).not.toContain('extra');
    expect(Object.keys(r.registro)).not.toContain('__proto__');
  });

  it('no lee propiedades heredadas: un campo solo en el prototipo cuenta como ausente', () => {
    const conHerencia = Object.create({ magnitud: 4 });
    Object.assign(conHerencia, { ...valida(), magnitud: undefined });
    delete conHerencia.magnitud;
    expect(crearRegistro(conHerencia, AHORA)).toEqual({ ok: false, motivo: 'magnitud' });
  });

  it('sanea los textos y los recorta a 200, 32 y 16 caracteres', () => {
    const r = crearRegistro(
      {
        ...valida(),
        lugar: `‮X${'y'.repeat(300)}`,
        autor: `A\u0000${'B'.repeat(40)}`,
        magnitudTipo: 'm'.repeat(20),
      },
      AHORA,
    );
    expect(r.registro.lugar).toHaveLength(200);
    expect(r.registro.lugar.startsWith('Xy')).toBe(true);
    expect(r.registro.autor).toHaveLength(32);
    expect(r.registro.magnitudTipo).toHaveLength(16);
  });

  it('normaliza la longitud de ±360 a ±180', () => {
    expect(crearRegistro({ ...valida(), lon: 278.7 }, AHORA).registro.lon).toBeCloseTo(-81.3, 9);
  });

  it('admite profundidad nula y una ligeramente negativa (foco sobre el nivel del mar)', () => {
    expect(crearRegistro({ ...valida(), profundidadKm: null }, AHORA).registro.profundidadKm).toBe(
      null,
    );
    expect(crearRegistro({ ...valida(), profundidadKm: -1.2 }, AHORA).registro.profundidadKm).toBe(
      -1.2,
    );
  });

  it('usa la hora de origen si falta actualizadoEn', () => {
    const r = crearRegistro({ ...valida(), actualizadoEn: undefined }, AHORA);
    expect(r.registro.actualizadoEn).toBe(r.registro.tiempo);
  });

  it('guarda los ids alternativos válidos de USGS sin repetir y descarta los inválidos', () => {
    const r = crearRegistro(
      {
        ...valida(),
        fuente: 'usgs',
        idFuente: 'us6000u19w',
        ids: ['pt26282001', 'us6000u19w', 'attmnq2s', '<script>', 7],
      },
      AHORA,
    );
    expect(r.registro.ids).toEqual(['us6000u19w', 'pt26282001', 'attmnq2s']);
    expect(r.registro.url).toBe('https://earthquake.usgs.gov/earthquakes/eventpage/us6000u19w');
  });

  it('acepta todos los fixtures reales de T1.2 sin descartes', () => {
    const entradas = [
      ...leerJson('emsc/fdsn-query-espana.json').features.map(desdeEmsc),
      ...leerJson('emsc/fdsn-query-panama-colombia.json').features.map(desdeEmsc),
      ...readFileSync(new URL('emsc-ws/mensajes.jsonl', FIXTURES), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((linea) => desdeEmsc(JSON.parse(JSON.parse(linea).raw).data)),
      ...leerJson('usgs/fdsn-query-espana-30d.geojson').features.map(desdeUsgs),
      ...leerJson('usgs/fdsn-query-panama.geojson').features.map(desdeUsgs),
      ...leerJson('usgs/summary-4.5_day.geojson').features.map(desdeUsgs),
    ];
    expect(entradas.length).toBeGreaterThanOrEqual(16);
    const descartes = entradas
      .map((e) => crearRegistro(e, AHORA))
      .filter((r) => !r.ok)
      .map((r) => r.motivo);
    expect(descartes).toEqual([]);
  });
});

describe('profundidadPositiva (PRD E1)', () => {
  it('EMSC: usa depth (positiva) aunque coordinates[2] sea −10', () => {
    expect(profundidadPositiva(10, -10)).toBe(10);
  });

  it('EMSC sin depth: cambia el signo de la coordenada vertical', () => {
    expect(profundidadPositiva(undefined, -10)).toBe(10);
    expect(profundidadPositiva(null, -0)).toBe(0);
  });

  it('USGS: coordinates[2] ya es positiva', () => {
    expect(profundidadPositiva(12.3)).toBe(12.3);
  });

  it('sin datos devuelve null', () => {
    expect(profundidadPositiva(undefined, undefined)).toBeNull();
    expect(profundidadPositiva('10', 'x')).toBeNull();
  });
});

describe('parsearInstante', () => {
  it.each([
    ['2026-10-10T06:52:38.51Z', Date.parse('2026-10-10T06:52:38.510Z')],
    ['2026-10-10T07:12:21.832403Z', Date.parse('2026-10-10T07:12:21.832Z')],
    ['2026-10-10T06:52:38Z', Date.parse('2026-10-10T06:52:38.000Z')],
    ['2026-10-10T08:52:38+02:00', Date.parse('2026-10-10T06:52:38.000Z')],
    [1790327076938, 1790327076938],
  ])('%s', (entrada, esperado) => {
    expect(parsearInstante(entrada)).toBe(esperado);
  });

  it.each(['', '2026-10-10', 'x'.repeat(50), null, Number.POSITIVE_INFINITY, {}])(
    'devuelve NaN para %s',
    (entrada) => {
      expect(parsearInstante(entrada)).toBeNaN();
    },
  );
});

describe('precedencia (ADR-0004)', () => {
  const emsc = (autor, lat = 9, lon = -79.5) => ({ fuente: 'emsc', autor, lat, lon });
  const usgs = { fuente: 'usgs', autor: 'US', lat: 9, lon: -79.5 };

  it.each([
    ['EMSC con IGC en Panamá', emsc('IGC'), 'PA', 1],
    ['EMSC con IGN en España', emsc('IGN'), 'ES', 1],
    ['EMSC con IGN pero ubicado en Panamá', emsc('IGN'), 'PA', 2],
    ['EMSC con IGC en Colombia (sin agencia nacional)', emsc('IGC'), 'CO', 2],
    ['EMSC con NEIC', emsc('NEIC'), 'PA', 2],
    ['EMSC sin país', emsc('IGN'), null, 2],
    ['USGS', usgs, 'PA', 3],
  ])('%s → rango %s', (_caso, registro, pais, rango) => {
    expect(rangoPrecedencia(registro, pais)).toBe(rango);
  });

  it('autor IGC dentro de EMSC gana a USGS, aunque USGS llegue primero (HU-01)', () => {
    const preferido = registroPreferido([usgs, emsc('IGC')], () => 'PA');
    expect(preferido.autor).toBe('IGC');
  });

  it('EMSC gana a USGS cuando el autor no es nacional', () => {
    expect(registroPreferido([usgs, emsc('NEIC')], () => 'PA').fuente).toBe('emsc');
  });

  it('el país del rango 1 sale de la ubicación del propio registro EMSC', () => {
    const paisDe = (lat) => (lat > 30 ? 'ES' : 'PA');
    const emscEnEspana = emsc('IGC', 40, -3);
    expect(registroPreferido([usgs, emscEnEspana], paisDe)).toBe(emscEnEspana);
    expect(rangoPrecedencia(emscEnEspana, paisDe(40))).toBe(2);
  });

  it('exige al menos un registro', () => {
    expect(() => registroPreferido([], () => null)).toThrow(RangeError);
  });
});

describe('componerSismo (contrato Sismo)', () => {
  const regEmsc = crearRegistro(
    {
      fuente: 'emsc',
      idFuente: '20261010_0000106',
      tiempo: '2026-10-10T06:04:20.1Z',
      actualizadoEn: '2026-10-10T06:10:00Z',
      lat: 7.62,
      lon: -80.53,
      profundidadKm: 15,
      magnitud: 4.4,
      magnitudTipo: 'ml',
      autor: 'IGC',
      lugar: 'PANAMA',
    },
    AHORA,
  ).registro;
  const regUsgs = crearRegistro(
    {
      fuente: 'usgs',
      idFuente: 'us6000u1aa',
      tiempo: Date.parse('2026-10-10T06:04:22Z'),
      actualizadoEn: Date.parse('2026-10-10T06:30:00Z'),
      lat: 7.6,
      lon: -80.5,
      profundidadKm: 10,
      magnitud: 4.6,
      magnitudTipo: 'mb',
      autor: 'US',
      lugar: '20 km S of Pedasí, Panama',
    },
    AHORA,
  ).registro;
  const asignarPais = () => ({
    pais: 'PA',
    zona: 'PA',
    zonaHoraria: 'America/Panama',
    paisesCandidatos: ['PA'],
  });

  it('toma los datos del registro preferido y conserva el id estable del primero', () => {
    const sismo = componerSismo(
      {
        id: idEstable(regUsgs),
        registros: [regUsgs, regEmsc],
        recibidoEn: Date.parse('2026-10-10T06:05:00Z'),
        revision: 2,
      },
      asignarPais,
    );
    expect(sismo).toEqual({
      id: 'usgs:us6000u1aa',
      tiempo: '2026-10-10T06:04:20.100Z',
      lat: 7.62,
      lon: -80.53,
      profundidadKm: 15,
      magnitud: 4.4,
      magnitudTipo: 'ml',
      lugar: 'PANAMA',
      pais: 'PA',
      zona: 'PA',
      zonaHoraria: 'America/Panama',
      autor: 'IGC',
      fuentePreferida: 'emsc',
      url: 'https://www.seismicportal.eu/eventdetails.html?unid=20261010_0000106',
      fuentes: [
        {
          fuente: 'usgs',
          idFuente: 'us6000u1aa',
          autor: 'US',
          magnitud: 4.6,
          magnitudTipo: 'mb',
          url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000u1aa',
          actualizadoEn: '2026-10-10T06:30:00.000Z',
        },
        {
          fuente: 'emsc',
          idFuente: '20261010_0000106',
          autor: 'IGC',
          magnitud: 4.4,
          magnitudTipo: 'ml',
          url: 'https://www.seismicportal.eu/eventdetails.html?unid=20261010_0000106',
          actualizadoEn: '2026-10-10T06:10:00.000Z',
        },
      ],
      actualizadoEn: '2026-10-10T06:30:00.000Z',
      recibidoEn: '2026-10-10T06:05:00.000Z',
      revision: 2,
    });
  });

  it('devuelve null si la ubicación preferida no es de ningún país', () => {
    expect(
      componerSismo(
        { id: idEstable(regEmsc), registros: [regEmsc], recibidoEn: AHORA, revision: 1 },
        () => null,
      ),
    ).toBeNull();
  });
});
