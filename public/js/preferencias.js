/**
 * Preferencias en `localStorage` (HU-06, HU-09). Solo preferencias: nunca datos de sismos ni
 * datos personales (RNF-14, amenazas §5.8). Todo acceso va con `try/catch`: con el almacenamiento
 * bloqueado o lleno, la página funciona igual con los valores por defecto.
 */

import { filtrosPorDefecto, validarFiltros } from './filtros.js';

export const CLAVE_FILTROS = 'filtros';
export const CLAVE_TEMA = 'tema';

/** Preferencias de tema: «Sistema» (por defecto), «Oscuro» y «Día». */
export const OPCIONES_TEMA = Object.freeze(['sistema', 'oscuro', 'dia']);

/**
 * `localStorage` si está disponible; `null` si el navegador lo bloquea.
 * @returns {Storage | null}
 */
export function almacenNavegador() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Filtros guardados, o los de por defecto si no hay o no son válidos (sin mensaje, HU-06).
 * @param {Pick<Storage, 'getItem'> | null} almacen
 * @returns {import('./filtros.js').Filtros}
 */
export function leerFiltros(almacen) {
  try {
    const crudo = almacen?.getItem(CLAVE_FILTROS);
    if (typeof crudo !== 'string' || crudo.length > 1000) return filtrosPorDefecto();
    return validarFiltros(JSON.parse(crudo)) ?? filtrosPorDefecto();
  } catch {
    return filtrosPorDefecto();
  }
}

/**
 * @param {Pick<Storage, 'setItem'> | null} almacen
 * @param {import('./filtros.js').Filtros} filtros
 * @returns {boolean} `true` si se ha guardado
 */
export function guardarFiltros(almacen, filtros) {
  try {
    if (!almacen) return false;
    const { paises, magMin, periodo } = filtros;
    almacen.setItem(CLAVE_FILTROS, JSON.stringify({ paises, magMin, periodo }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Preferencia de tema guardada; «sistema» si no hay o no es válida.
 * @param {Pick<Storage, 'getItem'> | null} almacen
 * @returns {'sistema' | 'oscuro' | 'dia'}
 */
export function leerTema(almacen) {
  try {
    const valor = almacen?.getItem(CLAVE_TEMA);
    return valor === 'oscuro' || valor === 'dia' ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
}

/**
 * Guarda la preferencia de tema. «Sistema» borra la clave: así `tema-inicial.js` sigue al
 * sistema sin más lógica.
 * @param {Pick<Storage, 'setItem' | 'removeItem'> | null} almacen
 * @param {'sistema' | 'oscuro' | 'dia'} tema
 * @returns {boolean}
 */
export function guardarTema(almacen, tema) {
  try {
    if (!almacen || !OPCIONES_TEMA.includes(tema)) return false;
    if (tema === 'sistema') almacen.removeItem(CLAVE_TEMA);
    else almacen.setItem(CLAVE_TEMA, tema);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tema efectivo a partir de la preferencia y de `prefers-color-scheme`.
 * @param {'sistema' | 'oscuro' | 'dia'} preferencia
 * @param {boolean} sistemaClaro `true` si el sistema pide modo claro
 * @returns {'oscuro' | 'dia'}
 */
export function resolverTema(preferencia, sistemaClaro) {
  if (preferencia === 'oscuro' || preferencia === 'dia') return preferencia;
  return sistemaClaro ? 'dia' : 'oscuro';
}
