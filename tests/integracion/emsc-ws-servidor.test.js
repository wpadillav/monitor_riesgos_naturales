// Cliente de EMSC contra un servidor `ws` local de verdad (sin red externa): handshake real,
// reproducción del fixture, límite de 64 KiB del propio `ws` (cierre 1009) y reconexión.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { createCatalogo } from '../../src/server/dominio/catalogo.js';
import { createEmscWs } from '../../src/server/fuentes/emsc-ws.js';
import { createEstadoFuentes } from '../../src/server/fuentes/estado-fuentes.js';
import { asignarPais } from '../../src/server/geo/asignar-pais.js';
import { silentLog } from '../../src/server/infra/log.js';
import { systemClock } from '../../src/server/infra/reloj.js';
import { ZONAS } from '../../src/shared/zonas.js';

const FIXTURE = readFileSync(new URL('../fixtures/emsc-ws/mensajes.jsonl', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l).raw);

/** @type {Array<() => unknown>} */
const limpiezas = [];
afterEach(async () => {
  for (const f of limpiezas.splice(0).reverse()) await f();
});

/** Servidor `ws` en un puerto libre de loopback. */
async function servidor() {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((ok) => wss.once('listening', ok));
  limpiezas.push(
    () =>
      new Promise((ok) => {
        for (const c of wss.clients) c.terminate();
        wss.close(ok);
      }),
  );
  const { port } = /** @type {import('node:net').AddressInfo} */ (wss.address());
  return { wss, url: `ws://127.0.0.1:${port}` };
}

function cliente(url) {
  const catalogo = createCatalogo({ asignarPais });
  const estado = createEstadoFuentes({ canales: ['emsc-ws'], reloj: systemClock, log: silentLog });
  const ws = createEmscWs({
    catalogo,
    estado,
    reloj: systemClock,
    log: silentLog,
    metricas: { registrar: () => {} },
    zonas: ZONAS.map((z) => ({ id: z.id, rectangulo: z.rectangulo })),
    url,
    aleatorio: () => 0, // primer reintento a 0,8 s
  });
  limpiezas.push(() => ws.detener());
  return { ws, catalogo, estado };
}

describe('emsc-ws contra un servidor ws local', () => {
  it('recibe los mensajes reales y deja el sismo de Panamá en el catálogo', async () => {
    const { wss, url } = await servidor();
    wss.on('connection', (socket) => {
      for (const raw of FIXTURE) socket.send(raw);
    });
    const { ws, catalogo, estado } = cliente(url);

    ws.arrancar();
    await vi.waitFor(() => expect(catalogo.contar()).toBe(1), { timeout: 3000 });

    expect(catalogo.obtener('emsc:20261010_0000106')).toMatchObject({ pais: 'PA', autor: 'IGC' });
    expect(estado.obtener()[0].estado).toBe('ok');
  });

  it('un frame de 1 MiB lo corta el propio ws (maxPayload) sin parsearlo y el cliente reconecta', async () => {
    const { wss, url } = await servidor();
    let conexiones = 0;
    wss.on('connection', (socket) => {
      conexiones += 1;
      if (conexiones === 1) socket.send('x'.repeat(1024 * 1024));
      else socket.send(FIXTURE[2]);
    });
    const { ws, catalogo, estado } = cliente(url);

    ws.arrancar();
    await vi.waitFor(() => expect(catalogo.contar()).toBe(1), { timeout: 5000 });

    expect(conexiones).toBe(2);
    expect(ws.estadisticas()).toMatchObject({ descartados: 1, conexiones: 2 });
    expect(estado.obtener()[0].estado).toBe('ok');
  });

  it('si el servidor cierra, vuelve a conectar con espera creciente', async () => {
    const { wss, url } = await servidor();
    const llegadas = [];
    wss.on('connection', (socket) => {
      llegadas.push(Date.now());
      if (llegadas.length < 3) socket.close(1011);
    });
    const { ws, estado } = cliente(url);

    ws.arrancar();
    await vi.waitFor(() => expect(llegadas).toHaveLength(3), { timeout: 6000 });

    // Esperas con jitter mínimo: 0,8 s y 1,6 s.
    expect(llegadas[1] - llegadas[0]).toBeGreaterThanOrEqual(700);
    expect(llegadas[2] - llegadas[1]).toBeGreaterThanOrEqual(1500);
    await vi.waitFor(() => expect(estado.obtener()[0].estado).toBe('ok'));
  }, 10_000);
});
