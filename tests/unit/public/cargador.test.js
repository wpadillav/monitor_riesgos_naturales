// Controlador de carga de la página (R-09 de la revisión T5.2): `GET /api/sismos`, apertura del
// stream, avisos de consulta lenta y reintentos con espera creciente. Dependencias simuladas y
// reloj determinista: sin DOM, sin red y sin temporizadores reales.

import { describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '../../../public/js/api.js';
import { ESPERAS_S, LENTO_MS, MUY_LENTO_MS, crearCargador } from '../../../public/js/cargador.js';
import { crearEstado } from '../../../public/js/estado.js';
import { filtrosPorDefecto } from '../../../public/js/filtros.js';

const T0 = Date.parse('2026-10-10T12:00:00Z');

/** @param {Record<string, unknown>} c */
const sismo = (c = {}) => ({
  id: 'emsc:1',
  tiempo: '2026-10-10T11:50:00Z',
  lat: 8,
  lon: -77,
  magnitud: 3,
  pais: 'CO',
  paisesCandidatos: ['CO'],
  lugar: 'NORTHERN COLOMBIA',
  revision: 1,
  ...c,
});

/** Temporizadores simulados (sueltos y periódicos) y deterministas. */
function reloj() {
  let t = T0;
  /** @type {{ en: number, fn: () => void, id: number, cada: number | null }[]} */
  let cola = [];
  let n = 0;
  /** @param {() => void} fn @param {number} ms @param {number | null} cada */
  const poner = (fn, ms, cada) => {
    n += 1;
    cola.push({ en: t + ms, fn, id: n, cada });
    return n;
  };
  const quitar = (/** @type {unknown} */ id) => {
    cola = cola.filter((x) => x.id !== id);
  };
  return {
    ahora: () => t,
    programar: (/** @type {() => void} */ fn, /** @type {number} */ ms) => poner(fn, ms, null),
    cancelar: quitar,
    repetir: (/** @type {() => void} */ fn, /** @type {number} */ ms) => poner(fn, ms, ms),
    pararRepetir: quitar,
    get pendientes() {
      return cola.length;
    },
    /** @param {number} ms */
    avanzar(ms) {
      const fin = t + ms;
      for (;;) {
        cola.sort((a, b) => a.en - b.en || a.id - b.id);
        const sig = cola[0];
        if (!sig || sig.en > fin) break;
        t = sig.en;
        if (sig.cada === null) cola.shift();
        else sig.en += sig.cada;
        sig.fn();
      }
      t = fin;
    },
  };
}

/** Promesa que la prueba resuelve o rechaza cuando quiere. */
function diferida() {
  /** @type {(v: any) => void} */
  let resolver = () => {};
  /** @type {(e: unknown) => void} */
  let rechazar = () => {};
  const promesa = new Promise((ok, mal) => {
    resolver = ok;
    rechazar = mal;
  });
  return { promesa, resolver, rechazar };
}

/** Deja correr las promesas pendientes. */
const vaciarPromesas = () => new Promise((ok) => setTimeout(ok, 0));

/** @param {object[]} sismos */
const respuesta = (sismos, ultimoEventoId = 'abc-7') => ({
  sismos,
  fuentes: [{ fuente: 'usgs', estado: 'ok' }],
  ultimoEventoId,
  generadoEn: '2026-10-10T12:00:00Z',
  truncado: false,
});

/**
 * @param {{ filtros?: import('../../../public/js/filtros.js').Filtros, eventSource?: boolean }}
 *   [opciones]
 */
function montar({ filtros = filtrosPorDefecto(), eventSource = true } = {}) {
  const r = reloj();
  const estado = crearEstado({ ahora: r.ahora });
  /** @type {ReturnType<typeof diferida>[]} */
  const consultas = [];
  /** @type {AbortSignal[]} */
  const senales = [];
  const api = {
    consultarSismos: vi.fn((_f, /** @type {{ signal: AbortSignal }} */ { signal }) => {
      const d = diferida();
      consultas.push(d);
      senales.push(signal);
      return d.promesa;
    }),
  };
  const vivo = { abrir: vi.fn(), cerrar: vi.fn() };
  const barra = { poner: vi.fn() };
  const notificador = { conocer: vi.fn() };
  const vista = {
    aviso: vi.fn(),
    progreso: vi.fn(),
    ocupada: vi.fn(),
    pintarVacio: vi.fn(),
    ponerResultado: vi.fn(),
    anunciar: vi.fn(),
    ponerFuentes: vi.fn(),
    cuenta: vi.fn(),
  };
  const estadoFiltros = { actual: filtros };
  const cargador = crearCargador({
    api: /** @type {any} */ (api),
    estado,
    vivo,
    barra,
    notificador,
    obtenerFiltros: () => estadoFiltros.actual,
    vista,
    hayEventSource: () => eventSource,
    ahora: r.ahora,
    programar: r.programar,
    cancelar: r.cancelar,
    repetir: r.repetir,
    pararRepetir: r.pararRepetir,
  });
  return {
    r,
    estado,
    api,
    consultas,
    senales,
    vivo,
    barra,
    notificador,
    vista,
    estadoFiltros,
    cargador,
  };
}

describe('crearCargador: carga correcta', () => {
  it('carga inicial: cierra el stream, consulta, da por conocidos los sismos y abre el stream', async () => {
    const m = montar();
    const hecho = m.cargador.cargar('inicial');
    expect(m.vivo.cerrar).toHaveBeenCalledTimes(1);
    expect(m.barra.poner).toHaveBeenLastCalledWith('cargando');
    expect(m.vista.ocupada).toHaveBeenLastCalledWith(true);
    expect(m.cargador.consultando).toBe(true);
    expect(m.cargador.cargaHecha).toBe(false);
    expect(m.api.consultarSismos).toHaveBeenCalledWith(filtrosPorDefecto(), {
      signal: expect.any(AbortSignal),
    });

    const sismos = [sismo(), sismo({ id: 'emsc:2', tiempo: '2026-10-10T11:40:00Z' })];
    m.consultas[0].resolver(respuesta(sismos));
    await hecho;

    expect(m.notificador.conocer).toHaveBeenCalledWith(sismos);
    expect(m.estado.tamano).toBe(2);
    expect(m.estado.obtener('emsc:1')?.llegadoEn).toBeNull();
    expect(m.vista.ponerFuentes).toHaveBeenCalledWith([{ fuente: 'usgs', estado: 'ok' }]);
    expect(m.vivo.abrir).toHaveBeenCalledTimes(1);
    expect(m.vista.ponerResultado).toHaveBeenLastCalledWith(2);
    expect(m.vista.anunciar).toHaveBeenLastCalledWith('2 sismos cargados.');
    expect(m.vista.ocupada).toHaveBeenLastCalledWith(false);
    expect(m.vista.aviso).toHaveBeenLastCalledWith(null);
    expect(m.cargador).toMatchObject({
      cargaHecha: true,
      consultando: false,
      error: null,
      ultimoEventoId: 'abc-7',
      ultimaCarga: T0,
    });
    // Los avisos de consulta lenta se cancelan al terminar.
    expect(m.r.pendientes).toBe(0);
  });

  it('el stream se abre con el ultimoEventoId de la carga (no antes)', async () => {
    const m = montar();
    /** @type {(string | null)[]} */
    const vistos = [];
    m.vivo.abrir.mockImplementation(() => vistos.push(m.cargador.ultimoEventoId));
    const hecho = m.cargador.cargar('inicial');
    m.consultas[0].resolver(respuesta([sismo()], 'abc-41'));
    await hecho;
    expect(vistos).toEqual(['abc-41']);
  });

  it('sin EventSource: «Datos cargados» con el número y la hora', async () => {
    const m = montar({ eventSource: false });
    const hecho = m.cargador.cargar('inicial');
    m.consultas[0].resolver(respuesta([sismo()]));
    await hecho;
    expect(m.vivo.abrir).not.toHaveBeenCalled();
    expect(m.barra.poner).toHaveBeenLastCalledWith('cargado', { n: 1, hora: T0 });
    expect(m.vista.anunciar).toHaveBeenLastCalledWith('1 sismo cargado.');
  });

  it('cambio de filtros con datos: «Actualizando…» con progreso y «Mostrando n sismos.»', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    m.consultas[0].resolver(respuesta([sismo()]));
    await a;
    const b = m.cargador.cargar('filtros');
    expect(m.barra.poner).toHaveBeenLastCalledWith('actualizando', { n: 1 });
    expect(m.vista.progreso).toHaveBeenLastCalledWith(true);
    m.consultas[1].resolver(respuesta([sismo(), sismo({ id: 'emsc:2' })]));
    await b;
    expect(m.vista.progreso).toHaveBeenLastCalledWith(false);
    expect(m.vista.anunciar).toHaveBeenLastCalledWith('Mostrando 2 sismos.');
    const c = m.cargador.cargar('filtros');
    m.consultas[2].resolver(respuesta([sismo()]));
    await c;
    expect(m.vista.anunciar).toHaveBeenLastCalledWith('Mostrando 1 sismo.');
    const d = m.cargador.cargar('filtros');
    m.consultas[3].resolver(respuesta([]));
    await d;
    expect(m.vista.anunciar).toHaveBeenLastCalledWith('No hay sismos con estos filtros.');
  });

  it('reanudación (flujo.reiniciar): silenciosa, marca como nuevos los que no estaban', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    m.consultas[0].resolver(respuesta([sismo()]));
    await a;
    m.barra.poner.mockClear();
    m.vista.anunciar.mockClear();
    m.vista.ocupada.mockClear();
    const b = m.cargador.cargar('reanudacion');
    expect(m.cargador.consultando).toBe(false);
    expect(m.vista.ocupada).not.toHaveBeenCalledWith(true);
    expect(m.barra.poner).not.toHaveBeenCalled();
    m.consultas[1].resolver(respuesta([sismo(), sismo({ id: 'emsc:nuevo' })]));
    await b;
    expect(m.estado.obtener('emsc:1')?.llegadoEn).toBeNull();
    expect(m.estado.obtener('emsc:nuevo')?.llegadoEn).toBe(T0);
    expect(m.vista.anunciar).not.toHaveBeenCalled();
    expect(m.vivo.abrir).toHaveBeenCalledTimes(2);
  });

  it('sin países: no consulta, vacía la lista y lo anuncia', async () => {
    const m = montar({ filtros: { ...filtrosPorDefecto(), paises: [] } });
    m.estado.reemplazar([sismo()]);
    await m.cargador.cargar('filtros');
    expect(m.api.consultarSismos).not.toHaveBeenCalled();
    expect(m.estado.tamano).toBe(0);
    expect(m.barra.poner).toHaveBeenLastCalledWith('sin-paises');
    expect(m.vista.ponerResultado).toHaveBeenLastCalledWith(0);
    expect(m.vista.anunciar).toHaveBeenLastCalledWith('Selecciona al menos un país.');
    expect(m.cargador.cargaHecha).toBe(true);
    expect(m.vivo.cerrar).toHaveBeenCalledTimes(1);
    expect(m.vivo.abrir).not.toHaveBeenCalled();
  });

  it('una carga nueva cancela la anterior: su respuesta tardía se ignora', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    const b = m.cargador.cargar('filtros');
    expect(m.senales[0].aborted).toBe(true);
    m.consultas[1].resolver(respuesta([sismo({ id: 'emsc:b' })], 'abc-2'));
    await b;
    m.consultas[0].resolver(respuesta([sismo({ id: 'emsc:a' })], 'abc-1'));
    await a;
    expect(m.estado.obtener('emsc:a')).toBeUndefined();
    expect(m.cargador.ultimoEventoId).toBe('abc-2');
    expect(m.vivo.abrir).toHaveBeenCalledTimes(1);
  });

  it('la API devuelve null (sin países en la query): no cambia nada', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    m.consultas[0].resolver(null);
    await a;
    expect(m.cargador.cargaHecha).toBe(false);
    expect(m.vivo.abrir).not.toHaveBeenCalled();
  });
});

describe('crearCargador: consulta lenta', () => {
  it(`a los ${LENTO_MS} ms «lento» y a los ${MUY_LENTO_MS} ms «muy lento» con los filtros`, async () => {
    const filtros = { ...filtrosPorDefecto(), periodo: /** @type {const} */ ('30d') };
    const m = montar({ filtros });
    const hecho = m.cargador.cargar('inicial');
    m.r.avanzar(LENTO_MS - 1);
    expect(m.vista.aviso).not.toHaveBeenCalled();
    m.r.avanzar(1);
    expect(m.vista.aviso).toHaveBeenLastCalledWith('lento', { filtros });
    m.r.avanzar(MUY_LENTO_MS - LENTO_MS);
    expect(m.vista.aviso).toHaveBeenLastCalledWith('muy-lento', { filtros });
    m.consultas[0].resolver(respuesta([]));
    await hecho;
    expect(m.vista.aviso).toHaveBeenLastCalledWith(null);
  });

  it('la recarga silenciosa no muestra avisos de consulta lenta', () => {
    const m = montar();
    m.cargador.cargar('reanudacion');
    m.r.avanzar(MUY_LENTO_MS * 2);
    expect(m.vista.aviso).not.toHaveBeenCalled();
  });
});

describe('crearCargador: errores y reintentos (RNF-06)', () => {
  it('sin datos y sin red: «Sin conexión», anuncio único y reintento con espera creciente', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    m.consultas[0].rechazar(new ErrorApi('red'));
    await a;
    expect(m.barra.poner).toHaveBeenLastCalledWith('sin-conexion', { hora: null });
    expect(m.vista.anunciar).toHaveBeenCalledWith('No se han podido cargar los sismos.');
    expect(m.vista.aviso).toHaveBeenLastCalledWith(null);
    expect(m.cargador.error?.tipo).toBe('red');
    expect(m.cargador.segundosRestantes).toBe(ESPERAS_S[0]);
    expect(m.vista.pintarVacio).toHaveBeenCalled();

    // Cuenta atrás de 5 s; al llegar a 0 se repite la carga.
    m.r.avanzar(1000);
    expect(m.vista.cuenta).toHaveBeenLastCalledWith(4);
    m.r.avanzar(3000);
    expect(m.vista.cuenta).toHaveBeenLastCalledWith(1);
    expect(m.api.consultarSismos).toHaveBeenCalledTimes(1);
    m.r.avanzar(1000);
    expect(m.api.consultarSismos).toHaveBeenCalledTimes(2);
    expect(m.vista.cuenta).toHaveBeenLastCalledWith(null);

    // Segundo fallo: 10 s y sin repetir el anuncio.
    m.vista.anunciar.mockClear();
    m.consultas[1].rechazar(new ErrorApi('red'));
    await vaciarPromesas();
    expect(m.cargador.segundosRestantes).toBe(ESPERAS_S[1]);
    expect(m.vista.anunciar).not.toHaveBeenCalled();
    m.r.avanzar(ESPERAS_S[1] * 1000);
    expect(m.api.consultarSismos).toHaveBeenCalledTimes(3);

    // Al ir bien se olvidan los intentos y el error.
    m.consultas[2].resolver(respuesta([sismo()]));
    await vaciarPromesas();
    expect(m.cargador.error).toBeNull();
    expect(m.vista.anunciar).toHaveBeenLastCalledWith('1 sismo cargado.');
  });

  it('la espera no pasa de 60 s', async () => {
    const m = montar();
    m.cargador.cargar('inicial');
    for (let i = 0; i < ESPERAS_S.length + 2; i += 1) {
      m.consultas[i].rechazar(new ErrorApi('servidor', 500));
      await vaciarPromesas();
      expect(m.cargador.segundosRestantes).toBe(ESPERAS_S[Math.min(i, ESPERAS_S.length - 1)]);
      m.r.avanzar(m.cargador.segundosRestantes * 1000);
    }
  });

  it('con datos, al fallar un cambio de filtros: «Error del servidor» y caja con los anteriores', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    m.consultas[0].resolver(respuesta([sismo()]));
    await a;
    m.vista.anunciar.mockClear();
    const b = m.cargador.cargar('filtros');
    m.consultas[1].rechazar(new ErrorApi('servidor', 503));
    await b;
    expect(m.barra.poner).toHaveBeenLastCalledWith('error-servidor', { hora: T0 });
    expect(m.vista.aviso).toHaveBeenLastCalledWith('error-con-datos');
    expect(m.vista.anunciar).not.toHaveBeenCalled();
    expect(m.estado.tamano).toBe(1);
  });

  it('un error que no es ErrorApi se trata como de red', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    m.consultas[0].rechazar(new TypeError('x'));
    await a;
    expect(m.cargador.error).toBeInstanceOf(ErrorApi);
    expect(m.cargador.error?.tipo).toBe('red');
  });

  it('el error de una consulta cancelada se ignora', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    m.cargador.cargar('filtros');
    m.consultas[0].rechazar(new DOMException('abortada', 'AbortError'));
    await a;
    expect(m.cargador.error).toBeNull();
    expect(m.barra.poner).not.toHaveBeenCalledWith('sin-conexion', expect.anything());
  });

  it('«Reintentar ahora» repite la carga con su motivo y cancela la cuenta atrás', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    m.consultas[0].resolver(respuesta([sismo()]));
    await a;
    const b = m.cargador.cargar('filtros');
    m.consultas[1].rechazar(new ErrorApi('red'));
    await b;
    const c = m.cargador.reintentar();
    expect(m.api.consultarSismos).toHaveBeenCalledTimes(3);
    expect(m.vista.cuenta).toHaveBeenLastCalledWith(null);
    m.consultas[2].resolver(respuesta([sismo(), sismo({ id: 'emsc:2' })]));
    await c;
    // Motivo «filtros»: «Mostrando…», no «cargados».
    expect(m.vista.anunciar).toHaveBeenLastCalledWith('Mostrando 2 sismos.');
    // La cuenta atrás ya no vuelve a cargar.
    m.r.avanzar(120_000);
    expect(m.api.consultarSismos).toHaveBeenCalledTimes(3);
  });

  it('error en la recarga silenciosa con datos: no muestra la caja de error', async () => {
    const m = montar();
    const a = m.cargador.cargar('inicial');
    m.consultas[0].resolver(respuesta([sismo()]));
    await a;
    m.vista.aviso.mockClear();
    const b = m.cargador.cargar('reanudacion');
    m.consultas[1].rechazar(new ErrorApi('red'));
    await b;
    expect(m.vista.aviso).not.toHaveBeenCalledWith('error-con-datos');
    expect(m.barra.poner).toHaveBeenLastCalledWith('sin-conexion', { hora: T0 });
  });
});

describe('crearCargador: dependencias por defecto', () => {
  it('usa los temporizadores y el reloj del entorno, y EventSource si existe', async () => {
    vi.useFakeTimers({ now: T0 });
    try {
      const estado = crearEstado();
      const vivo = { abrir: vi.fn(), cerrar: vi.fn() };
      const barra = { poner: vi.fn() };
      const vista = {
        aviso: vi.fn(),
        progreso: vi.fn(),
        ocupada: vi.fn(),
        pintarVacio: vi.fn(),
        ponerResultado: vi.fn(),
        anunciar: vi.fn(),
        ponerFuentes: vi.fn(),
        cuenta: vi.fn(),
      };
      const consultarSismos = vi
        .fn()
        .mockRejectedValueOnce(new ErrorApi('red'))
        .mockResolvedValueOnce(respuesta([sismo()]));
      const cargador = crearCargador({
        api: /** @type {any} */ ({ consultarSismos }),
        estado,
        vivo,
        barra,
        notificador: { conocer: vi.fn() },
        obtenerFiltros: filtrosPorDefecto,
        vista,
      });
      await cargador.cargar('inicial');
      expect(cargador.error?.tipo).toBe('red');
      await vi.advanceTimersByTimeAsync(ESPERAS_S[0] * 1000);
      expect(consultarSismos).toHaveBeenCalledTimes(2);
      const fin = T0 + ESPERAS_S[0] * 1000;
      expect(cargador.ultimaCarga).toBe(fin);
      // En Node no hay EventSource: «Datos cargados».
      expect(vivo.abrir).not.toHaveBeenCalled();
      expect(barra.poner).toHaveBeenLastCalledWith('cargado', { n: 1, hora: fin });
    } finally {
      vi.useRealTimers();
    }
  });
});
