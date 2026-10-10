// Planificador: carga inicial, ciclos escalonados con updatedafter, espera creciente,
// Retry-After, estados y cobertura single-flight (arquitectura §5.3 y §5.6; AM-03, AM-18).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalogo } from '../../../../src/server/dominio/catalogo.js';
import { createCobertura } from '../../../../src/server/dominio/cobertura.js';
import { createEstadoFuentes } from '../../../../src/server/fuentes/estado-fuentes.js';
import { FuenteError } from '../../../../src/server/fuentes/http-cliente.js';
import {
  ESPERAS_REINTENTO_MS,
  SOLAPE_MS,
  createLimitadorDescartes,
  createPlanificador,
} from '../../../../src/server/fuentes/planificador.js';
import { crearRegistro } from '../../../../src/shared/modelo.js';
import { ZONAS } from '../../../../src/shared/zonas.js';

const INICIO = Date.parse('2026-10-10T12:00:00.000Z');
const ZONAS_CONSULTA = ZONAS.map((z) => ({ id: z.id, rectangulo: z.rectangulo }));
const UBICACION = { pais: 'PA', zona: 'PA', zonaHoraria: 'America/Panama', paisesCandidatos: ['PA'] };

let secuencia = 0;
/** Registro normalizado de una fuente, con tiempos relativos a «ahora». */
function registro(fuente, { origenHaceMs = 60_000, publicadoHaceMs = 20_000, id } = {}) {
  const ahora = Date.now();
  secuencia += 1;
  const r = crearRegistro(
    {
      fuente,
      idFuente: id ?? `${fuente}${secuencia}`,
      tiempo: ahora - origenHaceMs,
      actualizadoEn: ahora - publicadoHaceMs,
      lat: 7.7 + secuencia * 0.01,
      lon: -81.3,
      profundidadKm: 10,
      magnitud: 2 + (secuencia % 30) / 10,
      magnitudTipo: 'ml',
      autor: fuente === 'emsc' ? 'IGC' : 'US',
      lugar: 'PANAMA',
    },
    ahora,
  );
  if (!r.ok) throw new Error(r.motivo);
  return r.registro;
}

/**
 * Adaptador simulado: `respuesta(params, n)` decide qué devuelve la llamada n (por zona y
 * total). Por defecto, vacío.
 */
function adaptador(canal, fuente, respuesta = () => ({ registros: [] })) {
  const llamadas = [];
  const consultar = vi.fn(async (params, opciones) => {
    const zona = ZONAS_CONSULTA.find((z) => z.rectangulo === params.rectangulo)?.id;
    const llamada = { zona, params, opciones, en: Date.now() };
    llamadas.push(llamada);
    const r = await respuesta(llamada, llamadas.length);
    return {
      registros: r.registros ?? [],
      retirados: r.retirados ?? [],
      descartes: r.descartes ?? {},
      recibidoEn: Date.now(),
    };
  });
  return { canal, fuente, construirUrl: () => '', consultar, llamadas };
}

function montar({ emsc, usgs, magInicial = 2.0, limiteCoberturaMs } = {}) {
  const reloj = { ahora: () => Date.now() };
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const metricas = { registrar: vi.fn() };
  const catalogo = createCatalogo({ asignarPais: () => UBICACION, log });
  const estado = createEstadoFuentes({ canales: ['emsc-fdsn', 'usgs'], reloj, log });
  const a = {
    emsc: emsc ?? adaptador('emsc-fdsn', 'emsc'),
    usgs: usgs ?? adaptador('usgs', 'usgs'),
  };
  const planificador = createPlanificador({
    fuentes: [
      { adaptador: a.emsc, intervaloMs: 30_000, escalonMs: 6_000 },
      { adaptador: a.usgs, intervaloMs: 60_000, escalonMs: 12_000 },
    ],
    zonas: ZONAS_CONSULTA,
    catalogo,
    cobertura: createCobertura(),
    estado,
    reloj,
    log,
    metricas,
    magInicial,
    ...(limiteCoberturaMs ? { limiteCoberturaMs } : {}),
  });
  return { planificador, catalogo, estado, log, metricas, ...a };
}

/** Llamadas de un adaptador con `actualizadoDesde` (ciclos) en una ventana de tiempo. */
const ciclosEntre = (a, desde, hasta) =>
  a.llamadas.filter((l) => l.params.actualizadoDesde !== null && l.en >= desde && l.en < hasta);

beforeEach(() => {
  vi.useFakeTimers({ now: INICIO });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('carga inicial', () => {
  it('pide 30 días de las 5 zonas a cada fuente con M ≥ 2.0 y sin updatedafter', async () => {
    const { planificador, emsc, usgs, estado, log } = montar();

    await planificador.arrancar();

    for (const a of [emsc, usgs]) {
      expect(a.llamadas.map((l) => l.zona).sort()).toEqual([...ZONAS.map((z) => z.id)].sort());
      for (const l of a.llamadas) {
        expect(l.params).toMatchObject({
          magMin: 2,
          desde: INICIO - 30 * 86_400_000,
          actualizadoDesde: null,
        });
      }
    }
    expect(estado.obtener().map((e) => e.estado)).toEqual(['ok', 'ok']);
    expect(log.info).toHaveBeenCalledWith(
      'carga.inicial',
      expect.objectContaining({ sismos: 0, fallos: 0 }),
    );
    planificador.detener();
  });

  it('como máximo 2 peticiones a la vez por fuente', async () => {
    let activas = 0;
    let maximo = 0;
    const lenta = adaptador('emsc-fdsn', 'emsc', async () => {
      activas += 1;
      maximo = Math.max(maximo, activas);
      await new Promise((ok) => setTimeout(ok, 100));
      activas -= 1;
      return { registros: [] };
    });
    const { planificador } = montar({ emsc: lenta });

    const carga = planificador.arrancar();
    await vi.advanceTimersByTimeAsync(1000);
    await carga;

    expect(maximo).toBe(2);
    planificador.detener();
  });

  it('los sismos de la carga no cuentan para las latencias ni se registran en info', async () => {
    const emsc = adaptador('emsc-fdsn', 'emsc', ({ zona }) => ({
      registros: zona === 'PA' ? [registro('emsc', { origenHaceMs: 5 * 86_400_000 })] : [],
    }));
    const { planificador, log, metricas, catalogo } = montar({ emsc });

    await planificador.arrancar();

    expect(catalogo.contar()).toBe(1);
    expect(metricas.registrar).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalledWith('sismo.recibido', expect.anything());
    expect(log.debug).toHaveBeenCalledWith(
      'sismo.recibido',
      expect.objectContaining({ modo: 'carga', accion: 'alta', zona: 'PA' }),
    );
    planificador.detener();
  });
});

describe('ciclos escalonados (RNF-10)', () => {
  it('EMSC ≤ 10 y USGS ≤ 5 peticiones por minuto, una zona cada 6 s y 12 s', async () => {
    const { planificador, emsc, usgs } = montar();
    await planificador.arrancar();
    const t0 = Date.now();

    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);

    const minuto2 = [t0 + 60_000, t0 + 120_000];
    expect(ciclosEntre(emsc, ...minuto2)).toHaveLength(10);
    expect(ciclosEntre(usgs, ...minuto2)).toHaveLength(5);
    // Escalonado: las primeras consultas de EMSC llegan a los 6, 12, 18, 24 y 30 s.
    const primeras = ciclosEntre(emsc, t0, t0 + 30_001).map((l) => l.en - t0);
    expect(primeras).toEqual([6_000, 12_000, 18_000, 24_000, 30_000]);
    planificador.detener();
  });

  it('usa updatedafter = última actualización vista − 2 min', async () => {
    const emsc = adaptador('emsc-fdsn', 'emsc', ({ zona, params }) => ({
      registros:
        zona === 'PA' && params.actualizadoDesde === null
          ? [registro('emsc', { publicadoHaceMs: 10_000 })]
          : [],
    }));
    const { planificador } = montar({ emsc });
    await planificador.arrancar();
    const marca = INICIO - 10_000;

    await vi.advanceTimersByTimeAsync(30_000);

    const pa = emsc.llamadas.find((l) => l.zona === 'PA' && l.params.actualizadoDesde !== null);
    expect(pa?.params.actualizadoDesde).toBe(marca - SOLAPE_MS);
    // Una zona sin sismos usa la hora de recepción de la carga como marca.
    const es = emsc.llamadas.find((l) => l.zona === 'ES-PEN' && l.params.actualizadoDesde !== null);
    expect(es?.params.actualizadoDesde).toBe(INICIO - SOLAPE_MS);
    planificador.detener();
  });

  it('cada sismo nuevo del ciclo escribe sismo.recibido con sus latencias (RNF-15)', async () => {
    /** @type {ReturnType<typeof registro> | null} */
    let nuevo = null;
    const emsc = adaptador('emsc-fdsn', 'emsc', ({ zona, params }) => ({
      registros: zona === 'ES-PEN' && params.actualizadoDesde !== null && nuevo ? [nuevo] : [],
    }));
    const { planificador, log, metricas } = montar({ emsc });
    await planificador.arrancar();
    // Publicado 15 s antes del ciclo de ES-PEN (a los 6 s) y con origen 4 min antes.
    vi.setSystemTime(Date.now() + 6_000);
    nuevo = registro('emsc', { id: 'nuevo1', origenHaceMs: 240_000, publicadoHaceMs: 15_000 });
    vi.setSystemTime(Date.now() - 6_000);

    await vi.advanceTimersByTimeAsync(6_000);

    expect(log.info).toHaveBeenCalledWith('sismo.recibido', {
      fuente: 'emsc',
      canal: 'fdsn',
      zona: 'ES-PEN',
      idFuente: 'nuevo1',
      accion: 'alta',
      publicacionARecepcionMs: 15_000,
      origenARecepcionMs: 240_000,
    });
    expect(metricas.registrar).toHaveBeenCalledWith({
      fuente: 'emsc',
      canal: 'fdsn',
      publicacionARecepcionMs: 15_000,
      origenARecepcionMs: 240_000,
    });
    // El solape del ciclo siguiente devuelve lo mismo: «sin cambios», sin otra línea.
    log.info.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(log.info).not.toHaveBeenCalledWith('sismo.recibido', expect.anything());
    planificador.detener();
  });

  it('retira del catálogo los ids reclasificados', async () => {
    const emsc = adaptador('emsc-fdsn', 'emsc', ({ zona, params }) =>
      zona === 'PA' && params.actualizadoDesde === null
        ? { registros: [registro('emsc', { id: 'vol1' })] }
        : { retirados: zona === 'PA' ? ['vol1'] : [], descartes: { tipo: 1 } },
    );
    const { planificador, catalogo } = montar({ emsc });
    await planificador.arrancar();
    expect(catalogo.contar()).toBe(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(catalogo.contar()).toBe(0);
    planificador.detener();
  });
});

describe('fallos de una fuente (HU-02, AM-03)', () => {
  it('USGS caída: degradada, caida en ≤ 60 s, reintentos 5/10/20 s y EMSC sigue; al volver, ok', async () => {
    let caida = false;
    const usgs = adaptador('usgs', 'usgs', () => {
      if (caida) throw new FuenteError('TIMEOUT');
      return { registros: [] };
    });
    const { planificador, estado, emsc } = montar({ usgs });
    await planificador.arrancar();
    caida = true;
    const t0 = Date.now();
    const estadoUsgs = () => estado.obtener().find((e) => e.fuente === 'usgs');

    await vi.advanceTimersByTimeAsync(12_000);
    expect(estadoUsgs()).toMatchObject({ estado: 'degradada', mensaje: 'Tiempo de espera agotado' });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(estadoUsgs()?.estado).toBe('caida');
    expect(Date.now() - t0).toBeLessThanOrEqual(60_000);

    // EMSC no se ve afectada.
    expect(estado.obtener()[0].estado).toBe('ok');
    expect(ciclosEntre(emsc, t0, Date.now()).length).toBeGreaterThan(0);

    // Reintentos de la zona ES-PEN de USGS: 5 s, 10 s y 20 s.
    const es = () =>
      usgs.llamadas.filter((l) => l.zona === 'ES-PEN' && l.en > t0).map((l) => l.en - t0);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(es().slice(0, 4)).toEqual([12_000, 17_000, 27_000, 47_000]);
    expect(ESPERAS_REINTENTO_MS).toEqual([5_000, 10_000, 20_000, 40_000, 60_000]);

    caida = false;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(estadoUsgs()).toMatchObject({ estado: 'ok', mensaje: null });
    planificador.detener();
  });

  it('la espera máxima es 60 s', async () => {
    const usgs = adaptador('usgs', 'usgs', ({ params }) => {
      if (params.actualizadoDesde !== null) throw new FuenteError('HTTP_STATUS', { status: 503 });
      return { registros: [] };
    });
    const { planificador } = montar({ usgs });
    await planificador.arrancar();
    const t0 = Date.now();

    await vi.advanceTimersByTimeAsync(600_000);

    const es = usgs.llamadas.filter((l) => l.zona === 'ES-PEN' && l.en >= t0).map((l) => l.en);
    const huecos = es.slice(1).map((t, i) => t - es[i]);
    expect(Math.max(...huecos)).toBe(60_000);
    planificador.detener();
  });

  it('429 con Retry-After: 120 → no se vuelve a llamar a esa fuente antes de 120 s (AM-18)', async () => {
    let primera = true;
    const usgs = adaptador('usgs', 'usgs', ({ params }) => {
      if (params.actualizadoDesde !== null && primera) {
        primera = false;
        throw new FuenteError('HTTP_STATUS', { status: 429, retryAfterMs: 120_000 });
      }
      return { registros: [] };
    });
    const { planificador } = montar({ usgs });
    await planificador.arrancar();
    const t0 = Date.now();

    await vi.advanceTimersByTimeAsync(12_000); // primer ciclo: 429
    const t429 = Date.now();
    await vi.advanceTimersByTimeAsync(119_999);
    expect(usgs.llamadas.filter((l) => l.en > t429)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(usgs.llamadas.filter((l) => l.en > t429).length).toBeGreaterThan(0);
    expect(t429 - t0).toBe(12_000);
    planificador.detener();
  });

  it('una excepción inesperada del adaptador se registra y no detiene el ciclo', async () => {
    let n = 0;
    const emsc = adaptador('emsc-fdsn', 'emsc', ({ params }) => {
      if (params.actualizadoDesde !== null && n++ === 0) throw new TypeError('x is undefined');
      return { registros: [] };
    });
    const { planificador, log, estado } = montar({ emsc });
    await planificador.arrancar();

    await vi.advanceTimersByTimeAsync(6_000);
    expect(log.error).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ fuente: 'emsc-fdsn', mensaje: 'x is undefined' }),
    );
    expect(estado.obtener()[0]).toMatchObject({ estado: 'degradada', mensaje: 'Error inesperado' });

    await vi.advanceTimersByTimeAsync(6_000);
    expect(estado.obtener()[0].estado).toBe('ok');
    planificador.detener();
  });

  it('si la carga inicial de una zona falla, su ciclo hace la carga completa', async () => {
    let n = 0;
    const emsc = adaptador('emsc-fdsn', 'emsc', ({ zona }) => {
      if (zona === 'PA' && n++ === 0) throw new FuenteError('RED');
      return { registros: [] };
    });
    const { planificador, log } = montar({ emsc });
    await planificador.arrancar();
    expect(log.info).toHaveBeenCalledWith('carga.inicial', expect.objectContaining({ fallos: 1 }));

    await vi.advanceTimersByTimeAsync(30_000);
    const pa = emsc.llamadas.filter((l) => l.zona === 'PA');
    expect(pa[1].params.actualizadoDesde).toBeNull();
    planificador.detener();
  });

  it('detener() cancela temporizadores y señales', async () => {
    const { planificador, emsc } = montar();
    await planificador.arrancar();
    const n = emsc.llamadas.length;
    planificador.detener();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(emsc.llamadas).toHaveLength(n);
    expect(emsc.llamadas[0].opciones.signal.aborted).toBe(true);
  });
});

describe('asegurarCobertura (arquitectura §5.6, AM-18)', () => {
  it('si la memoria cubre el filtro no consulta nada', async () => {
    const { planificador, emsc, usgs } = montar();
    await planificador.arrancar();
    const antes = emsc.llamadas.length + usgs.llamadas.length;

    await expect(planificador.asegurarCobertura(['PA', 'ES-PEN'], 2.5)).resolves.toEqual({
      completo: true,
    });
    expect(emsc.llamadas.length + usgs.llamadas.length).toBe(antes);
    planificador.detener();
  });

  it('100 peticiones simultáneas con «todas» generan 1 consulta por fuente y zona', async () => {
    const { planificador, emsc, usgs } = montar();
    await planificador.arrancar();
    const antes = { emsc: emsc.llamadas.length, usgs: usgs.llamadas.length };

    const resultados = await Promise.all(
      Array.from({ length: 100 }, () => planificador.asegurarCobertura(['PA', 'CO-CONT'], null)),
    );

    expect(resultados.every((r) => r.completo)).toBe(true);
    const nuevas = (a, n) => a.llamadas.slice(n);
    for (const [a, n] of [
      [emsc, antes.emsc],
      [usgs, antes.usgs],
    ]) {
      expect(nuevas(a, n).map((l) => l.zona).sort()).toEqual(['CO-CONT', 'PA']);
      for (const l of nuevas(a, n)) {
        expect(l.params).toMatchObject({ magMin: null, actualizadoDesde: null });
        expect(l.opciones.timeoutMs).toBeLessThanOrEqual(8_000);
      }
    }
    // Después queda cubierto y el ciclo usa la nueva magnitud.
    await planificador.asegurarCobertura(['PA'], 1.0);
    expect(emsc.llamadas.length).toBe(antes.emsc + 2);
    await vi.advanceTimersByTimeAsync(30_000);
    const ciclo = emsc.llamadas.findLast((l) => l.zona === 'PA');
    expect(ciclo?.params).toMatchObject({ magMin: null });
    planificador.detener();
  });

  it('nunca consulta por encima de la magnitud de ingesta', async () => {
    let falla = true;
    const emsc = adaptador('emsc-fdsn', 'emsc', () => {
      if (falla) throw new FuenteError('RED');
      return { registros: [] };
    });
    const { planificador } = montar({ emsc });
    await planificador.arrancar();
    falla = false;

    await planificador.asegurarCobertura(['PA'], 4.5);
    expect(emsc.llamadas.at(-1)?.params.magMin).toBe(2);
    planificador.detener();
  });

  it('una fuente caída da completo: false sin romper la respuesta', async () => {
    const usgs = adaptador('usgs', 'usgs', ({ params }) => {
      if (params.magMin === 1) throw new FuenteError('HTTP_STATUS', { status: 503 });
      return { registros: [] };
    });
    const { planificador, emsc } = montar({ usgs });
    await planificador.arrancar();

    await expect(planificador.asegurarCobertura(['PA'], 1.0)).resolves.toEqual({ completo: false });
    // EMSC sí quedó cubierta: la siguiente petición solo vuelve a intentar USGS.
    const nEmsc = emsc.llamadas.length;
    await planificador.asegurarCobertura(['PA'], 1.0);
    expect(emsc.llamadas.length).toBe(nEmsc);
    planificador.detener();
  });

  it('espera a la carga inicial en curso como mucho 8 s y responde completo: false', async () => {
    const lenta = adaptador('emsc-fdsn', 'emsc', () => new Promise(() => {}));
    const { planificador } = montar({ emsc: lenta });
    planificador.arrancar();

    const r = planificador.asegurarCobertura(['PA'], 2.0);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(r).resolves.toEqual({ completo: false });
    planificador.detener();
  });

  it('si la carga inicial termina a tiempo, responde con ella completo: true', async () => {
    const lenta = adaptador('emsc-fdsn', 'emsc', async () => {
      await new Promise((ok) => setTimeout(ok, 2_000));
      return { registros: [] };
    });
    const { planificador } = montar({ emsc: lenta });
    planificador.arrancar();

    const r = planificador.asegurarCobertura(['PA'], 2.0);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(r).resolves.toEqual({ completo: true });
    planificador.detener();
  });

  it('una fuente bloqueada por Retry-After no se consulta y la respuesta es incompleta', async () => {
    const usgs = adaptador('usgs', 'usgs', ({ params }) => {
      if (params.magMin === 1) {
        throw new FuenteError('HTTP_STATUS', { status: 429, retryAfterMs: 120_000 });
      }
      return { registros: [] };
    });
    const { planificador } = montar({ usgs });
    await planificador.arrancar();
    await planificador.asegurarCobertura(['PA'], 1.0);
    const n = usgs.llamadas.length;

    await expect(planificador.asegurarCobertura(['PA'], 1.0)).resolves.toEqual({ completo: false });
    expect(usgs.llamadas).toHaveLength(n);
    planificador.detener();
  });
});

describe('createLimitadorDescartes (AM-29, AM-34)', () => {
  it('como mucho una línea por minuto, fuente y motivo, con la cuenta acumulada', () => {
    const log = { warn: vi.fn(), debug: vi.fn() };
    const limitar = createLimitadorDescartes(log, { ahora: () => Date.now() });

    limitar('emsc', 'lat', 1);
    limitar('emsc', 'lat', 2);
    limitar('usgs', 'lat', 1);
    vi.advanceTimersByTime(60_000);
    limitar('emsc', 'lat', 1);

    expect(log.warn.mock.calls).toEqual([
      ['normalizacion.descarte', { fuente: 'emsc', motivo: 'lat', cuenta: 1 }],
      ['normalizacion.descarte', { fuente: 'usgs', motivo: 'lat', cuenta: 1 }],
      ['normalizacion.descarte', { fuente: 'emsc', motivo: 'lat', cuenta: 3 }],
    ]);
  });

  it('los descartes esperados (no son sismos) van a debug', () => {
    const log = { warn: vi.fn(), debug: vi.fn() };
    createLimitadorDescartes(log, { ahora: () => 0 })('emsc', 'tipo', 4);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalled();
  });
});
