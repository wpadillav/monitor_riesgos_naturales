// Máquina de estados de las fuentes (arquitectura §5.3, RNF-15).
import { describe, expect, it, vi } from 'vitest';
import { createEstadoFuentes } from '../../../../src/server/fuentes/estado-fuentes.js';

function crear() {
  let t = Date.parse('2026-10-10T06:00:00.000Z');
  const reloj = { ahora: () => t };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const estado = createEstadoFuentes({ canales: ['emsc-fdsn', 'usgs'], reloj, log });
  return { estado, log, avanzar: (ms) => (t += ms) };
}

describe('createEstadoFuentes', () => {
  it('empieza en «iniciando» con el formato del contrato', () => {
    const { estado } = crear();
    expect(estado.obtener()).toEqual([
      {
        fuente: 'emsc-fdsn',
        estado: 'iniciando',
        cambiadoEn: '2026-10-10T06:00:00.000Z',
        ultimoExitoEn: null,
        proximoIntentoEn: null,
        mensaje: null,
      },
      expect.objectContaining({ fuente: 'usgs', estado: 'iniciando' }),
    ]);
  });

  it('1 fallo → degradada; 2 seguidos → caida; un éxito → ok', () => {
    const { estado, log, avanzar } = crear();
    const cambios = [];
    estado.alCambiar((e) => cambios.push(`${e.fuente}:${e.estado}`));

    estado.registrarFallo('usgs', 'Tiempo de espera agotado', Date.parse('2026-10-10T06:00:05Z'));
    expect(estado.obtener()[1]).toMatchObject({
      estado: 'degradada',
      mensaje: 'Tiempo de espera agotado',
      proximoIntentoEn: '2026-10-10T06:00:05.000Z',
    });
    avanzar(5000);
    estado.registrarFallo('usgs', 'Respuesta HTTP no válida (503)', null);
    expect(estado.obtener()[1]).toMatchObject({
      estado: 'caida',
      cambiadoEn: '2026-10-10T06:00:05.000Z',
    });
    estado.registrarFallo('usgs', 'Error de red', null);
    avanzar(1000);
    estado.registrarExito('usgs');
    expect(estado.obtener()[1]).toMatchObject({
      estado: 'ok',
      mensaje: null,
      ultimoExitoEn: '2026-10-10T06:00:06.000Z',
      proximoIntentoEn: null,
    });

    expect(cambios).toEqual(['usgs:degradada', 'usgs:caida', 'usgs:ok']);
    // Una línea por cambio de estado (RNF-15), no por fallo.
    expect(log.warn).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith('fuente.estado', {
      fuente: 'usgs',
      de: 'degradada',
      a: 'caida',
      motivo: 'Respuesta HTTP no válida (503)',
    });
    expect(log.info).toHaveBeenCalledWith(
      'fuente.estado',
      expect.objectContaining({ de: 'caida', a: 'ok' }),
    );
  });

  it('un éxito intermedio reinicia la cuenta de fallos seguidos', () => {
    const { estado } = crear();
    estado.registrarFallo('emsc-fdsn', 'x', null);
    estado.registrarExito('emsc-fdsn');
    estado.registrarFallo('emsc-fdsn', 'x', null);
    expect(estado.obtener()[0].estado).toBe('degradada');
  });

  it('ignora canales no registrados y permite registrar emsc-ws (T4.6)', () => {
    const { estado } = crear();
    estado.registrarExito('emsc-ws');
    expect(estado.obtener()).toHaveLength(2);
    estado.registrarCanal('emsc-ws');
    expect(estado.obtener().map((e) => e.fuente)).toEqual(['emsc-fdsn', 'usgs', 'emsc-ws']);
  });

  it('registrarEstado fija el estado sin contar fallos (WebSocket, T4.6)', () => {
    const { estado } = crear();
    const cambios = [];
    estado.alCambiar((e) => cambios.push(e.estado));

    estado.registrarEstado(
      'usgs',
      'degradada',
      'Conexión cerrada',
      Date.parse('2026-10-10T06:00:01Z'),
    );
    estado.registrarEstado('usgs', 'degradada', 'Otra vez', Date.parse('2026-10-10T06:00:03Z'));
    expect(estado.obtener()[1]).toMatchObject({
      estado: 'degradada',
      mensaje: 'Otra vez',
      proximoIntentoEn: '2026-10-10T06:00:03.000Z',
    });
    estado.registrarEstado('usgs', 'caida', 'Sin conexión', null);
    estado.registrarEstado('emsc-ws', 'caida', 'no registrado', null);

    expect(cambios).toEqual(['degradada', 'caida']);
  });

  it('la suscripción se puede cancelar', () => {
    const { estado } = crear();
    const oyente = vi.fn();
    const cancelar = estado.alCambiar(oyente);
    cancelar();
    estado.registrarExito('usgs');
    expect(oyente).not.toHaveBeenCalled();
  });
});
