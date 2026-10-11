/**
 * Orquestador de las mediciones del servidor (T5.4). Para cada volumen de `VOLUMENES`
 * (0, 10 000 y 50 000 sismos por defecto):
 * 1. arranca `servidor-sintetico.js` con `--expose-gc` y espera a que termine la carga;
 * 2. mide la memoria (RSS con `ps` y `process.memoryUsage()` tras GC);
 * 3. con sismos, ejecuta `carga-api.js` y `sse-rafaga.js` (1 000 sismos en un lote y en lotes de 1);
 * 4. guarda `docs/rendimiento/datos/servidor-<N>.json` y para el servidor.
 *
 * También mide el RSS en reposo del arranque real (`src/server/index.js` con FUENTES_ACTIVAS=no).
 *
 * Uso: `node scripts/rendimiento/medir-servidor.js [volúmenes=0,10000,50000]`
 */

import { execFile, execFileSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const DATOS = `${RAIZ}docs/rendimiento/datos`;
const VOLUMENES = (process.argv[2] ?? '0,10000,50000').split(',').map(Number);
const ejecutar = promisify(execFile);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const rssMb = (pid) =>
  Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)]).toString()) / 1024);

/** @param {string[]} args @param {Record<string, string>} env */
function arrancar(args, env) {
  const hijo = spawn(process.execPath, args, {
    cwd: RAIZ,
    env: { ...process.env, PORT: '3008', CONTROL_PORT: '3009', ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const listo = new Promise((ok) => {
    let texto = '';
    hijo.stdout.on('data', (b) => {
      texto += b.toString();
      const linea = texto
        .split('\n')
        .find((l) => l.startsWith('{"listo"') || l.includes('http://localhost'));
      if (linea) ok(linea.startsWith('{') ? JSON.parse(linea) : { listo: true });
    });
  });
  return { hijo, listo };
}

async function parar(hijo) {
  hijo.kill('SIGTERM');
  await new Promise((r) => hijo.once('exit', r));
}

// RSS en reposo del arranque real, sin fuentes.
{
  const { hijo, listo } = arrancar(
    [
      '--permission',
      '--allow-fs-read=./package.json',
      '--allow-fs-read=./src/',
      '--allow-fs-read=./public/',
      '--allow-fs-read=./node_modules/',
      'src/server/index.js',
    ],
    { FUENTES_ACTIVAS: 'no', LOG_NIVEL: 'warn' },
  );
  await listo;
  await espera(3000);
  const rss = rssMb(hijo.pid);
  await parar(hijo);
  writeFileSync(`${DATOS}/servidor-reposo-real.json`, JSON.stringify({ rssMb: rss }, null, 2));
  console.error(`reposo real: ${rss} MB`);
}

for (const n of VOLUMENES) {
  const t0 = Date.now();
  const { hijo, listo } = arrancar(['--expose-gc', 'scripts/rendimiento/servidor-sintetico.js'], {
    N_SISMOS: String(n),
  });
  const carga = await listo;
  console.error(`N=${n}: carga en ${Date.now() - t0} ms`);
  await espera(2000);
  const gc = await (await fetch('http://127.0.0.1:3009/gc')).json();
  const salida = { n, carga, memoriaTrasGc: gc.memoria, rssPsMb: rssMb(hijo.pid) };
  if (n > 0) {
    const api = await ejecutar(
      process.execPath,
      ['scripts/rendimiento/carga-api.js', '200', '1,8'],
      {
        cwd: RAIZ,
        maxBuffer: 1 << 24,
      },
    );
    salida.api = JSON.parse(api.stdout);
    console.error(`N=${n}: carga API hecha`);
    salida.sse = {};
    for (const lote of [1000, 1]) {
      const sse = await ejecutar(
        process.execPath,
        ['scripts/rendimiento/sse-rafaga.js', '1000', String(lote)],
        {
          cwd: RAIZ,
          maxBuffer: 1 << 24,
        },
      );
      salida.sse[`lote${lote}`] = JSON.parse(sse.stdout);
      console.error(`N=${n}: ráfaga SSE (lote ${lote}) hecha`);
      await espera(1000);
    }
    await (await fetch('http://127.0.0.1:3009/gc')).json();
    salida.rssFinalPsMb = rssMb(hijo.pid);
  }
  await parar(hijo);
  writeFileSync(`${DATOS}/servidor-${n}.json`, JSON.stringify(salida, null, 2));
}
