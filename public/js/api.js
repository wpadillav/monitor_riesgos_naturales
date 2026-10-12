/**
 * Cliente de la API local (mismo origen; `connect-src 'self'`): `GET /api/sismos` y
 * `GET /api/salud`. La suscripción a `/api/stream` está en `stream.js`.
 */

import { construirQuery } from './filtros.js';

/** Tiempo máximo de una consulta: el servidor tarda como mucho ~10 s con 7 o 30 días (RNF-04). */
export const TIEMPO_MAXIMO_MS = 30_000;

/** Error de la API clasificado para elegir el mensaje (textos.md §6). */
export class ErrorApi extends Error {
  /**
   * @param {'red' | 'servidor'} tipo `red`: el servidor no responde; `servidor`: responde con
   *   un error (5xx, 4xx o un cuerpo inesperado)
   * @param {number} [status]
   */
  constructor(tipo, status = 0) {
    super(tipo === 'red' ? 'El servidor local no responde' : `Error del servidor (${status})`);
    this.name = 'ErrorApi';
    this.tipo = tipo;
    this.status = status;
  }
}

/**
 * @param {string} ruta
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch }} opciones
 * @returns {Promise<unknown>}
 */
async function pedirJson(ruta, { signal, fetchImpl = globalThis.fetch }) {
  const limite = AbortSignal.timeout(TIEMPO_MAXIMO_MS);
  const senal = signal ? AbortSignal.any([signal, limite]) : limite;
  let respuesta;
  try {
    respuesta = await fetchImpl(ruta, {
      signal: senal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if (signal?.aborted) throw err; // cancelada por una consulta posterior
    throw new ErrorApi('red');
  }
  if (!respuesta.ok) throw new ErrorApi('servidor', respuesta.status);
  try {
    return await respuesta.json();
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ErrorApi('servidor', respuesta.status);
  }
}

/**
 * `GET /api/sismos`. Devuelve `null` sin consultar si no hay países marcados (HU-03).
 * @param {import('./filtros.js').Filtros} filtros
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch }} [opciones]
 * @returns {Promise<{ sismos: unknown[], fuentes: unknown[], ultimoEventoId: string | null,
 *   generadoEn: string | null, truncado: boolean } | null>}
 */
export async function consultarSismos(filtros, opciones = {}) {
  const query = construirQuery(filtros);
  if (query === null) return null;
  const cuerpo = await pedirJson(`/api/sismos?${query}`, opciones);
  if (typeof cuerpo !== 'object' || cuerpo === null || !Array.isArray(cuerpo.sismos)) {
    throw new ErrorApi('servidor', 200);
  }
  return {
    sismos: cuerpo.sismos,
    fuentes: Array.isArray(cuerpo.fuentes) ? cuerpo.fuentes : [],
    ultimoEventoId: typeof cuerpo.ultimoEventoId === 'string' ? cuerpo.ultimoEventoId : null,
    generadoEn: typeof cuerpo.generadoEn === 'string' ? cuerpo.generadoEn : null,
    truncado: cuerpo.truncado === true,
  };
}

/**
 * `GET /api/salud`: solo interesa el estado de las fuentes.
 * @param {{ signal?: AbortSignal, fetchImpl?: typeof fetch }} [opciones]
 * @returns {Promise<unknown[]>}
 */
export async function consultarFuentes(opciones = {}) {
  const cuerpo = await pedirJson('/api/salud', opciones);
  return typeof cuerpo === 'object' && cuerpo !== null && Array.isArray(cuerpo.fuentes)
    ? cuerpo.fuentes
    : [];
}
