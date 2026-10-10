// Reglas de aviso (notificable con la ventana de 1 h y avisoMin con redondeo D1) y cobertura.
import { describe, expect, it } from 'vitest';
import {
  alcanzaAviso,
  esNotificable,
  redondear1,
} from '../../../../src/server/dominio/aviso.js';
import { createCobertura, cubre, minimaMagnitud } from '../../../../src/server/dominio/cobertura.js';

const AHORA = Date.parse('2026-10-10T07:00:00.000Z');
const hace = (min) => new Date(AHORA - min * 60_000).toISOString();

describe('esNotificable (ADR-0004, PRD E4)', () => {
  it.each([
    [0, true],
    [30, true],
    [60, true],
    [60.0001, false],
    [61, false],
    [30 * 60, false],
  ])('origen hace %s min → %s (ventana de 60 min)', (min, esperado) => {
    expect(esNotificable({ tiempo: hace(min) }, AHORA)).toBe(esperado);
  });

  it('respeta una ventana configurada (AVISO_VENTANA_MIN)', () => {
    expect(esNotificable({ tiempo: hace(90) }, AHORA, 120)).toBe(true);
    expect(esNotificable({ tiempo: hace(10) }, AHORA, 5)).toBe(false);
  });

  it('una hora de origen algo futura (reloj de la fuente) es notificable', () => {
    expect(esNotificable({ tiempo: AHORA + 30_000 }, AHORA)).toBe(true);
  });

  it('un tiempo inválido no es notificable', () => {
    expect(esNotificable({ tiempo: 'ayer' }, AHORA)).toBe(false);
  });

  it('el alta tardía de EMSC (30 h) no es notificable', () => {
    expect(esNotificable({ tiempo: hace(30 * 60) }, AHORA)).toBe(false);
  });
});

describe('alcanzaAviso (D1, D4) con umbral 4.5', () => {
  it.each([
    [4.5, true],
    [4.46, true],
    [4.45, true],
    [4.44, false],
    [4.4, false],
    [5.2, true],
  ])('magnitud %s → %s', (magnitud, esperado) => {
    expect(alcanzaAviso(magnitud, 4.5)).toBe(esperado);
  });

  it('4.5 exacto alcanza el umbral 4.5 (límite incluido)', () => {
    expect(alcanzaAviso(4.5, 4.5)).toBe(true);
  });

  it('sin umbral no avisa nunca', () => {
    expect(alcanzaAviso(9, null)).toBe(false);
  });

  it.each([
    [4.46, 4.5],
    [4.44, 4.4],
    [4.45, 4.5],
    [4.35, 4.4],
    [2.05, 2.1],
    [-0.15, -0.1],
  ])('redondear1(%s) = %s', (m, r) => {
    expect(redondear1(m)).toBe(r);
  });
});

describe('cobertura (arquitectura §5.6)', () => {
  it.each([
    [undefined, 2, false],
    [2, 2, true],
    [2, 3, true],
    [2, 1, false],
    [2, null, false],
    [null, null, true],
    [null, 1, true],
  ])('cargada %j cubre pedida %j → %s', (cargada, pedida, esperado) => {
    expect(cubre(cargada, pedida)).toBe(esperado);
  });

  it('minimaMagnitud trata null como todas', () => {
    expect(minimaMagnitud(2, 1)).toBe(1);
    expect(minimaMagnitud(null, 1)).toBeNull();
  });

  it('solo baja, nunca sube, y es por canal y zona', () => {
    const c = createCobertura();
    c.registrar('usgs', 'PA', 2);
    c.registrar('usgs', 'PA', 4);
    expect(c.obtener('usgs', 'PA')).toBe(2);
    c.registrar('usgs', 'PA', 1);
    expect(c.cubre('usgs', 'PA', 1)).toBe(true);
    expect(c.cubre('emsc-fdsn', 'PA', 4)).toBe(false);
    c.registrar('usgs', 'PA', null);
    expect(c.cubre('usgs', 'PA', null)).toBe(true);
  });
});
