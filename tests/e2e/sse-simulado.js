/**
 * Servidor SSE simulado para las pruebas E2E (T4.6b). La página pide `/api/stream` al servidor
 * real; Playwright redirige esa petición a este servidor (`route.continue({ url })`, invisible
 * para la página) y la prueba decide qué eventos llegan, cuándo se corta y si se acepta la
 * reconexión. Formato igual al del difusor: `id`, `event` y `data` JSON en una línea.
 */

import http from 'node:http';

/**
 * @typedef {{ query: URLSearchParams, lastEventId: string | null }} Conexion
 */

/**
 * @param {{ arranque?: string, retryMs?: number }} [opciones]
 */
export async function crearSseSimulado({ arranque = 'abc', retryMs = 300 } = {}) {
  /** @type {Set<http.ServerResponse>} */
  const clientes = new Set();
  /** @type {Conexion[]} */
  const conexiones = [];
  let secuencia = 1;
  let rechazar = false;

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const lastEventId = req.headers['last-event-id'];
    conexiones.push({
      query: url.searchParams,
      lastEventId: typeof lastEventId === 'string' ? lastEventId : null,
    });
    if (rechazar) {
      req.socket.destroy();
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
    /** Comentario `: ping` (invisible para `EventSource`). */
    ping() {
      for (const res of clientes) res.write(': ping\n\n');
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
    async cerrar() {
      for (const res of clientes) res.destroy();
      await new Promise((ok) => servidor.close(() => ok(undefined)));
    },
  };
}

/** @typedef {Awaited<ReturnType<typeof crearSseSimulado>>} SseSimulado */
