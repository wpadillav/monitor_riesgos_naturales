/**
 * Servidor de la entrega 1 con datos sintéticos (T5.4). Compone los mismos módulos que
 * `src/server/index.js` (catálogo, retención, difusor SSE, `createApp`) **sin fuentes** y llena
 * el catálogo con `catalogo.ingerirLote`, el mismo punto de entrada que usan el planificador
 * FDSN y el WebSocket de EMSC. No modifica nada de `src/`.
 *
 * Variables de entorno:
 * - `PORT` (3008): la aplicación, igual que `npm start`.
 * - `CONTROL_PORT` (3009): puerto de control de las mediciones, solo en 127.0.0.1.
 * - `N_SISMOS` (0): sismos sintéticos visibles al arrancar, repartidos en `DIAS` días.
 * - `DIAS` (30), `DUPLICADOS` (0.5): fracción de sismos con un segundo registro de USGS.
 *
 * Control (`http://127.0.0.1:3009`):
 * - `GET /estado` → memoria (tras GC si `--expose-gc`), sismos, clientes SSE, CPU acumulada y
 *   retardo del bucle de eventos.
 * - `GET /rafaga?n=1000&lote=1000` → ingiere `n` sismos nuevos (tiempo ≈ ahora) en lotes de
 *   `lote` y devuelve el tiempo síncrono de ingesta y la CPU usada.
 * - `GET /gc` → fuerza una recolección y devuelve la memoria.
 * - `GET /reset-eld` → reinicia el histograma de retardo del bucle de eventos.
 *
 * Ejemplo: `N_SISMOS=10000 node --expose-gc scripts/rendimiento/servidor-sintetico.js`
 */

import { createServer } from 'node:http';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { serve } from '@hono/node-server';

import { ZONAS_POR_PAIS, createApp } from '../../src/server/app.js';
import { createCatalogo } from '../../src/server/dominio/catalogo.js';
import { createConsultaSismos } from '../../src/server/dominio/consulta-sismos.js';
import { createRetencion } from '../../src/server/dominio/retencion.js';
import { createEstadoFuentes } from '../../src/server/fuentes/estado-fuentes.js';
import { asignarPais } from '../../src/server/geo/asignar-pais.js';
import { createLog } from '../../src/server/infra/log.js';
import { systemClock } from '../../src/server/infra/reloj.js';
import { createDifusor } from '../../src/server/stream/difusor.js';
import { crearAzar, crearPosiciones, crearRegistros } from './sinteticos.js';

const PORT = Number(process.env.PORT ?? 3008);
const CONTROL_PORT = Number(process.env.CONTROL_PORT ?? 3009);
const N_SISMOS = Number(process.env.N_SISMOS ?? 0);
const DIAS = Number(process.env.DIAS ?? 30);
const DUPLICADOS = Number(process.env.DUPLICADOS ?? 0.5);
const DIA_MS = 86_400_000;
const LOTE_CARGA = 500;

const log = createLog({ formato: 'json', nivel: process.env.LOG_NIVEL ?? 'warn' });
const reloj = systemClock;
const arrancadoEn = reloj.ahora();
const eld = monitorEventLoopDelay({ resolution: 10 });
eld.enable();

const catalogo = createCatalogo({ asignarPais, log });
const retencion = createRetencion({ catalogo, reloj, log });
const estadoFuentes = createEstadoFuentes({ canales: [], reloj, log });
let cargaInicialEnCurso = true;
const difusor = createDifusor({
  catalogo,
  estadoFuentes,
  reloj,
  log,
  arrancadoEn,
  paisesDe: (s) => asignarPais(s.lat, s.lon)?.paisesCandidatos ?? [s.pais],
  enCargaInicial: () => cargaInicialEnCurso,
});

const app = createApp({
  port: PORT,
  version: 'perf',
  log,
  reloj,
  arrancadoEn,
  obtenerFuentes: estadoFuentes.obtener,
  contarSismos: catalogo.contar,
  difusor,
  consultaSismos: createConsultaSismos({
    catalogo,
    planificador: null,
    obtenerFuentes: estadoFuentes.obtener,
    obtenerUltimoEventoId: difusor.ultimoId,
    zonas: ZONAS_POR_PAIS,
    reloj,
  }),
});

const azar = crearAzar();
const posiciones = crearPosiciones(3000, azar);

// ---------------------------------------------------------------------------------------
// Carga inicial sintética

const ahora0 = reloj.ahora();
const t0 = performance.now();
const registros = crearRegistros({
  n: N_SISMOS,
  desde: ahora0 - DIAS * DIA_MS + 3_600_000,
  hasta: ahora0 - 60_000,
  ahora: ahora0,
  prefijo: 'c',
  fraccionDuplicados: DUPLICADOS,
  posiciones,
  azar,
});
const tGen = performance.now();
for (let i = 0; i < registros.length; i += LOTE_CARGA) {
  catalogo.ingerirLote(registros.slice(i, i + LOTE_CARGA), { recibidoEn: reloj.ahora() });
}
difusor.vaciar();
cargaInicialEnCurso = false;
const tIngesta = performance.now();
registros.length = 0;

const cargaInfo = {
  sismos: catalogo.contar(),
  visibles: catalogo.contarVisibles(),
  generarMs: Math.round(tGen - t0),
  ingerirMs: Math.round(tIngesta - tGen),
};

// ---------------------------------------------------------------------------------------
// Control

let rafagas = 0;

function memoria() {
  const m = process.memoryUsage();
  const mb = (x) => Math.round((x / 1048576) * 10) / 10;
  return {
    rssMb: mb(m.rss),
    heapUsadoMb: mb(m.heapUsed),
    heapTotalMb: mb(m.heapTotal),
    externoMb: mb(m.external),
    arrayBuffersMb: mb(m.arrayBuffers),
  };
}

function estado() {
  const cpu = process.cpuUsage();
  return {
    pid: process.pid,
    ...cargaInfo,
    sismosAhora: catalogo.contar(),
    clientesSse: difusor.contarClientes(),
    memoria: memoria(),
    cpuUsuarioMs: Math.round(cpu.user / 1000),
    cpuSistemaMs: Math.round(cpu.system / 1000),
    uptimeS: Math.round(process.uptime()),
    eventLoopMs: {
      p50: Math.round(eld.percentile(50) / 1e4) / 100,
      p99: Math.round(eld.percentile(99) / 1e4) / 100,
      max: Math.round(eld.max / 1e4) / 100,
    },
  };
}

/** @param {URLSearchParams} q */
function rafaga(q) {
  const n = Math.min(20_000, Number(q.get('n') ?? 1000));
  const lote = Math.max(1, Number(q.get('lote') ?? n));
  const ahora = reloj.ahora();
  rafagas += 1;
  const regs = crearRegistros({
    n,
    desde: ahora - 50 * 60_000,
    hasta: ahora - 1000,
    ahora,
    prefijo: `r${rafagas}x`,
    fraccionDuplicados: 0,
    posiciones,
    azar,
  });
  const cpu0 = process.cpuUsage();
  const t = performance.now();
  for (let i = 0; i < regs.length; i += lote) {
    catalogo.ingerirLote(regs.slice(i, i + lote), { recibidoEn: reloj.ahora() });
  }
  const ingestaMs = performance.now() - t;
  const cpu = process.cpuUsage(cpu0);
  return {
    n: regs.length,
    lote,
    ingestaMs: Math.round(ingestaMs * 10) / 10,
    cpuMs: Math.round((cpu.user + cpu.system) / 100) / 10,
    inicioIngesta: Date.now() - Math.round(ingestaMs),
    sismosAhora: catalogo.contar(),
  };
}

const control = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  let cuerpo;
  if (url.pathname === '/estado') cuerpo = estado();
  else if (url.pathname === '/gc') {
    globalThis.gc?.();
    globalThis.gc?.();
    cuerpo = { gc: typeof globalThis.gc === 'function', memoria: memoria() };
  } else if (url.pathname === '/rafaga') cuerpo = rafaga(url.searchParams);
  else if (url.pathname === '/reset-eld') {
    eld.reset();
    cuerpo = { ok: true };
  } else {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(cuerpo));
});

control.listen(CONTROL_PORT, '127.0.0.1');
retencion.arrancar();
const server = serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, () => {
  process.stdout.write(`${JSON.stringify({ listo: true, puerto: PORT, ...cargaInfo })}\n`);
});

function apagar() {
  retencion.detener();
  difusor.cerrar();
  control.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.once('SIGINT', apagar);
process.once('SIGTERM', apagar);
