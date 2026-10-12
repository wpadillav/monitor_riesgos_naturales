/**
 * Estado de la vista: los sismos que se muestran, indexados por id (AM-24: nunca se buscan en el
 * DOM por su id). Sin DOM: la lista y el mapa se suscriben a los cambios.
 *
 * - `reemplazar(sismos)` con cada carga de `GET /api/sismos` (inicial, filtros y recarga);
 * - `aplicarSismo(sismo, { nuevo })` con `sismo.nuevo` y `sismo.actualizado` del stream;
 * - `eliminarSismo(id)` con `sismo.eliminado` y con los que dejan de cumplir los filtros;
 * - `purgar(desde)` con los que salen del periodo (HU-05);
 * - `suscribir(oyente)` recibe `{ tipo: 'reemplazo' | 'nuevo' | 'actualizado' | 'eliminado' |
 *   'purga', ids }` de forma síncrona. La página agrupa los cambios y repinta como mucho una vez
 *   por frame (`agrupador.js`, P-01).
 *
 * El array ordenado (`lista()`) se mantiene al día con inserción binaria en las altas, bajas y
 * revisiones sueltas: no se reordena todo por cada sismo del stream (P-01).
 */

import { redondearMagnitud } from './magnitud.js';

/**
 * @typedef {object} Sismo modelo común del contrato (`components.schemas.Sismo`)
 * @property {string} id
 * @property {string} tiempo
 * @property {number} lat
 * @property {number} lon
 * @property {number | null} profundidadKm
 * @property {number} magnitud
 * @property {string} magnitudTipo
 * @property {string} lugar
 * @property {string} pais
 * @property {string} zona
 * @property {string} zonaHoraria
 * @property {string} autor
 * @property {string} fuentePreferida
 * @property {string} url
 * @property {{ fuente: string, idFuente: string, autor: string, magnitud: number,
 *   magnitudTipo: string, url: string, actualizadoEn: string }[]} fuentes
 * @property {number} revision
 *
 * @typedef {object} Entrada
 * @property {Sismo} sismo
 * @property {number} instante `tiempo` en ms (para ordenar y para «hace X»)
 * @property {number | null} llegadoEn ms en que llegó en esta sesión (etiqueta «Nuevo»)
 * @property {number | null} magnitudAnterior magnitud antes de una revisión («Revisado»)
 * @property {number} version aumenta con cada cambio de la entrada (la vista repinta)
 *
 * @typedef {{ tipo: 'reemplazo' | 'nuevo' | 'actualizado' | 'eliminado' | 'purga',
 *   ids: string[] }} Cambio
 */

/** Tiempo durante el que un sismo llegado en esta sesión lleva la etiqueta «Nuevo». */
export const DURACION_NUEVO_MS = 10 * 60_000;

/**
 * ¿Tiene el objeto la forma mínima para pintarse? Defensa en profundidad frente a una respuesta
 * inesperada: lo que no cumple se descarta.
 * @param {unknown} s
 * @returns {s is Sismo}
 */
export function esSismoValido(s) {
  if (typeof s !== 'object' || s === null) return false;
  const v = /** @type {Record<string, unknown>} */ (s);
  return (
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    v.id.length <= 80 &&
    typeof v.tiempo === 'string' &&
    Number.isFinite(Date.parse(v.tiempo)) &&
    typeof v.lat === 'number' &&
    Number.isFinite(v.lat) &&
    Math.abs(v.lat) <= 90 &&
    typeof v.lon === 'number' &&
    Number.isFinite(v.lon) &&
    Math.abs(v.lon) <= 180 &&
    typeof v.magnitud === 'number' &&
    Number.isFinite(v.magnitud)
  );
}

/**
 * Orden de la lista: más recientes primero y, a igual instante, por id.
 * @param {Entrada} a
 * @param {Entrada} b
 */
function masReciente(a, b) {
  return (
    b.instante - a.instante || (a.sismo.id < b.sismo.id ? -1 : a.sismo.id > b.sismo.id ? 1 : 0)
  );
}

/**
 * Primera posición de `orden` donde `entrada` no va antes (búsqueda binaria).
 * @param {Entrada[]} orden
 * @param {Entrada} entrada
 */
function posicionDe(orden, entrada) {
  let lo = 0;
  let hi = orden.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (masReciente(orden[mid], entrada) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * @param {{ ahora?: () => number }} [opciones]
 */
export function crearEstado({ ahora = () => Date.now() } = {}) {
  /** @type {Map<string, Entrada>} */
  let porId = new Map();
  /** @type {Entrada[] | null} */
  let ordenadas = null;
  /** @type {Set<(cambio: Cambio) => void>} */
  const oyentes = new Set();
  let version = 0;

  /** @param {Cambio} cambio */
  function emitir(cambio) {
    for (const oyente of oyentes) oyente(cambio);
  }

  /** @param {Entrada} entrada quita la entrada del array ordenado (si está calculado) */
  function sacarDeOrden(entrada) {
    if (!ordenadas) return;
    const i = posicionDe(ordenadas, entrada);
    if (ordenadas[i] === entrada) ordenadas.splice(i, 1);
    else ordenadas = null; // no debería pasar: se recalcula entero la próxima vez
  }

  /** @param {Entrada} entrada */
  function meterEnOrden(entrada) {
    if (ordenadas) ordenadas.splice(posicionDe(ordenadas, entrada), 0, entrada);
  }

  /**
   * @param {Sismo} sismo
   * @param {Entrada | undefined} previa
   * @param {number | null} llegadoEn
   * @returns {Entrada}
   */
  function crearEntrada(sismo, previa, llegadoEn) {
    let magnitudAnterior = previa?.magnitudAnterior ?? null;
    if (previa && redondearMagnitud(previa.sismo.magnitud) !== redondearMagnitud(sismo.magnitud)) {
      magnitudAnterior = previa.sismo.magnitud;
    }
    version += 1;
    return {
      sismo,
      instante: Date.parse(sismo.tiempo),
      llegadoEn: previa ? previa.llegadoEn : llegadoEn,
      magnitudAnterior,
      version: previa && previa.sismo === sismo ? previa.version : version,
    };
  }

  return Object.freeze({
    /**
     * Sustituye todos los sismos (carga inicial o cambio de filtros). Conserva lo que ya se
     * sabía de los que siguen («Nuevo», magnitud anterior).
     * @param {unknown[]} sismos
     * @param {{ marcarNuevos?: boolean }} [opciones] marca como «Nuevo» los ids que no estaban
     *   (recarga periódica); en la carga inicial y al cambiar filtros no se marcan
     */
    reemplazar(sismos, { marcarNuevos = false } = {}) {
      const previas = porId;
      const t = ahora();
      porId = new Map();
      for (const s of sismos) {
        if (!esSismoValido(s) || porId.has(s.id)) continue;
        const previa = previas.get(s.id);
        const llegado = marcarNuevos && !previa ? t : null;
        const entrada =
          previa && previa.sismo.revision === s.revision && previa.sismo.tiempo === s.tiempo
            ? { ...previa, sismo: s }
            : crearEntrada(s, previa, llegado);
        porId.set(s.id, entrada);
      }
      ordenadas = null;
      emitir({ tipo: 'reemplazo', ids: [...porId.keys()] });
    },

    /**
     * Alta o actualización de un sismo (stream SSE, T4.6b).
     * @param {unknown} sismo
     * @param {{ nuevo?: boolean }} [opciones] `nuevo`: llegó en esta sesión (etiqueta «Nuevo»)
     * @returns {'nuevo' | 'actualizado' | null} `null` si el sismo no es válido
     */
    aplicarSismo(sismo, { nuevo = true } = {}) {
      if (!esSismoValido(sismo)) return null;
      const previa = porId.get(sismo.id);
      const entrada = crearEntrada(sismo, previa, nuevo ? ahora() : null);
      porId.set(sismo.id, entrada);
      if (previa) sacarDeOrden(previa);
      meterEnOrden(entrada);
      const tipo = previa ? 'actualizado' : 'nuevo';
      emitir({ tipo, ids: [sismo.id] });
      return tipo;
    },

    /**
     * @param {string} id
     * @returns {boolean} `true` si existía
     */
    eliminarSismo(id) {
      const previa = porId.get(id);
      if (!previa) return false;
      porId.delete(id);
      sacarDeOrden(previa);
      emitir({ tipo: 'eliminado', ids: [id] });
      return true;
    },

    /**
     * Quita los sismos anteriores a `desde` (salen del periodo, HU-05). Sin anuncio.
     * @param {number} desde ms
     * @returns {string[]} ids quitados
     */
    purgar(desde) {
      const quitados = [];
      for (const [id, e] of porId) {
        if (e.instante < desde) {
          porId.delete(id);
          quitados.push(id);
        }
      }
      if (quitados.length > 0) {
        // Los más antiguos están al final del array ordenado.
        if (ordenadas) ordenadas = ordenadas.filter((e) => e.instante >= desde);
        emitir({ tipo: 'purga', ids: quitados });
      }
      return quitados;
    },

    /**
     * @returns {Entrada[]} más recientes primero. Es el array interno, que cambia en el sitio
     *   con cada alta o baja: quien lo guarde debe tratarlo como de solo lectura.
     */
    lista() {
      if (!ordenadas) ordenadas = [...porId.values()].sort(masReciente);
      return ordenadas;
    },

    /**
     * @param {string} id
     * @returns {Entrada | undefined}
     */
    obtener(id) {
      return porId.get(id);
    },

    get tamano() {
      return porId.size;
    },

    /**
     * @param {(cambio: Cambio) => void} oyente
     * @returns {() => void} cancela la suscripción
     */
    suscribir(oyente) {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
  });
}

/**
 * ¿Lleva la etiqueta «Nuevo»?
 * @param {Entrada} entrada
 * @param {number} ahora ms
 */
export function esNuevo(entrada, ahora) {
  return entrada.llegadoEn !== null && ahora - entrada.llegadoEn < DURACION_NUEVO_MS;
}

/** @typedef {ReturnType<typeof crearEstado>} Estado */
