// Política de `uncaughtException` del proceso real (R-04, N-02 y N-03; arquitectura §7):
// registra `proceso.excepcion`, apaga, sale con código 1 y deja el puerto libre. Un SIGTERM
// durante ese apagado no rebaja el código de salida a 0.
//
// La excepción la provoca `tests/ayudas/provocar-excepcion.js`, cargado con `node --import`, al
// recibir SIGUSR2. El servidor no tiene ningún disparador propio.
import { spawn } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ENTRADA = fileURLToPath(new URL('../../src/server/index.js', import.meta.url));
const DISPARADOR = fileURLToPath(new URL('../ayudas/provocar-excepcion.js', import.meta.url));

/** @type {import('node:child_process').ChildProcess[]} */
const procesos = [];
/** @type {import('node:net').Socket[]} */
const sockets = [];

afterEach(() => {
  for (const s of sockets.splice(0)) s.destroy();
  for (const p of procesos.splice(0)) if (p.exitCode === null) p.kill('SIGKILL');
});

/** Puerto libre en loopback. */
async function freePort() {
  const srv = createServer();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const { port } = /** @type {import('node:net').AddressInfo} */ (srv.address());
  await new Promise((ok) => srv.close(ok));
  return port;
}

/**
 * @param {number} port
 * @returns {Promise<boolean>} se puede escuchar en el puerto
 */
function puertoLibre(port) {
  return new Promise((ok) => {
    const srv = createServer();
    srv.once('error', () => ok(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => ok(true)));
  });
}

/** @param {number} port */
function start(port) {
  const hijo = spawn(process.execPath, ['--import', DISPARADOR, ENTRADA], {
    env: {
      PATH: process.env.PATH,
      FUENTES_ACTIVAS: 'no',
      LOG_FORMATO: 'json',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procesos.push(hijo);
  let stdout = '';
  hijo.stdout.on('data', (d) => (stdout += d));
  /** @type {Promise<{ code: number | null, signal: string | null }>} */
  const salida = new Promise((ok) => hijo.on('exit', (code, signal) => ok({ code, signal })));
  /** @param {string} texto */
  const esperar = (texto) =>
    new Promise((ok, ko) => {
      const mirar = () => stdout.includes(texto) && ok(stdout);
      hijo.stdout.on('data', mirar);
      hijo.on('exit', (code) => ko(new Error(`salió con ${code} sin «${texto}»: ${stdout}`)));
      mirar();
    });
  const eventos = () =>
    stdout
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .map((l) => JSON.parse(l));
  return { hijo, salida, esperar, eventos };
}

/**
 * Deja una petición a medias (cabeceras sin terminar): `server.close` no la cierra por ociosa,
 * así que el apagado sigue en curso hasta que el proceso sale.
 * @param {number} port
 */
async function peticionAMedias(port) {
  const s = connect(port, '127.0.0.1');
  sockets.push(s);
  s.on('error', () => {});
  await new Promise((ok) => s.once('connect', ok));
  s.write(`GET /api/salud HTTP/1.1\r\nHost: localhost:${port}\r\n`);
}

describe('política de uncaughtException (N-03)', () => {
  it('registra proceso.excepcion, sale con código 1 y deja el puerto libre', async () => {
    const port = await freePort();
    const { hijo, salida, esperar, eventos } = start(port);
    await esperar('servidor.escuchando');
    expect(await puertoLibre(port)).toBe(false);

    hijo.kill('SIGUSR2');
    const { code, signal } = await salida;

    expect(signal).toBeNull();
    expect(code).toBe(1);
    const excepcion = eventos().find((e) => e.evento === 'proceso.excepcion');
    expect(excepcion).toMatchObject({
      nivel: 'error',
      origen: 'uncaughtException',
      mensaje: 'excepción provocada por la prueba (N-03)',
    });
    expect(await puertoLibre(port)).toBe(true);
  }, 15_000);

  it('un SIGTERM durante el apagado por excepción sigue saliendo con código 1 (N-02)', async () => {
    const port = await freePort();
    const { hijo, salida, esperar, eventos } = start(port);
    await esperar('servidor.escuchando');
    await peticionAMedias(port);

    hijo.kill('SIGUSR2');
    await esperar('proceso.excepcion');
    // La petición a medias mantiene el apagado en curso: la señal llega antes de salir.
    expect(hijo.exitCode).toBeNull();
    hijo.kill('SIGTERM');
    const { code, signal } = await salida;

    expect(signal).toBeNull();
    expect(code).toBe(1);
    expect(eventos().map((e) => e.evento)).toEqual(
      expect.arrayContaining(['proceso.excepcion', 'servidor.parando']),
    );
    expect(await puertoLibre(port)).toBe(true);
  }, 15_000);
});
