/**
 * `GET /api/sismos` (contrato: operationId `listarSismos`, esquemas `RespuestaSismos` y
 * `Filtro`). Validación con listas blancas en la frontera (AM-08): parámetros conocidos, sin
 * repetir, con valores de lista cerrada y la *query* de como máximo 512 bytes. Los errores son
 * `400` problem+json con `errors[]` de textos fijos (nunca se refleja la entrada).
 */

import { PAISES } from '../../shared/constantes.js';
import { PERIODO_POR_DEFECTO, PERIODOS_MS } from '../dominio/consulta-sismos.js';
import { problemResponse } from './errores.js';

/** Tamaño máximo de la *query* en bytes (AM-08). */
export const MAX_QUERY_BYTES = 512;

/** Opciones de `magMin` del contrato (ausente = todas). */
export const OPCIONES_MAG_MIN = Object.freeze(['1.0', '2.0', '2.5', '3.0', '4.0', '4.5', '5.0']);

const PARAMETROS = Object.freeze(['paises', 'magMin', 'periodo']);

const MENSAJES = Object.freeze({
  consulta: `La consulta supera ${MAX_QUERY_BYTES} bytes.`,
  desconocido: `Solo se admiten los parámetros ${PARAMETROS.join(', ')}.`,
  repetido: 'El parámetro está repetido.',
  paisesFalta: `Es obligatorio. Valores permitidos: ${PAISES.join(', ')}.`,
  paises: `Valores permitidos: ${PAISES.join(', ')}, separados por comas y sin repetir.`,
  magMin: `Valores permitidos: ${OPCIONES_MAG_MIN.join(', ')}. Sin el parámetro: todas.`,
  periodo: `Valores permitidos: ${Object.keys(PERIODOS_MS).join(', ')}.`,
});

/**
 * @typedef {import('../../shared/modelo.js').CodigoPais} CodigoPais
 * @typedef {import('../dominio/consulta-sismos.js').Periodo} Periodo
 * @typedef {import('../dominio/consulta-sismos.js').FiltroSismos} FiltroSismos
 *
 * @typedef {{ ok: true, filtro: FiltroSismos } |
 *   { ok: false, errors: import('./errores.js').ErrorParametro[] }} ResultadoParseo
 */

/**
 * Valida la *query* de `/api/sismos`. Función pura.
 * @param {string} search parte `?…` de la URL tal como llegó (codificada)
 * @returns {ResultadoParseo}
 */
export function parsearConsultaSismos(search) {
  const cruda = search.startsWith('?') ? search.slice(1) : search;
  if (new TextEncoder().encode(cruda).byteLength > MAX_QUERY_BYTES) {
    return { ok: false, errors: [{ parametro: 'consulta', mensaje: MENSAJES.consulta }] };
  }
  const q = new URLSearchParams(cruda);
  /** @type {import('./errores.js').ErrorParametro[]} */
  const errors = [];

  let desconocido = false;
  for (const nombre of new Set(q.keys())) {
    if (!PARAMETROS.includes(nombre)) {
      desconocido = true;
    } else if (q.getAll(nombre).length > 1) {
      errors.push({ parametro: nombre, mensaje: MENSAJES.repetido });
    }
  }
  if (desconocido) errors.push({ parametro: 'desconocido', mensaje: MENSAJES.desconocido });
  if (errors.length > 0) return { ok: false, errors };

  /** @type {CodigoPais[]} */
  const paises = [];
  const paisesTexto = q.get('paises');
  if (paisesTexto === null) {
    errors.push({ parametro: 'paises', mensaje: MENSAJES.paisesFalta });
  } else {
    const lista = paisesTexto.split(',');
    const validos =
      lista.length >= 1 &&
      lista.length <= PAISES.length &&
      lista.every((p) => PAISES.includes(p)) &&
      new Set(lista).size === lista.length;
    if (validos) paises.push(.../** @type {CodigoPais[]} */ (lista));
    else errors.push({ parametro: 'paises', mensaje: MENSAJES.paises });
  }

  let magMin = null;
  const magTexto = q.get('magMin');
  if (magTexto !== null) {
    if (OPCIONES_MAG_MIN.includes(magTexto)) magMin = Number(magTexto);
    else errors.push({ parametro: 'magMin', mensaje: MENSAJES.magMin });
  }

  /** @type {Periodo} */
  let periodo = PERIODO_POR_DEFECTO;
  const periodoTexto = q.get('periodo');
  if (periodoTexto !== null) {
    if (Object.hasOwn(PERIODOS_MS, periodoTexto)) periodo = /** @type {Periodo} */ (periodoTexto);
    else errors.push({ parametro: 'periodo', mensaje: MENSAJES.periodo });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, filtro: { paises, magMin, periodo } };
}

/**
 * @param {import('hono').Hono} app
 * @param {{ servicio: import('../dominio/consulta-sismos.js').ServicioSismos }} deps
 */
export function registerSismosRoutes(app, { servicio }) {
  app.get('/api/sismos', async (c) => {
    const resultado = parsearConsultaSismos(new URL(c.req.url).search);
    if (!resultado.ok) {
      return problemResponse(
        'parametro-invalido',
        {},
        {
          instance: '/api/sismos',
          errors: resultado.errors,
        },
      );
    }
    const cuerpo = await servicio.consultar(resultado.filtro);
    return c.body(JSON.stringify(cuerpo), 200, {
      'Content-Type': 'application/json; charset=utf-8',
    });
  });
}
