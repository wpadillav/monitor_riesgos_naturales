import { describe, expect, it } from 'vitest';
import { createLog, escaparNoImprimibles } from '../../../src/server/infra/log.js';

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

describe('secuencias de control en el log (S-01, AM-29)', () => {
  // El caso del modelo de amenazas: ESC + CSI de 7 bits, salto de línea y CSI de 8 bits.
  const RUTA = '/a\x1b[2J\n\u009bX\u0085\u007f\u2028';

  it.each(['json', 'texto'])(
    'formato %s: sin ESC, sin C1, sin DEL y en una sola línea',
    (formato) => {
      const { log, lineas } = capturar({ formato });
      log.error('error', { ruta: RUTA });

      expect(lineas).toHaveLength(1);
      const linea = lineas[0];
      expect(linea.includes('\x1b')).toBe(false);
      expect(linea).not.toMatch(/[\u007f-\u009f\u2028\u2029]/);
      expect(linea.split('\n')).toHaveLength(2); // solo el salto final
      expect(linea).toContain('\\u009b');
      expect(linea).toContain('\\u001b');
    },
  );

  it('el JSON escapado se vuelve a leer con el valor original', () => {
    const { log, lineas } = capturar({ formato: 'json' });
    log.error('error', { ruta: RUTA });
    expect(JSON.parse(lineas[0]).ruta).toBe(RUTA);
  });

  it('escaparNoImprimibles deja intacto el texto normal', () => {
    expect(escaparNoImprimibles('Panamá ñ €')).toBe('Panamá ñ €');
    expect(escaparNoImprimibles('a\u0080b')).toBe('a\\u0080b');
  });
});
