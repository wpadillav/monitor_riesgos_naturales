// Métricas de latencia y resumen horario (RNF-02, RNF-15).
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_MUESTRAS,
  createMetricasLatencia,
  percentil,
} from '../../../../src/server/infra/metricas-latencia.js';

describe('percentil (rango más cercano)', () => {
  it('calcula p50 y p95', () => {
    const datos = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentil(datos, 50)).toBe(50);
    expect(percentil(datos, 95)).toBe(95);
    expect(percentil([7], 95)).toBe(7);
    expect(percentil([], 50)).toBeNull();
  });
});

describe('createMetricasLatencia', () => {
  it('resume por fuente y canal, vacía las muestras y sigue informando con n=0', () => {
    const log = { info: vi.fn() };
    const m = createMetricasLatencia({ log });
    for (let i = 1; i <= 20; i += 1) {
      m.registrar({
        fuente: 'emsc',
        canal: 'fdsn',
        publicacionARecepcionMs: i * 1000,
        origenARecepcionMs: i * 10_000,
      });
    }
    m.registrar({
      fuente: 'usgs',
      canal: 'fdsn',
      publicacionARecepcionMs: 40_000,
      origenARecepcionMs: 900_000,
    });

    m.resumir();
    expect(log.info).toHaveBeenCalledWith('latencia.resumen', {
      fuente: 'emsc',
      canal: 'fdsn',
      n: 20,
      publicacionARecepcionP50Ms: 10_000,
      publicacionARecepcionP95Ms: 19_000,
      origenARecepcionP50Ms: 100_000,
      origenARecepcionP95Ms: 190_000,
    });
    expect(log.info).toHaveBeenCalledWith(
      'latencia.resumen',
      expect.objectContaining({ fuente: 'usgs', n: 1, publicacionARecepcionP95Ms: 40_000 }),
    );

    log.info.mockClear();
    m.resumir();
    expect(log.info).toHaveBeenCalledWith(
      'latencia.resumen',
      expect.objectContaining({ fuente: 'emsc', n: 0, publicacionARecepcionP50Ms: null }),
    );
  });

  it('acota las muestras por hora (memoria)', () => {
    const log = { info: vi.fn() };
    const m = createMetricasLatencia({ log });
    for (let i = 0; i < MAX_MUESTRAS + 10; i += 1) {
      m.registrar({
        fuente: 'emsc',
        canal: 'fdsn',
        publicacionARecepcionMs: 1,
        origenARecepcionMs: 1,
      });
    }
    m.resumir();
    expect(log.info.mock.calls[0][1].n).toBe(MAX_MUESTRAS);
  });
});
