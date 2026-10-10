import { describe, expect, it } from 'vitest';
import { ConfigError, checkProcess, loadConfig } from '../../../src/server/config.js';

describe('loadConfig', () => {
  it('usa 127.0.0.1:3000 por defecto', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      host: '127.0.0.1',
      logFormato: 'texto',
      logNivel: 'info',
      umbralesDedup: { dtS: 30, ddKm: 100, dm: 1.0 },
      ingestaMagMin: 2.0,
      emscIntervaloMs: 30_000,
      usgsIntervaloMs: 60_000,
      fuenteTimeoutMs: 10_000,
      retencionDias: 30,
      fuentesActivas: true,
      avisoVentanaMin: 60,
      sseMaxClientes: 8,
    });
  });

  it('lee los umbrales de duplicados (ADR-0004) y la ingesta', () => {
    expect(
      loadConfig({
        DEDUP_DT_S: '45',
        DEDUP_DD_KM: '80.5',
        DEDUP_DM: '1.2',
        INGESTA_MAG_MIN: 'todas',
        EMSC_FDSN_INTERVALO_S: '45',
        USGS_INTERVALO_S: '120',
        FUENTE_TIMEOUT_MS: '8000',
        RETENCION_DIAS: '7',
        FUENTES_ACTIVAS: 'no',
      }),
    ).toMatchObject({
      umbralesDedup: { dtS: 45, ddKm: 80.5, dm: 1.2 },
      ingestaMagMin: null,
      emscIntervaloMs: 45_000,
      usgsIntervaloMs: 120_000,
      fuenteTimeoutMs: 8000,
      retencionDias: 7,
      fuentesActivas: false,
    });
  });

  it.each([
    ['DEDUP_DT_S', '0', /DEDUP_DT_S debe ser un número mayor que 0/],
    ['DEDUP_DT_S', '-5', /DEDUP_DT_S/],
    ['DEDUP_DD_KM', 'cien', /DEDUP_DD_KM/],
    ['DEDUP_DD_KM', '5000', /DEDUP_DD_KM .*1000/],
    ['DEDUP_DM', '1e3', /DEDUP_DM/],
    ['DEDUP_DM', '6', /DEDUP_DM/],
    ['INGESTA_MAG_MIN', '2', /INGESTA_MAG_MIN/],
    ['EMSC_FDSN_INTERVALO_S', '10', /EMSC_FDSN_INTERVALO_S .*RNF-10/],
    ['USGS_INTERVALO_S', '30', /USGS_INTERVALO_S .*RNF-10/],
    ['FUENTE_TIMEOUT_MS', '60000', /FUENTE_TIMEOUT_MS/],
    ['RETENCION_DIAS', '31', /RETENCION_DIAS/],
    ['FUENTES_ACTIVAS', 'false', /FUENTES_ACTIVAS/],
    ['AVISO_VENTANA_MIN', '4', /AVISO_VENTANA_MIN .*5 a 1440/],
    ['AVISO_VENTANA_MIN', '1441', /AVISO_VENTANA_MIN/],
    ['AVISO_VENTANA_MIN', '60.5', /AVISO_VENTANA_MIN/],
    ['SSE_MAX_CLIENTES', '0', /SSE_MAX_CLIENTES .*AM-13/],
    ['SSE_MAX_CLIENTES', '17', /SSE_MAX_CLIENTES/],
  ])('rechaza %s=%s', (variable, valor, mensaje) => {
    expect(() => loadConfig({ [variable]: valor })).toThrow(mensaje);
  });

  it('lee AVISO_VENTANA_MIN (PRD E4) y SSE_MAX_CLIENTES (AM-13)', () => {
    expect(loadConfig({ AVISO_VENTANA_MIN: '120', SSE_MAX_CLIENTES: '16' })).toMatchObject({
      avisoVentanaMin: 120,
      sseMaxClientes: 16,
    });
    expect(loadConfig({ AVISO_VENTANA_MIN: '5', SSE_MAX_CLIENTES: '1' })).toMatchObject({
      avisoVentanaMin: 5,
      sseMaxClientes: 1,
    });
  });

  it('admite PORT=3100 y HOST=::1', () => {
    expect(loadConfig({ PORT: '3100', HOST: '::1' })).toMatchObject({ port: 3100, host: '::1' });
  });

  it.each(['0.0.0.0', '::', '192.168.1.10', 'localhost', 'evil.test', '127.0.0.2'])(
    'rechaza HOST=%s, que no es loopback (AM-09, RNF-09)',
    (host) => {
      expect(() => loadConfig({ HOST: host })).toThrow(ConfigError);
      expect(() => loadConfig({ HOST: host })).toThrow(/HOST solo admite 127\.0\.0\.1 o ::1/);
    },
  );

  it.each(['80', '1023', '65536', 'abc', '3000x', '-1', '3e3'])('rechaza PORT=%s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT debe ser un entero entre 1024 y 65535/);
  });

  it('rechaza LOG_FORMATO y LOG_NIVEL desconocidos y acumula los errores', () => {
    try {
      loadConfig({ LOG_FORMATO: 'xml', LOG_NIVEL: 'trace', HOST: '0.0.0.0' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect(err.errores).toHaveLength(3);
    }
  });
});

describe('checkProcess', () => {
  it('no arranca como root (AM-31)', () => {
    expect(checkProcess({ env: {}, uid: 0 })).toEqual([expect.stringMatching(/root/)]);
  });

  it('no arranca con NODE_TLS_REJECT_UNAUTHORIZED=0 (AM-06)', () => {
    expect(checkProcess({ env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' }, uid: 1000 })).toHaveLength(1);
  });

  it('arranca con un usuario normal', () => {
    expect(checkProcess({ env: {}, uid: 1000 })).toEqual([]);
  });
});
