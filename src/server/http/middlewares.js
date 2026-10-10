/**
 * Middlewares de seguridad (amenazas §5.3, §7; arquitectura §8.1).
 * Orden en `createApp`: cabeceras → Host → Origin (solo /api/*) → métodos.
 */

import { problemResponse } from './errores.js';

/** CSP literal del modelo de amenazas §7.1. No se modifica sin revisar el modelo. */
export const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://server.arcgisonline.com; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Cabeceras de §7.2 que van en todas las respuestas. Sin HSTS ni COEP, a propósito. */
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy':
    'geolocation=(), camera=(), microphone=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()',
});

const ALLOWED_METHODS = Object.freeze(['GET', 'HEAD']);

/** @typedef {import('hono').MiddlewareHandler} MiddlewareHandler */

/**
 * Cabeceras de seguridad en todas las respuestas, incluidas las de error (AM-19, AM-21).
 * Va la primera para envolver también los 421/403/405 de los demás middlewares.
 * @returns {MiddlewareHandler}
 */
export function securityHeaders() {
  return async (c, next) => {
    await next();
    const cabeceras = c.res.headers;
    for (const [nombre, valor] of Object.entries(SECURITY_HEADERS)) cabeceras.set(nombre, valor);
    cabeceras.delete('X-Powered-By');
    if (c.req.path.startsWith('/api/')) cabeceras.set('Cache-Control', 'no-store');
  };
}

/**
 * Lista blanca exacta de `Host` contra DNS rebinding (AM-10). Se aplica a todas las rutas.
 * @param {number} port
 * @returns {Set<string>}
 */
export function allowedHosts(port) {
  return new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
}

/**
 * @param {object} opciones
 * @param {number} opciones.port
 * @param {(status: number) => void} opciones.onReject
 * @returns {MiddlewareHandler}
 */
export function hostAllowlist({ port, onReject }) {
  const permitidos = allowedHosts(port);
  return async (c, next) => {
    const host = c.req.header('host')?.toLowerCase();
    if (!host || !permitidos.has(host)) {
      onReject(421);
      return problemResponse('host-no-permitido');
    }
    await next();
  };
}

/**
 * En /api/*: `Origin`, si viene, debe ser exactamente el origen propio (esquema, host y
 * puerto); `Sec-Fetch-Site`, si viene, `same-origin` o `none`. Se rechaza con 403 antes de
 * hacer ningún trabajo. Nunca se envía `Access-Control-Allow-*` (AM-11).
 * Requiere que `hostAllowlist` haya validado antes el `Host`.
 * @param {object} opciones
 * @param {(status: number) => void} opciones.onReject
 * @returns {MiddlewareHandler}
 */
export function sameOriginOnly({ onReject }) {
  return async (c, next) => {
    const origenPropio = `http://${c.req.header('host')?.toLowerCase()}`;
    const origin = c.req.header('origin');
    const fetchSite = c.req.header('sec-fetch-site');
    const origenValido = origin === undefined || origin === origenPropio;
    const sitioValido =
      fetchSite === undefined || fetchSite === 'same-origin' || fetchSite === 'none';
    if (!origenValido || !sitioValido) {
      onReject(403);
      return problemResponse('origen-no-permitido');
    }
    await next();
  };
}

/**
 * Solo `GET` y `HEAD` en toda la aplicación (AM-12).
 * @param {object} opciones
 * @param {(status: number) => void} opciones.onReject
 * @returns {MiddlewareHandler}
 */
export function readOnlyMethods({ onReject }) {
  return async (c, next) => {
    if (!ALLOWED_METHODS.includes(c.req.method)) {
      onReject(405);
      return problemResponse('metodo-no-permitido', { Allow: ALLOWED_METHODS.join(', ') });
    }
    await next();
  };
}

/**
 * Registra los rechazos HTTP como mucho una vez por minuto y por código (arquitectura §8.3).
 * @param {import('../infra/log.js').Log} log
 * @param {import('../infra/reloj.js').Reloj} reloj
 * @returns {(status: number) => void}
 */
export function createRejectionLogger(log, reloj) {
  /** @type {Map<number, { desde: number, cuenta: number }>} */
  const ventanas = new Map();
  return (status) => {
    const ahora = reloj.ahora();
    const ventana = ventanas.get(status);
    if (ventana && ahora - ventana.desde < 60_000) {
      ventana.cuenta += 1;
      return;
    }
    const cuenta = (ventana?.cuenta ?? 0) + 1;
    ventanas.set(status, { desde: ahora, cuenta: 0 });
    log.warn('http.rechazo', { status, cuenta });
  };
}
