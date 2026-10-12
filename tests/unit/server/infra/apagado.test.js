// Apagado ordenado (R-04, N-02): pasos, cierre del servidor, plazo y código de salida más alto.
import { describe, expect, it, vi } from 'vitest';
import { PLAZO_APAGADO_MS, createApagado } from '../../../../src/server/infra/apagado.js';

function montar() {
  /** @type {(() => void) | null} */
  let alCerrar = null;
  /** @type {{ fn: () => void, ms: number }[]} */
  const programados = [];
  const salir = vi.fn();
  const pasos = [vi.fn(), vi.fn()];
  const cerrarServidor = vi.fn((fn) => {
    alCerrar = fn;
  });
  const apagado = createApagado({
    pasos,
    cerrarServidor,
    salir,
    programar: (fn, ms) => programados.push({ fn, ms }),
  });
  return { apagado, salir, pasos, cerrarServidor, programados, cerrar: () => alCerrar?.() };
}

describe('apagado ordenado', () => {
  it('ejecuta los pasos, cierra el servidor y sale con el código pedido al cerrar', () => {
    const { apagado, salir, pasos, cerrarServidor, programados, cerrar } = montar();
    apagado.apagar(0);
    expect(apagado.apagando).toBe(true);
    for (const paso of pasos) expect(paso).toHaveBeenCalledTimes(1);
    expect(cerrarServidor).toHaveBeenCalledTimes(1);
    expect(programados).toHaveLength(1);
    expect(programados[0].ms).toBe(PLAZO_APAGADO_MS);
    expect(salir).not.toHaveBeenCalled();
    cerrar();
    expect(salir).toHaveBeenCalledWith(0);
  });

  it('si el servidor no cierra a tiempo, el plazo fuerza la salida', () => {
    const { apagado, salir, programados } = montar();
    apagado.apagar(1);
    programados[0].fn();
    expect(salir).toHaveBeenCalledWith(1);
  });

  it('un SIGTERM (0) durante el apagado por excepción (1) sale con 1 al momento (N-02)', () => {
    const { apagado, salir, pasos, cerrar } = montar();
    apagado.apagar(1);
    apagado.apagar(0);
    expect(salir).toHaveBeenCalledTimes(1);
    expect(salir).toHaveBeenLastCalledWith(1);
    // Los pasos no se repiten.
    expect(pasos[0]).toHaveBeenCalledTimes(1);
    // Si después cierra el servidor, tampoco baja el código.
    cerrar();
    expect(salir).toHaveBeenLastCalledWith(1);
    expect(apagado.codigo).toBe(1);
  });

  it('una excepción durante un apagado limpio eleva el código a 1 en todas las salidas', () => {
    const { apagado, salir, programados, cerrar } = montar();
    apagado.apagar(0);
    apagado.apagar(1);
    expect(salir).toHaveBeenLastCalledWith(1);
    cerrar();
    programados[0].fn();
    expect(salir.mock.calls.every(([c]) => c === 1)).toBe(true);
  });

  it('por defecto programa el plazo con un temporizador que no retiene el proceso', () => {
    vi.useFakeTimers();
    try {
      const salir = vi.fn();
      const apagado = createApagado({ pasos: [], cerrarServidor: () => {}, salir });
      apagado.apagar(1);
      vi.advanceTimersByTime(PLAZO_APAGADO_MS);
      expect(salir).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
