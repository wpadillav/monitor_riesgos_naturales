/**
 * Textos derivados de un sismo para la lista y la ventana emergente (textos.md §5 y §7). Todo
 * devuelve cadenas que se insertan con `textContent` (RNF-07).
 */

import { sanear } from '/shared/texto.js';

/** Nombre de cada país (contrato `CodigoPais`). */
export const NOMBRE_PAIS = Object.freeze({ ES: 'España', CO: 'Colombia', PA: 'Panamá' });

/** Nombre visible de cada fuente (contrato `Fuente`). */
export const NOMBRE_FUENTE = Object.freeze({ emsc: 'EMSC', usgs: 'USGS' });

/** Palabras que van en minúscula dentro de un nombre (salvo al principio). */
const MENORES = new Set(['of', 'the', 'and', 'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e']);

const LETRAS = /\p{L}+/gu;
const MINUSCULA = /\p{Ll}/u;

/**
 * Lugar tal como llega de la fuente, con formato de mayúsculas y minúsculas si viene todo en
 * mayúsculas (EMSC: «PANAMA-COSTA RICA BORDER REGION» → «Panama-Costa Rica Border Region»).
 * Si trae minúsculas, se respeta tal cual. No se traduce. Vacío → «Lugar sin nombre».
 * @param {unknown} lugar
 * @returns {string}
 */
export function formatearLugar(lugar) {
  const texto = sanear(lugar, 200);
  if (texto === '') return 'Lugar sin nombre';
  if (MINUSCULA.test(texto)) return texto;
  let primera = true;
  return texto.replace(LETRAS, (palabra) => {
    const minus = palabra.toLocaleLowerCase('es');
    const esPrimera = primera;
    primera = false;
    if (!esPrimera && MENORES.has(minus)) return minus;
    return minus.charAt(0).toLocaleUpperCase('es') + minus.slice(1);
  });
}

/**
 * @param {unknown} pais
 * @returns {string}
 */
export function nombrePais(pais) {
  return typeof pais === 'string' && Object.hasOwn(NOMBRE_PAIS, pais) ? NOMBRE_PAIS[pais] : '';
}

/**
 * Profundidad en km enteros: «12 km». `null` → `null` (el texto de reserva lo pone quien llama).
 * @param {unknown} km
 * @returns {string | null}
 */
export function formatearProfundidad(km) {
  if (typeof km !== 'number' || !Number.isFinite(km)) return null;
  return `${Math.round(km) || 0} km`;
}

/**
 * Línea 2 de la lista: «Colombia · 12 km de profundidad» o «Colombia · profundidad desconocida».
 * @param {{ pais: unknown, profundidadKm: unknown }} sismo
 * @returns {string}
 */
export function lineaPaisProfundidad(sismo) {
  const prof = formatearProfundidad(sismo.profundidadKm);
  const pais = nombrePais(sismo.pais);
  const textoProf = prof === null ? 'profundidad desconocida' : `${prof} de profundidad`;
  return pais ? `${pais} · ${textoProf}` : textoProf;
}

/**
 * Coordenadas con dos decimales y la latitud primero: «8.31, -76.95».
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
export function formatearCoordenadas(lat, lon) {
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

const numero = new Intl.NumberFormat('es');

/**
 * Número con el formato de `Intl.NumberFormat('es')`: «1234», «10.000».
 * @param {number} n
 * @returns {string}
 */
export function formatearNumero(n) {
  return numero.format(n);
}

/**
 * Contador: «Ningún sismo», «1 sismo», «12 sismos».
 * @param {number} n
 * @returns {string}
 */
export function textoContador(n) {
  if (n === 0) return 'Ningún sismo';
  if (n === 1) return '1 sismo';
  return `${formatearNumero(n)} sismos`;
}

/**
 * Hora del equipo del usuario para la línea de estado: «14:20:05».
 * @param {number} instante ms
 * @returns {string}
 */
export function horaEquipo(instante) {
  const d = new Date(instante);
  const dos = (/** @type {number} */ v) => String(v).padStart(2, '0');
  return `${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`;
}
