/**
 * Prueba de carga de `GET /api/sismos` (RNF-04) contra `servidor-sintetico.js` (T5.4).
 *
 * Para cada consulta y cada concurrencia lanza `N` peticiones (tras 10 de calentamiento) con
 * conexiones persistentes y calcula p50/p95/p99/máx en el cliente. Muestrea el RSS del servidor
 * con `ps` cada 100 ms para obtener el pico durante la carga.
 *
 * Uso: `node scripts/rendimiento/carga-api.js [N=200] [concurrencias=1,8]`
 * Requiere el servidor sintético en marcha (`PORT` 3008, `CONTROL_PORT` 3009).
 */

import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { performance } from 'node:perf_hooks';

const PORT = Number(process.env.PORT ?? 3008);
const CONTROL = `http://127.0.0.1:${process.env.CONTROL_PORT ?? 3009}`;
const N = Number(process.argv[2] ?? 200);
const CONCURRENCIAS = (process.argv[3] ?? '1,8').split(',').map(Number);
const CONSULTAS = [
  // Carga inicial por defecto de la página (D5): 3 países, M ≥ 2.0, 24 h.
  'paises=ES,CO,PA&magMin=2.0&periodo=24h',
  // RNF-03: 30 días con la magnitud por defecto.
  'paises=ES,CO,PA&magMin=2.0&periodo=30d',
  // Un solo país, 7 días.
  'paises=ES&magMin=2.0&periodo=7d',
];

const agente = new http.Agent({ keepAlive: true, maxSockets: 64 });

/** @param {string} q @returns {Promise<{ ms: number, bytes: number, status: number }>} */
function peticion(q) {
  return new Promise((ok, mal) => {
    const t = performance.now();
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path: `/api/sismos?${q}`, agent: agente },
      (res) => {
        let bytes = 0;
        res.on('data', (b) => {
          bytes += b.length;
        });
        res.on('end', () => ok({ ms: performance.now() - t, bytes, status: res.statusCode ?? 0 }));
      },
    );
    req.on('error', mal);
  });
}

/** @param {number[]} xs @param {number} p */
function percentil(xs, p) {
  const i = Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1);
  return Math.round(xs[i] * 10) / 10;
}

const estado = await (await fetch(`${CONTROL}/estado`)).json();
const pid = estado.pid;
const rss = () => {
  try {
    return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)]).toString()) / 1024;
  } catch {
    return 0;
  }
};

const resultados = [];
for (const q of CONSULTAS) {
  for (let i = 0; i < 10; i += 1) await peticion(q);
  for (const c of CONCURRENCIAS) {
    const cpu0 = await (await fetch(`${CONTROL}/estado`)).json();
    let pico = rss();
    const muestreo = setInterval(() => {
      pico = Math.max(pico, rss());
    }, 100);
    const tiempos = [];
    let bytes = 0;
    let errores = 0;
    let siguiente = 0;
    const t0 = performance.now();
    await Promise.all(
      Array.from({ length: c }, async () => {
        while (siguiente < N) {
          siguiente += 1;
          const r = await peticion(q);
          if (r.status !== 200) errores += 1;
          tiempos.push(r.ms);
          bytes = r.bytes;
        }
      }),
    );
    const duracion = performance.now() - t0;
    clearInterval(muestreo);
    const cpu1 = await (await fetch(`${CONTROL}/estado`)).json();
    tiempos.sort((a, b) => a - b);
    resultados.push({
      consulta: q,
      concurrencia: c,
      peticiones: tiempos.length,
      errores,
      bytesRespuesta: bytes,
      rps: Math.round((tiempos.length / duracion) * 1000 * 10) / 10,
      p50: percentil(tiempos, 0.5),
      p95: percentil(tiempos, 0.95),
      p99: percentil(tiempos, 0.99),
      max: percentil(tiempos, 1),
      cpuServidorMsPorPeticion:
        Math.round(
          ((cpu1.cpuUsuarioMs + cpu1.cpuSistemaMs - cpu0.cpuUsuarioMs - cpu0.cpuSistemaMs) /
            tiempos.length) *
            10,
        ) / 10,
      rssPicoMb: Math.round(pico),
    });
  }
}
agente.destroy();
console.log(
  JSON.stringify(
    { sismosEnServidor: estado.sismosAhora, memoria: estado.memoria, resultados },
    null,
    2,
  ),
);
