/**
 * `GET /api/stream` (contrato: operationId `suscribirStream`). Valida la *query* con listas
 * blancas (AM-08), comprueba las plazas (AM-13) y entrega el flujo del difusor. `Host` y
 * `Origin`/`Sec-Fetch-Site` ya los validan los middlewares (AM-10, AM-11): una conexión solo
 * ocupa plaza después de pasarlos.
 */

import { OPCIONES_AVISO_MIN } from '../dominio/aviso.js';
import { problemResponse } from './errores.js';
import { leerFiltro, validarConsulta } from './rutas-sismos.js';

const PARAMETROS = Object.freeze(['paises', 'magMin', 'periodo', 'avisoMin', 'ultimoId']);

/** Segundos de `Retry-After` en el 503 por falta de plazas (contrato). */
export const RETRY_AFTER_S = 10;

/** Cabeceras del flujo. `no-store` según el contrato; sin compresión ni *buffering*. */
export const CABECERAS_SSE = Object.freeze({
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Accel-Buffering': 'no',
});

/**
 * @typedef {import('../stream/difusor.js').FiltroCliente} FiltroCliente
 * @typedef {{ ok: true, filtro: FiltroCliente, ultimoId: string | null } |
 *   { ok: false, errors: import('./errores.js').ErrorParametro[] }} ResultadoStream
 */

/**
 * Valida la *query* de `/api/stream`. Función pura. `ultimoId` no se valida aquí: un id mal
 * formado nunca da error, provoca `flujo.reiniciar` (contrato).
 * @param {string} search
 * @returns {ResultadoStream}
 */
export function parsearConsultaStream(search) {
  const base = validarConsulta(search, PARAMETROS);
  if (!base.ok) return base;
  /** @type {import('./errores.js').ErrorParametro[]} */
  const errors = [];
  const { paises, magMin, periodo } = leerFiltro(base.q, errors);

  let avisoMin = null;
  const avisoTexto = base.q.get('avisoMin');
  if (avisoTexto !== null) {
    if (OPCIONES_AVISO_MIN.includes(avisoTexto)) avisoMin = Number(avisoTexto);
    else {
      errors.push({
        parametro: 'avisoMin',
        mensaje: `Valores permitidos: ${OPCIONES_AVISO_MIN.join(', ')}. Sin el parámetro: sin avisos.`,
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    filtro: { paises, magMin, periodo, avisoMin },
    ultimoId: base.q.get('ultimoId'),
  };
}

/**
 * @param {import('hono').Hono} app
 * @param {{ difusor: Pick<ReturnType<typeof import('../stream/difusor.js').createDifusor>,
 *   'conectar'> }} deps
 */
export function registerStreamRoutes(app, { difusor }) {
  app.get('/api/stream', (c) => {
    const resultado = parsearConsultaStream(new URL(c.req.url).search);
    if (!resultado.ok) {
      return problemResponse(
        'parametro-invalido',
        {},
        { instance: '/api/stream', errors: resultado.errors },
      );
    }
    // HEAD no abre flujo ni ocupa plaza.
    if (c.req.method === 'HEAD') return new Response(null, { status: 200, headers: CABECERAS_SSE });

    // Gana la cabecera que envía EventSource al reconectar (contrato).
    const ultimoId = c.req.header('last-event-id') ?? resultado.ultimoId;
    const conexion = difusor.conectar({ filtro: resultado.filtro, ultimoId });
    if (!conexion) {
      return problemResponse(
        'demasiadas-conexiones',
        { 'Retry-After': String(RETRY_AFTER_S) },
        { instance: '/api/stream' },
      );
    }
    c.req.raw.signal?.addEventListener('abort', conexion.cerrar, { once: true });
    return new Response(conexion.cuerpo, { status: 200, headers: CABECERAS_SSE });
  });
}
