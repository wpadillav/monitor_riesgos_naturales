/**
 * Difusor SSE con 8 clientes y una ráfaga de sismos (T5.4; ADR-0002, RNF-01).
 *
 * 1. Abre `CLIENTES` (8) conexiones a `/api/stream` con el filtro por defecto ampliado a 30 días
 *    y comprueba que la novena recibe 503 (AM-13).
 * 2. Pide al servidor sintético una ráfaga de `N` sismos (`/rafaga`), en un lote o en lotes de 1.
 * 3. Cada cliente anota la llegada de cada `sismo.nuevo`. La latencia de emisión es
 *    `llegada − recibidoEn` (el instante en que el catálogo ingirió el sismo; mismo reloj).
 * 4. CPU del servidor durante la ráfaga (`process.cpuUsage`) y retardo máximo del bucle.
 *
 * Uso: `node scripts/rendimiento/sse-rafaga.js [N=1000] [lote=1000]`
 */

import http from 'node:http';
import { performance } from 'node:perf_hooks';

const PORT = Number(process.env.PORT ?? 3008);
const CONTROL = `http://127.0.0.1:${process.env.CONTROL_PORT ?? 3009}`;
const N = Number(process.argv[2] ?? 1000);
const LOTE = Number(process.argv[3] ?? N);
const CLIENTES = Number(process.env.CLIENTES ?? 8);
const RUTA = '/api/stream?paises=ES,CO,PA&magMin=2.0&periodo=30d';

/**
 * @returns {Promise<{ llegadas: number[], bytes: number, cerrar: () => void, status: number }>}
 */
function abrir() {
  return new Promise((ok, mal) => {
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path: RUTA, headers: { Accept: 'text/event-stream' } },
      (res) => {
        const cliente = {
          llegadas: [],
          bytes: 0,
          status: res.statusCode ?? 0,
          cerrar: () => req.destroy(),
        };
        if (res.statusCode !== 200) {
          res.resume();
          ok(cliente);
          return;
        }
        let resto = '';
        res.setEncoding('utf8');
        res.on('data', (txt) => {
          const ahora = Date.now();
          cliente.bytes += txt.length;
          resto += txt;
          const bloques = resto.split('\n\n');
          resto = bloques.pop() ?? '';
          for (const b of bloques) {
            if (!b.includes('event: sismo.nuevo')) continue;
            const data = b.split('\n').find((l) => l.startsWith('data: '));
            if (!data) continue;
            const sobre = JSON.parse(data.slice(6));
            cliente.llegadas.push(ahora - Date.parse(sobre.datos.sismo.recibidoEn));
          }
        });
        ok(cliente);
      },
    );
    req.on('error', mal);
  });
}

const pct = (xs, p) => Math.round(xs[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)]);

const clientes = [];
for (let i = 0; i < CLIENTES; i += 1) clientes.push(await abrir());
const extra = await abrir();
extra.cerrar();
await new Promise((r) => setTimeout(r, 500));

await fetch(`${CONTROL}/reset-eld`);
const antes = await (await fetch(`${CONTROL}/estado`)).json();
const t0 = performance.now();
const rafaga = await (await fetch(`${CONTROL}/rafaga?n=${N}&lote=${LOTE}`)).json();

// Espera a que todos reciban la ráfaga (o 60 s).
const limite = Date.now() + 60_000;
while (Date.now() < limite && clientes.some((c) => c.llegadas.length < rafaga.n)) {
  await new Promise((r) => setTimeout(r, 50));
}
const totalMs = Math.round(performance.now() - t0);
await new Promise((r) => setTimeout(r, 300));
const despues = await (await fetch(`${CONTROL}/estado`)).json();

const todas = clientes.flatMap((c) => c.llegadas).sort((a, b) => a - b);
const porCliente = clientes.map((c) => ({
  recibidos: c.llegadas.length,
  p95: c.llegadas.length
    ? pct(
        [...c.llegadas].sort((a, b) => a - b),
        0.95,
      )
    : null,
  max: c.llegadas.length ? Math.max(...c.llegadas) : null,
  kB: Math.round(c.bytes / 1024),
}));
for (const c of clientes) c.cerrar();

console.log(
  JSON.stringify(
    {
      sismosAntes: antes.sismosAhora,
      clientes: CLIENTES,
      novenaConexionStatus: extra.status,
      rafaga,
      entregaCompletaMs: totalMs,
      latenciaEmisionMs: todas.length
        ? {
            n: todas.length,
            p50: pct(todas, 0.5),
            p95: pct(todas, 0.95),
            p99: pct(todas, 0.99),
            max: todas[todas.length - 1],
          }
        : null,
      porCliente,
      cpuServidorMs:
        despues.cpuUsuarioMs + despues.cpuSistemaMs - antes.cpuUsuarioMs - antes.cpuSistemaMs,
      bucleEventosMs: despues.eventLoopMs,
      memoriaDespues: despues.memoria,
    },
    null,
    2,
  ),
);
process.exit(0);
