// Cliente del WebSocket de EMSC con un doble del socket y reloj simulado (sin red): fixture
// real, espera creciente con jitter, ping/pong, estado de la fuente, frames de más de 64 KiB,
// ráfaga con la cola llena y acciones create/update/delete (ADR-0002; AM-03, AM-05, AM-17).
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCatalogo } from '../../../../src/server/dominio/catalogo.js';
import {
  CAIDA_MS,
  ESPERA_MAX_MS,
  ESTABLE_MS,
  MAX_COLA,
  MAX_FRAME_BYTES,
  MENSAJE_INGESTA_FALLIDA,
  PING_MS,
  PONG_TIMEOUT_MS,
  URL_EMSC_WS,
  calcularEspera,
  createEmscWs,
  interpretarMensaje,
} from '../../../../src/server/fuentes/emsc-ws.js';
import { createEstadoFuentes } from '../../../../src/server/fuentes/estado-fuentes.js';
import { asignarPais } from '../../../../src/server/geo/asignar-pais.js';
import { ZONAS } from '../../../../src/shared/zonas.js';

const FIXTURE = readFileSync(
  new URL('../../../fixtures/emsc-ws/mensajes.jsonl', import.meta.url),
  'utf8',
)
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

const ZONAS_WS = ZONAS.map((z) => ({ id: z.id, rectangulo: z.rectangulo }));

/** Doble de `ws.WebSocket`: emite los mismos eventos y registra las llamadas. */
class SocketDoble extends EventEmitter {
  constructor(url, opciones) {
    super();
    this.url = url;
    this.opciones = opciones;
    this.pings = 0;
    this.autoPong = true; // como un servidor sano
    this.terminado = false;
    this.cerradoCon = null;
  }
  ping() {
    this.pings += 1;
    if (this.autoPong) this.emit('pong');
  }
  terminate() {
    this.terminado = true;
    this.emit('close', 1006);
  }
  close(codigo) {
    this.cerradoCon = codigo;
    this.emit('close', codigo);
  }
  abrir() {
    this.emit('open');
  }
  /** @param {string | Buffer} datos */
  recibir(datos, esBinario = false) {
    this.emit('message', typeof datos === 'string' ? Buffer.from(datos) : datos, esBinario);
  }
  cortar(codigo = 1006) {
    this.emit('close', codigo);
  }
}

/** Mensaje de EMSC en Panamá con el formato real del fixture. */
function mensajePanama(unid, { accion = 'create', mag = 4.4, haceMs = 60_000, lat, lon } = {}) {
  const ahora = Date.now();
  return JSON.stringify({
    action: accion,
    data: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon ?? -81.056, lat ?? 7.8117, -5.0] },
      id: unid,
      properties: {
        source_id: '2072298',
        source_catalog: 'EMSC-RTS',
        lastupdate: new Date(ahora - 2000).toISOString(),
        time: new Date(ahora - haceMs).toISOString(),
        flynn_region: 'PANAMA',
        lat: lat ?? 7.8117,
        lon: lon ?? -81.056,
        depth: 5.0,
        evtype: 'ke',
        auth: 'IGC',
        mag,
        magtype: 'm',
        unid,
      },
    },
  });
}

function crear(opciones = {}) {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const reloj = { ahora: () => Date.now() };
  const catalogo = createCatalogo({ asignarPais, log });
  const estado = createEstadoFuentes({ canales: ['emsc-ws'], reloj, log });
  const metricas = { registrar: vi.fn() };
  /** @type {SocketDoble[]} */
  const sockets = [];
  const alDesbordar = vi.fn();
  const cliente = createEmscWs({
    catalogo,
    estado,
    reloj,
    log,
    metricas,
    zonas: ZONAS_WS,
    userAgent: 'Prueba/1.0',
    aleatorio: () => 0.5, // jitter 0 → esperas exactas
    crearSocket: (url, o) => {
      const s = new SocketDoble(url, o);
      sockets.push(s);
      return s;
    },
    alDesbordar,
    ...opciones,
  });
  const ultimo = () => sockets[sockets.length - 1];
  const estadoWs = () => estado.obtener()[0];
  return { cliente, catalogo, estado, estadoWs, log, metricas, sockets, ultimo, alDesbordar };
}

/** Deja correr el drenaje de la cola (setImmediate simulado). */
const drenar = () => vi.advanceTimersByTime(0);

let activos = [];
beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse('2026-10-10T06:00:00.000Z') });
});
afterEach(() => {
  for (const c of activos.splice(0)) c.detener();
  vi.useRealTimers();
});

/** Crea y arranca. */
function arrancado(opciones) {
  const ctx = crear(opciones);
  ctx.cliente.arrancar();
  activos.push(ctx.cliente);
  return ctx;
}

describe('calcularEspera (RNF-06, ADR-0002)', () => {
  it('crece 1 s, 2 s, 4 s… y se queda en 60 s', () => {
    const sinJitter = () => 0.5;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map((i) => calcularEspera(i, sinJitter))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ]);
  });

  it('aplica ±20 % de jitter sin pasar nunca de 60 s', () => {
    expect(calcularEspera(0, () => 0)).toBe(800);
    expect(calcularEspera(0, () => 0.999_999)).toBe(1200);
    expect(calcularEspera(10, () => 0)).toBe(48_000);
    expect(calcularEspera(10, () => 0.999_999)).toBe(ESPERA_MAX_MS);
  });
});

describe('interpretarMensaje (AM-03, AM-05, AM-17)', () => {
  const ahora = Date.parse('2026-10-10T06:08:33.000Z');

  it('interpreta los tres mensajes reales del fixture', () => {
    const r = FIXTURE.map((m) => interpretarMensaje(Buffer.from(m.raw), false, ahora));
    expect(r.map((x) => [x.tipo, x.accion, x.registro?.idFuente])).toEqual([
      ['registro', 'update', '20261010_0000104'],
      ['registro', 'create', '20261009_0000392'],
      ['registro', 'create', '20261010_0000106'],
    ]);
    expect(r[2].registro).toMatchObject({ autor: 'IGC', magnitud: 4.4, profundidadKm: 5 });
  });

  it.each([
    ['JSON truncado', '{"action":"create","data":{', 'json'],
    ['frame «{»', '{', 'json'],
    ['null', 'null', 'accion'],
    ['acción desconocida', '{"action":"borrar","data":{}}', 'accion'],
    ['sin data', '{"action":"create"}', 'entrada'],
    ['data que no es Feature', '{"action":"create","data":"x"}', 'entrada'],
    ['delete sin id', '{"action":"delete","data":{}}', 'id'],
    [
      '__proto__ en properties',
      '{"action":"create","data":{"properties":{"__proto__":{"polluted":1}}}}',
      'tipo',
    ],
  ])('descarta %s sin lanzar', (_caso, texto, motivo) => {
    expect(interpretarMensaje(Buffer.from(texto), false, ahora)).toEqual({
      tipo: 'descarte',
      motivo,
    });
    expect(/** @type {any} */ ({}).polluted).toBeUndefined();
  });

  it('descarta los frames binarios', () => {
    expect(interpretarMensaje(Buffer.from('{}'), true, ahora)).toEqual({
      tipo: 'descarte',
      motivo: 'binario',
    });
  });

  it('descarta un frame de más de 64 KiB sin parsearlo', () => {
    const parse = vi.spyOn(JSON, 'parse');
    const grande = Buffer.alloc(1024 * 1024, 0x20);

    expect(interpretarMensaje(grande, false, ahora)).toEqual({
      tipo: 'descarte',
      motivo: 'tamano',
    });
    expect(parse).not.toHaveBeenCalled();
  });

  it('admite un frame de exactamente 64 KiB', () => {
    const base = FIXTURE[2].raw;
    const justo = base + ' '.repeat(MAX_FRAME_BYTES - Buffer.byteLength(base));
    expect(Buffer.byteLength(justo)).toBe(MAX_FRAME_BYTES);
    expect(interpretarMensaje(Buffer.from(justo), false, ahora).tipo).toBe('registro');
    expect(interpretarMensaje(Buffer.from(`${justo} `), false, ahora)).toMatchObject({
      motivo: 'tamano',
    });
  });

  it('delete y las reclasificaciones son retiros', () => {
    expect(
      interpretarMensaje(
        Buffer.from('{"action":"delete","data":{"properties":{"unid":"20261010_0000106"}}}'),
        false,
        ahora,
      ),
    ).toEqual({ tipo: 'retiro', accion: 'delete', idFuente: '20261010_0000106' });
    expect(
      interpretarMensaje(
        Buffer.from('{"action":"delete","data":{"id":"20261010_0000106"}}'),
        false,
        ahora,
      ),
    ).toMatchObject({ tipo: 'retiro', idFuente: '20261010_0000106' });
    const voladura = FIXTURE[2].raw.replace('"evtype": "ke"', '"evtype": "qb"');
    expect(interpretarMensaje(Buffer.from(voladura), false, ahora)).toEqual({
      tipo: 'retiro',
      accion: 'create',
      idFuente: '20261010_0000106',
    });
  });
});

describe('conexión', () => {
  it('se conecta a la URL fija wss:// con maxPayload de 64 KiB, sin redirecciones', () => {
    const { ultimo } = arrancado();
    expect(URL_EMSC_WS).toBe('wss://www.seismicportal.eu/standing_order/websocket');
    expect(ultimo().url).toBe(URL_EMSC_WS);
    expect(ultimo().opciones).toMatchObject({
      maxPayload: 64 * 1024,
      followRedirects: false,
      handshakeTimeout: 10_000,
      headers: { 'User-Agent': 'Prueba/1.0' },
    });
    expect(ultimo().opciones).not.toHaveProperty('rejectUnauthorized');
  });

  it('reproduce mensajes.jsonl: solo el sismo de Panamá entra en el catálogo, con su latencia', () => {
    const { ultimo, catalogo, metricas, log, estadoWs } = arrancado();
    ultimo().abrir();
    expect(estadoWs().estado).toBe('ok');

    for (const m of FIXTURE) {
      vi.setSystemTime(Date.parse(m.received_at));
      ultimo().recibir(m.raw);
      drenar();
    }

    const { sismos } = catalogo.listar({ paises: ['ES', 'CO', 'PA'], magMin: null, desde: 0 });
    expect(sismos.map((s) => [s.id, s.pais, s.autor, s.magnitud])).toEqual([
      ['emsc:20261010_0000106', 'PA', 'IGC', 4.4],
    ]);
    expect(catalogo.contar()).toBe(1); // California y las Aleutianas quedan fuera de las zonas
    expect(log.info).toHaveBeenCalledWith('sismo.recibido', {
      fuente: 'emsc',
      canal: 'ws',
      zona: 'PA',
      idFuente: '20261010_0000106',
      accion: 'alta',
      mensaje: 'create',
      // 06:08:33.000 − lastupdate 06:08:30.760 y − origen 06:04:20.0
      publicacionARecepcionMs: 2240,
      origenARecepcionMs: 253_000,
    });
    expect(metricas.registrar).toHaveBeenCalledTimes(1);
    expect(metricas.registrar).toHaveBeenCalledWith({
      fuente: 'emsc',
      canal: 'ws',
      publicacionARecepcionMs: 2240,
      origenARecepcionMs: 253_000,
    });
  });

  it('ingiere por lotes: los mensajes de un mismo turno van en un solo ingerirLote', () => {
    const real = createCatalogo({ asignarPais });
    const lote = vi.fn(real.ingerirLote);
    const { ultimo } = arrancado({ catalogo: { ...real, ingerirLote: lote } });
    ultimo().abrir();
    ultimo().recibir(mensajePanama('20261010_0000001'));
    ultimo().recibir(mensajePanama('20261010_0000002', { lat: 8.5, lon: -79.5 }));
    expect(lote).not.toHaveBeenCalled();

    drenar();
    expect(lote).toHaveBeenCalledTimes(1);
    expect(lote.mock.calls[0][0]).toHaveLength(2);
  });

  it('update revisa el sismo; un repetido no se registra como recepción', () => {
    const { ultimo, catalogo, metricas } = arrancado();
    ultimo().abrir();
    ultimo().recibir(mensajePanama('20261010_0000106', { mag: 4.3 }));
    drenar();
    vi.advanceTimersByTime(5000);
    const revision = mensajePanama('20261010_0000106', { accion: 'update', mag: 4.8 });
    ultimo().recibir(revision);
    drenar();
    ultimo().recibir(revision);
    drenar();

    expect(catalogo.obtener('emsc:20261010_0000106')).toMatchObject({ magnitud: 4.8, revision: 2 });
    expect(metricas.registrar).toHaveBeenCalledTimes(2);
  });

  it('delete retira el sismo del catálogo', () => {
    const { ultimo, catalogo, log } = arrancado();
    ultimo().abrir();
    ultimo().recibir(mensajePanama('20261010_0000106'));
    ultimo().recibir('{"action":"delete","data":{"properties":{"unid":"20261010_0000106"}}}');
    drenar();

    expect(catalogo.contar()).toBe(0);
    expect(log.info).toHaveBeenCalledWith('sismo.retirado', {
      fuente: 'emsc',
      canal: 'ws',
      idFuente: '20261010_0000106',
    });
  });

  it('la revisión de un sismo conocido que sale de las zonas sí llega al catálogo', () => {
    const { ultimo, catalogo } = arrancado();
    const bajas = [];
    catalogo.on('baja', (b) => bajas.push(b.motivo));
    ultimo().abrir();
    ultimo().recibir(mensajePanama('20261010_0000106'));
    drenar();
    vi.advanceTimersByTime(1000);
    ultimo().recibir(mensajePanama('20261010_0000106', { accion: 'update', lat: 34, lon: -117 }));
    drenar();

    expect(bajas).toEqual(['fuera-de-zona']);
  });

  it('un mensaje malformado no detiene la ingesta del resto (AM-03)', () => {
    const { ultimo, catalogo } = arrancado();
    ultimo().abrir();
    ultimo().recibir('{');
    ultimo().recibir(Buffer.from([0xff, 0xfe]), true);
    ultimo().recibir(mensajePanama('20261010_0000106'));
    expect(() => drenar()).not.toThrow();
    expect(catalogo.contar()).toBe(1);
  });

  it('descarta antes de encolar un frame de más de 64 KiB', () => {
    const { ultimo, cliente, catalogo } = arrancado();
    ultimo().abrir();
    ultimo().recibir('x'.repeat(MAX_FRAME_BYTES + 1));
    drenar();
    expect(cliente.estadisticas()).toMatchObject({ descartados: 1, cola: 0 });
    expect(catalogo.contar()).toBe(0);
  });
});

describe('ráfaga con la cola llena (AM-17)', () => {
  it('10 000 frames de golpe: 1 000 en cola, el resto descartado y una sola resincronización', () => {
    const { ultimo, cliente, catalogo, alDesbordar, log } = arrancado();
    ultimo().abrir();
    const frames = Array.from({ length: 10_000 }, (_, i) =>
      mensajePanama(`20261010_${String(i).padStart(7, '0')}`, {
        lat: 7.2 + (i % 100) * 0.02,
        lon: -82 + Math.floor(i / 100) * 0.04,
      }),
    );

    const inicio = performance.now();
    for (const f of frames) ultimo().recibir(f);
    expect(cliente.estadisticas()).toMatchObject({ cola: MAX_COLA, perdidos: 9000 });
    expect(alDesbordar).toHaveBeenCalledTimes(1);

    drenar();
    expect(performance.now() - inicio).toBeLessThan(5000);
    expect(cliente.estadisticas()).toMatchObject({ cola: 0, ingeridos: MAX_COLA });
    expect(catalogo.contar()).toBeLessThanOrEqual(MAX_COLA);
    expect(log.warn).toHaveBeenCalledWith('fuente.cola-desbordada', {
      fuente: 'emsc-ws',
      perdidos: 9000,
    });

    // Una ráfaga posterior es otro episodio: otra resincronización.
    for (let i = 0; i < MAX_COLA + 1; i += 1) ultimo().recibir('{}');
    expect(alDesbordar).toHaveBeenCalledTimes(2);
  });
});

describe('reconexión y estado de la fuente (arquitectura §5.3 y §7)', () => {
  it('reintenta con espera creciente 1, 2, 4, 8… s hasta 60 s', () => {
    const { sockets, ultimo, log } = arrancado();
    const esperas = [];
    for (let i = 0; i < 9; i += 1) {
      ultimo().cortar();
      const n = sockets.length;
      const espera = log.info.mock.calls.at(-1)[1].esperaMs;
      esperas.push(espera);
      vi.advanceTimersByTime(espera - 1);
      expect(sockets).toHaveLength(n);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(n + 1);
    }
    expect(esperas).toEqual([1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000]);
    expect(log.info).toHaveBeenCalledWith('fuente.reconexion', {
      fuente: 'emsc-ws',
      intento: 1,
      esperaMs: 1000,
      codigo: 1006,
    });
  });

  it('cierre → degradada; sin reconectar en 30 s → caida; open → ok', () => {
    const { ultimo, estadoWs } = arrancado();
    ultimo().abrir();
    expect(estadoWs().estado).toBe('ok');

    ultimo().cortar();
    expect(estadoWs()).toMatchObject({
      estado: 'degradada',
      proximoIntentoEn: '2026-10-10T06:00:01.000Z',
    });

    // Intentos fallidos: sigue degradada hasta cumplir 30 s sin conexión.
    vi.advanceTimersByTime(1000);
    ultimo().cortar();
    vi.advanceTimersByTime(2000);
    ultimo().cortar();
    expect(estadoWs().estado).toBe('degradada');
    vi.advanceTimersByTime(CAIDA_MS - 3000);
    expect(estadoWs().estado).toBe('caida');

    vi.advanceTimersByTime(4000);
    ultimo().cortar();
    expect(estadoWs().estado).toBe('caida'); // un fallo más no la sube a degradada

    vi.advanceTimersByTime(8000);
    ultimo().abrir();
    expect(estadoWs()).toMatchObject({ estado: 'ok', mensaje: null, proximoIntentoEn: null });
  });

  it('la espera vuelve a 1 s tras 60 s de conexión estable', () => {
    const { ultimo, log } = arrancado();
    const ultimaEspera = () => log.info.mock.calls.at(-1)[1].esperaMs;
    for (const espera of [1000, 2000, 4000]) {
      ultimo().cortar();
      expect(ultimaEspera()).toBe(espera);
      vi.advanceTimersByTime(espera);
    }
    // Conexión corta: la espera sigue creciendo.
    ultimo().abrir();
    vi.advanceTimersByTime(ESTABLE_MS - 1);
    ultimo().cortar();
    expect(ultimaEspera()).toBe(8000);
    vi.advanceTimersByTime(8000);

    ultimo().abrir();
    vi.advanceTimersByTime(ESTABLE_MS);
    ultimo().cortar();
    expect(ultimaEspera()).toBe(1000);
  });

  it('el primer reintento llega en ≤ 5 s con cualquier jitter (RNF-06)', () => {
    for (const a of [0, 0.25, 0.75, 0.999_999])
      expect(calcularEspera(0, () => a)).toBeLessThan(5000);
  });

  it('envía ping cada 15 s y corta si no llega el pong en 10 s', () => {
    const { ultimo, sockets, log } = arrancado();
    const ws = ultimo();
    ws.autoPong = false;
    ws.abrir();

    vi.advanceTimersByTime(PING_MS);
    expect(ws.pings).toBe(1);
    ws.emit('pong');
    vi.advanceTimersByTime(PING_MS);
    expect(ws.pings).toBe(2);
    expect(ws.terminado).toBe(false);

    vi.advanceTimersByTime(PONG_TIMEOUT_MS);
    expect(ws.terminado).toBe(true);
    expect(log.warn).toHaveBeenCalledWith('fuente.sin-pong', expect.any(Object));
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
  });

  it('un frame demasiado grande en ws (cierre 1009) cuenta como descarte y reconecta', () => {
    const { ultimo, sockets, cliente } = arrancado();
    ultimo().abrir();
    const err = Object.assign(new RangeError('Max payload size exceeded'), {
      code: 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH',
    });
    ultimo().emit('error', err);
    ultimo().cortar(1009);

    expect(cliente.estadisticas().descartados).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
  });

  it('si crear el socket lanza, se reintenta igualmente', () => {
    let primera = true;
    const sockets = [];
    const { estadoWs } = arrancado({
      crearSocket: (url, o) => {
        if (primera) {
          primera = false;
          throw new SyntaxError('URL inválida');
        }
        const s = new SocketDoble(url, o);
        sockets.push(s);
        return s;
      },
    });
    expect(estadoWs().estado).toBe('degradada');
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(1);
  });

  it('detener() cierra con 1000 y no vuelve a conectar', () => {
    const { cliente, ultimo, sockets } = arrancado();
    const ws = ultimo();
    ws.abrir();
    cliente.detener();

    expect(ws.cerradoCon).toBe(1000);
    vi.advanceTimersByTime(10 * 60_000);
    expect(sockets).toHaveLength(1);
    expect(ws.pings).toBe(0);
  });

  it('ignora los eventos de un socket ya sustituido', () => {
    const { ultimo, sockets, catalogo } = arrancado();
    const viejo = ultimo();
    viejo.cortar();
    vi.advanceTimersByTime(1000);
    viejo.recibir(mensajePanama('20261010_0000106'));
    viejo.cortar();
    drenar();

    expect(catalogo.contar()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
  });
});

describe('casos límite de entrada y del ciclo de vida (T5.1)', () => {
  const ahora = Date.parse('2026-10-10T06:08:33.000Z');
  const crudo = FIXTURE[2].raw;

  it('acepta el frame como texto, ArrayBuffer o lista de Buffer (fragmentos)', () => {
    const bytes = Buffer.from(crudo);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const mitad = Math.floor(bytes.length / 2);

    for (const datos of [crudo, arrayBuffer, [bytes.subarray(0, mitad), bytes.subarray(mitad)]]) {
      expect(interpretarMensaje(datos, false, ahora)).toMatchObject({
        tipo: 'registro',
        registro: { idFuente: '20261010_0000106' },
      });
    }
  });

  it.each([
    ['un número', 42],
    ['undefined', undefined],
    ['una lista con algo que no es Buffer', [Buffer.from('{'), 'x']],
  ])('descarta como «entrada» %s sin lanzar', (_caso, datos) => {
    expect(interpretarMensaje(/** @type {any} */ (datos), false, ahora)).toEqual({
      tipo: 'descarte',
      motivo: 'entrada',
    });
  });

  it('delete con un id que no cumple el patrón se descarta', () => {
    expect(
      interpretarMensaje('{"action":"delete","data":{"id":"../../etc"}}', false, ahora),
    ).toEqual({ tipo: 'descarte', motivo: 'id' });
  });

  it('mide los fragmentos de un mensaje antes de encolarlo (AM-17)', () => {
    const { ultimo, cliente } = arrancado();
    ultimo().abrir();
    const trozo = Buffer.alloc(MAX_FRAME_BYTES / 2 + 1, 0x20);

    ultimo().recibir(/** @type {any} */ ([trozo, trozo]));

    expect(cliente.estadisticas()).toMatchObject({ descartados: 1, cola: 0 });
  });

  it('un error sin código se registra como «desconocido» y no rompe la conexión', () => {
    const { ultimo, log, cliente } = arrancado();
    ultimo().abrir();

    ultimo().emit('error', new Error('texto del servidor remoto'));

    expect(log.debug).toHaveBeenCalledWith('fuente.error', {
      fuente: 'emsc-ws',
      codigo: 'desconocido',
    });
    expect(JSON.stringify(log.debug.mock.calls)).not.toContain('texto del servidor remoto');
    expect(cliente.estadisticas().abierto).toBe(true);
  });

  it('un código de error largo se recorta a 40 caracteres (AM-29)', () => {
    const { ultimo, log } = arrancado();
    ultimo().emit('error', Object.assign(new Error('x'), { code: 'E'.repeat(100) }));

    expect(log.debug).toHaveBeenCalledWith('fuente.error', {
      fuente: 'emsc-ws',
      codigo: 'E'.repeat(40),
    });
  });

  it('un cierre sin código numérico reconecta igualmente', () => {
    const { ultimo, sockets, log } = arrancado();
    ultimo().abrir();

    ultimo().emit('close', undefined);
    vi.advanceTimersByTime(1000);

    expect(sockets).toHaveLength(2);
    expect(log.info).toHaveBeenCalledWith('fuente.reconexion', {
      fuente: 'emsc-ws',
      intento: 1,
      esperaMs: 1000,
      codigo: undefined,
    });
  });

  it('el pong de un socket ya sustituido no cancela la espera del socket nuevo', () => {
    const { ultimo, sockets } = arrancado();
    const viejo = ultimo();
    viejo.cortar();
    vi.advanceTimersByTime(1000);
    const nuevo = ultimo();
    nuevo.autoPong = false;
    nuevo.abrir();

    vi.advanceTimersByTime(PING_MS);
    viejo.emit('pong');
    vi.advanceTimersByTime(PONG_TIMEOUT_MS);

    expect(nuevo.terminado).toBe(true);
    expect(sockets).toHaveLength(2);
  });

  it('si alDesbordar lanza, se registra el error y la ingesta sigue', () => {
    const { ultimo, log, cliente } = arrancado({
      alDesbordar: () => {
        throw new Error('fallo al resincronizar');
      },
    });
    ultimo().abrir();

    for (let i = 0; i < MAX_COLA + 1; i += 1) ultimo().recibir('{}');

    expect(log.error).toHaveBeenCalledWith('error', { mensaje: 'fallo al resincronizar' });
    expect(cliente.estadisticas()).toMatchObject({ cola: MAX_COLA, perdidos: 1 });
    drenar();
    expect(cliente.estadisticas().cola).toBe(0);
  });

  it('si el catálogo lanza en ingerirLote, se registra y el WebSocket sigue vivo (R-04)', () => {
    const real = createCatalogo({ asignarPais });
    let fallar = true;
    const ingerirLote = vi.fn((registros, opciones) => {
      if (fallar) throw new Error('catálogo roto');
      return real.ingerirLote(registros, opciones);
    });
    const { ultimo, sockets, log, cliente } = arrancado({ catalogo: { ...real, ingerirLote } });
    const ws = ultimo();
    ws.abrir();

    ws.recibir(mensajePanama('20261010_0000201'));
    // `drenar` corre en setImmediate: si lanzara, sería una excepción no capturada.
    expect(() => drenar()).not.toThrow();
    expect(log.error).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        fuente: 'emsc-ws',
        mensaje: 'Ingesta del WebSocket: catálogo roto',
      }),
    );
    expect(ws.terminado).toBe(false);
    expect(sockets).toHaveLength(1);
    expect(cliente.estadisticas()).toMatchObject({ abierto: true, cola: 0 });

    // El siguiente mensaje entra con normalidad.
    fallar = false;
    ws.recibir(mensajePanama('20261010_0000202'));
    drenar();
    expect(real.obtener('emsc:20261010_0000202')).not.toBeNull();
  });

  it('un fallo de ingerirLote deja el canal degradado hasta la siguiente ingesta buena (N-07)', () => {
    const real = createCatalogo({ asignarPais });
    let fallar = true;
    const ingerirLote = vi.fn((registros, opciones) => {
      if (fallar) throw new Error('catálogo roto');
      return real.ingerirLote(registros, opciones);
    });
    const { ultimo, estadoWs } = arrancado({ catalogo: { ...real, ingerirLote } });
    const ws = ultimo();
    ws.abrir();
    expect(estadoWs().estado).toBe('ok');

    ws.recibir(mensajePanama('20261010_0000203'));
    drenar();
    expect(estadoWs()).toMatchObject({
      estado: 'degradada',
      mensaje: MENSAJE_INGESTA_FALLIDA,
      proximoIntentoEn: null,
    });

    // Un segundo fallo no repite el cambio de estado.
    ws.recibir(mensajePanama('20261010_0000204'));
    drenar();
    expect(estadoWs().estado).toBe('degradada');

    fallar = false;
    ws.recibir(mensajePanama('20261010_0000205'));
    drenar();
    expect(estadoWs()).toMatchObject({ estado: 'ok', mensaje: null });
  });

  it('un fallo de ingesta tras cerrarse el socket no pisa el estado de la reconexión (N-07)', () => {
    const real = createCatalogo({ asignarPais });
    const ingerirLote = vi.fn(() => {
      throw new Error('catálogo roto');
    });
    const { ultimo, estadoWs } = arrancado({ catalogo: { ...real, ingerirLote } });
    const ws = ultimo();
    ws.abrir();
    ws.recibir(mensajePanama('20261010_0000206'));
    ws.cortar();
    drenar();
    expect(estadoWs().mensaje).not.toBe(MENSAJE_INGESTA_FALLIDA);
  });

  it('si el catálogo lanza al retirar, se registra y sigue con el resto del lote (R-04)', () => {
    const real = createCatalogo({ asignarPais });
    const retirar = vi.fn(() => {
      throw 'retiro roto';
    });
    const { ultimo, log } = arrancado({ catalogo: { ...real, retirar } });
    ultimo().abrir();
    ultimo().recibir('{"action":"delete","data":{"properties":{"unid":"20261010_0000300"}}}');
    ultimo().recibir(mensajePanama('20261010_0000301'));
    expect(() => drenar()).not.toThrow();
    expect(log.error).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ mensaje: 'Retiro del WebSocket: retiro roto', pila: undefined }),
    );
    expect(real.obtener('emsc:20261010_0000301')).not.toBeNull();
  });

  it('un fallo fuera de la ingesta (p. ej. en conoce) tampoco escapa del drenaje (R-04)', () => {
    const real = createCatalogo({ asignarPais });
    const conoce = vi.fn(() => {
      throw new Error('índice roto');
    });
    const { ultimo, log } = arrancado({ catalogo: { ...real, conoce } });
    ultimo().abrir();
    // Fuera de las zonas: el drenaje consulta `conoce`.
    ultimo().recibir(mensajePanama('20261010_0000302', { lat: 50, lon: 10 }));
    expect(() => drenar()).not.toThrow();
    expect(log.error).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ mensaje: 'Drenaje del WebSocket: índice roto' }),
    );
  });

  it('arrancar dos veces no abre dos conexiones', () => {
    const { cliente, sockets } = arrancado();

    cliente.arrancar();

    expect(sockets).toHaveLength(1);
  });

  it('detener() corta con terminate si close lanza', () => {
    const { cliente, ultimo } = arrancado();
    const ws = ultimo();
    ws.abrir();
    ws.close = () => {
      throw new Error('socket roto');
    };

    expect(() => cliente.detener()).not.toThrow();
    expect(ws.terminado).toBe(true);
  });
});
