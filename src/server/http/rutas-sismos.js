/**
 * `GET /api/sismos` (contrato: operationId `listarSismos`, esquemas `RespuestaSismos` y
 * `Filtro`). Validación con listas blancas en la frontera (AM-08): parámetros conocidos, sin
 * repetir, con valores de lista cerrada y la *query* de como máximo 512 bytes. Los errores son
 * `400` problem+json con `errors[]` de textos fijos (nunca se refleja la entrada).
 */

import { PAISES } from '../../shared/constantes.js';
import {
  OPCIONES_MAG_MIN,
  PERIODO_POR_DEFECTO,
  PERIODOS,
  PERIODOS_MS,
} from '../../shared/reglas.js';
import { problemResponse } from './errores.js';

/** Tamaño máximo de la *query* en bytes (AM-08). */
export const MAX_QUERY_BYTES = 512;

const PARAMETROS = Object.freeze(['paises', 'magMin', 'periodo']);

const MENSAJES = Object.freeze({
  consulta: `La consulta supera ${MAX_QUERY_BYTES} bytes.`,
  repetido: 'El parámetro está repetido.',
  paisesFalta: `Es obligatorio. Valores permitidos: ${PAISES.join(', ')}.`,
  paises: `Valores permitidos: ${PAISES.join(', ')}, separados por comas y sin repetir.`,
  magMin: `Valores permitidos: ${OPCIONES_MAG_MIN.join(', ')}. Sin el parámetro: todas.`,
  periodo: `Valores permitidos: ${PERIODOS.join(', ')}.`,
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
 * Comprobaciones comunes de la *query* (AM-08): tamaño, parámetros conocidos y sin repetir.
 * @param {string} search parte `?…` de la URL tal como llegó (codificada)
 * @param {ReadonlyArray<string>} permitidos
 * @returns {{ ok: true, q: URLSearchParams } |
 *   { ok: false, errors: import('./errores.js').ErrorParametro[] }}
 */
export function validarConsulta(search, permitidos) {
  const cruda = search.startsWith('?') ? search.slice(1) : search;
  if (new TextEncoder().encode(cruda).byteLength > MAX_QUERY_BYTES) {
    return { ok: false, errors: [{ parametro: 'consulta', mensaje: MENSAJES.consulta }] };
  }
  const q = new URLSearchParams(cruda);
  /** @type {import('./errores.js').ErrorParametro[]} */
  const errors = [];

  let desconocido = false;
  for (const nombre of new Set(q.keys())) {
    if (!permitidos.includes(nombre)) {
      desconocido = true;
    } else if (q.getAll(nombre).length > 1) {
      errors.push({ parametro: nombre, mensaje: MENSAJES.repetido });
    }
  }
  if (desconocido) {
    errors.push({
      parametro: 'desconocido',
      mensaje: `Solo se admiten los parámetros ${permitidos.join(', ')}.`,
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, q };
}

/**
 * Lee `paises`, `magMin` y `periodo` de una *query* ya validada con `validarConsulta`. Añade a
 * `errors` los que no cumplen las listas cerradas.
 * @param {URLSearchParams} q
 * @param {import('./errores.js').ErrorParametro[]} errors
 * @returns {FiltroSismos}
 */
export function leerFiltro(q, errors) {
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
  return { paises, magMin, periodo };
}

/**
 * Valida la *query* de `/api/sismos`. Función pura.
 * @param {string} search parte `?…` de la URL tal como llegó (codificada)
 * @returns {ResultadoParseo}
 */
export function parsearConsultaSismos(search) {
  const base = validarConsulta(search, PARAMETROS);
  if (!base.ok) return base;
  /** @type {import('./errores.js').ErrorParametro[]} */
  const errors = [];
  const filtro = leerFiltro(base.q, errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, filtro };
}

/** Tamaño orientativo de cada trozo de la respuesta en streaming (P-03). */
export const TROZO_BYTES = 64 * 1024;

const CABECERAS_JSON = Object.freeze({ 'Content-Type': 'application/json; charset=utf-8' });

/**
 * Serializa `RespuestaSismos` como un flujo de trozos de unos 64 KiB (P-03, RNF-05).
 *
 * `JSON.stringify` de la respuesta completa crea una cadena de hasta 7 MB y, al enviarla, su copia
 * en UTF-8; con varias peticiones a la vez el pico de memoria se multiplica. Aquí la lista de
 * `Sismo` (objetos inmutables, ya elegidos por el catálogo) se serializa sismo a sismo cuando el
 * consumidor pide más (`pull`): en memoria solo hay un trozo por petición, y la contrapresión del
 * socket frena la serialización si el cliente lee despacio. El JSON resultante es idéntico al de
 * `JSON.stringify(cuerpo)`, con `sismos` como último campo.
 * @param {{ sismos: ReadonlyArray<object> } & Record<string, unknown>} cuerpo
 * @param {number} [trozoBytes]
 * @returns {ReadableStream<Uint8Array>}
 */
export function serializarRespuesta(cuerpo, trozoBytes = TROZO_BYTES) {
  const { sismos, ...resto } = cuerpo;
  const encoder = new TextEncoder();
  const cabeza = JSON.stringify({ ...resto, sismos: [] }).slice(0, -2);
  let i = -1; // -1: falta la cabeza
  return new ReadableStream(
    {
      pull(controller) {
        let texto = '';
        if (i < 0) {
          texto = cabeza;
          i = 0;
        }
        while (i < sismos.length && texto.length < trozoBytes) {
          texto += (i === 0 ? '' : ',') + JSON.stringify(sismos[i]);
          i += 1;
        }
        if (i >= sismos.length) {
          controller.enqueue(encoder.encode(`${texto}]}`));
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(texto));
      },
    },
    // Un trozo en cola como máximo: `pull` solo se llama cuando el anterior ya salió.
    { highWaterMark: 1 },
  );
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
    // R-21: HEAD valida la query y responde con las cabeceras, sin pedir cobertura a las fuentes
    // ni leer el catálogo.
    if (c.req.method === 'HEAD')
      return new Response(null, { status: 200, headers: CABECERAS_JSON });
    const cuerpo = await servicio.consultar(resultado.filtro);
    return new Response(serializarRespuesta(cuerpo), { status: 200, headers: CABECERAS_JSON });
  });
}
