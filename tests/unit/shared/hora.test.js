import { describe, expect, it } from 'vitest';
import {
  etiquetaZona,
  haceTexto,
  horaCompleta,
  horaCorta,
  horaLista,
} from '../../../src/shared/hora.js';

const t = (iso) => Date.parse(iso);

describe('etiquetaZona', () => {
  it.each([
    ['Europe/Madrid', 'hora peninsular'],
    ['Africa/Ceuta', 'hora peninsular'],
    ['Atlantic/Canary', 'hora de Canarias'],
    ['America/Bogota', 'hora de Colombia'],
    ['America/Panama', 'hora de Panamá'],
  ])('%s → %s', (zona, texto) => {
    expect(etiquetaZona(zona)).toBe(texto);
  });

  it('una zona desconocida o no textual se muestra como UTC', () => {
    expect(etiquetaZona('Europe/Paris')).toBe('UTC');
    expect(etiquetaZona(undefined)).toBe('UTC');
    expect(etiquetaZona('__proto__')).toBe('UTC');
  });
});

describe('horaLista (HU-08, RNF-13)', () => {
  it('Canarias en verano: 12:00 UTC → 13:00 (hora de Canarias)', () => {
    const instante = t('2026-07-15T12:00:00Z');
    expect(horaLista(instante, 'Atlantic/Canary', instante + 60_000)).toBe(
      '13:00 (hora de Canarias)',
    );
  });

  it('Canarias en invierno: 12:00 UTC → 12:00', () => {
    const instante = t('2026-01-15T12:00:00Z');
    expect(horaLista(instante, 'Atlantic/Canary', instante)).toBe('12:00 (hora de Canarias)');
  });

  it('Península en invierno: 12:00 UTC → 13:00 (hora peninsular)', () => {
    const instante = t('2026-01-15T12:00:00Z');
    expect(horaLista(instante, 'Europe/Madrid', instante)).toBe('13:00 (hora peninsular)');
  });

  it('Península en verano: 12:00 UTC → 14:00', () => {
    const instante = t('2026-07-15T12:00:00Z');
    expect(horaLista(instante, 'Europe/Madrid', instante)).toBe('14:00 (hora peninsular)');
  });

  it('Ceuta sigue la hora peninsular', () => {
    const instante = t('2026-07-15T12:00:00Z');
    expect(horaLista(instante, 'Africa/Ceuta', instante)).toBe('14:00 (hora peninsular)');
  });

  it('Colombia y Panamá: 12:00 UTC → 07:00, sin horario de verano', () => {
    for (const iso of ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z']) {
      const instante = t(iso);
      expect(horaLista(instante, 'America/Bogota', instante)).toBe('07:00 (hora de Colombia)');
      expect(horaLista(instante, 'America/Panama', instante)).toBe('07:00 (hora de Panamá)');
    }
  });

  it('el cambio de hora de marzo en Madrid: antes y después de las 01:00 UTC', () => {
    expect(horaLista(t('2026-03-29T00:59:00Z'), 'Europe/Madrid', 0)).toBe(
      '01:59 (hora peninsular)',
    );
    expect(horaLista(t('2026-03-29T01:00:00Z'), 'Europe/Madrid', 0)).toBe(
      '03:00 (hora peninsular)',
    );
  });

  it('con 24 h o más añade el día y el mes, en la zona del sismo', () => {
    const instante = t('2026-10-07T20:15:00Z');
    const ahora = instante + 3 * 86_400_000;
    expect(horaLista(instante, 'Europe/Madrid', ahora)).toBe('07/10 22:15 (hora peninsular)');
    expect(horaLista(instante, 'America/Bogota', instante + 86_399_999)).toBe(
      '15:15 (hora de Colombia)',
    );
  });

  it('medianoche se escribe 00, no 24', () => {
    const instante = t('2026-01-14T23:30:00Z');
    expect(horaLista(instante, 'Europe/Madrid', instante)).toBe('00:30 (hora peninsular)');
  });
});

describe('horaCompleta y horaCorta', () => {
  it('fecha completa con segundos y zona', () => {
    expect(horaCompleta(t('2026-10-10T12:42:15Z'), 'America/Bogota')).toBe(
      '10/10/2026 07:42:15 (hora de Colombia)',
    );
  });

  it('hora corta sin zona', () => {
    expect(horaCorta(t('2026-10-10T12:42:15Z'), 'America/Panama')).toBe('07:42');
  });

  it.each([['Europe/Paris'], ['__proto__'], [null], [42]])(
    'zona desconocida o inválida (%s): hora UTC y lo dice (T5.1)',
    (zona) => {
      expect(horaCompleta(t('2026-10-10T12:42:15Z'), zona)).toBe('10/10/2026 12:42:15 (UTC)');
    },
  );
});

describe('haceTexto (textos.md §5)', () => {
  const ahora = t('2026-10-10T12:00:00Z');
  const min = 60_000;
  it.each([
    [0, 'hace instantes'],
    [59_999, 'hace instantes'],
    [min, 'hace 1 min'],
    [8 * min, 'hace 8 min'],
    [59 * min, 'hace 59 min'],
    [60 * min, 'hace 1 h'],
    [95 * min, 'hace 1 h 35 min'],
    [119 * min, 'hace 1 h 59 min'],
    [120 * min, 'hace 2 h'],
    [23 * 60 * min + 59 * min, 'hace 23 h 59 min'],
    [24 * 60 * min, 'hace 1 día'],
    [47 * 60 * min, 'hace 1 día'],
    [48 * 60 * min, 'hace 2 días'],
    [30 * 24 * 60 * min, 'hace 30 días'],
  ])('%i ms → %s', (edad, texto) => {
    expect(haceTexto(ahora - edad, ahora)).toBe(texto);
  });

  it('un instante futuro (reloj adelantado de la fuente) es «hace instantes»', () => {
    expect(haceTexto(ahora + 5 * min, ahora)).toBe('hace instantes');
  });
});
