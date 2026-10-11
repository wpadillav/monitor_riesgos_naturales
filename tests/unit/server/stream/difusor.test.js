// Difusor SSE: lotes de 250 ms, filtro por cliente, notificable, Last-Event-ID, flujo.reiniciar,
// heartbeat, plazas y contrapresión (ADR-0002; arquitectura §5.7; AM-13, AM-14, AM-15, AM-17).
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEstadoFuentes } from '../../../../src/server/fuentes/estado-fuentes.js';
import {
  HEARTBEAT_MS,
  HISTORIAL_MAX,
  HISTORIAL_MS,
  LOTE_MS,
  MAX_PENDIENTE_BYTES,
  RETRY_MS,
  createDifusor,
  cumpleFiltro,
} from '../../../../src/server/stream/difusor.js';
import { crearLector, eventos, parsearSse } from '../../../ayudas/sse.js';

const INICIO = Date.parse('2026-10-10T07:00:00.000Z');
const ARRANQUE = Date.parse('2026-10-10T06:00:00.000Z');
const PREFIJO = ARRANQUE.toString(36);
const MIN = 60_000;

const silencio = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() });

/** Catálogo doble: solo `on` y un `emitir` para las pruebas. */
function catalogoDoble() {
  const em = new EventEmitter();
  return {
    on: (evento, oyente) => {
      em.on(evento, oyente);
      return () => em.off(evento, oyente);
    },
    alta: (sismo) => em.emit('alta', { sismo }),
    actualizacion: (anterior, sismo) => em.emit('actualizacion', { sismo, anterior, cambios: [] }),
    baja: (anterior, motivo, reemplazadoPor = null) =>
      em.emit('baja', { id: anterior.id, motivo, reemplazadoPor, anterior }),
    purga: (ids) => em.emit('purga', { ids, motivo: 'retencion' }),
    oyentes: () => em.eventNames().reduce((n, e) => n + em.listenerCount(e), 0),
  };
}

let n = 0;
/** `Sismo` del contrato, con hora de origen relativa a «ahora». */
function sismo({
  id,
  pais = 'PA',
  magnitud = 3.0,
  haceMin = 10,
  revision = 1,
  lugar = 'PANAMA',
} = {}) {
  n += 1;
  const ahora = Date.now();
  return {
    id: id ?? `emsc:20261010_${String(n).padStart(7, '0')}`,
    tiempo: new Date(ahora - haceMin * MIN).toISOString(),
    lat: pais === 'ES' ? 37.2 : 7.8,
    lon: pais === 'ES' ? -3.6 : -81.0,
    profundidadKm: 10,
    magnitud,
    magnitudTipo: 'ml',
    lugar,
    pais,
    zona: pais === 'ES' ? 'ES-PEN' : pais === 'CO' ? 'CO-CONT' : 'PA',
    zonaHoraria: pais === 'ES' ? 'Europe/Madrid' : 'America/Panama',
    autor: pais === 'ES' ? 'IGN' : 'IGC',
    fuentePreferida: 'emsc',
    url: 'https://www.seismicportal.eu/eventdetails.html?unid=20261010_0000106',
    fuentes: [],
    actualizadoEn: new Date(ahora - MIN).toISOString(),
    recibidoEn: new Date(ahora).toISOString(),
    revision,
  };
}

/** Revisión de un sismo con otros valores. */
const revisar = (s, cambios) => ({ ...s, ...cambios, revision: s.revision + 1 });

const FILTRO = Object.freeze({ paises: ['PA'], magMin: 2.0, periodo: '24h', avisoMin: null });

let difusores = [];
function crear(opciones = {}) {
  const catalogo = catalogoDoble();
  const log = silencio();
  const reloj = { ahora: () => Date.now() };
  const estadoFuentes = createEstadoFuentes({ canales: ['emsc-ws', 'usgs'], reloj, log });
  const difusor = createDifusor({
    catalogo,
    estadoFuentes,
    reloj,
    log,
    arrancadoEn: ARRANQUE,
    ...opciones,
  });
  difusores.push(difusor);
  /** Conecta un cliente y devuelve su lector. */
  const conectar = (filtro = FILTRO, ultimoId = null) => {
    const c = difusor.conectar({ filtro, ultimoId });
    if (!c) return null;
    return { ...crearLector(c.cuerpo), cerrar: c.cerrar };
  };
  return { difusor, catalogo, estadoFuentes, log, conectar };
}

/** Avanza el lote de 250 ms. */
const tras = (ms = LOTE_MS) => vi.advanceTimersByTime(ms);

beforeEach(() => {
  // setImmediate real: lo usa el lector para saber que no queda nada en cola.
  vi.useFakeTimers({
    now: INICIO,
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
});

afterEach(() => {
  for (const d of difusores.splice(0)) d.cerrar();
  vi.useRealTimers();
});

describe('cumpleFiltro (arquitectura §5.7)', () => {
  const ahora = INICIO;
  it.each([
    ['país no marcado', { pais: 'ES', magnitud: 5 }, FILTRO, false],
    ['magnitud y periodo', { magnitud: 2.0 }, FILTRO, true],
    ['por debajo de magMin', { magnitud: 1.9 }, FILTRO, false],
    ['fuera del periodo', { haceMin: 120 }, { ...FILTRO, periodo: '1h' }, false],
    ['«Todas» admite cualquier magnitud', { magnitud: 0.1 }, { ...FILTRO, magMin: null }, true],
    [
      'avisoMin amplía la magnitud (D4)',
      { magnitud: 4.46 },
      { ...FILTRO, magMin: 5.0, avisoMin: 4.5 },
      true,
    ],
    [
      'avisoMin amplía el periodo (D4)',
      { magnitud: 4.5, haceMin: 3000 },
      { ...FILTRO, periodo: '1h', avisoMin: 4.5 },
      true,
    ],
    ['avisoMin no salta el país', { pais: 'ES', magnitud: 6 }, { ...FILTRO, avisoMin: 4.5 }, false],
    [
      'redondeo D1: 4.44 no alcanza 4.5',
      { magnitud: 4.44 },
      { ...FILTRO, magMin: 5.0, avisoMin: 4.5 },
      false,
    ],
  ])('%s', (_caso, datos, filtro, esperado) => {
    const s = sismo(datos);
    expect(cumpleFiltro(s, [s.pais], filtro, ahora)).toBe(esperado);
  });

  it('un sismo de la franja CO-PA llega a quien marque cualquiera de los dos', () => {
    const s = sismo({ pais: 'PA' });
    expect(cumpleFiltro(s, ['PA', 'CO'], { ...FILTRO, paises: ['CO'] }, ahora)).toBe(true);
  });
});

describe('conexión y formato', () => {
  it('empieza con retry: 3000 y un estado.fuente por fuente con el id actual', async () => {
    const { conectar } = crear();
    const c = conectar();
    const mensajes = parsearSse(await c.leer());

    expect(mensajes[0]).toEqual({ retry: String(RETRY_MS), comentarios: [] });
    const estados = mensajes.slice(1);
    expect(estados.map((m) => m.event)).toEqual(['estado.fuente', 'estado.fuente']);
    expect(estados.map((m) => m.datos.datos.fuente)).toEqual(['emsc-ws', 'usgs']);
    expect(estados[0].id).toBe(`${PREFIJO}-0`);
    expect(estados[0].datos).toMatchObject({
      tipo: 'estado.fuente',
      version: 1,
      ocurridoEn: '2026-10-10T07:00:00.000Z',
      datos: { fuente: 'emsc-ws', estado: 'iniciando' },
    });
  });

  it('emite sismo.nuevo con el sobre del contrato tras el lote de 250 ms', async () => {
    const { conectar, catalogo, difusor } = crear();
    const c = conectar();
    await c.leer();
    const s = sismo({ magnitud: 4.4 });

    catalogo.alta(s);
    tras(LOTE_MS - 1);
    expect(await c.leer()).toBe('');
    tras(1);
    const [m] = eventos(await c.leer());

    expect(m.id).toBe(`${PREFIJO}-1`);
    expect(m.event).toBe('sismo.nuevo');
    expect(m.datos).toEqual({
      tipo: 'sismo.nuevo',
      version: 1,
      ocurridoEn: new Date(INICIO + LOTE_MS).toISOString(),
      datos: { sismo: s, notificable: true, cambios: [] },
    });
    expect(difusor.ultimoId()).toBe(`${PREFIJO}-1`);
  });

  it('AM-15: un lugar con saltos de línea y «event:» llega como un único evento literal', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar();
    await c.leer();
    const lugar = 'a\n\nevent: hack\ndata: {}\r\nid: 999';

    catalogo.alta(sismo({ lugar }));
    tras();
    const texto = await c.leer();
    const mensajes = parsearSse(texto);

    expect(mensajes).toHaveLength(1);
    expect(mensajes[0].event).toBe('sismo.nuevo');
    expect(mensajes[0].datos.datos.sismo.lugar).toBe(lugar);
    expect(texto.split('\n').filter((l) => l.startsWith('event:'))).toHaveLength(1);
  });

  it('agrupa en un lote los cambios del mismo sismo (AM-17): alta + revisión = un sismo.nuevo', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar();
    await c.leer();
    const s1 = sismo({ magnitud: 3.0 });
    const s2 = revisar(s1, { magnitud: 3.4 });
    const s3 = revisar(s2, { magnitud: 3.6 });

    catalogo.alta(s1);
    catalogo.actualizacion(s1, s2);
    catalogo.actualizacion(s2, s3);
    tras();
    const lista = eventos(await c.leer());

    expect(lista).toHaveLength(1);
    expect(lista[0].event).toBe('sismo.nuevo');
    expect(lista[0].datos.datos.sismo.revision).toBe(3);
    expect(lista[0].datos.datos.cambios).toEqual([]);
  });

  it('un alta y su baja en el mismo lote no llegan a los clientes', async () => {
    const { conectar, catalogo, difusor } = crear();
    const c = conectar();
    await c.leer();
    const s = sismo();

    catalogo.alta(s);
    catalogo.baja(s, 'fusionado', 'usgs:us1');
    tras();

    expect(await c.leer()).toBe('');
    expect(difusor.ultimoId()).toBe(`${PREFIJO}-0`);
  });

  it('la purga por retención no se difunde', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar();
    await c.leer();
    catalogo.purga(['emsc:1']);
    tras();
    expect(await c.leer()).toBe('');
  });

  it('difunde los cambios de estado de las fuentes', async () => {
    const { conectar, estadoFuentes } = crear();
    const c = conectar();
    await c.leer();

    estadoFuentes.registrarExito('emsc-ws');
    tras();
    const [m] = eventos(await c.leer());

    expect(m.event).toBe('estado.fuente');
    expect(m.datos.datos).toMatchObject({ fuente: 'emsc-ws', estado: 'ok' });
  });
});

describe('filtro por cliente (HU-01, arquitectura §5.7)', () => {
  it('cada cliente recibe solo lo de sus países y su magnitud', async () => {
    const { conectar, catalogo } = crear();
    const pa = conectar({ ...FILTRO, paises: ['PA'] });
    const es = conectar({ ...FILTRO, paises: ['ES'], magMin: 3.0 });
    await pa.leer();
    await es.leer();

    catalogo.alta(sismo({ pais: 'ES', magnitud: 4.0, id: 'emsc:es1' }));
    catalogo.alta(sismo({ pais: 'ES', magnitud: 2.5, id: 'emsc:es2' }));
    catalogo.alta(sismo({ pais: 'PA', magnitud: 2.5, id: 'emsc:pa1' }));
    tras();

    expect(eventos(await pa.leer()).map((m) => m.datos.datos.sismo.id)).toEqual(['emsc:pa1']);
    expect(eventos(await es.leer()).map((m) => m.datos.datos.sismo.id)).toEqual(['emsc:es1']);
  });

  it('una revisión que entra en el filtro llega como sismo.nuevo con sus cambios', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar();
    await c.leer();
    const s1 = sismo({ magnitud: 1.8 });
    catalogo.alta(s1);
    tras();
    expect(await c.leer()).toBe('');

    const s2 = revisar(s1, { magnitud: 2.3 });
    catalogo.actualizacion(s1, s2);
    tras();
    const [m] = eventos(await c.leer());

    expect(m.event).toBe('sismo.nuevo');
    expect(m.datos.datos.cambios).toEqual(['magnitud']);
  });

  it('una revisión dentro del filtro es sismo.actualizado; si sale, sismo.eliminado fuera-de-filtro', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar();
    const s1 = sismo({ magnitud: 2.3 });
    catalogo.alta(s1);
    tras();
    await c.leer();

    const s2 = revisar(s1, { magnitud: 2.6 });
    catalogo.actualizacion(s1, s2);
    tras();
    const [act] = eventos(await c.leer());
    expect(act.event).toBe('sismo.actualizado');
    expect(act.datos.datos).toMatchObject({ cambios: ['magnitud'], sismo: { magnitud: 2.6 } });

    const s3 = revisar(s2, { magnitud: 1.9 });
    catalogo.actualizacion(s2, s3);
    tras();
    const [baja] = eventos(await c.leer());
    expect(baja.event).toBe('sismo.eliminado');
    expect(baja.datos.datos).toEqual({
      id: s1.id,
      motivo: 'fuera-de-filtro',
      reemplazadoPor: null,
    });
  });

  it('un cambio de país saca el sismo de un cliente y lo mete en otro', async () => {
    const { conectar, catalogo } = crear();
    const pa = conectar({ ...FILTRO, paises: ['PA'] });
    const co = conectar({ ...FILTRO, paises: ['CO'] });
    const s1 = sismo({ pais: 'PA' });
    catalogo.alta(s1);
    tras();
    await pa.leer();
    await co.leer();

    catalogo.actualizacion(s1, revisar(s1, { pais: 'CO', zona: 'CO-CONT' }));
    tras();

    expect(eventos(await pa.leer())[0].datos.datos).toMatchObject({ motivo: 'fuera-de-filtro' });
    expect(eventos(await co.leer())[0].event).toBe('sismo.nuevo');
  });

  it('las bajas del catálogo llegan con su motivo a los clientes del país (fusionado)', async () => {
    const { conectar, catalogo } = crear();
    const pa = conectar({ ...FILTRO, paises: ['PA'], magMin: 5.0 });
    const es = conectar({ ...FILTRO, paises: ['ES'] });
    const s = sismo({ magnitud: 2.5 });
    catalogo.alta(s);
    tras();
    await pa.leer();
    await es.leer();

    catalogo.baja(s, 'fusionado', 'usgs:us6000u1cz');
    tras();

    // Aunque no cumpla magMin: quitar lo que no se tiene es inocuo y traslada el «notificado».
    expect(eventos(await pa.leer())[0].datos).toMatchObject({
      tipo: 'sismo.eliminado',
      datos: { id: s.id, motivo: 'fusionado', reemplazadoPor: 'usgs:us6000u1cz' },
    });
    expect(await es.leer()).toBe('');
  });

  it('usa paisesDe para la franja CO-PA', async () => {
    const { conectar, catalogo } = crear({ paisesDe: (s) => [s.pais, 'CO'] });
    const co = conectar({ ...FILTRO, paises: ['CO'] });
    await co.leer();
    catalogo.alta(sismo({ pais: 'PA' }));
    tras();
    expect(eventos(await co.leer())).toHaveLength(1);
  });
});

describe('notificable en el stream (PRD E4, ADR-0004)', () => {
  const AVISOS = Object.freeze({ paises: ['PA'], magMin: 5.0, periodo: '24h', avisoMin: 4.5 });

  it('M 4.5 exacta llega con notificable aunque la lista pida M ≥ 5.0 (D1, D4)', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar(AVISOS);
    await c.leer();

    catalogo.alta(sismo({ magnitud: 4.5, id: 'emsc:exacto' }));
    catalogo.alta(sismo({ magnitud: 4.44, id: 'emsc:debajo' }));
    tras();
    const lista = eventos(await c.leer());

    expect(lista.map((m) => m.datos.datos.sismo.id)).toEqual(['emsc:exacto']);
    expect(lista[0].datos.datos.notificable).toBe(true);
  });

  it('un sismo de un país desmarcado no llega al cliente (no puede notificarse)', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar(AVISOS);
    await c.leer();
    catalogo.alta(sismo({ pais: 'ES', magnitud: 5.0 }));
    tras();
    expect(await c.leer()).toBe('');
  });

  it('un sismo con origen de hace más de 1 h llega con notificable: false (alta tardía)', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar(AVISOS);
    await c.leer();

    catalogo.alta(sismo({ magnitud: 5.0, haceMin: 61, id: 'emsc:tarde' }));
    catalogo.alta(sismo({ magnitud: 5.0, haceMin: 59, id: 'emsc:reciente' }));
    tras();
    const porId = Object.fromEntries(
      eventos(await c.leer()).map((m) => [m.datos.datos.sismo.id, m.datos.datos.notificable]),
    );

    expect(porId).toEqual({ 'emsc:tarde': false, 'emsc:reciente': true });
  });

  it('respeta AVISO_VENTANA_MIN', async () => {
    const { conectar, catalogo } = crear({ ventanaAvisoMin: 120 });
    const c = conectar(AVISOS);
    await c.leer();
    catalogo.alta(sismo({ magnitud: 5.0, haceMin: 90 }));
    tras();
    expect(eventos(await c.leer())[0].datos.datos.notificable).toBe(true);
  });

  it('actualización frente a alta: las dos llevan notificable por la hora de origen', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar(AVISOS);
    await c.leer();
    const reciente = sismo({ magnitud: 4.3, haceMin: 5 });
    const antiguo = sismo({ magnitud: 5.1, haceMin: 300 });
    catalogo.alta(reciente);
    catalogo.alta(antiguo);
    tras();
    const altas = eventos(await c.leer());
    // 4.3 no alcanza el aviso ni la lista (5.0): solo llega el antiguo, no notificable.
    expect(altas.map((m) => [m.event, m.datos.datos.notificable])).toEqual([
      ['sismo.nuevo', false],
    ]);

    // Revisión que cruza el umbral (HU-11): entra como nuevo y es notificable.
    catalogo.actualizacion(reciente, revisar(reciente, { magnitud: 4.8 }));
    // Revisión de un sismo antiguo ya mostrado: actualizado, no notificable.
    catalogo.actualizacion(antiguo, revisar(antiguo, { magnitud: 5.3 }));
    tras();
    const revisiones = eventos(await c.leer()).map((m) => [m.event, m.datos.datos.notificable]);

    expect(revisiones).toEqual([
      ['sismo.nuevo', true],
      ['sismo.actualizado', false],
    ]);
  });

  it('una actualización reciente de un sismo ya enviado es sismo.actualizado notificable', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar(AVISOS);
    const s = sismo({ magnitud: 4.6, haceMin: 2 });
    catalogo.alta(s);
    tras();
    const altas = eventos(await c.leer()).filter((m) => m.event === 'sismo.nuevo');
    expect(altas.map((m) => m.datos.datos.notificable)).toEqual([true]);

    catalogo.actualizacion(s, revisar(s, { magnitud: 4.7 }));
    tras();
    const [m] = eventos(await c.leer());
    expect([m.event, m.datos.datos.notificable]).toEqual(['sismo.actualizado', true]);
  });

  it('durante la carga inicial nada es notificable (PRD E4)', async () => {
    let carga = true;
    const { conectar, catalogo } = crear({ enCargaInicial: () => carga });
    const c = conectar(AVISOS);
    await c.leer();

    catalogo.alta(sismo({ magnitud: 6.0, haceMin: 1 }));
    tras();
    expect(eventos(await c.leer())[0].datos.datos.notificable).toBe(false);

    carga = false;
    catalogo.alta(sismo({ magnitud: 6.0, haceMin: 1 }));
    tras();
    expect(eventos(await c.leer())[0].datos.datos.notificable).toBe(true);
  });

  it('el reenvío al reanudar conserva el valor original de notificable', async () => {
    const { conectar, catalogo } = crear();
    const desde = conectar(AVISOS);
    await desde.leer();
    catalogo.alta(sismo({ magnitud: 5.0, haceMin: 55 }));
    tras();
    await desde.leer();

    vi.advanceTimersByTime(10 * MIN); // el origen ya es de hace 65 min
    const c = conectar(AVISOS, `${PREFIJO}-0`);
    const [m] = eventos(await c.leer()).filter((e) => e.event === 'sismo.nuevo');

    expect(m.datos.datos.notificable).toBe(true);
  });
});

describe('reanudación con Last-Event-ID', () => {
  /** Emite `k` altas en lotes separados y devuelve sus ids de sismo. */
  function emitir(catalogo, k, datos = {}) {
    const ids = [];
    for (let i = 0; i < k; i += 1) {
      const s = sismo(datos);
      ids.push(s.id);
      catalogo.alta(s);
      tras();
    }
    return ids;
  }

  it('reenvía lo posterior al id que cumple el filtro y termina con el estado actual', async () => {
    const { conectar, catalogo } = crear();
    emitir(catalogo, 1);
    const ids = emitir(catalogo, 2);
    catalogo.alta(sismo({ pais: 'ES' }));
    tras();

    const c = conectar(FILTRO, `${PREFIJO}-1`);
    const lista = eventos(await c.leer());

    expect(lista.map((m) => [m.id, m.event])).toEqual([
      [`${PREFIJO}-2`, 'sismo.nuevo'],
      [`${PREFIJO}-3`, 'sismo.nuevo'],
      [`${PREFIJO}-4`, 'estado.fuente'],
      [`${PREFIJO}-4`, 'estado.fuente'],
    ]);
    expect(lista.slice(0, 2).map((m) => m.datos.datos.sismo.id)).toEqual(ids);
  });

  it('con el id actual no reenvía nada', async () => {
    const { conectar, catalogo } = crear();
    emitir(catalogo, 3);
    const c = conectar(FILTRO, `${PREFIJO}-3`);
    expect(eventos(await c.leer()).map((m) => m.event)).toEqual(['estado.fuente', 'estado.fuente']);
  });

  it('id de otro arranque → flujo.reiniciar (arranque-distinto)', async () => {
    const { conectar, catalogo } = crear();
    emitir(catalogo, 2);
    const c = conectar(FILTRO, 'lx3k9a-1');
    const [m] = eventos(await c.leer());

    expect(m).toMatchObject({ id: `${PREFIJO}-2`, event: 'flujo.reiniciar' });
    expect(m.datos).toMatchObject({
      tipo: 'flujo.reiniciar',
      datos: { motivo: 'arranque-distinto' },
    });
  });

  it('id más antiguo que el historial (2 000 eventos) → flujo.reiniciar (historial-insuficiente)', async () => {
    const { conectar, catalogo } = crear();
    for (let i = 0; i < HISTORIAL_MAX + 1; i += 1) catalogo.alta(sismo());
    tras();

    const viejo = conectar(FILTRO, `${PREFIJO}-0`);
    const [m] = eventos(await viejo.leer());
    expect(m.datos.datos).toEqual({ motivo: 'historial-insuficiente' });

    const justo = conectar(FILTRO, `${PREFIJO}-1`);
    const reenviados = eventos(await justo.leer()).filter((e) => e.event === 'sismo.nuevo');
    expect(reenviados).toHaveLength(HISTORIAL_MAX);
    expect(reenviados[0].id).toBe(`${PREFIJO}-2`);
  });

  it('id más antiguo que 15 min → flujo.reiniciar', async () => {
    const { conectar, catalogo } = crear();
    emitir(catalogo, 2);
    vi.advanceTimersByTime(HISTORIAL_MS + HEARTBEAT_MS);

    const c = conectar(FILTRO, `${PREFIJO}-1`);
    expect(eventos(await c.leer())[0].datos.datos).toEqual({ motivo: 'historial-insuficiente' });
  });

  it('id del futuro → flujo.reiniciar', async () => {
    const { conectar } = crear();
    const c = conectar(FILTRO, `${PREFIJO}-5`);
    expect(eventos(await c.leer())[0].event).toBe('flujo.reiniciar');
  });

  it.each([
    'abc',
    '-1',
    '1e309',
    '99999999999999999999',
    `${PREFIJO}-99999999999999999999`,
    `${PREFIJO}--1`,
    `${PREFIJO}-1.5`,
    'x'.repeat(10_000),
    `${PREFIJO}-1\nevent: hack`,
  ])('AM-14: un id manipulado (%s) no lanza y da flujo.reiniciar', async (id) => {
    const { conectar, catalogo } = crear();
    emitir(catalogo, 3);
    const c = conectar(FILTRO, id);
    const lista = eventos(await c.leer());

    expect(lista[0].event).toBe('flujo.reiniciar');
    expect(lista.filter((m) => m.event === 'sismo.nuevo')).toHaveLength(0);
  });
});

describe('mantenimiento, plazas y contrapresión (AM-13)', () => {
  it('envía un evento «latido» cada 20 s, visible para EventSource (no un comentario)', async () => {
    const { conectar } = crear();
    const c = conectar();
    await c.leer();

    vi.advanceTimersByTime(HEARTBEAT_MS - 1);
    expect(await c.leer()).toBe('');
    vi.advanceTimersByTime(1);
    const texto = await c.leer();

    expect(texto).toBe(
      `id: ${PREFIJO}-0\nevent: latido\ndata: ` +
        `{"tipo":"latido","version":1,"ocurridoEn":"${new Date(INICIO + HEARTBEAT_MS).toISOString()}","datos":{}}\n\n`,
    );
    expect(parsearSse(texto)).toEqual([
      {
        comentarios: [],
        id: `${PREFIJO}-0`,
        event: 'latido',
        data: expect.any(String),
        datos: {
          tipo: 'latido',
          version: 1,
          ocurridoEn: new Date(INICIO + HEARTBEAT_MS).toISOString(),
          datos: {},
        },
      },
    ]);
    vi.advanceTimersByTime(HEARTBEAT_MS * 8);
    expect(eventos(await c.leer()).map((m) => m.event)).toEqual(Array(8).fill('latido'));
  });

  it('el latido no consume secuencia: lleva el id del último evento emitido', async () => {
    const { conectar, catalogo, difusor } = crear();
    const c = conectar();
    await c.leer();
    catalogo.alta(sismo());
    tras();
    expect(eventos(await c.leer())[0].id).toBe(`${PREFIJO}-1`);

    vi.advanceTimersByTime(HEARTBEAT_MS);
    const [latido] = eventos(await c.leer());
    expect(latido).toMatchObject({ event: 'latido', id: `${PREFIJO}-1` });
    expect(difusor.ultimoId()).toBe(`${PREFIJO}-1`);

    catalogo.alta(sismo());
    tras();
    expect(eventos(await c.leer())[0].id).toBe(`${PREFIJO}-2`);
  });

  it('reanudar desde el id de un latido no reenvía ni reinicia nada', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar();
    await c.leer();
    catalogo.alta(sismo());
    tras();
    vi.advanceTimersByTime(HEARTBEAT_MS);
    const latido = eventos(await c.leer()).find((m) => m.event === 'latido');
    c.cerrar();

    const otra = conectar(FILTRO, latido.id);
    const tipos = eventos(await otra.leer()).map((m) => m.event);
    expect(tipos.every((t) => t === 'estado.fuente')).toBe(true);
  });

  it('el latido no lleva datos del cliente ni de las fuentes (AM-15)', async () => {
    const { conectar } = crear();
    const a = conectar({ ...FILTRO, paises: ['ES'] });
    const b = conectar({ ...FILTRO, paises: ['PA'], avisoMin: 4.5 });
    await a.leer();
    await b.leer();
    vi.advanceTimersByTime(HEARTBEAT_MS);
    const ta = await a.leer();
    expect(ta).toBe(await b.leer());
    expect(ta.split('\n').filter((l) => l.startsWith('data:'))).toHaveLength(1);
  });

  it('hayPlaza() refleja las plazas libres sin ocupar ninguna', () => {
    const { conectar, difusor } = crear({ maxClientes: 1 });
    expect(difusor.hayPlaza()).toBe(true);
    expect(difusor.contarClientes()).toBe(0);
    const c = conectar();
    expect(difusor.hayPlaza()).toBe(false);
    c.cerrar();
    expect(difusor.hayPlaza()).toBe(true);
    difusor.cerrar();
    expect(difusor.hayPlaza()).toBe(false);
  });

  it('admite 8 clientes; el noveno no tiene plaza; al cerrar uno, entra otro; sin fugas', async () => {
    const { conectar, difusor } = crear();
    const abiertos = Array.from({ length: 8 }, () => conectar());

    expect(abiertos.every(Boolean)).toBe(true);
    expect(conectar()).toBeNull();

    await abiertos[0].cancelar();
    expect(difusor.contarClientes()).toBe(7);
    expect(conectar()).not.toBeNull();

    for (const c of abiertos.slice(1)) c.cerrar();
    expect(difusor.contarClientes()).toBe(1);
  });

  it('respeta SSE_MAX_CLIENTES', () => {
    const { conectar } = crear({ maxClientes: 2 });
    expect(conectar()).not.toBeNull();
    expect(conectar()).not.toBeNull();
    expect(conectar()).toBeNull();
  });

  it('desconecta al cliente que acumula más de 1 MiB sin leer', async () => {
    const { conectar, catalogo, difusor, log } = crear();
    const lento = conectar({ ...FILTRO, magMin: null });
    const rapido = conectar({ ...FILTRO, magMin: null });
    await rapido.leer();

    // ~1 000 sismos con el lugar más largo (200 caracteres): más de 1 MiB en un lote.
    let bytes = 0;
    for (let i = 0; bytes <= MAX_PENDIENTE_BYTES; i += 1) {
      const s = sismo({ lugar: 'X'.repeat(200) });
      bytes += JSON.stringify(s).length;
      catalogo.alta(s);
    }
    tras();

    expect(difusor.contarClientes()).toBe(1);
    expect(log.warn).toHaveBeenCalledWith('sse.cliente-lento', expect.any(Object));
    await lento.leer();
    expect(lento.estado.error).toBeInstanceOf(Error);
    // El cliente que lee sigue conectado y lo recibe todo.
    expect(eventos(await rapido.leer()).length).toBeGreaterThan(500);
    expect(rapido.estado.fin).toBe(false);
  });

  it('cerrar() envía lo pendiente, cierra los flujos y se desuscribe', async () => {
    const { conectar, catalogo, difusor } = crear();
    const c = conectar();
    await c.leer();
    catalogo.alta(sismo());

    difusor.cerrar();
    const lista = eventos(await c.leer());

    expect(lista.map((m) => m.event)).toEqual(['sismo.nuevo']);
    expect(c.estado.fin).toBe(true);
    expect(difusor.contarClientes()).toBe(0);
    expect(catalogo.oyentes()).toBe(0);
    expect(difusor.conectar({ filtro: FILTRO })).toBeNull();
  });
});

describe('casos límite (T5.1)', () => {
  it('una baja sin motivo ni reemplazo llega como «retirado» con reemplazadoPor null', async () => {
    const { conectar, catalogo } = crear();
    const c = conectar();
    const s = sismo();
    catalogo.alta(s);
    tras();
    await c.leer();

    catalogo.baja(s, undefined, undefined);
    tras();

    expect(eventos(await c.leer())[0].datos).toMatchObject({
      tipo: 'sismo.eliminado',
      datos: { id: s.id, motivo: 'retirado', reemplazadoPor: null },
    });
  });

  it('vaciar() envía el lote en curso sin esperar los 250 ms', async () => {
    const { conectar, catalogo, difusor } = crear();
    const c = conectar();
    await c.leer();
    const s = sismo();

    catalogo.alta(s);
    difusor.vaciar();

    expect(eventos(await c.leer()).map((e) => e.datos.tipo)).toEqual(['sismo.nuevo']);
    tras();
    expect(await c.leer()).toBe('');
  });

  it('vaciar() sin nada pendiente no envía nada', async () => {
    const { conectar, difusor } = crear();
    const c = conectar();
    await c.leer();

    difusor.vaciar();

    expect(await c.leer()).toBe('');
  });

  it('cerrar la conexión dos veces no falla ni libera dos plazas', () => {
    const { difusor, conectar } = crear();
    const c = conectar();
    expect(difusor.contarClientes()).toBe(1);

    c.cerrar();
    c.cerrar();

    expect(difusor.contarClientes()).toBe(0);
  });
});
