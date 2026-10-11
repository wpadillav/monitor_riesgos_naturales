/**
 * Sesión con fuentes reales (T5.4; RNF-02, RNF-05, RNF-10 y muestra corta de RNF-16).
 *
 * Arranca el servidor con el mismo comando que `npm start` en `PORT` (3008) durante `MINUTOS`
 * (20) y lee su log JSON:
 * - `sismo.recibido` en modo ciclo o WebSocket → p50/p95 de `publicacionARecepcionMs` por canal
 *   (RNF-02: la parte de publicación → recepción; RNF-01 se suma aparte);
 * - RSS con `ps` cada minuto (RNF-05) y peticiones a las fuentes no medidas aquí.
 *
 * Uso: `MINUTOS=20 node scripts/rendimiento/sesion-real.js > docs/rendimiento/datos/sesion-real.json`
 */

import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.PORT ?? 3008);
const MINUTOS = Number(process.env.MINUTOS ?? 20);

const hijo = spawn(
  process.execPath,
  [
    '--permission',
    '--allow-fs-read=./package.json',
    '--allow-fs-read=./src/',
    '--allow-fs-read=./public/',
    '--allow-fs-read=./node_modules/',
    'src/server/index.js',
  ],
  {
    cwd: RAIZ,
    env: { ...process.env, PORT: String(PORT), LOG_FORMATO: 'json', LOG_NIVEL: 'info' },
    stdio: ['ignore', 'pipe', 'inherit'],
  },
);

/** @type {Record<string, number[]>} */
const porCanal = {};
const eventos = {};
let carga = null;
let resto = '';
hijo.stdout.on('data', (b) => {
  resto += b.toString();
  const partes = resto.split('\n');
  resto = partes.pop() ?? '';
  for (const p of partes) {
    let l;
    try {
      l = JSON.parse(p);
    } catch {
      continue;
    }
    eventos[l.evento] = (eventos[l.evento] ?? 0) + 1;
    if (l.evento === 'carga.inicial') carga = l;
    if (l.evento === 'sismo.recibido' && typeof l.publicacionARecepcionMs === 'number') {
      const k = `${l.fuente}/${l.canal ?? 'fdsn'}`;
      (porCanal[k] ??= []).push(l.publicacionARecepcionMs);
    }
  }
});

const rss = [];
const muestreo = setInterval(() => {
  try {
    rss.push(Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', String(hijo.pid)])) / 1024));
  } catch {
    // el proceso terminó
  }
}, 60_000);

await new Promise((r) => setTimeout(r, MINUTOS * 60_000));
clearInterval(muestreo);
hijo.kill('SIGTERM');

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : null;
};
const latencias = Object.fromEntries(
  Object.entries(porCanal).map(([k, xs]) => [
    k,
    { n: xs.length, p50: pct(xs, 0.5), p95: pct(xs, 0.95), max: pct(xs, 1) },
  ]),
);
console.log(
  JSON.stringify(
    { minutos: MINUTOS, cargaInicial: carga, latencias, rssMb: rss, eventos },
    null,
    2,
  ),
);
