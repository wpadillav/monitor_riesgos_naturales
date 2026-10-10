// Arranque real del proceso: loopback, HOST inválido, puerto ocupado y Host en la red (AM-09, AM-10, HU-12).
import { spawn } from 'node:child_process';
import { request as httpRequest, createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const ENTRADA = fileURLToPath(new URL('../../src/server/index.js', import.meta.url));

/** @type {import('node:child_process').ChildProcess[]} */
const procesos = [];

afterEach(() => {
  for (const p of procesos.splice(0)) p.kill('SIGTERM');
});

/** Puerto libre en loopback. */
async function freePort() {
  const srv = createServer();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const { port } = /** @type {import('node:net').AddressInfo} */ (srv.address());
  await new Promise((ok) => srv.close(ok));
  return port;
}

/** @param {Record<string, string>} env */
function start(env) {
  // Sin red en las pruebas: el proceso arranca sin consultar EMSC ni USGS.
  const hijo = spawn(process.execPath, [ENTRADA], {
    env: { PATH: process.env.PATH, FUENTES_ACTIVAS: 'no', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  procesos.push(hijo);
  let stdout = '';
  let stderr = '';
  hijo.stdout.on('data', (d) => (stdout += d));
  hijo.stderr.on('data', (d) => (stderr += d));
  const salida = new Promise((ok) => hijo.on('exit', (code) => ok({ code, stdout, stderr })));
  const escuchando = new Promise((ok, ko) => {
    hijo.stdout.on('data', () => stdout.includes('\n') && ok(stdout));
    hijo.on('exit', (code) => ko(new Error(`salió con ${code}: ${stderr}`)));
  });
  // Las pruebas que esperan un fallo de arranque no usan esta promesa.
  escuchando.catch(() => {});
  return { hijo, salida, escuchando };
}

/** GET con Host arbitrario (fetch no permite fijar Host). */
function get(port, ruta, host) {
  return new Promise((ok, ko) => {
    const req = httpRequest({ host: '127.0.0.1', port, path: ruta, headers: { host } }, (res) => {
      let cuerpo = '';
      res.on('data', (d) => (cuerpo += d));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, cuerpo }));
    });
    req.on('error', ko);
    req.end();
  });
}

describe('arranque del servidor', () => {
  it('rechaza un HOST que no es loopback: sale con código ≠ 0 sin escuchar', async () => {
    const { salida } = start({ HOST: '0.0.0.0', PORT: String(await freePort()) });
    const { code, stdout, stderr } = await salida;

    expect(code).not.toBe(0);
    expect(stderr).toMatch(/HOST solo admite 127\.0\.0\.1 o ::1/);
    expect(stdout).not.toMatch(/http:\/\/localhost/);
  });

  it('rechaza PORT fuera de rango con código ≠ 0', async () => {
    const { code, stderr } = await start({ PORT: '80' }).salida;
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/PORT/);
  });

  it('escucha en 127.0.0.1, anuncia la URL y aplica la lista de Host', async () => {
    const port = await freePort();
    const { escuchando } = start({ PORT: String(port) });

    expect(await escuchando).toMatch(
      new RegExp(`^Monitor de Riesgos Naturales en http://localhost:${port}\\n`),
    );

    const salud = await get(port, '/api/salud', `localhost:${port}`);
    expect(salud.status).toBe(200);
    expect(JSON.parse(salud.cuerpo)).toMatchObject({ estado: 'ok', version: '2.0.0' });

    const rebinding = await get(port, '/', 'evil.test');
    expect(rebinding.status).toBe(421);
    expect(rebinding.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('con el puerto ocupado explica cómo cambiarlo y sale con código ≠ 0', async () => {
    const ocupado = createServer();
    await new Promise((ok) => ocupado.listen(0, '127.0.0.1', ok));
    const { port } = /** @type {import('node:net').AddressInfo} */ (ocupado.address());

    try {
      const { code, stderr } = await start({ PORT: String(port) }).salida;
      expect(code).not.toBe(0);
      expect(stderr).toMatch(new RegExp(`puerto ${port} está ocupado.*PORT=`));
    } finally {
      await new Promise((ok) => ocupado.close(ok));
    }
  });
});
