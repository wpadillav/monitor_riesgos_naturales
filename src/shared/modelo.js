/**
 * Modelo común de sismo (ADR-0004) y normalizador único de campos (AM-05).
 *
 * Los adaptadores por fuente (T4.3, `src/server/fuentes/normalizar-*.js`) extraen los valores
 * crudos de cada formato y llaman a `crearRegistro`, que valida y construye un objeto nuevo
 * campo a campo. Nada de lo que llega de fuera se copia tal cual.
 */

import { AGENCIA_NACIONAL, FUENTES } from './constantes.js';
import { PATRON_ID_FUENTE, urlFicha } from './enlaces.js';
import { normalizarLongitud } from './geo.js';
import { sanear } from './texto.js';

/**
 * @typedef {'emsc' | 'usgs'} Fuente
 * @typedef {'ES' | 'CO' | 'PA'} CodigoPais
 * @typedef {'ES-PEN' | 'ES-CAN' | 'CO-CONT' | 'CO-SAI' | 'PA'} Zona
 */

/**
 * Lo que aporta una fuente a un sismo, ya normalizado. Los instantes son milisegundos UTC; el
 * servidor los serializa en ISO 8601 al construir el `Sismo` del contrato.
 * @typedef {object} RegistroFuente
 * @property {Fuente} fuente
 * @property {string} idFuente `unid` en EMSC; id preferido en USGS.
 * @property {ReadonlyArray<string>} ids todos los ids por los que se puede asociar
 *   (en USGS, los de `ids`; incluye siempre `idFuente`).
 * @property {number} tiempo hora de origen (ms UTC).
 * @property {number} actualizadoEn última actualización en la fuente (ms UTC).
 * @property {number} lat grados, [−90, 90].
 * @property {number} lon grados, [−180, 180].
 * @property {number | null} profundidadKm positiva hacia abajo, [−10, 800]; `null` si falta.
 * @property {number} magnitud número finito, [−2, 10]; sin redondear.
 * @property {string} magnitudTipo
 * @property {string} autor agencia autora (`auth` de EMSC, `net` de USGS en mayúsculas).
 * @property {string} lugar región o lugar, saneado.
 * @property {string} url ficha construida con plantilla fija (AM-02).
 */

/**
 * Sismo canónico tal como lo publica el contrato (`Sismo` en `docs/api/openapi.yaml`).
 * @typedef {object} Sismo
 * @property {string} id `<fuente>:<idFuente>` del primer registro.
 * @property {string} tiempo ISO 8601 UTC.
 * @property {number} lat
 * @property {number} lon
 * @property {number | null} profundidadKm
 * @property {number} magnitud
 * @property {string} magnitudTipo
 * @property {string} lugar
 * @property {CodigoPais} pais
 * @property {Zona} zona
 * @property {string} zonaHoraria
 * @property {string} autor
 * @property {Fuente} fuentePreferida
 * @property {string} url
 * @property {Array<{fuente: Fuente, idFuente: string, autor: string, magnitud: number,
 *   magnitudTipo: string, url: string, actualizadoEn: string}>} fuentes
 * @property {string} actualizadoEn
 * @property {string} recibidoEn
 * @property {number} revision
 */

/**
 * Resultado de asignar país a una posición (ver `pais.js`).
 * @typedef {object} UbicacionPais
 * @property {CodigoPais} pais
 * @property {Zona} zona
 * @property {string} zonaHoraria
 * @property {ReadonlyArray<CodigoPais>} paisesCandidatos
 */

/** Rangos de AM-05. */
export const LIMITES = Object.freeze({
  latitud: Object.freeze([-90, 90]),
  longitud: Object.freeze([-360, 360]),
  profundidadKm: Object.freeze([-10, 800]),
  magnitud: Object.freeze([-2, 10]),
  /** Margen admitido de hora de origen en el futuro (reloj de la fuente adelantado). */
  futuroMaxMs: 10 * 60 * 1000,
  /** No se aceptan horas anteriores a 1900 (valores absurdos o mal parseados). */
  tiempoMinMs: Date.UTC(1900, 0, 1),
  textoMax: 200,
  autorMax: 32,
  magnitudTipoMax: 16,
  idsMax: 20,
});

const ISO_UTC =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Convierte un instante de una fuente en milisegundos UTC: número (ms, USGS) o cadena ISO 8601
 * con zona (EMSC, hasta 9 decimales de segundo). Devuelve `NaN` si no es válido.
 * @param {unknown} valor
 * @returns {number}
 */
export function parsearInstante(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : Number.NaN;
  if (typeof valor !== 'string' || valor.length > 40) return Number.NaN;
  const m = ISO_UTC.exec(valor);
  if (!m) return Number.NaN;
  const fraccion = (m[7] ?? '').padEnd(3, '0').slice(0, 3);
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${fraccion}${m[8]}`);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * Profundidad positiva hacia abajo (PRD E1). Usa `depth` si es un número finito; si no, la
 * coordenada vertical `z` cambiada de signo (EMSC publica `coordinates[2]` negativo). Para
 * USGS, cuya `coordinates[2]` ya es positiva, se pasa como `depth`.
 * @param {unknown} depth profundidad ya positiva
 * @param {unknown} [z] coordenada vertical positiva hacia arriba
 * @returns {number | null}
 */
export function profundidadPositiva(depth, z) {
  if (typeof depth === 'number' && Number.isFinite(depth)) return depth === 0 ? 0 : depth;
  if (typeof z === 'number' && Number.isFinite(z)) return z === 0 ? 0 : -z;
  return null;
}

const enRango = (x, [min, max]) =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

/**
 * Datos crudos que el adaptador de cada fuente extrae de su formato.
 * @typedef {object} EntradaRegistro
 * @property {unknown} fuente
 * @property {unknown} idFuente
 * @property {unknown} [ids] lista de ids alternativos (USGS).
 * @property {unknown} tiempo ms o ISO 8601.
 * @property {unknown} actualizadoEn ms o ISO 8601; si falta, se usa `tiempo`.
 * @property {unknown} lat
 * @property {unknown} lon
 * @property {unknown} profundidadKm ya pasada por `profundidadPositiva` (o `null`).
 * @property {unknown} magnitud
 * @property {unknown} magnitudTipo
 * @property {unknown} autor
 * @property {unknown} lugar
 */

/**
 * @typedef {{ ok: true, registro: Readonly<RegistroFuente> } | { ok: false, motivo: string }}
 *   ResultadoRegistro
 */

/**
 * Normalizador único (AM-05): valida cada campo y construye un objeto nuevo. Lo que no cumple se
 * descarta con un motivo (para el contador por fuente); nunca se corrige a ciegas.
 * @param {EntradaRegistro} entrada
 * @param {number} ahora ms UTC (reloj inyectado)
 * @returns {ResultadoRegistro}
 */
export function crearRegistro(entrada, ahora) {
  if (entrada === null || typeof entrada !== 'object') return descartar('entrada');
  const leer = (clave) => (Object.hasOwn(entrada, clave) ? entrada[clave] : undefined);

  const fuente = leer('fuente');
  if (typeof fuente !== 'string' || !FUENTES.includes(fuente)) return descartar('fuente');

  const idFuente = leer('idFuente');
  if (typeof idFuente !== 'string' || !PATRON_ID_FUENTE.test(idFuente)) return descartar('id');

  const tiempo = parsearInstante(leer('tiempo'));
  if (!Number.isFinite(tiempo) || tiempo < LIMITES.tiempoMinMs) return descartar('tiempo');
  if (tiempo > ahora + LIMITES.futuroMaxMs) return descartar('tiempo-futuro');

  const actualizadoCrudo = leer('actualizadoEn');
  const actualizadoEn =
    actualizadoCrudo === undefined || actualizadoCrudo === null
      ? tiempo
      : parsearInstante(actualizadoCrudo);
  if (!Number.isFinite(actualizadoEn) || actualizadoEn < LIMITES.tiempoMinMs) {
    return descartar('actualizado');
  }

  const lat = leer('lat');
  if (!enRango(lat, LIMITES.latitud)) return descartar('lat');
  const lonCruda = leer('lon');
  if (!enRango(lonCruda, LIMITES.longitud)) return descartar('lon');

  const profundidadCruda = leer('profundidadKm');
  let profundidadKm = null;
  if (profundidadCruda !== undefined && profundidadCruda !== null) {
    if (!enRango(profundidadCruda, LIMITES.profundidadKm)) return descartar('profundidad');
    profundidadKm = profundidadCruda;
  }

  const magnitud = leer('magnitud');
  if (!enRango(magnitud, LIMITES.magnitud)) return descartar('magnitud');

  const autor = sanear(leer('autor'), LIMITES.autorMax);
  if (autor === '') return descartar('autor');
  const magnitudTipo = sanear(leer('magnitudTipo'), LIMITES.magnitudTipoMax);
  const lugar = sanear(leer('lugar'), LIMITES.textoMax);

  const ids = [idFuente];
  const idsCrudos = leer('ids');
  if (Array.isArray(idsCrudos)) {
    for (const id of idsCrudos.slice(0, LIMITES.idsMax)) {
      if (typeof id === 'string' && PATRON_ID_FUENTE.test(id) && !ids.includes(id)) ids.push(id);
    }
  }

  /** @type {RegistroFuente} */
  const registro = {
    fuente: /** @type {Fuente} */ (fuente),
    idFuente,
    ids: Object.freeze(ids),
    tiempo,
    actualizadoEn,
    lat,
    lon: normalizarLongitud(lonCruda),
    profundidadKm,
    magnitud,
    magnitudTipo,
    autor,
    lugar,
    url: /** @type {string} */ (urlFicha(fuente, idFuente)),
  };
  return { ok: true, registro: Object.freeze(registro) };
}

/** @param {string} motivo */
function descartar(motivo) {
  return { ok: false, motivo };
}

/**
 * Identificador estable de un sismo: `<fuente>:<idFuente>` del registro que lo creó (ADR-0004).
 * @param {Pick<RegistroFuente, 'fuente' | 'idFuente'>} registro
 * @returns {string}
 */
export function idEstable(registro) {
  return `${registro.fuente}:${registro.idFuente}`;
}

/**
 * Rango de precedencia de un registro (ADR-0004): 1 = EMSC con autor nacional del país asignado a
 * la ubicación de ese registro; 2 = otro EMSC; 3 = USGS. Menor es mejor.
 * @param {Pick<RegistroFuente, 'fuente' | 'autor'>} registro
 * @param {CodigoPais | null | undefined} paisDelRegistro
 * @returns {1 | 2 | 3}
 */
export function rangoPrecedencia(registro, paisDelRegistro) {
  if (registro.fuente !== 'emsc') return 3;
  const agencia = paisDelRegistro ? AGENCIA_NACIONAL[paisDelRegistro] : undefined;
  return agencia !== undefined && registro.autor.toUpperCase() === agencia ? 1 : 2;
}

/**
 * Registro preferido de un sismo según la precedencia. Se recalcula en cada cambio, porque el
 * autor de un `unid` puede cambiar. Con el mismo rango (no debería ocurrir: un registro por
 * fuente) gana el primero de la lista.
 * @template {Pick<RegistroFuente, 'fuente' | 'autor' | 'lat' | 'lon'>} R
 * @param {ReadonlyArray<R>} registros al menos uno
 * @param {(lat: number, lon: number) => CodigoPais | null} paisDe
 * @returns {R}
 */
export function registroPreferido(registros, paisDe) {
  if (registros.length === 0) throw new RangeError('Un sismo tiene al menos un registro.');
  let mejor = registros[0];
  let rangoMejor = rangoPrecedencia(mejor, paisDe(mejor.lat, mejor.lon));
  for (const registro of registros.slice(1)) {
    const rango = rangoPrecedencia(registro, paisDe(registro.lat, registro.lon));
    if (rango < rangoMejor) {
      mejor = registro;
      rangoMejor = rango;
    }
  }
  return mejor;
}

/**
 * Construye el `Sismo` del contrato a partir de sus registros (un máximo de uno por fuente).
 * Devuelve `null` si la ubicación preferida no pertenece a ningún país: ese sismo se guarda para
 * deduplicar, pero no se sirve (arquitectura §5.5).
 * @param {object} datos
 * @param {string} datos.id identificador estable (`idEstable` del primer registro).
 * @param {ReadonlyArray<RegistroFuente>} datos.registros
 * @param {number} datos.recibidoEn ms UTC de la primera recepción.
 * @param {number} datos.revision entero ≥ 1.
 * @param {(lat: number, lon: number) => UbicacionPais | null} asignarPais
 * @returns {Sismo | null}
 */
export function componerSismo({ id, registros, recibidoEn, revision }, asignarPais) {
  const paisDe = (lat, lon) => asignarPais(lat, lon)?.pais ?? null;
  const preferido = registroPreferido(registros, paisDe);
  const ubicacion = asignarPais(preferido.lat, preferido.lon);
  if (!ubicacion) return null;
  const iso = (ms) => new Date(ms).toISOString();
  return {
    id,
    tiempo: iso(preferido.tiempo),
    lat: preferido.lat,
    lon: preferido.lon,
    profundidadKm: preferido.profundidadKm,
    magnitud: preferido.magnitud,
    magnitudTipo: preferido.magnitudTipo,
    lugar: preferido.lugar,
    pais: ubicacion.pais,
    zona: ubicacion.zona,
    zonaHoraria: ubicacion.zonaHoraria,
    autor: preferido.autor,
    fuentePreferida: preferido.fuente,
    url: preferido.url,
    fuentes: registros.map((r) => ({
      fuente: r.fuente,
      idFuente: r.idFuente,
      autor: r.autor,
      magnitud: r.magnitud,
      magnitudTipo: r.magnitudTipo,
      url: r.url,
      actualizadoEn: iso(r.actualizadoEn),
    })),
    actualizadoEn: iso(Math.max(...registros.map((r) => r.actualizadoEn))),
    recibidoEn: iso(recibidoEn),
    revision,
  };
}
