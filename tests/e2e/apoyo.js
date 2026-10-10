/**
 * Apoyo de las pruebas E2E (T4.5): datos simulados, interceptación de `/api/*` y de las teselas
 * de Esri, y vigilancia de CSP, consola y diálogos en **todas** las pruebas (AM-01, AM-19, AM-36).
 */

import { test as base, expect } from '@playwright/test';
import { crearSseSimulado } from './sse-simulado.js';

/** Instante fijo de las pruebas: verano (horario de verano en Madrid y Canarias). */
export const AHORA = Date.parse('2026-07-15T12:30:00.000Z');

const HORA = 3_600_000;
const PERIODOS = { '1h': HORA, '24h': 24 * HORA, '7d': 7 * 24 * HORA, '30d': 30 * 24 * HORA };

/** PNG de 1 × 1 para las teselas simuladas. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Aviso conocido de Chrome con `Permissions-Policy` (cabecera fijada por T4.1). */
const AVISO_BLUETOOTH = /Permissions-Policy.*bluetooth/;

/**
 * Sismo del contrato con valores por defecto.
 * @param {Record<string, unknown>} campos
 */
export function sismo(campos) {
  const unid = String(campos.unid ?? campos.id ?? 'x');
  const id = `emsc:${unid}`;
  const url = `https://www.seismicportal.eu/eventdetails.html?unid=${unid}`;
  const base = {
    id,
    tiempo: new Date(AHORA - 10 * 60_000).toISOString(),
    lat: 40.4,
    lon: -3.7,
    profundidadKm: 10,
    magnitud: 3,
    magnitudTipo: 'ml',
    lugar: 'SPAIN',
    pais: 'ES',
    zona: 'ES-PEN',
    zonaHoraria: 'Europe/Madrid',
    autor: 'IGN',
    fuentePreferida: 'emsc',
    url,
    fuentes: [
      {
        fuente: 'emsc',
        idFuente: unid,
        autor: String(campos.autor ?? 'IGN'),
        magnitud: Number(campos.magnitud ?? 3),
        magnitudTipo: 'ml',
        url,
        actualizadoEn: new Date(AHORA - 5 * 60_000).toISOString(),
      },
    ],
    actualizadoEn: new Date(AHORA - 5 * 60_000).toISOString(),
    recibidoEn: new Date(AHORA - 4 * 60_000).toISOString(),
    revision: 1,
  };
  const resto = { ...campos };
  delete resto.unid;
  return { ...base, ...resto };
}

/** Enlace malicioso del fixture XSS (AM-02). Se compone para no disparar `no-script-url`. */
const URL_JAVASCRIPT = ['javascript', 'alert(1)'].join(':');

/** Juego de sismos de las pruebas (HU-07, HU-08, RNF-07). */
export function sismosEjemplo() {
  return [
    sismo({
      unid: 'tenerife',
      tiempo: '2026-07-15T12:00:00.000Z',
      lat: 28.3,
      lon: -16.6,
      magnitud: 2.7,
      lugar: 'CANARY ISLANDS, SPAIN REGION',
      zona: 'ES-CAN',
      zonaHoraria: 'Atlantic/Canary',
      profundidadKm: 14,
    }),
    sismo({
      unid: 'uraba',
      tiempo: '2026-07-15T11:55:00.000Z',
      lat: 8.31,
      lon: -76.95,
      magnitud: 4.2,
      lugar: 'NORTHERN COLOMBIA',
      pais: 'CO',
      zona: 'CO-CONT',
      zonaHoraria: 'America/Bogota',
      autor: 'IGC',
      profundidadKm: 12,
    }),
    sismo({
      unid: 'xss',
      tiempo: '2026-07-15T11:40:00.000Z',
      lat: 37.2,
      lon: -3.6,
      magnitud: 3.4,
      lugar: '<img src=x onerror=alert(1)>',
      autor: '<b onmouseover=alert(1)>IGN</b>',
      url: URL_JAVASCRIPT,
      fuentes: [
        {
          fuente: 'emsc',
          idFuente: 'xss',
          autor: 'IGN',
          magnitud: 3.4,
          magnitudTipo: 'ml',
          url: URL_JAVASCRIPT,
          actualizadoEn: '2026-07-15T11:45:00.000Z',
        },
      ],
      profundidadKm: 8,
    }),
    sismo({
      unid: 'murcia',
      tiempo: '2026-07-15T10:00:00.000Z',
      lat: 37.7,
      lon: -1.7,
      magnitud: 3.1,
      lugar: 'MURCIA, SPAIN',
      profundidadKm: 9,
    }),
    sismo({
      unid: 'sin-nombre',
      tiempo: '2026-07-15T09:00:00.000Z',
      lat: 4.6,
      lon: -74.1,
      magnitud: 2.1,
      lugar: '',
      pais: 'CO',
      zona: 'CO-CONT',
      zonaHoraria: 'America/Bogota',
      profundidadKm: null,
    }),
    sismo({
      unid: 'panama',
      tiempo: '2026-07-14T10:00:00.000Z',
      lat: 6.9,
      lon: -82.3,
      magnitud: 6.1,
      lugar: 'SOUTH OF PANAMA',
      pais: 'PA',
      zona: 'PA',
      zonaHoraria: 'America/Panama',
      autor: 'IGC',
      profundidadKm: 10,
    }),
  ];
}

/**
 * `n` sismos sintéticos en España, uno cada 8 s hacia atrás (10 000 caben en 24 h, RNF-03).
 * @param {number} n
 */
export function muchosSismos(n) {
  return Array.from({ length: n }, (_, i) =>
    sismo({
      unid: `m${i}`,
      tiempo: new Date(AHORA - (i + 1) * 8_000).toISOString(),
      lat: 36 + (i % 80) / 10,
      lon: -9 + (i % 120) / 10,
      magnitud: 2 + (i % 40) / 10,
      lugar: `SINTETICO ${i + 1}`,
    }),
  );
}

/**
 * Simula `/api/sismos` (filtra por la query como el servidor), `/api/salud` y las teselas.
 * @param {import('@playwright/test').Page} page
 * @param {object} [opciones]
 * @param {object[]} [opciones.sismos]
 * @param {object[]} [opciones.fuentes]
 * @param {(n: number) => number | undefined} [opciones.estadoHttp] código HTTP de la n-ésima
 *   petición (1, 2…); `undefined` = 200
 * @returns {Promise<{ peticiones: URLSearchParams[], teselas: string[] }>}
 */
export async function simular(page, opciones = {}) {
  const sismos = opciones.sismos ?? sismosEjemplo();
  const fuentes = opciones.fuentes ?? [
    { fuente: 'emsc-fdsn', estado: 'ok', cambiadoEn: new Date(AHORA - HORA).toISOString() },
    { fuente: 'usgs', estado: 'ok', cambiadoEn: new Date(AHORA - HORA).toISOString() },
  ];
  /** @type {URLSearchParams[]} */
  const peticiones = [];
  /** @type {string[]} */
  const teselas = [];

  await page.route('https://server.arcgisonline.com/**', (ruta) => {
    teselas.push(ruta.request().url());
    return ruta.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  await page.route('**/api/salud', (ruta) =>
    ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ estado: 'ok', version: '2.0.0', fuentes }),
    }),
  );
  await page.route('**/api/sismos?*', (ruta) => {
    const q = new URL(ruta.request().url()).searchParams;
    peticiones.push(q);
    const estado = opciones.estadoHttp?.(peticiones.length);
    if (estado !== undefined && estado !== 200) {
      return ruta.fulfill({
        status: estado,
        contentType: 'application/problem+json',
        body: JSON.stringify({ type: 'urn:terremotos:problema:error-interno', status: estado }),
      });
    }
    const paises = (q.get('paises') ?? '').split(',');
    const magMin = q.has('magMin') ? Number(q.get('magMin')) : -Infinity;
    const desde = AHORA - PERIODOS[/** @type {'24h'} */ (q.get('periodo') ?? '24h')];
    const filtrados = sismos.filter(
      (s) =>
        paises.includes(s.pais) &&
        Math.round(s.magnitud * 10 + 1e-9) / 10 >= magMin &&
        Date.parse(s.tiempo) >= desde,
    );
    return ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generadoEn: new Date(AHORA).toISOString(),
        filtro: { paises, magMin: null, periodo: q.get('periodo'), desde },
        ultimoEventoId: 'abc-1',
        completo: true,
        total: filtrados.length,
        truncado: false,
        fuentes,
        sismos: filtrados,
      }),
    });
  });
  return { peticiones, teselas };
}

/**
 * `test` con vigilancia automática: al terminar cada prueba exige 0 violaciones de CSP, 0 errores
 * de consola (salvo el aviso conocido de `bluetooth` y los que la prueba declare) y 0 diálogos.
 */
export const test = base.extend({
  erroresPermitidos: [[], { option: true }],
  /**
   * `/api/stream` simulado (T4.6b): cada prueba tiene su servidor SSE y la página se conecta a
   * él sin saberlo. La prueba envía eventos con `sse.enviar(tipo, datos)`.
   * @type {import('./sse-simulado.js').SseSimulado}
   */
  sse: [
    async ({ page }, usar) => {
      const sse = await crearSseSimulado();
      await page.route('**/api/stream?*', (ruta) => {
        const original = new URL(ruta.request().url());
        return ruta.continue({
          url: `http://127.0.0.1:${sse.puerto}${original.pathname}${original.search}`,
        });
      });
      await usar(sse);
      await sse.cerrar();
    },
    { auto: true },
  ],
  vigilancia: [
    async ({ page, erroresPermitidos }, usar) => {
      /** @type {string[]} */
      const errores = [];
      /** @type {string[]} */
      const dialogos = [];
      await page.addInitScript(() => {
        /** @type {any} */ (window).__csp = [];
        document.addEventListener('securitypolicyviolation', (e) => {
          /** @type {any} */ (window).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
        });
      });
      page.on('console', (m) => {
        if (m.type() !== 'error' && m.type() !== 'warning') return;
        const texto = m.text();
        if (AVISO_BLUETOOTH.test(texto)) return;
        if (m.type() === 'warning') return;
        if (/** @type {RegExp[]} */ (erroresPermitidos).some((r) => r.test(texto))) return;
        errores.push(texto);
      });
      page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
      page.on('dialog', (d) => {
        dialogos.push(d.message());
        return d.dismiss();
      });
      await page.clock.install({ time: AHORA });
      await usar(undefined);
      const csp = await page
        .evaluate(() => /** @type {any} */ (window).__csp ?? [])
        .catch(() => []);
      expect(csp, 'violaciones de CSP').toEqual([]);
      expect(errores, 'errores de consola').toEqual([]);
      expect(dialogos, 'diálogos (posible XSS)').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Filas de la lista.
 * @param {import('@playwright/test').Page} page
 */
export function filas(page) {
  return page.locator('#lista-sismos button.item');
}

/**
 * Registra las notificaciones que crea la página en `window.__avisos` (antes de cargarla).
 * - Sin `permiso`: envuelve la `Notification` **real** del navegador; el permiso es el del
 *   contexto de Playwright (`test.use({ permissions: ['notifications'] })`).
 * - Con `permiso`: la sustituye por una simulada con ese permiso; `requestPermission` contesta
 *   `respuesta` (para «denegado» y «sin respuesta», que el contexto no permite simular).
 * - Con `soportado: false`: la elimina (navegador sin avisos).
 * @param {import('@playwright/test').Page} page
 * @param {{ permiso?: NotificationPermission, respuesta?: NotificationPermission,
 *   soportado?: boolean }} [opciones]
 */
export async function espiarNotificaciones(page, opciones = {}) {
  await page.addInitScript(
    ({ permiso, respuesta, soportado }) => {
      const w = /** @type {any} */ (window);
      if (!soportado) {
        delete w.Notification;
        return;
      }
      w.__avisos = [];
      w.__peticionesPermiso = 0;
      if (permiso === null) {
        const Original = w.Notification;
        const pedirOriginal = Original.requestPermission.bind(Original);
        w.Notification = class extends Original {
          /** @param {string} titulo @param {NotificationOptions} [o] */
          constructor(titulo, o) {
            super(titulo, o);
            w.__avisos.push(this);
          }
          static requestPermission() {
            w.__peticionesPermiso += 1;
            return pedirOriginal();
          }
        };
        return;
      }
      let actual = permiso;
      class NotificacionEspia extends EventTarget {
        /** @param {string} titulo @param {NotificationOptions} [o] */
        constructor(titulo, o = {}) {
          super();
          this.title = titulo;
          this.body = o.body;
          this.tag = o.tag;
          this.lang = o.lang;
          this.icon = o.icon;
          this.cerrada = false;
          w.__avisos.push(this);
        }
        close() {
          this.cerrada = true;
        }
        static get permission() {
          return actual;
        }
        static async requestPermission() {
          w.__peticionesPermiso += 1;
          actual = respuesta;
          return actual;
        }
      }
      w.Notification = NotificacionEspia;
      w.__cambiarPermiso = (/** @type {NotificationPermission} */ p) => {
        actual = p;
      };
    },
    {
      permiso: opciones.permiso ?? null,
      respuesta: opciones.respuesta ?? 'granted',
      soportado: opciones.soportado ?? true,
    },
  );
}

/**
 * Notificaciones creadas (título, cuerpo y etiqueta).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ title: string, body: string, tag: string, lang: string, icon: string }[]>}
 */
export function avisos(page) {
  return page.evaluate(() =>
    /** @type {any[]} */ (/** @type {any} */ (window).__avisos ?? []).map((n) => ({
      title: n.title,
      body: n.body,
      tag: n.tag,
      lang: n.lang,
      icon: n.icon,
    })),
  );
}
