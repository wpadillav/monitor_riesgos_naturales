// Retención del catálogo (arquitectura §5.5; AM-16): purga periódica con reloj inyectado (T5.1).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INTERVALO_PURGA_MS, createRetencion } from '../../../../src/server/dominio/retencion.js';

const AHORA = Date.parse('2026-10-10T12:00:00.000Z');

function crear({ purgados = 0, intervaloMs } = {}) {
  const catalogo = { purgar: vi.fn(() => purgados) };
  const reloj = { ahora: vi.fn(() => AHORA) };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const retencion = createRetencion({ catalogo, reloj, log, intervaloMs });
  return { retencion, catalogo, reloj, log };
}

describe('createRetencion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('purga cada 60 s por defecto', () => {
    expect(INTERVALO_PURGA_MS).toBe(60_000);
  });

  it('purgarAhora pide al catálogo purgar con la hora del reloj y devuelve los purgados', () => {
    const { retencion, catalogo, log } = crear({ purgados: 3 });

    const purgados = retencion.purgarAhora();

    expect(purgados).toBe(3);
    expect(catalogo.purgar).toHaveBeenCalledWith(AHORA);
    expect(log.info).toHaveBeenCalledWith('retencion.purga', { purgados: 3 });
  });

  it('no escribe en el log si no hay nada que purgar', () => {
    const { retencion, log } = crear({ purgados: 0 });

    expect(retencion.purgarAhora()).toBe(0);
    expect(log.info).not.toHaveBeenCalled();
  });

  it('arrancar purga en cada intervalo y detener lo para', () => {
    const { retencion, catalogo } = crear({ intervaloMs: 1_000 });

    retencion.arrancar();
    vi.advanceTimersByTime(999);
    expect(catalogo.purgar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(catalogo.purgar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    expect(catalogo.purgar).toHaveBeenCalledTimes(3);

    retencion.detener();
    vi.advanceTimersByTime(10_000);
    expect(catalogo.purgar).toHaveBeenCalledTimes(3);
  });

  it('arrancar dos veces no duplica el temporizador', () => {
    const { retencion, catalogo } = crear();

    retencion.arrancar();
    retencion.arrancar();
    vi.advanceTimersByTime(INTERVALO_PURGA_MS);

    expect(catalogo.purgar).toHaveBeenCalledTimes(1);
    retencion.detener();
  });

  it('detener sin haber arrancado no falla y permite arrancar después', () => {
    const { retencion, catalogo } = crear();

    expect(() => retencion.detener()).not.toThrow();
    retencion.arrancar();
    vi.advanceTimersByTime(INTERVALO_PURGA_MS);

    expect(catalogo.purgar).toHaveBeenCalledTimes(1);
    retencion.detener();
  });
});
