import { describe, expect, it, vi } from 'vitest';
import { crearEstado } from '../../../public/js/estado.js';
import { filtrosPorDefecto } from '../../../public/js/filtros.js';
import {
  ESPERAS_S,
  RETRY_AFTER_MAX_S,
  RETRY_AFTER_POR_DEFECTO_S,
  SIN_CONEXION_MS,
  SIN_DATOS_MS,
  aplicarEvento,
  comprobarPlazas,
  crearAnunciadorNuevos,
  crearConexionVivo,
  leerRetryAfter,
  parsearEvento,
  urlStream,
} from '../../../public/js/stream.js';

/** Deja correr las promesas pendientes (diagnóstico asíncrono del 503). */
const vaciarPromesas = () => new Promise((ok) => setTimeout(ok, 0));

const T0 = Date.parse('2026-10-10T12:00:00Z');

/** @param {Record<string, unknown>} c */
const sismo = (c = {}) => ({
  id: 'emsc:1',
  tiempo: '2026-10-10T11:50:00Z',
  lat: 8,
  lon: -77,
  magnitud: 3,
  pais: 'CO',
  lugar: 'NORTHERN COLOMBIA',
  revision: 1,
  ...c,
});

/** @param {string} tipo @param {unknown} datos @param {Record<string, unknown>} [extra] */
const data = (tipo, datos, extra = {}) =>
  JSON.stringify({ tipo, version: 1, ocurridoEn: '2026-10-10T12:00:00Z', datos, ...extra });

describe('urlStream (contrato GET /api/stream)', () => {
  const f = filtrosPorDefecto();
  it('filtros por defecto, sin avisoMin ni ultimoId', () => {
    expect(urlStream(f)).toBe('/api/stream?paises=ES%2CCO%2CPA&magMin=2.0&periodo=24h');
  });
  it('añade avisoMin y ultimoId válidos', () => {
    expect(urlStream(f, { avisoMin: '4.5', ultimoId: 'lx3k9a-41' })).toBe(
      '/api/stream?paises=ES%2CCO%2CPA&magMin=2.0&periodo=24h&avisoMin=4.5&ultimoId=lx3k9a-41',
    );
  });
  it('descarta avisoMin fuera de la lista cerrada y un ultimoId mal formado', () => {
    expect(urlStream(f, { avisoMin: '3.5', ultimoId: '../x' })).toBe(
      '/api/stream?paises=ES%2CCO%2CPA&magMin=2.0&periodo=24h',
    );
  });
  it('sin países no hay stream', () => {
    expect(urlStream({ ...f, paises: [] })).toBeNull();
  });
});

describe('parsearEvento', () => {
  it('sismo.nuevo válido', () => {
    const e = parsearEvento(
      'sismo.nuevo',
      data('sismo.nuevo', { sismo: sismo(), notificable: true, cambios: ['magnitud', 7] }),
    );
    expect(e).toEqual({
      tipo: 'sismo.nuevo',
      sismo: sismo(),
      notificable: true,
      cambios: ['magnitud'],
    });
  });
  it('notificable ausente o no booleano → false', () => {
    const e = parsearEvento(
      'sismo.actualizado',
      data('sismo.actualizado', { sismo: sismo(), notificable: 'true' }),
    );
    expect(e && 'notificable' in e && e.notificable).toBe(false);
  });
  it.each([
    ['JSON roto', 'sismo.nuevo', '{"tipo":'],
    ['tipo distinto del event', 'sismo.nuevo', data('sismo.actualizado', { sismo: sismo() })],
    ['versión desconocida', 'sismo.nuevo', data('sismo.nuevo', { sismo: sismo() }, { version: 2 })],
    ['sin datos', 'sismo.nuevo', JSON.stringify({ tipo: 'sismo.nuevo', version: 1 })],
    ['sismo inválido', 'sismo.nuevo', data('sismo.nuevo', { sismo: sismo({ lat: 999 }) })],
    ['evento desconocido', 'hack', data('hack', {})],
    ['eliminado sin id', 'sismo.eliminado', data('sismo.eliminado', { motivo: 'retirado' })],
    ['fuente sin estado', 'estado.fuente', data('estado.fuente', { fuente: 'usgs' })],
    ['data no es texto', 'sismo.nuevo', null],
    ['data enorme', 'sismo.nuevo', 'x'.repeat(300_000)],
  ])('descarta: %s', (_, tipo, d) => {
    expect(parsearEvento(tipo, d)).toBeNull();
  });
  it('__proto__ en el sobre no contamina el prototipo', () => {
    parsearEvento('sismo.nuevo', '{"__proto__":{"contaminado":1},"tipo":"sismo.nuevo"}');
    expect(/** @type {any} */ ({}).contaminado).toBeUndefined();
  });
  it('sismo.eliminado, estado.fuente y flujo.reiniciar', () => {
    expect(
      parsearEvento(
        'sismo.eliminado',
        data('sismo.eliminado', { id: 'a', motivo: 'fusionado', reemplazadoPor: 'b' }),
      ),
    ).toEqual({ tipo: 'sismo.eliminado', id: 'a', motivo: 'fusionado', reemplazadoPor: 'b' });
    expect(
      parsearEvento(
        'estado.fuente',
        data('estado.fuente', { fuente: 'usgs', estado: 'caida', cambiadoEn: 'x', extra: 1 }),
      ),
    ).toEqual({
      tipo: 'estado.fuente',
      fuente: { fuente: 'usgs', estado: 'caida', cambiadoEn: 'x' },
    });
    expect(
      parsearEvento('flujo.reiniciar', data('flujo.reiniciar', { motivo: 'arranque-distinto' })),
    ).toEqual({ tipo: 'flujo.reiniciar', motivo: 'arranque-distinto' });
  });
});

describe('aplicarEvento', () => {
  const filtros = filtrosPorDefecto();
  it('alta en la lista con «Nuevo» y después actualización', () => {
    const estado = crearEstado({ ahora: () => T0 });
    const r = aplicarEvento(
      { tipo: 'sismo.nuevo', sismo: sismo(), notificable: true, cambios: [] },
      { estado, filtros, ahora: T0 },
    );
    expect(r).toMatchObject({ enLista: true, alta: true });
    expect(estado.obtener('emsc:1')?.llegadoEn).toBe(T0);
    const r2 = aplicarEvento(
      {
        tipo: 'sismo.actualizado',
        sismo: sismo({ magnitud: 3.5, revision: 2 }),
        notificable: true,
        cambios: ['magnitud'],
      },
      { estado, filtros, ahora: T0 },
    );
    expect(r2).toMatchObject({ enLista: true, alta: false });
    expect(estado.tamano).toBe(1);
    expect(estado.obtener('emsc:1')?.magnitudAnterior).toBe(3);
  });

  it('por debajo de la magnitud de la lista (llega por el aviso): no se pinta y se quita', () => {
    const estado = crearEstado({ ahora: () => T0 });
    estado.reemplazar([sismo({ magnitud: 2.4 })]);
    const r = aplicarEvento(
      {
        tipo: 'sismo.actualizado',
        sismo: sismo({ magnitud: 1.9 }),
        notificable: true,
        cambios: [],
      },
      { estado, filtros, ahora: T0 },
    );
    expect(r).toMatchObject({ enLista: false, alta: false });
    expect(estado.tamano).toBe(0);
  });

  it('fuera del periodo o de un país no marcado: no se pinta', () => {
    const estado = crearEstado({ ahora: () => T0 });
    aplicarEvento(
      {
        tipo: 'sismo.nuevo',
        sismo: sismo({ tiempo: '2026-10-08T12:00:00Z' }),
        notificable: false,
        cambios: [],
      },
      { estado, filtros, ahora: T0 },
    );
    aplicarEvento(
      {
        tipo: 'sismo.nuevo',
        sismo: sismo({ id: 'b', pais: 'PA' }),
        notificable: true,
        cambios: [],
      },
      { estado, filtros: { ...filtros, paises: ['ES'] }, ahora: T0 },
    );
    expect(estado.tamano).toBe(0);
  });

  it('franja CO-PA con solo Colombia: entra, sigue tras sismo.actualizado y no se borra (R-01)', () => {
    const estado = crearEstado({ ahora: () => T0 });
    const soloCo = { ...filtros, paises: /** @type {any} */ (['CO']) };
    const franja = sismo({
      id: 'emsc:franja',
      lat: 9.5,
      lon: -77.1,
      pais: 'PA',
      paisesCandidatos: ['CO', 'PA'],
    });
    // Cargado con `GET /api/sismos` (el servidor ya filtra por paisesCandidatos).
    estado.reemplazar([franja]);
    const r = aplicarEvento(
      {
        tipo: 'sismo.actualizado',
        sismo: { ...franja, magnitud: 3.4, revision: 2 },
        notificable: true,
        cambios: ['magnitud'],
      },
      { estado, filtros: soloCo, ahora: T0 },
    );
    expect(r).toMatchObject({ enLista: true, alta: false });
    expect(estado.obtener('emsc:franja')?.sismo.magnitud).toBe(3.4);
    // Llega en vivo otro de la franja.
    const r2 = aplicarEvento(
      {
        tipo: 'sismo.nuevo',
        sismo: { ...franja, id: 'emsc:franja2' },
        notificable: true,
        cambios: [],
      },
      { estado, filtros: soloCo, ahora: T0 },
    );
    expect(r2).toMatchObject({ enLista: true, alta: true });
    expect(estado.tamano).toBe(2);
  });

  it('la lista compara la magnitud cruda (R-02): con magMin 5.0, un M 4.96 no entra', () => {
    const estado = crearEstado({ ahora: () => T0 });
    const r = aplicarEvento(
      {
        tipo: 'sismo.nuevo',
        sismo: sismo({ magnitud: 4.96 }),
        notificable: true,
        cambios: [],
      },
      { estado, filtros: { ...filtros, magMin: '5.0' }, ahora: T0 },
    );
    expect(r).toMatchObject({ enLista: false, alta: false });
    expect(estado.tamano).toBe(0);
  });

  it('sismo.eliminado', () => {
    const estado = crearEstado();
    estado.reemplazar([sismo()]);
    const r = aplicarEvento(
      { tipo: 'sismo.eliminado', id: 'emsc:1', motivo: 'retirado', reemplazadoPor: null },
      { estado, filtros, ahora: T0 },
    );
    expect(r).toMatchObject({ quitado: true });
    expect(estado.tamano).toBe(0);
  });
});

/** Temporizadores simulados y deterministas. */
function reloj() {
  let t = T0;
  /** @type {{ en: number, fn: () => void, id: number }[]} */
  let cola = [];
  let n = 0;
  return {
    ahora: () => t,
    programar: (/** @type {() => void} */ fn, /** @type {number} */ ms) => {
      n += 1;
      cola.push({ en: t + ms, fn, id: n });
      return n;
    },
    cancelar: (/** @type {unknown} */ id) => {
      cola = cola.filter((x) => x.id !== id);
    },
    /** @param {number} ms */
    avanzar(ms) {
      const fin = t + ms;
      for (;;) {
        cola.sort((a, b) => a.en - b.en);
        const sig = cola[0];
        if (!sig || sig.en > fin) break;
        cola.shift();
        t = sig.en;
        sig.fn();
      }
      t = fin;
    },
  };
}

describe('crearAnunciadorNuevos (textos.md §10)', () => {
  it('uno cada 10 s; varios en la ventana → «{n} sismos nuevos.»', () => {
    const r = reloj();
    const anunciar = vi.fn();
    const a = crearAnunciadorNuevos({ anunciar, programar: r.programar });
    a.nuevo(sismo({ magnitud: 4.24 }));
    expect(anunciar).toHaveBeenLastCalledWith(
      'Nuevo sismo: magnitud 4.2, Northern Colombia, Colombia.',
    );
    a.nuevo(sismo());
    a.nuevo(sismo());
    expect(anunciar).toHaveBeenCalledTimes(1);
    r.avanzar(10_000);
    expect(anunciar).toHaveBeenLastCalledWith('2 sismos nuevos.');
    a.nuevo(sismo({ lugar: 'X', pais: 'ES' }));
    r.avanzar(10_000);
    expect(anunciar).toHaveBeenLastCalledWith('Nuevo sismo: magnitud 3.0, X, España.');
    r.avanzar(10_000);
    a.nuevo(sismo());
    expect(anunciar).toHaveBeenCalledTimes(4);
  });
});

/** `EventSource` simulado. */
class FuenteFalsa {
  /** @type {FuenteFalsa[]} */
  static creadas = [];
  /** @param {string} url */
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.cerrada = false;
    /** @type {Map<string, (e: any) => void>} */
    this.oyentes = new Map();
    /** @type {((e: any) => void) | null} */
    this.onopen = null;
    /** @type {((e: any) => void) | null} */
    this.onerror = null;
    FuenteFalsa.creadas.push(this);
  }
  /** @param {string} tipo @param {(e: any) => void} fn */
  addEventListener(tipo, fn) {
    this.oyentes.set(tipo, fn);
  }
  close() {
    this.cerrada = true;
    this.readyState = 2;
  }
  abrir() {
    this.readyState = 1;
    this.onopen?.({});
  }
  /** @param {number} [estado] */
  fallar(estado = 0) {
    this.readyState = estado;
    this.onerror?.({});
  }
  /** @param {string} tipo @param {unknown} datos @param {string} [id] */
  emitir(tipo, datos, id = '') {
    this.oyentes.get(tipo)?.({ data: data(tipo, datos), lastEventId: id });
  }
}

/**
 * @param {{ avisoMin?: string | null, obtenerFiltros?: () => any,
 *   diagnosticar?: (url: string) => Promise<import('../../../public/js/stream.js').Diagnostico> }}
 *   [opciones] `diagnosticar` por defecto: no es falta de plazas
 */
function montar({
  avisoMin = /** @type {string | null} */ (null),
  obtenerFiltros = filtrosPorDefecto,
  diagnosticar = vi.fn(async () => ({ sinPlazas: /** @type {const} */ (false) })),
} = {}) {
  FuenteFalsa.creadas = [];
  const r = reloj();
  const estado = crearEstado({ ahora: r.ahora });
  /** @type {string[]} */
  const estados = [];
  let actual = 'cargando';
  const barra = {
    poner: vi.fn((/** @type {string} */ e) => {
      actual = e;
      estados.push(e);
    }),
    get estado() {
      return actual;
    },
  };
  const recargar = vi.fn();
  const ponerFuentes = vi.fn();
  const alEvento = vi.fn();
  const vivo = crearConexionVivo({
    estado,
    barra,
    obtenerFiltros,
    obtenerUltimoEventoId: () => 'abc-1',
    obtenerAvisoMin: () => avisoMin,
    recargar,
    ponerFuentes,
    alEvento,
    EventSourceImpl: /** @type {any} */ (FuenteFalsa),
    diagnosticar,
    ahora: r.ahora,
    programar: r.programar,
    cancelar: r.cancelar,
  });
  const ultima = () => /** @type {FuenteFalsa} */ (FuenteFalsa.creadas.at(-1));
  return {
    r,
    estado,
    barra,
    estados,
    recargar,
    ponerFuentes,
    alEvento,
    vivo,
    ultima,
    diagnosticar,
  };
}

describe('crearConexionVivo', () => {
  it('abre con el ultimoEventoId de la carga y pasa a «En vivo» al abrirse', () => {
    const m = montar({ avisoMin: '4.5' });
    m.vivo.abrir();
    expect(m.ultima().url).toBe(
      '/api/stream?paises=ES%2CCO%2CPA&magMin=2.0&periodo=24h&avisoMin=4.5&ultimoId=abc-1',
    );
    expect(m.barra.poner).not.toHaveBeenCalled();
    m.ultima().abrir();
    expect(m.barra.poner).toHaveBeenLastCalledWith('en-vivo', { n: 0, hora: T0 });
  });

  it('aplica los sismos, avisa a alEvento y guarda el último id', () => {
    const m = montar();
    m.vivo.abrir();
    m.ultima().abrir();
    m.ultima().emitir('sismo.nuevo', { sismo: sismo(), notificable: true, cambios: [] }, 'abc-7');
    expect(m.estado.tamano).toBe(1);
    expect(m.alEvento).toHaveBeenCalledWith(expect.objectContaining({ alta: true, enLista: true }));
    expect(m.vivo.ultimoId).toBe('abc-7');
    m.ultima().emitir('sismo.eliminado', { id: 'emsc:1', motivo: 'retirado' }, 'abc-8');
    expect(m.estado.tamano).toBe(0);
  });

  it('franja CO-PA en vivo con solo Colombia: se pinta y llega a alEvento (R-01)', () => {
    const m = montar({ obtenerFiltros: () => ({ ...filtrosPorDefecto(), paises: ['CO'] }) });
    m.vivo.abrir();
    m.ultima().abrir();
    const franja = sismo({ lat: 9.5, lon: -77.1, pais: 'PA', paisesCandidatos: ['CO', 'PA'] });
    m.ultima().emitir('sismo.nuevo', { sismo: franja, notificable: true, cambios: [] }, 'abc-9');
    expect(m.estado.tamano).toBe(1);
    expect(m.alEvento).toHaveBeenCalledWith(expect.objectContaining({ alta: true, enLista: true }));
  });

  it('ignora un Last-Event-ID de más de 32 caracteres (esIdEvento compartido)', () => {
    const m = montar();
    m.vivo.abrir();
    m.ultima().abrir();
    m.ultima().emitir('latido', {}, `${'a'.repeat(16)}-${'1'.repeat(16)}`);
    expect(m.vivo.ultimoId).toBe('abc-1');
  });

  it('corte: «Reconectando…» y a los 10 s «Sin conexión…»; al volver, «En vivo»', () => {
    const m = montar();
    m.vivo.abrir();
    m.ultima().abrir();
    m.r.avanzar(1000);
    m.ultima().fallar(0);
    expect(m.barra.poner).toHaveBeenLastCalledWith('reconectando', { hora: T0 });
    m.r.avanzar(SIN_CONEXION_MS - 1);
    expect(m.barra.estado).toBe('reconectando');
    m.r.avanzar(1);
    expect(m.barra.poner).toHaveBeenLastCalledWith('sin-conexion', { hora: T0 });
    m.ultima().fallar(0);
    expect(m.barra.estado).toBe('sin-conexion');
    m.ultima().abrir();
    expect(m.barra.estado).toBe('en-vivo');
    // El navegador reconecta solo (misma instancia): no se crean más.
    expect(FuenteFalsa.creadas).toHaveLength(1);
  });

  it('si EventSource se rinde (CLOSED) sin ser por plazas, reintenta a los 5 s con el último id', async () => {
    const m = montar();
    m.vivo.abrir();
    m.ultima().abrir();
    m.ultima().emitir('estado.fuente', { fuente: 'usgs', estado: 'ok' }, 'abc-9');
    m.ultima().fallar(2);
    expect(m.ultima().cerrada).toBe(true);
    await vaciarPromesas();
    expect(m.diagnosticar).toHaveBeenCalledWith(expect.stringContaining('/api/stream?'));
    expect(m.barra.estado).toBe('reconectando');
    m.r.avanzar(ESPERAS_S[0] * 1000 - 1);
    expect(FuenteFalsa.creadas).toHaveLength(1);
    m.r.avanzar(1);
    expect(FuenteFalsa.creadas).toHaveLength(2);
    expect(m.ultima().url).toContain('ultimoId=abc-9');
    m.ultima().fallar(2);
    await vaciarPromesas();
    m.r.avanzar(ESPERAS_S[1] * 1000);
    expect(FuenteFalsa.creadas).toHaveLength(3);
  });

  it('503 sin plazas: «sin plazas» (no «Sin conexión…»), reintento con Retry-After y vuelta a «En vivo»', async () => {
    const diagnosticar = vi.fn(async () => ({
      sinPlazas: /** @type {const} */ (true),
      reintentarS: 10,
    }));
    const m = montar({ diagnosticar });
    m.estado.reemplazar([sismo()]);
    m.vivo.abrir();
    // El navegador recibe 503 y se rinde sin llegar a abrir.
    m.ultima().fallar(2);
    await vaciarPromesas();
    expect(m.barra.poner).toHaveBeenLastCalledWith('sin-plazas', { n: 1, hora: null });
    expect(m.estados).not.toContain('reconectando');

    // Pasado el plazo de «Sin conexión…» (10 s), sigue en «sin plazas»: el servidor responde.
    m.r.avanzar(10_000 - 1);
    expect(FuenteFalsa.creadas).toHaveLength(1);
    expect(m.barra.estado).toBe('sin-plazas');
    m.r.avanzar(1);
    expect(FuenteFalsa.creadas).toHaveLength(2);
    expect(m.ultima().url).toContain('ultimoId=abc-1');

    // Sigue sin plazas: otra espera igual (sin espera creciente) y sin «Sin conexión…».
    m.ultima().fallar(2);
    await vaciarPromesas();
    m.r.avanzar(SIN_CONEXION_MS * 3);
    expect(m.estados).not.toContain('sin-conexion');
    expect(FuenteFalsa.creadas).toHaveLength(3);

    // Queda una plaza libre: abre y vuelve a «En vivo».
    m.ultima().abrir();
    expect(m.barra.estado).toBe('en-vivo');
    expect(diagnosticar).toHaveBeenCalledTimes(2);
  });

  it('respeta el Retry-After que devuelve el diagnóstico', async () => {
    const m = montar({
      diagnosticar: async () => ({ sinPlazas: /** @type {const} */ (true), reintentarS: 30 }),
    });
    m.vivo.abrir();
    m.ultima().fallar(2);
    await vaciarPromesas();
    m.r.avanzar(30_000 - 1);
    expect(FuenteFalsa.creadas).toHaveLength(1);
    m.r.avanzar(1);
    expect(FuenteFalsa.creadas).toHaveLength(2);
  });

  it('un diagnóstico que llega después de cerrar() se ignora', async () => {
    /** @type {(d: any) => void} */
    let responder = () => {};
    const m = montar({ diagnosticar: () => new Promise((ok) => (responder = ok)) });
    m.vivo.abrir();
    m.ultima().fallar(2);
    m.vivo.cerrar();
    responder({ sinPlazas: true, reintentarS: 10 });
    await vaciarPromesas();
    expect(m.estados).not.toContain('sin-plazas');
    m.r.avanzar(60_000);
    expect(FuenteFalsa.creadas).toHaveLength(1);
  });

  it('si el diagnóstico falla, se trata como un corte normal', async () => {
    const m = montar({
      diagnosticar: async () => {
        throw new Error('red');
      },
    });
    m.vivo.abrir();
    m.ultima().fallar(2);
    await vaciarPromesas();
    expect(m.barra.estado).toBe('reconectando');
    m.r.avanzar(ESPERAS_S[0] * 1000);
    expect(FuenteFalsa.creadas).toHaveLength(2);
  });

  it('con latidos cada 20 s no reconecta en reposo (3 min) y renueva «actualizado a las…»', () => {
    const m = montar();
    m.vivo.abrir();
    m.ultima().abrir();
    m.ultima().emitir('estado.fuente', { fuente: 'usgs', estado: 'ok' }, 'abc-1');
    for (let i = 0; i < 9; i += 1) {
      m.r.avanzar(20_000);
      m.ultima().emitir('latido', {}, 'abc-1');
    }
    expect(FuenteFalsa.creadas).toHaveLength(1);
    expect(FuenteFalsa.creadas[0].cerrada).toBe(false);
    expect(m.barra.estado).toBe('en-vivo');
    expect(m.barra.poner).toHaveBeenLastCalledWith('en-vivo', { n: 0, hora: T0 + 180_000 });
    expect(m.vivo.ultimoId).toBe('abc-1');
    // Si dejan de llegar, a los 45 s del último reabre.
    m.r.avanzar(SIN_DATOS_MS - 1);
    expect(FuenteFalsa.creadas).toHaveLength(1);
    m.r.avanzar(1);
    expect(FuenteFalsa.creadas).toHaveLength(2);
  });

  it('un latido fuera de «En vivo» no cambia el indicador', () => {
    const m = montar();
    m.vivo.abrir();
    m.ultima().abrir();
    m.ultima().fallar(0);
    expect(m.barra.estado).toBe('reconectando');
    const llamadas = m.barra.poner.mock.calls.length;
    m.ultima().emitir('latido', {});
    expect(m.barra.poner.mock.calls.length).toBe(llamadas);
  });

  it('sin mensajes en 45 s reabre sin tocar el indicador', () => {
    const m = montar();
    m.vivo.abrir();
    m.ultima().abrir();
    m.ultima().emitir('sismo.nuevo', { sismo: sismo(), notificable: false, cambios: [] }, 'abc-3');
    const llamadas = m.barra.poner.mock.calls.length;
    m.r.avanzar(SIN_DATOS_MS);
    expect(FuenteFalsa.creadas).toHaveLength(2);
    expect(FuenteFalsa.creadas[0].cerrada).toBe(true);
    expect(m.ultima().url).toContain('ultimoId=abc-3');
    expect(m.barra.poner.mock.calls.length).toBe(llamadas);
  });

  it('flujo.reiniciar: cierra y recarga; más de 3 en un minuto, espera antes de recargar', () => {
    const m = montar();
    for (let i = 0; i < 3; i += 1) {
      m.vivo.abrir();
      m.ultima().abrir();
      m.ultima().emitir('flujo.reiniciar', { motivo: 'historial-insuficiente' });
      expect(m.ultima().cerrada).toBe(true);
    }
    expect(m.recargar).toHaveBeenCalledTimes(3);
    m.vivo.abrir();
    m.ultima().abrir();
    m.ultima().emitir('flujo.reiniciar', { motivo: 'historial-insuficiente' });
    expect(m.recargar).toHaveBeenCalledTimes(3);
    m.r.avanzar(ESPERAS_S[0] * 1000);
    expect(m.recargar).toHaveBeenCalledTimes(4);
  });

  it('agrupa los estado.fuente que llegan juntos al conectar', () => {
    const m = montar();
    m.vivo.abrir();
    m.ultima().abrir();
    for (const fuente of ['emsc-ws', 'emsc-fdsn', 'usgs']) {
      m.ultima().emitir('estado.fuente', { fuente, estado: fuente === 'usgs' ? 'caida' : 'ok' });
    }
    expect(m.ponerFuentes).not.toHaveBeenCalled();
    m.r.avanzar(100);
    expect(m.ponerFuentes).toHaveBeenCalledTimes(1);
    expect(m.ponerFuentes.mock.calls[0][0]).toHaveLength(3);
  });

  it('cerrar() cierra la conexión e ignora lo que llegue después', () => {
    const m = montar();
    m.vivo.abrir();
    const fuente = m.ultima();
    fuente.abrir();
    m.vivo.cerrar();
    expect(fuente.cerrada).toBe(true);
    fuente.emitir('sismo.nuevo', { sismo: sismo(), notificable: true, cambios: [] });
    expect(m.estado.tamano).toBe(0);
    m.r.avanzar(SIN_DATOS_MS * 2);
    expect(FuenteFalsa.creadas).toHaveLength(1);
  });

  it('reabrir() (cambio de avisoMin) sigue desde el último id', () => {
    const m = montar();
    m.vivo.abrir();
    m.ultima().abrir();
    m.ultima().emitir('estado.fuente', { fuente: 'usgs', estado: 'ok' }, 'abc-5');
    m.vivo.reabrir();
    expect(FuenteFalsa.creadas).toHaveLength(2);
    expect(m.ultima().url).toContain('ultimoId=abc-5');
  });
});

describe('latido (contrato GET /api/stream, «Mantenimiento»)', () => {
  it('parsearEvento acepta el latido con datos vacíos', () => {
    expect(parsearEvento('latido', data('latido', {}))).toEqual({ tipo: 'latido' });
  });

  it.each([
    ['datos no es objeto', data('latido', null)],
    ['tipo distinto del event', data('estado.fuente', {})],
    ['versión desconocida', data('latido', {}, { version: 2 })],
    ['JSON inválido', '{'],
  ])('parsearEvento descarta un latido mal formado: %s', (_, texto) => {
    expect(parsearEvento('latido', texto)).toBeNull();
  });
});

describe('leerRetryAfter', () => {
  it.each([
    ['10', 10],
    [' 25 ', 25],
    ['0', 1],
    ['999999', RETRY_AFTER_MAX_S],
    [null, RETRY_AFTER_POR_DEFECTO_S],
    ['', RETRY_AFTER_POR_DEFECTO_S],
    ['-5', RETRY_AFTER_POR_DEFECTO_S],
    ['1.5', RETRY_AFTER_POR_DEFECTO_S],
    ['Wed, 21 Oct 2026 07:28:00 GMT', RETRY_AFTER_POR_DEFECTO_S],
  ])('%j → %i s', (valor, esperado) => {
    expect(leerRetryAfter(valor)).toBe(esperado);
  });
});

describe('comprobarPlazas (HEAD /api/stream)', () => {
  /** @param {number} status @param {Record<string, string>} [cabeceras] */
  const respuesta = (status, cabeceras = {}) => new Response(null, { status, headers: cabeceras });

  it('503 con Retry-After → sin plazas, con la espera pedida', async () => {
    const fetchImpl = vi.fn(async () => respuesta(503, { 'Retry-After': '10' }));
    const url = '/api/stream?paises=PA';
    expect(await comprobarPlazas(url, /** @type {any} */ (fetchImpl))).toEqual({
      sinPlazas: true,
      reintentarS: 10,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: 'HEAD', cache: 'no-store' }),
    );
  });

  it.each([200, 400, 403, 500])('%i → no es falta de plazas', async (status) => {
    const fetchImpl = async () => respuesta(status);
    expect(await comprobarPlazas('/api/stream?paises=PA', /** @type {any} */ (fetchImpl))).toEqual({
      sinPlazas: false,
    });
  });

  it('un error de red no lanza: no es falta de plazas', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await comprobarPlazas('/api/stream?paises=PA', /** @type {any} */ (fetchImpl))).toEqual({
      sinPlazas: false,
    });
  });
});
