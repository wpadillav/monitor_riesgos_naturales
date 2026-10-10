// `npm start` con el modelo de permisos de Node (AM-31, T4.8): el servidor funciona con
// lectura limitada al proyecto y sin escritura, procesos hijo ni workers.
// Las opciones se leen del script `start` de package.json para probar exactamente lo que se ejecuta.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const { scripts } = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));

// «node <opciones> src/server/index.js» → opciones y entrada.
const partes = scripts.start.trim().split(/\s+/);
const OPCIONES = partes.slice(1, -1);
const ENTRADA = partes.at(-1);
const OPCIONES_PERMISOS = OPCIONES.filter((o) => !o.startsWith('--env-file'));

/** @type {import('node:child_process').ChildProcess[]} */
const procesos = [];

afterEach(() => {
  for (const p of procesos.splice(0)) p.kill('SIGTERM');
});

async function freePort() {
  const srv = createServer();
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const { port } = /** @type {import('node:net').AddressInfo} */ (srv.address());
  await new Promise((ok) => srv.close(ok));
  return port;
}

/**
 * Ejecuta código con las mismas opciones de permisos que `npm start` y devuelve su salida JSON.
 * @param {string} codigo
 */
function sondear(codigo) {
  const r = spawnSync(
    process.execPath,
    [...OPCIONES_PERMISOS, '--input-type=module', '-e', codigo],
    {
      cwd: RAIZ,
      env: { PATH: process.env.PATH },
      encoding: 'utf8',
    },
  );
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout);
}

describe('npm start con el modelo de permisos de Node (AM-31)', () => {
  it('el script start activa --permission con lectura solo dentro del proyecto', () => {
    expect(partes[0]).toBe('node');
    expect(ENTRADA).toBe('src/server/index.js');
    expect(OPCIONES).toContain('--permission');
    for (const o of OPCIONES.filter((x) => x.startsWith('--allow-'))) {
      expect(o, 'solo se concede lectura de rutas relativas al proyecto').toMatch(
        /^--allow-fs-read=\.\/[\w./-]*$/,
      );
      expect(o).not.toMatch(/\.\./);
    }
  });

  it('niega escritura, procesos hijo, workers y lecturas fuera de lo necesario', () => {
    const permisos = sondear(`
      import { join } from 'node:path';
      const p = process.permission;
      const raiz = process.cwd();
      console.log(JSON.stringify({
        escritura: p.has('fs.write'),
        hijos: p.has('child'),
        workers: p.has('worker'),
        paquete: p.has('fs.read', join(raiz, 'package.json')),
        entrada: p.has('fs.read', join(raiz, 'src/server/index.js')),
        dotenv: p.has('fs.read', join(raiz, '.env')),
        home: p.has('fs.read', ${JSON.stringify(join(homedir(), '.ssh'))}),
        etc: p.has('fs.read', '/etc/passwd'),
      }));
    `);
    expect(permisos).toEqual({
      escritura: false,
      hijos: false,
      workers: false,
      paquete: true,
      entrada: true,
      dotenv: false,
      home: false,
      etc: false,
    });
  });

  it('el servidor arranca y sirve la página, Leaflet y la API con esos permisos', async () => {
    const port = await freePort();
    // Sin red en las pruebas: arranca sin consultar EMSC ni USGS.
    const hijo = spawn(process.execPath, [...OPCIONES, ENTRADA], {
      cwd: RAIZ,
      env: { PATH: process.env.PATH, FUENTES_ACTIVAS: 'no', PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    procesos.push(hijo);
    let stdout = '';
    let stderr = '';
    hijo.stderr.on('data', (d) => (stderr += d));
    await new Promise((ok, ko) => {
      hijo.stdout.on('data', (d) => {
        stdout += d;
        if (stdout.includes('\n')) ok(stdout);
      });
      hijo.on('exit', (code) => ko(new Error(`salió con ${code}: ${stderr}`)));
    });
    expect(stdout).toMatch(
      new RegExp(`^Monitor de Riesgos Naturales en http://localhost:${port}\\n`),
    );

    const base = `http://localhost:${port}`;
    for (const ruta of ['/', '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css']) {
      expect((await fetch(base + ruta)).status, ruta).toBe(200);
    }
    const salud = await fetch(`${base}/api/salud`);
    expect(salud.status).toBe(200);
    expect(await salud.json()).toMatchObject({ estado: 'ok' });
    expect(stderr).not.toMatch(/ERR_ACCESS_DENIED/);
  });
});
