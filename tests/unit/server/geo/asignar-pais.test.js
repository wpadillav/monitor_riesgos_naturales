// Adaptador de asignación de país del servidor: caché LRU por posición (P-02).
import { describe, expect, it, vi } from 'vitest';
import {
  CACHE_POSICIONES,
  asignarPais,
  asignarPaisSinCache,
  conCache,
} from '../../../../src/server/geo/asignar-pais.js';

describe('conCache (P-02)', () => {
  it('llama una sola vez por posición y devuelve el mismo objeto', () => {
    const base = vi.fn((lat, lon) => (lat > 0 ? Object.freeze({ lat, lon }) : null));
    const asignar = conCache(base, 3);
    const a = asignar(1, 2);
    expect(asignar(1, 2)).toBe(a);
    expect(asignar(-1, 2)).toBeNull();
    expect(asignar(-1, 2)).toBeNull();
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('descarta la posición usada hace más tiempo al llenarse', () => {
    const base = vi.fn((lat, lon) => ({ lat, lon }));
    const asignar = conCache(base, 2);
    asignar(1, 1);
    asignar(2, 2);
    asignar(1, 1); // (1,1) pasa a ser la más reciente
    asignar(3, 3); // sale (2,2)
    expect(asignar.tamano()).toBe(2);
    asignar(1, 1);
    expect(base).toHaveBeenCalledTimes(3);
    asignar(2, 2);
    expect(base).toHaveBeenCalledTimes(4);
  });

  it('el asignador del servidor da lo mismo con y sin caché, y está acotado', () => {
    for (const [lat, lon] of [
      [9.5, -77.1],
      [40.4, -3.7],
      [15.83, -80.04],
    ]) {
      expect(asignarPais(lat, lon)).toEqual(asignarPaisSinCache(lat, lon));
    }
    expect(CACHE_POSICIONES).toBe(10_000);
  });
});
