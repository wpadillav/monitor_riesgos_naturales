/**
 * Arranque con fuentes reales (T5.4): mide la carga inicial de 30 días (`carga.inicial`), la
 * memoria con los datos reales, la latencia de `/api/sismos` desde memoria y el tiempo de una
 * consulta que **no** cubre la memoria («Todas» las magnitudes con 30 y 7 días → consulta a EMSC
 * y USGS con el límite de 8 s, RNF-04).
 *
 * Arranca el servidor con el mismo comando que `npm start` (con `--permission`) en `PORT`
 * (3008), lee su log JSON y lo para al terminar. Necesita red.
 *
 * Uso: `node scripts/rendimiento/arranque-real.js > docs/rendimiento/datos/arranque-real.json`
 */

import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { asignarPais } from '../../src/server/geo/asignar-pais.js';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const PORT = Number(process.env.PORT ?? 3008);
const BASE = `http://127.0.0.1:${PORT}`;
const LIMITE_ESPERA_MS = 120_000;

const t0 = performance.now();
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

/** @type {Record<string, any>[]} */
const lineas = [];
let resto = '';
/** @type {(l: Record<string, any>) => void} */
let alLinea = () => {};
hijo.stdout.on('data', (b) => {
  resto += b.toString();
  const partes = resto.split('\n');
  resto = partes.pop() ?? '';
  for (const p of partes) {
    try {
      const l = JSON.parse(p);
      l.__ms = Math.round(performance.now() - t0);
      lineas.push(l);
      alLinea(l);
    } catch {
      // primera línea en texto plano
    }
  }
});

function esperarEvento(nombre) {
  return new Promise((ok, mal) => {
    const previa = lineas.find(
      (l) => (l.evento ?? l.msg ?? l.mensaje) === nombre || l.event === nombre,
    );
    if (previa) return ok(previa);
    const t = setTimeout(() => mal(new Error(`sin ${nombre}`)), LIMITE_ESPERA_MS);
    alLinea = (l) => {
      if (JSON.stringify(l).includes(`"${nombre}"`)) {
        clearTimeout(t);
        ok(l);
      }
    };
  });
}

const rssMb = () =>
  Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', String(hijo.pid)]).toString()) / 1024);

/** @param {string} q @param {number} n */
async function medir(q, n) {
  const tiempos = [];
  let bytes = 0;
  let cuerpo;
  for (let i = 0; i < n; i += 1) {
    const t = performance.now();
    const r = await fetch(`${BASE}/api/sismos?${q}`);
    const texto = await r.text();
    tiempos.push(performance.now() - t);
    bytes = texto.length;
    cuerpo = JSON.parse(texto);
  }
  tiempos.sort((a, b) => a - b);
  const p = (x) =>
    Math.round(tiempos[Math.min(tiempos.length - 1, Math.ceil(x * tiempos.length) - 1)] * 10) / 10;
  return {
    q,
    n,
    p50: p(0.5),
    p95: p(0.95),
    max: p(1),
    bytes,
    total: cuerpo.total,
    completo: cuerpo.completo,
    cuerpo,
  };
}

const salida = {};
try {
  const carga = await esperarEvento('carga.inicial');
  salida.cargaInicial = carga;
  salida.rssTrasCargaMb = rssMb();

  const r24 = await medir('paises=ES,CO,PA&magMin=2.0&periodo=24h', 100);
  const r30 = await medir('paises=ES,CO,PA&magMin=2.0&periodo=30d', 100);
  // Franja CO-PA en los datos reales: sismos que exigen la distancia a la tierra (Turf).
  const sismos30 = r30.cuerpo.sismos;
  let enFranja = 0;
  const tF = performance.now();
  for (const s of sismos30)
    if ((asignarPais(s.lat, s.lon)?.paisesCandidatos.length ?? 0) > 1) enFranja += 1;
  salida.franjaReal = {
    sismos: sismos30.length,
    enFranja,
    asignarPaisTotalMs: Math.round(performance.now() - tF),
  };
  for (const r of [r24, r30]) delete r.cuerpo;
  salida.apiDesdeMemoria = [r24, r30];

  // Sin cobertura: «Todas» (sin magMin) con 7 y 30 días. La primera vez consulta las fuentes.
  const cobertura = [];
  for (const q of ['paises=ES,CO,PA&periodo=30d', 'paises=ES,CO,PA&periodo=7d']) {
    const r = await medir(q, 1);
    delete r.cuerpo;
    cobertura.push(r);
  }
  salida.apiConsultandoFuentes = cobertura;
  const despues = await medir('paises=ES,CO,PA&periodo=30d', 50);
  delete despues.cuerpo;
  salida.apiTodasDesdeMemoria = despues;
  salida.rssFinalMb = rssMb();
  const resumen = await (await fetch(`${BASE}/api/salud`)).json();
  salida.salud = resumen;
} catch (err) {
  salida.error = String(err);
} finally {
  salida.lineasRelevantes = lineas
    .filter((l) => /carga\.inicial|fuente\.|memoria|cobertura|error|warn/.test(JSON.stringify(l)))
    .slice(0, 60);
  hijo.kill('SIGTERM');
}
console.log(JSON.stringify(salida, null, 2));
