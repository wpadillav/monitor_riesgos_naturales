/**
 * Reglas del contrato comunes al servidor y a la página (arquitectura §5.7 y §5.8; R-01, R-02 y
 * R-06 de la revisión T5.2). Módulo puro y sin dependencias: lo importa el servidor
 * (`../../shared/reglas.js`) y lo puede importar la página (`/shared/reglas.js`).
 *
 * Dos reglas distintas, decididas por el coordinador el 2026-10-11 (R-02):
 * - **Lista:** la magnitud **cruda** ≥ `magMin`, como el contrato y el `minmag` de FDSN.
 * - **Aviso:** la magnitud **redondeada a un decimal** ≥ umbral (D1: 4.46 avisa con 4.5).
 *
 * En las dos, un sismo de la franja CO-PA cuenta para **cualquiera** de sus `paisesCandidatos`
 * (HU-03, ADR-0005).
 */

/**
 * @typedef {'ES' | 'CO' | 'PA'} CodigoPais
 * @typedef {'1h' | '24h' | '7d' | '30d'} Periodo
 *
 * @typedef {object} SismoReglas lo mínimo de un `Sismo` del contrato que miran las reglas
 * @property {CodigoPais} pais
 * @property {ReadonlyArray<CodigoPais>} [paisesCandidatos] si falta, solo cuenta `pais`
 * @property {number} magnitud cruda
 * @property {string | number} tiempo ISO 8601 (contrato) o ms
 *
 * @typedef {object} FiltroLista
 * @property {ReadonlyArray<string>} paises países marcados
 * @property {number | null} magMin `null` = todas
 * @property {Periodo} periodo
 *
 * @typedef {object} FiltroAviso
 * @property {ReadonlyArray<string>} paises países marcados
 * @property {number | null} avisoMin umbral; `null` = sin avisos
 */

/** Opciones de `magMin` del contrato (`GET /api/sismos` y `/api/stream`). Ausente = todas. */
export const OPCIONES_MAG_MIN = Object.freeze(['1.0', '2.0', '2.5', '3.0', '4.0', '4.5', '5.0']);

/** Valor de la página y de `INGESTA_MAG_MIN` que significa «sin mínimo» (no viaja en la API). */
export const MAG_MIN_TODAS = 'todas';

/** Magnitud mínima por defecto de la lista y de la ingesta (D5). */
export const MAG_MIN_POR_DEFECTO = '2.0';

/** Periodos del contrato (`Periodo`) y su duración en ms. */
export const PERIODOS_MS = Object.freeze({
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
});

/** Periodos en el orden del contrato. */
export const PERIODOS = Object.freeze(/** @type {Periodo[]} */ (Object.keys(PERIODOS_MS)));

/** Periodo por defecto (D5 y contrato). */
export const PERIODO_POR_DEFECTO = '24h';

/** Umbrales de aviso del contrato (`avisoMin` en `/api/stream`). */
export const OPCIONES_AVISO_MIN = Object.freeze(['4.0', '4.5', '5.0', '5.5', '6.0']);

/** Umbral de aviso por defecto (PRD E4). */
export const AVISO_MIN_POR_DEFECTO = '4.5';

/**
 * Id de evento SSE del contrato (`IdEvento`): `<arranque base 36>-<secuencia>`, como máximo
 * 32 caracteres. Los grupos capturan el arranque y la secuencia.
 */
export const PATRON_ID_EVENTO = /^([0-9a-z]{1,16})-([0-9]{1,15})$/;

/** Longitud máxima de un id de evento (16 + 1 + 15). */
export const MAX_ID_EVENTO = 32;

/**
 * ¿Es un id de evento con la forma del contrato? Mide la longitud antes de aplicar la
 * expresión (AM-14) y nunca lanza.
 * @param {unknown} id
 * @returns {boolean}
 */
export function esIdEvento(id) {
  return typeof id === 'string' && id.length <= MAX_ID_EVENTO && PATRON_ID_EVENTO.test(id);
}

/**
 * Magnitud redondeada a un decimal, tal como se muestra (D1: 4.46 → 4.5, 4.44 → 4.4). El
 * pequeño margen corrige la representación binaria (4.45 se guarda como 4.4500000000000002 y
 * 4.35 como 4.3499999999999996): el resultado es el del redondeo decimal «a la mitad hacia
 * arriba» que espera el usuario.
 * @param {number} magnitud
 * @returns {number}
 */
export function redondear1(magnitud) {
  return Math.round(magnitud * 10 + 1e-9) / 10;
}

/**
 * Países por los que cuenta un sismo: `paisesCandidatos` (franja CO-PA) o, si no viene, `pais`.
 * @param {Pick<SismoReglas, 'pais' | 'paisesCandidatos'>} sismo
 * @returns {ReadonlyArray<string>}
 */
export function paisesDelSismo(sismo) {
  const candidatos = sismo.paisesCandidatos;
  return Array.isArray(candidatos) && candidatos.length > 0 ? candidatos : [sismo.pais];
}

/**
 * ¿Está marcado alguno de los países del sismo? (HU-03).
 * @param {Pick<SismoReglas, 'pais' | 'paisesCandidatos'>} sismo
 * @param {ReadonlyArray<string>} paises países marcados
 * @returns {boolean}
 */
export function algunPaisMarcado(sismo, paises) {
  return paisesDelSismo(sismo).some((p) => paises.includes(p));
}

/**
 * ¿Cumple la magnitud **cruda** la mínima de la lista? (R-02). `null` = todas.
 * @param {number} magnitud
 * @param {number | null} magMin
 * @returns {boolean}
 */
export function cumpleMagMin(magnitud, magMin) {
  return magMin === null || magnitud >= magMin;
}

/**
 * Instante en ms de un `tiempo` del contrato (ISO 8601) o ya en ms. `NaN` si no es válido.
 * @param {string | number} tiempo
 * @returns {number}
 */
function instante(tiempo) {
  return typeof tiempo === 'number' ? tiempo : Date.parse(tiempo);
}

/**
 * ¿Cumple la hora de origen el periodo? Un sismo con hora ligeramente futura también.
 * @param {string | number} tiempo
 * @param {Periodo} periodo
 * @param {number} ahora ms
 * @returns {boolean}
 */
export function cumplePeriodo(tiempo, periodo, ahora) {
  const t = instante(tiempo);
  return Number.isFinite(t) && t >= ahora - PERIODOS_MS[periodo];
}

/**
 * Predicado de la **lista** (HU-03, HU-04, HU-05): algún país marcado entre los candidatos,
 * magnitud cruda ≥ `magMin` y hora de origen dentro del periodo.
 * @param {SismoReglas} sismo
 * @param {FiltroLista} filtro
 * @param {number} ahora ms
 * @returns {boolean}
 */
export function cumpleFiltroLista(sismo, filtro, ahora) {
  return (
    algunPaisMarcado(sismo, filtro.paises) &&
    cumpleMagMin(sismo.magnitud, filtro.magMin) &&
    cumplePeriodo(sismo.tiempo, filtro.periodo, ahora)
  );
}

/**
 * ¿Alcanza la magnitud **redondeada** el umbral de aviso? (D1, D4: no depende de `magMin` ni del
 * periodo). Sin umbral (`null`) nunca lo alcanza.
 * @param {number} magnitud
 * @param {number | null} avisoMin
 * @returns {boolean}
 */
export function alcanzaAviso(magnitud, avisoMin) {
  if (avisoMin === null || !Number.isFinite(magnitud)) return false;
  return redondear1(magnitud) >= avisoMin;
}

/**
 * Predicado de **aviso** (HU-11, D1, D4): `notificable`, algún país marcado entre los candidatos
 * y magnitud redondeada ≥ umbral. No mira `magMin` ni el periodo. Lo que ya se notificó y las
 * revisiones que cruzan el umbral los decide quien llama.
 * @param {SismoReglas} sismo
 * @param {boolean} notificable `datos.notificable` del stream
 * @param {FiltroAviso} filtro
 * @returns {boolean}
 */
export function cumpleFiltroAviso(sismo, notificable, filtro) {
  return (
    notificable === true &&
    algunPaisMarcado(sismo, filtro.paises) &&
    alcanzaAviso(sismo.magnitud, filtro.avisoMin)
  );
}

/**
 * Filtro del **stream** por cliente (arquitectura §5.7, contrato `GET /api/stream`): algún país
 * marcado y, además, la regla de la lista **o** la magnitud redondeada ≥ `avisoMin` (D4). El
 * servidor no mira `notificable` aquí: la página lo necesita para pintar y para decidir.
 * @param {SismoReglas} sismo
 * @param {FiltroLista & FiltroAviso} filtro
 * @param {number} ahora ms
 * @returns {boolean}
 */
export function cumpleFiltroStream(sismo, filtro, ahora) {
  if (!algunPaisMarcado(sismo, filtro.paises)) return false;
  const enLista =
    cumpleMagMin(sismo.magnitud, filtro.magMin) &&
    cumplePeriodo(sismo.tiempo, filtro.periodo, ahora);
  return enLista || alcanzaAviso(sismo.magnitud, filtro.avisoMin);
}
