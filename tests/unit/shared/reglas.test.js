// Reglas comunes del contrato (R-01, R-02, R-06): opciones, redondeo, id de evento y los
// predicados de lista, aviso y stream con la franja CO-PA.
import { describe, expect, it } from 'vitest';
import {
  AVISO_MIN_POR_DEFECTO,
  MAG_MIN_POR_DEFECTO,
  MAG_MIN_TODAS,
  MAX_ID_EVENTO,
  OPCIONES_AVISO_MIN,
  OPCIONES_MAG_MIN,
  PATRON_ID_EVENTO,
  PERIODOS,
  PERIODOS_MS,
  PERIODO_POR_DEFECTO,
  alcanzaAviso,
  algunPaisMarcado,
  cumpleFiltroAviso,
  cumpleFiltroLista,
  cumpleFiltroStream,
  cumpleMagMin,
  cumplePeriodo,
  esIdEvento,
  paisesDelSismo,
  redondear1,
} from '../../../src/shared/reglas.js';

const AHORA = Date.parse('2026-10-10T07:00:00.000Z');
const hace = (min) => new Date(AHORA - min * 60_000).toISOString();

/** Sismo mínimo; por defecto en Panamá, hace 10 min. */
const sismo = (over = {}) => ({ pais: 'PA', magnitud: 4.0, tiempo: hace(10), ...over });
/** El de la revisión T5.2: 9.5, −77.1 → PA con candidatos CO y PA. */
const franja = (over = {}) => sismo({ paisesCandidatos: ['CO', 'PA'], ...over });

describe('constantes del contrato', () => {
  it('opciones de magnitud, periodos y umbrales', () => {
    expect(OPCIONES_MAG_MIN).toEqual(['1.0', '2.0', '2.5', '3.0', '4.0', '4.5', '5.0']);
    expect(MAG_MIN_TODAS).toBe('todas');
    expect(MAG_MIN_POR_DEFECTO).toBe('2.0');
    expect(PERIODOS).toEqual(['1h', '24h', '7d', '30d']);
    expect(PERIODOS_MS['30d']).toBe(30 * 86_400_000);
    expect(PERIODO_POR_DEFECTO).toBe('24h');
    expect(OPCIONES_AVISO_MIN).toEqual(['4.0', '4.5', '5.0', '5.5', '6.0']);
    expect(AVISO_MIN_POR_DEFECTO).toBe('4.5');
    expect(Object.isFrozen(OPCIONES_MAG_MIN) && Object.isFrozen(PERIODOS_MS)).toBe(true);
  });

  it.each([
    ['lx3k9a-41', true],
    [`${'a'.repeat(16)}-${'1'.repeat(15)}`, true],
    ['LX3K9A-41', false],
    ['lx3k9a', false],
    ['lx3k9a-', false],
    [`${'a'.repeat(17)}-1`, false],
    [`${'a'.repeat(40)}-1`, false],
    [41, false],
    [null, false],
  ])('esIdEvento(%j) = %s', (id, esperado) => {
    expect(esIdEvento(id)).toBe(esperado);
  });

  it('PATRON_ID_EVENTO captura arranque y secuencia; el máximo es 32', () => {
    expect(PATRON_ID_EVENTO.exec('lx3k9a-41')?.slice(1)).toEqual(['lx3k9a', '41']);
    expect(MAX_ID_EVENTO).toBe(32);
  });
});

describe('redondear1 (D1)', () => {
  it.each([
    [4.46, 4.5],
    [4.44, 4.4],
    [4.45, 4.5],
    [4.35, 4.4],
    [4.96, 5.0],
  ])('%s → %s', (m, r) => {
    expect(redondear1(m)).toBe(r);
  });
});

describe('países (HU-03, ADR-0005)', () => {
  it('sin paisesCandidatos (o vacío) cuenta solo el país asignado', () => {
    expect(paisesDelSismo(sismo())).toEqual(['PA']);
    expect(paisesDelSismo(sismo({ paisesCandidatos: [] }))).toEqual(['PA']);
    expect(paisesDelSismo(franja())).toEqual(['CO', 'PA']);
  });

  it('un sismo de la franja cuenta para cualquiera de los dos', () => {
    expect(algunPaisMarcado(franja(), ['CO'])).toBe(true);
    expect(algunPaisMarcado(franja(), ['PA'])).toBe(true);
    expect(algunPaisMarcado(franja(), ['ES'])).toBe(false);
    expect(algunPaisMarcado(sismo(), ['CO'])).toBe(false);
  });
});

describe('cumpleFiltroLista: magnitud cruda (R-02)', () => {
  const filtro = { paises: ['PA'], magMin: 5.0, periodo: '24h' };

  it('un M 4.96 no entra con magMin 5.0 aunque se muestre «5.0»', () => {
    expect(cumpleFiltroLista(sismo({ magnitud: 4.96 }), filtro, AHORA)).toBe(false);
    expect(cumpleFiltroLista(sismo({ magnitud: 5.0 }), filtro, AHORA)).toBe(true);
  });

  it('«todas» (null) admite cualquier magnitud', () => {
    expect(cumpleMagMin(-1, null)).toBe(true);
    expect(cumpleFiltroLista(sismo({ magnitud: 0.1 }), { ...filtro, magMin: null }, AHORA)).toBe(
      true,
    );
  });

  it('aplica el periodo, en ISO o en ms, y rechaza tiempos inválidos', () => {
    expect(cumplePeriodo(hace(59), '1h', AHORA)).toBe(true);
    expect(cumplePeriodo(AHORA - 3_600_001, '1h', AHORA)).toBe(false);
    expect(cumplePeriodo('ayer', '30d', AHORA)).toBe(false);
    expect(cumpleFiltroLista(sismo({ magnitud: 6, tiempo: hace(25 * 60) }), filtro, AHORA)).toBe(
      false,
    );
  });

  it('con solo Colombia marcada, el sismo de la franja (PA asignado) entra (R-01)', () => {
    const co = { paises: ['CO'], magMin: 2.0, periodo: '24h' };
    expect(cumpleFiltroLista(franja(), co, AHORA)).toBe(true);
    expect(cumpleFiltroLista(sismo(), co, AHORA)).toBe(false);
  });
});

describe('cumpleFiltroAviso: magnitud redondeada (D1)', () => {
  const filtro = { paises: ['CO'], avisoMin: 4.5 };

  it('4.46 avisa con 4.5; 4.44 no', () => {
    expect(cumpleFiltroAviso(franja({ magnitud: 4.46 }), true, filtro)).toBe(true);
    expect(cumpleFiltroAviso(franja({ magnitud: 4.44 }), true, filtro)).toBe(false);
  });

  it('exige notificable y algún país marcado', () => {
    expect(cumpleFiltroAviso(franja({ magnitud: 6 }), false, filtro)).toBe(false);
    expect(cumpleFiltroAviso(sismo({ magnitud: 6 }), true, filtro)).toBe(false);
  });

  it('sin umbral o con magnitud no finita, nunca', () => {
    expect(alcanzaAviso(9, null)).toBe(false);
    expect(alcanzaAviso(Number.NaN, 4)).toBe(false);
    expect(cumpleFiltroAviso(franja({ magnitud: 9 }), true, { ...filtro, avisoMin: null })).toBe(
      false,
    );
  });
});

describe('cumpleFiltroStream (arquitectura §5.7, D4)', () => {
  const filtro = { paises: ['CO'], magMin: 5.0, periodo: '1h', avisoMin: 4.5 };

  it('lista o aviso, siempre con país marcado', () => {
    expect(cumpleFiltroStream(franja({ magnitud: 5.1 }), filtro, AHORA)).toBe(true);
    // No cumple la lista (4.6 < 5.0), pero sí el aviso redondeado.
    expect(cumpleFiltroStream(franja({ magnitud: 4.46, tiempo: hace(300) }), filtro, AHORA)).toBe(
      true,
    );
    expect(cumpleFiltroStream(franja({ magnitud: 4.44 }), filtro, AHORA)).toBe(false);
    expect(cumpleFiltroStream(sismo({ magnitud: 7 }), filtro, AHORA)).toBe(false);
  });
});
