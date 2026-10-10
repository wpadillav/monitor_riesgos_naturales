/**
 * Filtros de la página (PRD E2, D5; contrato `GET /api/sismos`). Lógica pura: sin DOM ni
 * almacenamiento. La interfaz está en `filtros-ui.js` y la persistencia en `preferencias.js`.
 */

import { PAISES } from '/shared/constantes.js';
import { redondearMagnitud } from './magnitud.js';

/**
 * @typedef {'ES' | 'CO' | 'PA'} CodigoPais
 * @typedef {'todas' | '1.0' | '2.0' | '2.5' | '3.0' | '4.0' | '4.5' | '5.0'} OpcionMagnitud
 * @typedef {'1h' | '24h' | '7d' | '30d'} Periodo
 * @typedef {{ paises: CodigoPais[], magMin: OpcionMagnitud, periodo: Periodo }} Filtros
 */

/** Opciones de magnitud mínima (D5). `todas` = sin `magMin` en la petición. */
export const OPCIONES_MAGNITUD = Object.freeze([
  Object.freeze({ valor: 'todas', texto: 'Todas' }),
  Object.freeze({ valor: '1.0', texto: '1.0 o más' }),
  Object.freeze({ valor: '2.0', texto: '2.0 o más' }),
  Object.freeze({ valor: '2.5', texto: '2.5 o más' }),
  Object.freeze({ valor: '3.0', texto: '3.0 o más' }),
  Object.freeze({ valor: '4.0', texto: '4.0 o más' }),
  Object.freeze({ valor: '4.5', texto: '4.5 o más' }),
  Object.freeze({ valor: '5.0', texto: '5.0 o más' }),
]);

/** Opciones de periodo [PRD HU-05], con su duración y el texto en minúsculas de los avisos. */
export const OPCIONES_PERIODO = Object.freeze([
  Object.freeze({ valor: '1h', texto: 'Última hora', enFrase: 'la última hora', ms: 3_600_000 }),
  Object.freeze({
    valor: '24h',
    texto: 'Últimas 24 h',
    enFrase: 'las últimas 24 h',
    ms: 86_400_000,
  }),
  Object.freeze({ valor: '7d', texto: '7 días', enFrase: '7 días', ms: 7 * 86_400_000 }),
  Object.freeze({ valor: '30d', texto: '30 días', enFrase: '30 días', ms: 30 * 86_400_000 }),
]);

/** Valores por defecto (D5): los tres países, 2.0 o más y últimas 24 h. */
export const FILTROS_POR_DEFECTO = Object.freeze({
  paises: Object.freeze(/** @type {CodigoPais[]} */ ([...PAISES])),
  magMin: /** @type {OpcionMagnitud} */ ('2.0'),
  periodo: /** @type {Periodo} */ ('24h'),
});

const VALORES_MAGNITUD = OPCIONES_MAGNITUD.map((o) => o.valor);
const VALORES_PERIODO = OPCIONES_PERIODO.map((o) => o.valor);

/**
 * Copia de los filtros por defecto (mutable).
 * @returns {Filtros}
 */
export function filtrosPorDefecto() {
  return {
    paises: [...FILTROS_POR_DEFECTO.paises],
    magMin: FILTROS_POR_DEFECTO.magMin,
    periodo: FILTROS_POR_DEFECTO.periodo,
  };
}

/**
 * Países en el orden canónico (ES, CO, PA), sin repetir.
 * @param {ReadonlyArray<string>} paises
 * @returns {CodigoPais[]}
 */
export function ordenarPaises(paises) {
  return /** @type {CodigoPais[]} */ (PAISES.filter((p) => paises.includes(p)));
}

/**
 * Valida un objeto desconocido (preferencias guardadas). Devuelve los filtros o `null` si algo
 * no es válido: las preferencias dañadas se descartan enteras (HU-06).
 * @param {unknown} valor
 * @returns {Filtros | null}
 */
export function validarFiltros(valor) {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  const v = /** @type {Record<string, unknown>} */ (valor);
  const { paises, magMin, periodo } = v;
  if (!Array.isArray(paises) || paises.length > PAISES.length) return null;
  if (!paises.every((p) => typeof p === 'string' && PAISES.includes(p))) return null;
  if (new Set(paises).size !== paises.length) return null;
  if (typeof magMin !== 'string' || !VALORES_MAGNITUD.includes(magMin)) return null;
  if (typeof periodo !== 'string' || !VALORES_PERIODO.includes(periodo)) return null;
  return {
    paises: ordenarPaises(/** @type {string[]} */ (paises)),
    magMin: /** @type {OpcionMagnitud} */ (magMin),
    periodo: /** @type {Periodo} */ (periodo),
  };
}

/**
 * ¿Son iguales dos filtros?
 * @param {Filtros} a
 * @param {Filtros} b
 * @returns {boolean}
 */
export function filtrosIguales(a, b) {
  return (
    a.magMin === b.magMin &&
    a.periodo === b.periodo &&
    ordenarPaises(a.paises).join(',') === ordenarPaises(b.paises).join(',')
  );
}

/**
 * ¿Difiere algún filtro del valor por defecto? (muestra «Restablecer filtros»).
 * @param {Filtros} filtros
 * @returns {boolean}
 */
export function difiereDeDefecto(filtros) {
  return !filtrosIguales(filtros, FILTROS_POR_DEFECTO);
}

/**
 * Query de `GET /api/sismos` (contrato: `paises` obligatorio, `magMin` y `periodo` de lista
 * cerrada). Devuelve `null` si no hay países: entonces no se consulta (HU-03).
 * @param {Filtros} filtros
 * @returns {string | null}
 */
export function construirQuery(filtros) {
  const paises = ordenarPaises(filtros.paises);
  if (paises.length === 0) return null;
  const q = new URLSearchParams();
  q.set('paises', paises.join(','));
  if (filtros.magMin !== 'todas') q.set('magMin', filtros.magMin);
  q.set('periodo', filtros.periodo);
  return q.toString();
}

/**
 * Duración del periodo en ms.
 * @param {Periodo} periodo
 * @returns {number}
 */
export function duracionPeriodo(periodo) {
  return (OPCIONES_PERIODO.find((o) => o.valor === periodo) ?? OPCIONES_PERIODO[1]).ms;
}

/**
 * @param {Periodo} periodo
 * @returns {{ texto: string, enFrase: string }}
 */
export function textosPeriodo(periodo) {
  return OPCIONES_PERIODO.find((o) => o.valor === periodo) ?? OPCIONES_PERIODO[1];
}

/**
 * @param {OpcionMagnitud} magMin
 * @returns {string}
 */
export function textoMagnitud(magMin) {
  return (OPCIONES_MAGNITUD.find((o) => o.valor === magMin) ?? OPCIONES_MAGNITUD[2]).texto;
}

const NOMBRES = Object.freeze({ ES: 'España', CO: 'Colombia', PA: 'Panamá' });

/**
 * Países en el resumen (textos.md §4): «3 países», «España y Colombia», «Solo Panamá»,
 * «Ningún país».
 * @param {ReadonlyArray<string>} paises
 * @returns {string}
 */
export function textoPaises(paises) {
  const p = ordenarPaises(paises);
  if (p.length === 0) return 'Ningún país';
  if (p.length === PAISES.length) return `${PAISES.length} países`;
  if (p.length === 1) return `Solo ${NOMBRES[p[0]]}`;
  return p.map((c) => NOMBRES[c]).join(' y ');
}

/**
 * Resumen del botón «Filtros y avisos» en móvil: «3 países · 2.0 o más · Últimas 24 h».
 * Sin países: «Ningún país».
 * @param {Filtros} filtros
 * @returns {string}
 */
export function resumenFiltros(filtros) {
  if (filtros.paises.length === 0) return 'Ningún país';
  return [
    textoPaises(filtros.paises),
    textoMagnitud(filtros.magMin),
    textosPeriodo(filtros.periodo).texto,
  ].join(' · ');
}

/**
 * ¿Cumple un sismo los filtros de la lista? Lo usará el stream (T4.6b) para decidir si pinta un
 * sismo que llega en vivo; la magnitud se compara redondeada (D1).
 * @param {{ pais: string, magnitud: number, tiempo: string }} sismo
 * @param {Filtros} filtros
 * @param {number} ahora ms
 * @returns {boolean}
 */
export function cumpleFiltros(sismo, filtros, ahora) {
  if (!filtros.paises.includes(/** @type {CodigoPais} */ (sismo.pais))) return false;
  if (filtros.magMin !== 'todas' && redondearMagnitud(sismo.magnitud) < Number(filtros.magMin)) {
    return false;
  }
  const t = Date.parse(sismo.tiempo);
  return Number.isFinite(t) && t >= ahora - duracionPeriodo(filtros.periodo);
}
