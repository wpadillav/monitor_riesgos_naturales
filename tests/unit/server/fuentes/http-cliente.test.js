// Cliente HTTP de las fuentes: límites de tamaño y tiempo, redirecciones, tipos y UA
// (AM-03, AM-04, AM-06, AM-35). Sin red: `fetch` simulado.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FuenteError,
  MAX_BYTES_FDSN,
  createHttpClient,
  parsearRetryAfter,
} from '../../../../src/server/fuentes/http-cliente.js';

const URL_OK = 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json';
const MiB = 1024 * 1024;

/** @param {BodyInit | null} cuerpo @param {ResponseInit} [init] */
const respuesta = (cuerpo, { headers = {}, ...init } = {}) =>
  new Response(cuerpo, {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** Cliente con un `fetch` simulado que devuelve `res` y guarda la llamada. */
function cliente(res, opciones = {}) {
  const fetch = vi.fn(async () => (typeof res === 'function' ? res() : res));
  return {
    fetch,
    http: createHttpClient({ fetch, userAgent: 'TerremotosEnVivo/2.0.0 (uso local; sin contacto)', ...opciones }),
  };
}

/**
 * Cuerpo en streaming de `total` bytes en trozos de 64 KiB, sin búfer previo (`highWaterMark`
 * 0): `estado.leidos` cuenta exactamente lo que el cliente ha pedido leer.
 */
function cuerpoGrande(total) {
  const estado = { leidos: 0 };
  const trozo = new Uint8Array(64 * 1024).fill(0x20);
  const stream = new ReadableStream(
    {
      pull(controller) {
        if (estado.leidos >= total) {
          controller.close();
          return;
        }
        estado.leidos += trozo.byteLength;
        controller.enqueue(trozo);
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, estado };
}

/** Cuerpo que nunca termina (envía un trozo y se queda colgado). */
function cuerpoInfinito() {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"features":['));
    },
    pull() {
      return new Promise(() => {});
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createHttpClient().getJson', () => {
  it('devuelve el JSON y los bytes leídos con 200', async () => {
    const { http } = cliente(respuesta('{"features":[]}'));
    await expect(http.getJson(URL_OK)).resolves.toEqual({
      status: 200,
      datos: { features: [] },
      bytes: 15,
    });
  });

  it('204 (EMSC sin datos) devuelve datos null', async () => {
    const { http } = cliente(new Response(null, { status: 204 }));
    await expect(http.getJson(URL_OK)).resolves.toEqual({ status: 204, datos: null, bytes: 0 });
  });

  it('pide con redirect: "error", GET y un User-Agent sin datos personales (AM-06, AM-35)', async () => {
    const { http, fetch } = cliente(respuesta('{}'));
    await http.getJson(URL_OK);

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(URL_OK);
    expect(init.redirect).toBe('error');
    expect(init.method).toBe('GET');
    const cabeceras = Object.values(init.headers).join(' ');
    expect(cabeceras).not.toContain('@');
    expect(init.headers['User-Agent']).toBe('TerremotosEnVivo/2.0.0 (uso local; sin contacto)');
  });

  it.each(['http://www.seismicportal.eu/x', 'ftp://x.test/', 'file:///etc/passwd', '//evil.test'])(
    'rechaza la URL no https %s sin llamar a fetch (AM-06)',
    async (url) => {
      const { http, fetch } = cliente(respuesta('{}'));
      await expect(http.getJson(url)).rejects.toMatchObject({ codigo: 'URL_NO_SEGURA' });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('una respuesta 302 es un fallo de la fuente (AM-06)', async () => {
    const { http } = cliente(
      new Response(null, { status: 302, headers: { location: 'https://evil.test/' } }),
    );
    await expect(http.getJson(URL_OK)).rejects.toMatchObject({
      codigo: 'REDIRECCION',
      status: 302,
    });
  });

  it('el TypeError de fetch por redirección o red se convierte en error RED sin URL', async () => {
    const { http } = cliente(() => {
      throw new TypeError(`fetch failed: redirect to ${URL_OK}`);
    });
    const err = await http.getJson(URL_OK).catch((e) => e);
    expect(err).toBeInstanceOf(FuenteError);
    expect(err.codigo).toBe('RED');
    expect(err.message).not.toContain('https://');
  });

  it.each([500, 502, 504, 404])('HTTP %i es un fallo sin leer el cuerpo', async (status) => {
    const { http } = cliente(
      respuesta('<html>504 Gateway Timeout ERROR CloudFront</html>', {
        status,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(http.getJson(URL_OK)).rejects.toMatchObject({
      codigo: 'HTTP_STATUS',
      status,
      retryAfterMs: null,
    });
  });

  it('429 con Retry-After: 120 informa de 120 000 ms (AM-18)', async () => {
    const { http } = cliente(
      new Response('', { status: 429, headers: { 'retry-after': '120' } }),
    );
    await expect(http.getJson(URL_OK)).rejects.toMatchObject({ status: 429, retryAfterMs: 120_000 });
  });

  it('rechaza un Content-Type que no es JSON (el HTML de error de CloudFront, AM-03)', async () => {
    const { http } = cliente(
      respuesta('<html></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    );
    await expect(http.getJson(URL_OK)).rejects.toMatchObject({ codigo: 'CONTENT_TYPE' });
  });

  it('acepta application/json con charset (USGS)', async () => {
    const { http } = cliente(
      respuesta('{"a":1}', { headers: { 'content-type': 'application/json; charset=utf-8' } }),
    );
    await expect(http.getJson(URL_OK)).resolves.toMatchObject({ datos: { a: 1 } });
  });

  it.each(['{"features":[', '', 'null x', '<html>'])(
    'JSON truncado o inválido (%j) da JSON_INVALIDO (AM-03)',
    async (texto) => {
      const { http } = cliente(respuesta(texto));
      await expect(http.getJson(URL_OK)).rejects.toMatchObject({ codigo: 'JSON_INVALIDO' });
    },
  );

  it('rechaza de antemano un Content-Length mayor que el límite', async () => {
    const { stream, estado } = cuerpoGrande(40 * MiB);
    const { http } = cliente(
      respuesta(stream, { headers: { 'content-length': String(40 * MiB) } }),
    );
    await expect(http.getJson(URL_OK)).rejects.toMatchObject({ codigo: 'LIMITE_TAMANO' });
    expect(estado.leidos).toBeLessThanOrEqual(2 * MiB);
  });

  it('un cuerpo de 40 MiB sin Content-Length se aborta antes de leer 33 MiB (AM-04 a)', async () => {
    const { stream, estado } = cuerpoGrande(40 * MiB);
    const { http } = cliente(respuesta(stream));

    await expect(http.getJson(URL_OK)).rejects.toMatchObject({ codigo: 'LIMITE_TAMANO' });
    expect(MAX_BYTES_FDSN).toBe(32 * MiB);
    expect(estado.leidos).toBeLessThan(33 * MiB);
  });

  it('respeta un maxBytes menor por petición', async () => {
    const { http } = cliente(respuesta('x'.repeat(2048)));
    await expect(http.getJson(URL_OK, { maxBytes: 1024 })).rejects.toMatchObject({
      codigo: 'LIMITE_TAMANO',
    });
  });

  it('una respuesta que no termina se aborta a los 10 s (AM-04 b)', async () => {
    vi.useFakeTimers();
    const { http } = cliente(respuesta(cuerpoInfinito()));

    const promesa = http.getJson(URL_OK).catch((e) => e);
    await vi.advanceTimersByTimeAsync(9_999);
    let resuelta = false;
    promesa.then(() => (resuelta = true));
    await Promise.resolve();
    expect(resuelta).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const err = await promesa;
    expect(err).toBeInstanceOf(FuenteError);
    expect(err.codigo).toBe('TIMEOUT');
  });

  it('un fetch que no responde (cabeceras) también se aborta por tiempo', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url, init) =>
        new Promise((_ok, ko) => {
          init.signal.addEventListener('abort', () => ko(new DOMException('aborted', 'AbortError')));
        }),
    );
    const http = createHttpClient({ fetch, userAgent: 'x', timeoutMs: 3000 });

    const promesa = http.getJson(URL_OK).catch((e) => e);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await promesa).codigo).toBe('TIMEOUT');
  });

  it('una señal externa cancela la petición con CANCELADA', async () => {
    const fetch = vi.fn(
      (_url, init) =>
        new Promise((_ok, ko) => {
          init.signal.addEventListener('abort', () => ko(new DOMException('aborted', 'AbortError')));
        }),
    );
    const http = createHttpClient({ fetch, userAgent: 'x' });
    const controlador = new AbortController();
    const promesa = http.getJson(URL_OK, { signal: controlador.signal }).catch((e) => e);
    controlador.abort();
    expect((await promesa).codigo).toBe('CANCELADA');
  });
});

describe('parsearRetryAfter', () => {
  const AHORA = Date.parse('2026-10-10T07:00:00.000Z');

  it('admite segundos y fecha HTTP', () => {
    expect(parsearRetryAfter('120', AHORA)).toBe(120_000);
    expect(parsearRetryAfter('Sat, 10 Oct 2026 07:00:30 GMT', AHORA)).toBe(30_000);
  });

  it('ignora valores vacíos o inválidos y acota a 1 h', () => {
    expect(parsearRetryAfter(null, AHORA)).toBeNull();
    expect(parsearRetryAfter('mañana', AHORA)).toBeNull();
    expect(parsearRetryAfter('999999', AHORA)).toBe(3_600_000);
  });
});
