/**
 * Arranque (`npm start`): valida la configuración y el proceso, escucha solo en loopback
 * y apaga de forma ordenada con SIGINT/SIGTERM (HU-12, RNF-09, AM-09, AM-31).
 */

import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { NOMBRE_APLICACION } from '../shared/constantes.js';
import { ZONAS } from '../shared/zonas.js';
import { ZONAS_POR_PAIS, createApp } from './app.js';
import { ConfigError, checkProcess, loadConfig } from './config.js';
import { createCatalogo } from './dominio/catalogo.js';
import { createCobertura } from './dominio/cobertura.js';
import { createConsultaSismos } from './dominio/consulta-sismos.js';
import { createRetencion } from './dominio/retencion.js';
import { createEmscFdsn } from './fuentes/emsc-fdsn.js';
import { CANAL_EMSC_WS, createEmscWs } from './fuentes/emsc-ws.js';
import { createEstadoFuentes } from './fuentes/estado-fuentes.js';
import { createHttpClient } from './fuentes/http-cliente.js';
import { createPlanificador } from './fuentes/planificador.js';
import { createUsgsFdsn } from './fuentes/usgs-fdsn.js';
import { FRANJA_KM, asignarPais } from './geo/asignar-pais.js';
import { createLog } from './infra/log.js';
import { createMetricasLatencia } from './infra/metricas-latencia.js';
import { systemClock } from './infra/reloj.js';
import { createDifusor } from './stream/difusor.js';

const HORA_MS = 3_600_000;

/** @param {string} mensaje */
function abortStartup(mensaje) {
  process.stderr.write(`${mensaje}\n`);
  process.exit(1);
}

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  if (err instanceof ConfigError) abortStartup(err.message);
  throw err;
}

const motivos = checkProcess({ env: process.env, uid: process.getuid?.() });
if (motivos.length > 0) abortStartup(`No se puede arrancar:\n- ${motivos.join('\n- ')}`);

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);
const log = createLog({ formato: config.logFormato, nivel: config.logNivel, version });
const arrancadoEn = systemClock.ahora();

const reloj = systemClock;

// Dominio en memoria (ADR-0004, arquitectura §5.5).
const catalogo = createCatalogo({
  asignarPais,
  umbrales: config.umbralesDedup,
  retencionDias: config.retencionDias,
  log,
});
const retencion = createRetencion({ catalogo, reloj, log });
const metricas = createMetricasLatencia({ log });

// Fuentes: WebSocket de EMSC (tiempo real) y consulta periódica (arquitectura §5.3).
const estadoFuentes = createEstadoFuentes({
  canales: config.fuentesActivas ? [CANAL_EMSC_WS, 'emsc-fdsn', 'usgs'] : [],
  reloj,
  log,
});
// AM-35: identificable y sin datos personales.
const userAgent = `TerremotosEnVivo/${version} (uso local; sin contacto)`;
let planificador = null;
let emscWs = null;
if (config.fuentesActivas) {
  const http = createHttpClient({
    userAgent,
    timeoutMs: config.fuenteTimeoutMs,
    ahora: reloj.ahora,
  });
  const nZonas = ZONAS.length;
  planificador = createPlanificador({
    fuentes: [
      {
        adaptador: createEmscFdsn({ http, reloj }),
        intervaloMs: config.emscIntervaloMs,
        escalonMs: config.emscIntervaloMs / nZonas,
      },
      {
        adaptador: createUsgsFdsn({ http, reloj }),
        intervaloMs: config.usgsIntervaloMs,
        escalonMs: config.usgsIntervaloMs / nZonas,
      },
    ],
    zonas: ZONAS.map((z) => ({ id: z.id, rectangulo: z.rectangulo })),
    catalogo,
    cobertura: createCobertura(),
    estado: estadoFuentes,
    reloj,
    log,
    metricas,
    magInicial: config.ingestaMagMin,
    ventanaMs: config.retencionDias * 86_400_000,
  });
  const planificadorFdsn = planificador;
  emscWs = createEmscWs({
    catalogo,
    estado: estadoFuentes,
    reloj,
    log,
    metricas,
    zonas: ZONAS.map((z) => ({ id: z.id, rectangulo: z.rectangulo })),
    userAgent,
    // AM-17: si la cola se desborda, la consulta FDSN de EMSC recupera lo perdido.
    alDesbordar: () => planificadorFdsn.resincronizar('emsc-fdsn'),
  });
}

// Difusor SSE (ADR-0002). Mientras dura la carga de 30 días nada es notificable (PRD E4).
let cargaInicialEnCurso = config.fuentesActivas;
const difusor = createDifusor({
  catalogo,
  estadoFuentes,
  reloj,
  log,
  arrancadoEn,
  ventanaAvisoMin: config.avisoVentanaMin,
  maxClientes: config.sseMaxClientes,
  // Un sismo en la franja CO-PA llega a quien marque cualquiera de los dos (HU-03).
  paisesDe: (s) => asignarPais(s.lat, s.lon)?.paisesCandidatos ?? [s.pais],
  enCargaInicial: () => cargaInicialEnCurso,
});

const app = createApp({
  port: config.port,
  version,
  log,
  reloj,
  arrancadoEn,
  obtenerFuentes: estadoFuentes.obtener,
  contarSismos: catalogo.contar,
  difusor,
  consultaSismos: createConsultaSismos({
    catalogo,
    planificador,
    obtenerFuentes: estadoFuentes.obtener,
    obtenerUltimoEventoId: difusor.ultimoId,
    zonas: ZONAS_POR_PAIS,
    reloj,
  }),
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => {
  // Primera línea en texto plano en los dos formatos (arquitectura §8.3, HU-12).
  process.stdout.write(`${NOMBRE_APLICACION} en http://localhost:${config.port}\n`);
  log.info('servidor.escuchando', {
    host: config.host,
    puerto: config.port,
    nodo: process.version,
    franjaKm: FRANJA_KM,
    fuentes: config.fuentesActivas,
  });
  retencion.arrancar();
  // Primero la carga de 30 días; después el WebSocket (arquitectura §5.6).
  planificador
    ?.arrancar()
    .catch((err) => {
      log.error('error', { mensaje: err instanceof Error ? err.message : String(err) });
    })
    .finally(() => {
      cargaInicialEnCurso = false;
      emscWs?.arrancar();
    });
});

// Resúmenes horarios (RNF-02, RNF-05, RNF-15, RNF-16).
const resumenHorario = setInterval(() => {
  metricas.resumir();
  const memoria = process.memoryUsage();
  log.info('memoria.resumen', {
    rssMb: Math.round((memoria.rss / 1048576) * 10) / 10,
    heapMb: Math.round((memoria.heapUsed / 1048576) * 10) / 10,
    sismos: catalogo.contar(),
    clientesSse: difusor.contarClientes(),
  });
}, HORA_MS);
resumenHorario.unref();

server.on('error', (err) => {
  if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EADDRINUSE') {
    abortStartup(
      `El puerto ${config.port} está ocupado. Usa otro con la variable de entorno PORT, por ejemplo: PORT=3100 npm start`,
    );
  }
  log.error('error', { mensaje: err.message, pila: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (motivo) => {
  log.error('error', { mensaje: motivo instanceof Error ? motivo.message : String(motivo) });
});

/** @param {NodeJS.Signals} senal */
function shutdown(senal) {
  log.info('servidor.parando', { senal });
  emscWs?.detener();
  planificador?.detener();
  retencion.detener();
  // Cierra los flujos SSE: si no, `server.close` esperaría a que los cerrara la página.
  difusor.cerrar();
  clearInterval(resumenHorario);
  server.close(() => process.exit(0));
  // Si alguna conexión no se cierra en 5 s, se fuerza la salida.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
