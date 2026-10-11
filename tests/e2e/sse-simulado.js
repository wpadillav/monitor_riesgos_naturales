/**
 * Servidor SSE simulado para las pruebas E2E (T4.6b). La página pide `/api/stream` al servidor
 * real; Playwright redirige esa petición a este servidor (`route.continue({ url })`, invisible
 * para la página) y la prueba decide qué eventos llegan, cuándo se corta y si se acepta la
 * reconexión. Formato igual al del difusor: `id`, `event` y `data` JSON en una línea.
 *
 * T5.0: `latido()` envía el evento `latido` del difusor (mismo id que el último evento, sin
 * consumir secuencia) y `sinPlazas(s)` hace que `GET` y `HEAD` respondan 503 con `Retry-After`,
 * como el servidor real cuando no quedan plazas.
 */

import http from 'node:http';

/**
 * @typedef {{ query: URLSearchParams, lastEventId: string | null }} Conexion
 */

/** Cuerpo del 503 por falta de plazas (contrato, `DemasiadasConexiones`). */
const PROBLEMA_SIN_PLAZAS = JSON.stringify({
  type: 'urn:terremotos:problema:demasiadas-conexiones',
  title: 'Demasiadas conexiones en vivo',
  status: 503,
});

/**
 * @param {{ arranque?: string, retryMs?: number }} [opciones]
 */
export async function crearSseSimulado({ arranque = 'abc', retryMs = 300 } = {}) {
  /** @type {Set<http.ServerResponse>} */
  const clientes = new Set();
  /** @type {Conexion[]} */
  const conexiones = [];
  /** @type {URLSearchParams[]} */
  const comprobaciones = [];
  let secuencia = 1;
  let rechazar = false;
  /** @type {number | null} segundos de `Retry-After` mientras no haya plazas */
  let sinPlazas = null;

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'HEAD') {
      comprobaciones.push(url.searchParams);
      if (sinPlazas !== null) {
        res.writeHead(503, {
          'Content-Type': 'application/problem+json; charset=utf-8',
          'Retry-After': String(sinPlazas),
        });
      } else {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
        });
      }
      res.end();
      return;
    }
    const lastEventId = req.headers['last-event-id'];
    conexiones.push({
      query: url.searchParams,
      lastEventId: typeof lastEventId === 'string' ? lastEventId : null,
    });
    if (rechazar) {
      req.socket.destroy();
      return;
    }
    if (sinPlazas !== null) {
      res.writeHead(503, {
        'Content-Type': 'application/problem+json; charset=utf-8',
        'Retry-After': String(sinPlazas),
      });
      res.end(PROBLEMA_SIN_PLAZAS);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.write(`retry: ${retryMs}\n\n`);
    clientes.add(res);
    req.on('close', () => clientes.delete(res));
  });
  servidor.keepAliveTimeout = 0;
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', () => ok(undefined)));
  const direccion = servidor.address();
  const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

  return {
    puerto,
    conexiones,
    /** Peticiones `HEAD` (comprobación de plazas de la página). */
    comprobaciones,
    get clientes() {
      return clientes.size;
    },
    /** Siguiente id que se usará. */
    get siguienteId() {
      return `${arranque}-${secuencia + 1}`;
    },
    /**
     * Envía un evento a todos los clientes. Devuelve su id.
     * @param {string} tipo
     * @param {unknown} datos
     */
    enviar(tipo, datos) {
      secuencia += 1;
      const id = `${arranque}-${secuencia}`;
      const data = JSON.stringify({
        tipo,
        version: 1,
        ocurridoEn: new Date().toISOString(),
        datos,
      });
      for (const res of clientes) res.write(`id: ${id}\nevent: ${tipo}\ndata: ${data}\n\n`);
      return id;
    },
    /** Evento `latido` como el del difusor: id del último evento, sin consumir secuencia. */
    latido() {
      const data = JSON.stringify({
        tipo: 'latido',
        version: 1,
        ocurridoEn: new Date().toISOString(),
        datos: {},
      });
      const id = `${arranque}-${secuencia}`;
      for (const res of clientes) res.write(`id: ${id}\nevent: latido\ndata: ${data}\n\n`);
    },
    /** Corta las conexiones abiertas (el navegador reconectará). */
    cortar() {
      for (const res of clientes) res.destroy();
      clientes.clear();
    },
    /** @param {boolean} valor con `true`, las conexiones nuevas se cortan sin respuesta */
    rechazar(valor) {
      rechazar = valor;
    },
    /**
     * @param {number | false} retryAfterS con un número, `GET` y `HEAD` dan 503 con ese
     *   `Retry-After` (sin plazas); con `false`, vuelve a haber plazas
     */
    sinPlazas(retryAfterS) {
      sinPlazas = retryAfterS === false ? null : retryAfterS;
    },
    async cerrar() {
      for (const res of clientes) res.destroy();
      await new Promise((ok) => servidor.close(() => ok(undefined)));
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof crearSseSimulado>>} SseSimulado */
