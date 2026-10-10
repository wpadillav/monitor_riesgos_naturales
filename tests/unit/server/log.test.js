import { describe, expect, it } from 'vitest';
import { createLog } from '../../../src/server/infra/log.js';

function capturar(opciones) {
  const lineas = [];
  const log = createLog({
    ...opciones,
    version: '2.0.0',
    ahora: () => Date.parse('2026-10-10T06:00:00.000Z'),
    salida: { write: (l) => lineas.push(l) },
  });
  return { log, lineas };
}

describe('createLog', () => {
  it('formato json: una línea JSON por evento con los campos comunes', () => {
    const { log, lineas } = capturar({ formato: 'json' });
    log.info('servidor.escuchando', { puerto: 3000 });

    expect(lineas).toHaveLength(1);
    expect(JSON.parse(lineas[0])).toEqual({
      ts: '2026-10-10T06:00:00.000Z',
      nivel: 'info',
      evento: 'servidor.escuchando',
      version: '2.0.0',
      puerto: 3000,
    });
  });

  it('formato texto: legible y con los valores entrecomillados', () => {
    const { log, lineas } = capturar({ formato: 'texto' });
    log.warn('http.rechazo', { status: 421, ruta: 'a b', nada: undefined });

    expect(lineas).toEqual(['2026-10-10T06:00:00.000Z WARN http.rechazo status=421 ruta="a b"\n']);
  });

  it('filtra por nivel', () => {
    const { log, lineas } = capturar({ nivel: 'warn' });
    log.info('x');
    log.debug('y');
    log.error('z');

    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toContain('ERROR z');
  });
});
