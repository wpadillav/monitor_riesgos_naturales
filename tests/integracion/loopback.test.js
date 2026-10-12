// RNF-09 y AM-09: el proceso real solo escucha en loopback. Complementa `arranque.test.js`
// (que valida `HOST` y la lista de `Host`) comprobando **dónde está el socket**:
// - la tabla de sockets del núcleo (`/proc/net/tcp` y `tcp6`, Linux, el único entorno del
//   proyecto) tiene una sola escucha en ese puerto, en 127.0.0.1 o en ::1;
// - una conexión a ese puerto por cualquier otra dirección del propio equipo se rechaza.
// El intento desde un segundo equipo de la red sigue siendo manual (plan de pruebas §3).

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, connect } from 'node:net';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ENTRADA = fileURLToPath(new URL('../../src/server/index.js', import.meta.url));
const HAY_PROC = existsSync('/proc/net/tcp') && existsSync('/proc/net/tcp6');

/** @type {import('node:child_process').ChildProcess[]} */
const procesos = [];

afterEach(async () => {
  for (const p of procesos.splice(0)) {
    if (p.exitCode !== null || p.pid === undefined) continue;
    const fin = new Promise((ok) => p.once('exit', ok));
    process.kill(p.pid, 'SIGTERM');
    await fin;
  }
});

/** Puerto libre (comprobado en las dos familias). */
async function puertoLibre() {
  const srv = createServer();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(undefined)));
  const { port } = /** @type {import('node:net').AddressInfo} */ (srv.address());
  await new Promise((ok) => srv.close(() => ok(undefined)));
  return port;
}

/**
 * Arranca el servidor real sin fuentes y espera la primera línea («… en http://localhost:…»).
 * @param {Record<string, string>} env
 */
async function arrancar(env) {
  const hijo = spawn(process.execPath, [ENTRADA], {
    env: { PATH: process.env.PATH, FUENTES_ACTIVAS: 'no', LOG_NIVEL: 'warn', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procesos.push(hijo);
  let salida = '';
  let errores = '';
  hijo.stderr.on('data', (d) => (errores += d));
  await new Promise((ok, ko) => {
    hijo.stdout.on('data', (d) => {
      salida += d;
      if (salida.includes('\n')) ok(undefined);
    });
    hijo.on('exit', (code) => ko(new Error(`salió con ${code}: ${errores}`)));
  });
  return hijo;
}

/**
 * Direcciones locales en escucha TCP (estado `0A`) en un puerto, leídas de `/proc/net/tcp{,6}`.
 * @param {number} puerto
 * @returns {string[]} en hexadecimal tal como las da el núcleo
 */
function escuchasEnPuerto(puerto) {
  const puertoHex = puerto.toString(16).toUpperCase().padStart(4, '0');
  return ['/proc/net/tcp', '/proc/net/tcp6'].flatMap((ruta) =>
    readFileSync(ruta, 'utf8')
      .split('\n')
      .slice(1)
      .map((l) => l.trim().split(/\s+/))
      .filter((c) => c.length > 3 && c[3] === '0A' && c[1].endsWith(`:${puertoHex}`))
      .map((c) => c[1].split(':')[0]),
  );
}

/** 127.0.0.1 y ::1 tal como aparecen en `/proc/net/tcp` y `tcp6` (palabras en little-endian). */
const LOOPBACK_V4 = '0100007F';
const LOOPBACK_V6 = '00000000000000000000000001000000';

/** Direcciones del propio equipo que **no** son loopback (pueden no existir: sin red). */
function direccionesNoLoopback() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((d) => d && !d.internal && !(d.family === 'IPv6' && d.scopeid))
    .map((d) => /** @type {import('node:os').NetworkInterfaceInfo} */ (d).address);
}

/**
 * Intenta abrir una conexión TCP. Devuelve `'conectado'` o el código de error.
 * @param {string} host
 * @param {number} puerto
 */
function intentarConexion(host, puerto) {
  return new Promise((ok) => {
    const s = connect({ host, port: puerto, timeout: 3_000 });
    s.once('connect', () => {
      s.destroy();
      ok('conectado');
    });
    s.once('timeout', () => {
      s.destroy();
      ok('ETIMEDOUT');
    });
    s.once('error', (e) => ok(/** @type {NodeJS.ErrnoException} */ (e).code));
  });
}

describe('el servidor solo escucha en loopback (RNF-09, AM-09)', () => {
  it.skipIf(!HAY_PROC)('por defecto: una única escucha, en 127.0.0.1', async () => {
    const puerto = await puertoLibre();
    await arrancar({ PORT: String(puerto) });

    expect(escuchasEnPuerto(puerto)).toEqual([LOOPBACK_V4]);
  });

  it.skipIf(!HAY_PROC)('con HOST=::1: una única escucha, en ::1', async () => {
    const puerto = await puertoLibre();
    await arrancar({ PORT: String(puerto), HOST: '::1' });

    expect(escuchasEnPuerto(puerto)).toEqual([LOOPBACK_V6]);
    expect(await intentarConexion('127.0.0.1', puerto)).toBe('ECONNREFUSED');
    expect(await intentarConexion('::1', puerto)).toBe('conectado');
  });

  it('por loopback se conecta y por cualquier otra dirección del equipo se rechaza', async () => {
    const puerto = await puertoLibre();
    await arrancar({ PORT: String(puerto) });

    expect(await intentarConexion('127.0.0.1', puerto)).toBe('conectado');
    const otras = direccionesNoLoopback();
    for (const direccion of otras) {
      expect(await intentarConexion(direccion, puerto), direccion).toBe('ECONNREFUSED');
    }
  });

  it('una dirección de loopback que no es la de escucha (127.0.0.2) también se rechaza', async () => {
    const puerto = await puertoLibre();
    await arrancar({ PORT: String(puerto) });

    expect(await intentarConexion('127.0.0.2', puerto)).toBe('ECONNREFUSED');
  });
});
