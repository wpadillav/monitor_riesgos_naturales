// Catálogo en memoria: asociación por id, fusión por cercanía y tardía, precedencia,
// visibilidad por país, retención, tope y eventos internos (ADR-0004, AM-16).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  EVENTOS_CATALOGO,
  TOPE_SISMOS,
  createCatalogo,
} from '../../../../src/server/dominio/catalogo.js';
import { asignarPais } from '../../../../src/server/geo/asignar-pais.js';
import { crearRegistro } from '../../../../src/shared/modelo.js';

const AHORA = Date.parse('2026-10-10T12:00:00.000Z');
const T0 = Date.parse('2026-10-10T10:35:11.922Z');

/** Registro normalizado con valores de Panamá por defecto. */
function reg(over = {}) {
  const r = crearRegistro(
    {
      fuente: 'emsc',
      idFuente: '20261010_0000175',
      tiempo: T0,
      actualizadoEn: T0 + 120_000,
      lat: 7.7463,
      lon: -81.3092,
      profundidadKm: 10,
      magnitud: 4.8,
      magnitudTipo: 'mb',
      autor: 'NEIC',
      lugar: 'PANAMA',
      ...over,
    },
    AHORA,
  );
  if (!r.ok) throw new Error(`registro de prueba inválido: ${r.motivo}`);
  return r.registro;
}

const usgsReg = (over = {}) =>
  reg({
    fuente: 'usgs',
    idFuente: 'us6000u1e5',
    autor: 'US',
    lugar: '14 km W of Río Grande, Panama',
    actualizadoEn: T0 + 300_000,
    ...over,
  });

/** Catálogo con Turf real y un registro de los eventos emitidos. */
function crear(opciones = {}) {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const catalogo = createCatalogo({ asignarPais, log, ...opciones });
  const eventos = [];
  for (const nombre of Object.values(EVENTOS_CATALOGO)) {
    catalogo.on(nombre, (carga) => eventos.push({ evento: nombre, ...carga }));
  }
  return { catalogo, eventos, log };
}

const resumen = (eventos) =>
  eventos.map((e) => [e.evento, e.sismo?.id ?? e.id, e.motivo ?? e.cambios ?? null]);

describe('alta y asociación por id', () => {
  it('un registro nuevo crea un sismo visible con revisión 1 y emite «alta»', () => {
    const { catalogo, eventos } = crear();

    const r = catalogo.ingerir(reg(), { recibidoEn: AHORA });

    expect(r).toEqual({ accion: 'alta', id: 'emsc:20261010_0000175', visible: true });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].evento).toBe('alta');
    expect(eventos[0].sismo).toMatchObject({
      id: 'emsc:20261010_0000175',
      pais: 'PA',
      zona: 'PA',
      zonaHoraria: 'America/Panama',
      fuentePreferida: 'emsc',
      revision: 1,
      recibidoEn: new Date(AHORA).toISOString(),
    });
    expect(catalogo.contar()).toBe(1);
  });

  it('una revisión más reciente del mismo unid actualiza el sismo (HU-01, M 3.8 → 4.1)', () => {
    const { catalogo, eventos } = crear();
    catalogo.ingerir(reg({ magnitud: 3.8 }), { recibidoEn: AHORA });

    const r = catalogo.ingerir(reg({ magnitud: 4.1, actualizadoEn: T0 + 600_000 }), {
      recibidoEn: AHORA + 1000,
    });

    expect(r.accion).toBe('actualizacion');
    expect(catalogo.contar()).toBe(1);
    const act = eventos[1];
    expect(act.evento).toBe('actualizacion');
    expect(act.cambios).toEqual(['magnitud', 'fuentes']);
    expect(act.anterior.magnitud).toBe(3.8);
    expect(act.sismo).toMatchObject({ magnitud: 4.1, revision: 2 });
    // recibidoEn es la primera recepción.
    expect(act.sismo.recibidoEn).toBe(new Date(AHORA).toISOString());
  });

  it('una respuesta igual o más antigua no revierte nada ni emite eventos (solape y caché)', () => {
    const { catalogo, eventos } = crear();
    catalogo.ingerir(reg({ magnitud: 4.1, actualizadoEn: T0 + 600_000 }), { recibidoEn: AHORA });

    expect(catalogo.ingerir(reg({ magnitud: 3.8 }), { recibidoEn: AHORA }).accion).toBe(
      'sin-cambios',
    );
    expect(
      catalogo.ingerir(reg({ magnitud: 4.1, actualizadoEn: T0 + 600_000 }), { recibidoEn: AHORA })
        .accion,
    ).toBe('sin-cambios');
    expect(eventos).toHaveLength(1);
    expect(catalogo.obtener('emsc:20261010_0000175')?.magnitud).toBe(4.1);
  });

  it('USGS cambia de id preferido (pt → us): se asocia por cualquiera de «ids»', () => {
    const { catalogo } = crear();
    catalogo.ingerir(usgsReg({ idFuente: 'pt26282001' }), { recibidoEn: AHORA });

    const r = catalogo.ingerir(
      usgsReg({ idFuente: 'us6000u19w', ids: ['pt26282001'], actualizadoEn: T0 + 900_000 }),
      { recibidoEn: AHORA },
    );

    expect(r).toMatchObject({ accion: 'actualizacion', id: 'usgs:pt26282001' });
    expect(catalogo.contar()).toBe(1);
    const s = catalogo.obtener('usgs:pt26282001');
    expect(s?.fuentes[0].idFuente).toBe('us6000u19w');
    expect(s?.url).toBe('https://earthquake.usgs.gov/earthquakes/eventpage/us6000u19w');
  });
});

describe('duplicados entre fuentes y precedencia (ADR-0004)', () => {
  it('HU-01: EMSC con autor IGC y luego USGS → un solo sismo con los datos de IGC y dos fuentes', () => {
    const { catalogo, eventos } = crear();
    catalogo.ingerir(reg({ autor: 'IGC', magnitud: 4.4, magnitudTipo: 'm' }), {
      recibidoEn: AHORA,
    });

    const r = catalogo.ingerir(usgsReg({ magnitud: 4.3, tiempo: T0 + 2000 }), {
      recibidoEn: AHORA + 5000,
    });

    expect(r).toEqual({ accion: 'fusion', id: 'emsc:20261010_0000175', visible: true });
    expect(catalogo.contar()).toBe(1);
    const s = catalogo.obtener('emsc:20261010_0000175');
    expect(s).toMatchObject({ autor: 'IGC', magnitud: 4.4, fuentePreferida: 'emsc', revision: 2 });
    expect(s?.fuentes.map((f) => f.fuente)).toEqual(['emsc', 'usgs']);
    expect(resumen(eventos)).toEqual([
      ['alta', 'emsc:20261010_0000175', null],
      ['actualizacion', 'emsc:20261010_0000175', ['fuentes']],
    ]);
  });

  it('USGS primero y EMSC después: el id no cambia pero gana EMSC (rango 2 frente a 3)', () => {
    const { catalogo, eventos } = crear();
    catalogo.ingerir(usgsReg({ magnitud: 4.9 }), { recibidoEn: AHORA });
    catalogo.ingerir(reg(), { recibidoEn: AHORA + 1000 });

    const s = catalogo.obtener('usgs:us6000u1e5');
    expect(s).toMatchObject({ id: 'usgs:us6000u1e5', fuentePreferida: 'emsc', magnitud: 4.8 });
    expect(eventos[1].cambios).toEqual(['magnitud', 'lugar', 'fuentes', 'preferida']);
  });

  it('en España gana el autor IGN dentro de EMSC; si el autor cambia, se recalcula', () => {
    const { catalogo } = crear();
    const base = { lat: 37.1129, lon: -3.6309, tiempo: T0, lugar: 'SPAIN' };
    catalogo.ingerir(usgsReg({ ...base, idFuente: 'us6000tlmq', magnitud: 4.4 }), {
      recibidoEn: AHORA,
    });
    catalogo.ingerir(reg({ ...base, idFuente: '20260818_0000350', autor: 'IGN', magnitud: 4.1 }), {
      recibidoEn: AHORA,
    });
    expect(catalogo.obtener('usgs:us6000tlmq')).toMatchObject({
      pais: 'ES',
      autor: 'IGN',
      magnitud: 4.1,
    });
  });

  it('nunca fusiona dos registros de la misma fuente aunque estén a 1 s y 1 km (réplicas)', () => {
    const { catalogo } = crear();
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    catalogo.ingerir(reg({ idFuente: '20261010_0000176', tiempo: T0 + 1000, lat: 7.75 }), {
      recibidoEn: AHORA,
    });
    expect(catalogo.contar()).toBe(2);
  });

  it('no asocia si se supera algún umbral (Δt 31 s)', () => {
    const { catalogo } = crear();
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    catalogo.ingerir(usgsReg({ tiempo: T0 + 31_000 }), { recibidoEn: AHORA });
    expect(catalogo.contar()).toBe(2);
  });

  it('respeta umbrales configurados (DEDUP_DT_S=60)', () => {
    const { catalogo } = crear({ umbrales: { dtS: 60, ddKm: 100, dm: 1 } });
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    catalogo.ingerir(usgsReg({ tiempo: T0 + 45_000 }), { recibidoEn: AHORA });
    expect(catalogo.contar()).toBe(1);
  });

  it('con varios candidatos elige la menor puntuación', () => {
    const { catalogo } = crear();
    catalogo.ingerir(reg({ idFuente: 'lejos', tiempo: T0 + 20_000 }), { recibidoEn: AHORA });
    catalogo.ingerir(reg({ idFuente: 'cerca', tiempo: T0 + 1000 }), { recibidoEn: AHORA });
    const r = catalogo.ingerir(usgsReg(), { recibidoEn: AHORA });
    expect(r.id).toBe('emsc:cerca');
  });

  it('fusión tardía: una revisión acerca dos sismos y se fusionan en el más antiguo', () => {
    const { catalogo, eventos } = crear();
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    catalogo.ingerir(usgsReg({ tiempo: T0 + 90_000 }), { recibidoEn: AHORA + 1000 });
    expect(catalogo.contar()).toBe(2);
    eventos.length = 0;

    const r = catalogo.ingerir(usgsReg({ tiempo: T0 + 3000, actualizadoEn: T0 + 900_000 }), {
      recibidoEn: AHORA + 2000,
    });

    expect(r).toEqual({ accion: 'actualizacion', id: 'emsc:20261010_0000175', visible: true });
    expect(catalogo.contar()).toBe(1);
    expect(resumen(eventos)).toEqual([
      ['baja', 'usgs:us6000u1e5', 'fusionado'],
      ['actualizacion', 'emsc:20261010_0000175', ['fuentes']],
    ]);
    expect(eventos[0].reemplazadoPor).toBe('emsc:20261010_0000175');
    // El id antiguo de USGS sigue apuntando al superviviente.
    catalogo.ingerir(usgsReg({ tiempo: T0 + 3000, actualizadoEn: T0 + 999_000, magnitud: 5 }), {
      recibidoEn: AHORA + 3000,
    });
    expect(catalogo.contar()).toBe(1);
    expect(catalogo.obtener('emsc:20261010_0000175')?.fuentes[1].magnitud).toBe(5);
  });

  it('los 54 pares reales del fixture quedan como 54 sismos con dos fuentes cada uno', () => {
    const { pares } = JSON.parse(
      readFileSync(
        new URL('../../../fixtures/dedup/pares-usgs-emsc.json', import.meta.url),
        'utf8',
      ),
    );
    const { catalogo } = crear();
    const ahora = Date.parse('2026-10-11T00:00:00Z');
    pares.forEach((p, i) => {
      const e = crearRegistro(
        {
          fuente: 'emsc',
          idFuente: p.emsc.unid,
          tiempo: p.emsc.tiempo,
          actualizadoEn: p.emsc.tiempo,
          lat: p.emsc.lat,
          lon: p.emsc.lon,
          profundidadKm: p.emsc.profundidadKm,
          magnitud: p.emsc.magnitud,
          magnitudTipo: p.emsc.magnitudTipo,
          autor: p.emsc.auth,
          lugar: 'x',
        },
        ahora,
      );
      const u = crearRegistro(
        {
          fuente: 'usgs',
          idFuente: p.usgs.id,
          tiempo: p.usgs.tiempo,
          actualizadoEn: p.usgs.tiempo,
          lat: p.usgs.lat,
          lon: p.usgs.lon,
          profundidadKm: p.usgs.profundidadKm,
          magnitud: p.usgs.magnitud,
          magnitudTipo: p.usgs.magnitudTipo,
          autor: 'US',
          lugar: 'x',
        },
        ahora,
      );
      // Mitad en un orden y mitad en el otro.
      const orden = i % 2 === 0 ? [e, u] : [u, e];
      catalogo.ingerirLote(
        orden.map((r) => r.registro),
        { recibidoEn: ahora },
      );
    });
    expect(catalogo.contar()).toBe(54);
  });
});

describe('visibilidad por país', () => {
  it('un sismo en el rectángulo pero fuera de la franja se guarda sin servirlo ni difundirlo', () => {
    const { catalogo, eventos } = crear();
    const r = catalogo.ingerir(reg({ idFuente: 'mar', lat: 6.3, lon: -84 }), { recibidoEn: AHORA });

    expect(r.visible).toBe(false);
    expect(catalogo.contar()).toBe(1);
    expect(catalogo.contarVisibles()).toBe(0);
    expect(eventos).toEqual([]);
    expect(catalogo.listar({ paises: ['PA', 'CO', 'ES'], magMin: null, desde: 0 }).sismos).toEqual(
      [],
    );
  });

  it('una revisión que lo saca del país emite «baja» fuera-de-zona; si vuelve, «alta»', () => {
    const { catalogo, eventos } = crear();
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    catalogo.ingerir(reg({ lat: 6.3, lon: -84, actualizadoEn: T0 + 500_000 }), {
      recibidoEn: AHORA,
    });
    catalogo.ingerir(reg({ actualizadoEn: T0 + 600_000 }), { recibidoEn: AHORA });

    expect(resumen(eventos)).toEqual([
      ['alta', 'emsc:20261010_0000175', null],
      ['baja', 'emsc:20261010_0000175', 'fuera-de-zona'],
      ['alta', 'emsc:20261010_0000175', null],
    ]);
    expect(eventos[2].sismo.revision).toBe(3);
  });
});

describe('conoce (T4.6)', () => {
  it('sabe si un id de fuente está asociado a algún sismo, tenga país o no', () => {
    const { catalogo } = crear();
    expect(catalogo.conoce('emsc', '20261010_0000175')).toBe(false);
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    catalogo.ingerir(reg({ idFuente: 'fuera', lat: 34, lon: -117 }), { recibidoEn: AHORA });

    expect(catalogo.conoce('emsc', '20261010_0000175')).toBe(true);
    expect(catalogo.conoce('emsc', 'fuera')).toBe(true);
    expect(catalogo.conoce('usgs', '20261010_0000175')).toBe(false);
  });
});

describe('retirar', () => {
  it('quitar el único registro elimina el sismo con «baja» retirado', () => {
    const { catalogo, eventos } = crear();
    catalogo.ingerir(reg(), { recibidoEn: AHORA });

    expect(catalogo.retirar('emsc', '20261010_0000175')).toBe(true);
    expect(catalogo.contar()).toBe(0);
    expect(resumen(eventos).at(-1)).toEqual(['baja', 'emsc:20261010_0000175', 'retirado']);
    expect(catalogo.retirar('emsc', '20261010_0000175')).toBe(false);
  });

  it('quitar uno de dos registros deja el sismo con la otra fuente', () => {
    const { catalogo, eventos } = crear();
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    catalogo.ingerir(usgsReg(), { recibidoEn: AHORA });

    catalogo.retirar('emsc', '20261010_0000175');

    const s = catalogo.obtener('emsc:20261010_0000175');
    expect(s?.fuentes.map((f) => f.fuente)).toEqual(['usgs']);
    expect(s?.fuentePreferida).toBe('usgs');
    expect(eventos.at(-1)?.evento).toBe('actualizacion');
  });
});

describe('listar', () => {
  function cargado() {
    const { catalogo } = crear();
    const hora = 3_600_000;
    catalogo.ingerirLote(
      [
        reg({ idFuente: 'pa-1', tiempo: AHORA - 1 * hora, magnitud: 4.5 }),
        reg({ idFuente: 'pa-2', tiempo: AHORA - 30 * hora, magnitud: 2.0 }),
        reg({ idFuente: 'es-1', tiempo: AHORA - 2 * hora, lat: 37.1, lon: -3.6, magnitud: 1.9 }),
        reg({ idFuente: 'co-1', tiempo: AHORA - 3 * hora, lat: 4.6, lon: -74.1, magnitud: 3.0 }),
      ],
      { recibidoEn: AHORA },
    );
    return catalogo;
  }

  it('filtra por países, magnitud mínima (incluida) y desde; ordena por tiempo descendente', () => {
    const catalogo = cargado();
    const ids = (f) => catalogo.listar(f).sismos.map((s) => s.id);

    expect(ids({ paises: ['ES', 'CO', 'PA'], magMin: null, desde: 0 })).toEqual([
      'emsc:pa-1',
      'emsc:es-1',
      'emsc:co-1',
      'emsc:pa-2',
    ]);
    expect(ids({ paises: ['PA'], magMin: null, desde: 0 })).toEqual(['emsc:pa-1', 'emsc:pa-2']);
    expect(ids({ paises: ['ES', 'CO', 'PA'], magMin: 2.0, desde: 0 })).toEqual([
      'emsc:pa-1',
      'emsc:co-1',
      'emsc:pa-2',
    ]);
    expect(ids({ paises: ['ES', 'CO', 'PA'], magMin: 4.5, desde: 0 })).toEqual(['emsc:pa-1']);
    expect(
      ids({ paises: ['ES', 'CO', 'PA'], magMin: null, desde: AHORA - 24 * 3_600_000 }),
    ).toEqual(['emsc:pa-1', 'emsc:es-1', 'emsc:co-1']);
  });

  it('trunca al límite y lo indica, con total de los que cumplen', () => {
    const r = cargado().listar({ paises: ['ES', 'CO', 'PA'], magMin: null, desde: 0, limite: 2 });
    expect(r).toMatchObject({ total: 4, truncado: true });
    expect(r.sismos).toHaveLength(2);
  });

  it('un sismo en la franja de dos países sale con cualquiera de los dos (HU-03)', () => {
    const asignar = vi.fn(() => ({
      pais: 'PA',
      zona: 'PA',
      zonaHoraria: 'America/Panama',
      paisesCandidatos: ['PA', 'CO'],
    }));
    const catalogo = createCatalogo({ asignarPais: asignar });
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    expect(catalogo.listar({ paises: ['CO'], magMin: null, desde: 0 }).total).toBe(1);
  });
});

describe('retención y tope de memoria (AM-16)', () => {
  it('purgar elimina lo anterior a 30 días con «purga» y sin «baja»', () => {
    const { catalogo, eventos } = crear();
    catalogo.ingerir(reg({ idFuente: 'viejo', tiempo: AHORA - 29 * 86_400_000 }), {
      recibidoEn: AHORA,
    });
    catalogo.ingerir(reg({ idFuente: 'nuevo', tiempo: AHORA - 3_600_000 }), { recibidoEn: AHORA });
    eventos.length = 0;

    expect(catalogo.purgar(AHORA)).toBe(0);
    expect(catalogo.purgar(AHORA + 2 * 86_400_000)).toBe(1);
    expect(catalogo.purgar(AHORA + 31 * 86_400_000)).toBe(1);
    expect(catalogo.contar()).toBe(0);
    expect(eventos.map((e) => e.evento)).toEqual(['purga', 'purga']);
    expect(eventos[0]).toMatchObject({ ids: ['emsc:viejo'], motivo: 'retencion' });

    // Los índices se purgan con el sismo: el mismo id vuelve a crear un sismo.
    expect(
      catalogo.ingerir(reg({ idFuente: 'viejo', tiempo: AHORA }), { recibidoEn: AHORA }).accion,
    ).toBe('alta');
  });

  it('respeta RETENCION_DIAS', () => {
    const { catalogo } = crear({ retencionDias: 1 });
    catalogo.ingerir(reg({ tiempo: AHORA - 2 * 86_400_000 }), { recibidoEn: AHORA });
    expect(catalogo.purgar(AHORA)).toBe(1);
  });

  it('al insertar 60 000 sismos sintéticos quedan 50 000 (los más recientes) y se avisa', () => {
    const asignar = () => ({
      pais: 'PA',
      zona: 'PA',
      zonaHoraria: 'America/Panama',
      paisesCandidatos: ['PA'],
    });
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    const catalogo = createCatalogo({ asignarPais: asignar, log });
    const purgas = [];
    catalogo.on('purga', (p) => purgas.push(p));
    const inicio = AHORA - 60_000 * 60_000;
    const registros = Array.from({ length: 60_000 }, (_, i) =>
      reg({ idFuente: `s${i}`, tiempo: inicio + i * 60_000 }),
    );

    catalogo.ingerirLote(registros, { recibidoEn: AHORA });

    expect(TOPE_SISMOS).toBe(50_000);
    expect(catalogo.contar()).toBe(50_000);
    expect(catalogo.obtener('emsc:s9999')).toBeNull();
    expect(catalogo.obtener('emsc:s10000')).not.toBeNull();
    expect(log.warn).toHaveBeenCalledWith('memoria.tope', { descartados: 10_000, tope: 50_000 });
    expect(purgas).toEqual([expect.objectContaining({ motivo: 'tope' })]);
    expect(purgas[0].ids).toHaveLength(10_000);
  });

  it('el tope también se aplica en la ingesta individual', () => {
    const { catalogo } = crear({ tope: 2 });
    catalogo.ingerir(reg({ idFuente: 'a', tiempo: T0 }), { recibidoEn: AHORA });
    catalogo.ingerir(reg({ idFuente: 'b', tiempo: T0 + 120_000 }), { recibidoEn: AHORA });
    catalogo.ingerir(reg({ idFuente: 'c', tiempo: T0 + 240_000 }), { recibidoEn: AHORA });
    expect(catalogo.contar()).toBe(2);
    expect(catalogo.obtener('emsc:a')).toBeNull();
  });
});

describe('eventos', () => {
  it('un oyente que lanza no rompe la ingesta y se registra', () => {
    const { catalogo, log } = crear();
    catalogo.on('alta', () => {
      throw new Error('fallo del oyente');
    });
    expect(() => catalogo.ingerir(reg(), { recibidoEn: AHORA })).not.toThrow();
    expect(log.error).toHaveBeenCalled();
    expect(catalogo.contar()).toBe(1);
  });

  it('la suscripción se puede cancelar', () => {
    const catalogo = createCatalogo({ asignarPais });
    const oyente = vi.fn();
    const cancelar = catalogo.on('alta', oyente);
    cancelar();
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    expect(oyente).not.toHaveBeenCalled();
  });
});

describe('casos límite (T5.1)', () => {
  const espana = (over = {}) =>
    reg({
      idFuente: '20261010_0000900',
      lat: 40.4,
      lon: -3.7,
      lugar: 'SPAIN',
      autor: 'IGN',
      ...over,
    });

  it('un oyente que lanza (aunque no sea un Error) no impide avisar a los demás', () => {
    const { catalogo, log } = crear();
    const segundo = vi.fn();
    catalogo.on(EVENTOS_CATALOGO.ALTA, () => {
      throw 'cadena lanzada';
    });
    catalogo.on(EVENTOS_CATALOGO.ALTA, segundo);

    catalogo.ingerir(reg(), { recibidoEn: AHORA });

    expect(segundo).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith('error', {
      mensaje: 'Oyente de alta: cadena lanzada',
    });
  });

  it('listar desempata por id cuando dos sismos tienen la misma hora', () => {
    const { catalogo } = crear();
    catalogo.ingerir(reg(), { recibidoEn: AHORA });
    catalogo.ingerir(espana(), { recibidoEn: AHORA });

    const ids = catalogo
      .listar({ paises: ['ES', 'PA'], magMin: null, desde: 0 })
      .sismos.map((s) => s.id);

    expect(ids).toHaveLength(2);
    expect([...ids].sort()).toEqual(ids);
  });

  it('listar con magMin exacto incluye la magnitud igual al mínimo (frontera)', () => {
    const { catalogo } = crear();
    catalogo.ingerir(reg({ magnitud: 4.5 }), { recibidoEn: AHORA });

    expect(catalogo.listar({ paises: ['PA'], magMin: 4.5, desde: 0 }).total).toBe(1);
    expect(catalogo.listar({ paises: ['PA'], magMin: 4.6, desde: 0 }).total).toBe(0);
  });

  it('listar excluye lo anterior a «desde» e incluye lo que cae justo en el límite', () => {
    const { catalogo } = crear();
    catalogo.ingerir(reg(), { recibidoEn: AHORA });

    expect(catalogo.listar({ paises: ['PA'], magMin: null, desde: T0 }).total).toBe(1);
    expect(catalogo.listar({ paises: ['PA'], magMin: null, desde: T0 + 1 }).total).toBe(0);
  });
});
