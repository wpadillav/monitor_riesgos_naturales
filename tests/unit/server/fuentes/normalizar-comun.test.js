// Utilidades comunes de los normalizadores (AM-05): lectura de propiedades propias y recorrido
// de colecciones externas con descartes y retirados (T5.1).
import { describe, expect, it, vi } from 'vitest';
import { FuenteError } from '../../../../src/server/fuentes/http-cliente.js';
import {
  MAX_FEATURES,
  elemento,
  idValido,
  propia,
  recorrerColeccion,
} from '../../../../src/server/fuentes/normalizar-comun.js';

describe('propia', () => {
  it('lee solo propiedades propias de objetos planos', () => {
    expect(propia({ a: 1 }, 'a')).toBe(1);
    expect(propia({ a: 1 }, 'toString')).toBeUndefined();
    expect(propia(JSON.parse('{"__proto__": {"x": 1}}'), 'x')).toBeUndefined();
  });

  it('devuelve undefined con null, primitivos y arrays', () => {
    expect(propia(null, 'a')).toBeUndefined();
    expect(propia('texto', 'length')).toBeUndefined();
    expect(propia([1, 2], '0')).toBeUndefined();
  });
});

describe('elemento', () => {
  it('devuelve el elemento si existe y undefined fuera de rango o sin array', () => {
    expect(elemento([10, 20], 1)).toBe(20);
    expect(elemento([10, 20], 2)).toBeUndefined();
    expect(elemento({ 0: 'x' }, 0)).toBeUndefined();
  });
});

describe('idValido', () => {
  it('acepta ids con el patrón de las fuentes y rechaza el resto', () => {
    expect(idValido('20261010_0000175')).toBe('20261010_0000175');
    expect(idValido('us6000u1e5')).toBe('us6000u1e5');
    expect(idValido('<script>')).toBeNull();
    expect(idValido('')).toBeNull();
    expect(idValido(42)).toBeNull();
  });
});

describe('recorrerColeccion', () => {
  const ok = (/** @type {unknown} */ f) => ({ ok: true, registro: f });

  it('null (204 de EMSC) es una colección vacía y no llama al normalizador', () => {
    const normalizar = vi.fn(ok);

    expect(recorrerColeccion(null, normalizar)).toEqual({
      registros: [],
      retirados: [],
      descartes: {},
    });
    expect(normalizar).not.toHaveBeenCalled();
  });

  it('lanza FuenteError FORMATO si no hay un array de features', () => {
    for (const datos of [{}, { features: 'x' }, [], 'texto', { features: { length: 1 } }]) {
      expect(() => recorrerColeccion(datos, ok)).toThrow(FuenteError);
    }
    /** @type {unknown} */
    let error = null;
    try {
      recorrerColeccion({ features: null }, ok);
    } catch (err) {
      error = err;
    }
    expect(/** @type {FuenteError} */ (error)?.codigo).toBe('FORMATO');
  });

  it('separa válidos, cuenta descartes por motivo y recoge los retirados', () => {
    const features = ['a', 'malo', 'b', 'retirado', 'malo'];
    const normalizar = (/** @type {string} */ f) => {
      if (f === 'malo') return { ok: false, motivo: 'magnitud' };
      if (f === 'retirado') return { ok: false, motivo: 'no-sismo', retirado: 'us1' };
      return ok(f);
    };

    const r = recorrerColeccion({ features }, normalizar);

    expect(r.registros).toEqual(['a', 'b']);
    expect(r.descartes).toEqual({ magnitud: 2, 'no-sismo': 1 });
    expect(r.retirados).toEqual(['us1']);
  });

  it('un descarte con retirado null no añade nada a retirados', () => {
    const r = recorrerColeccion({ features: [1] }, () => ({
      ok: false,
      motivo: 'id',
      retirado: null,
    }));

    expect(r.retirados).toEqual([]);
    expect(r.descartes).toEqual({ id: 1 });
  });

  it('procesa como máximo MAX_FEATURES y cuenta el exceso como «limite»', () => {
    const features = Array.from({ length: MAX_FEATURES + 3 }, (_, i) => i);
    const normalizar = vi.fn(ok);

    const r = recorrerColeccion({ features }, normalizar);

    expect(normalizar).toHaveBeenCalledTimes(MAX_FEATURES);
    expect(r.registros).toHaveLength(MAX_FEATURES);
    expect(r.descartes).toEqual({ limite: 3 });
  });
});
