/**
 * Reglas de aviso que decide el servidor (ADR-0004 «Notificable»; PRD E4, D1 y D4). T4.6 las
 * usa al emitir por SSE: `notificable` viaja en `DatosSismo` y `avisoMin` amplía el filtro de
 * cada cliente. `GET /api/sismos` no notifica nunca (carga inicial).
 */

/** Ventana de aviso por defecto: 60 min (`AVISO_VENTANA_MIN`). */
export const AVISO_VENTANA_MIN_POR_DEFECTO = 60;

/** Opciones de umbral de aviso del contrato (`avisoMin` en `/api/stream`). */
export const OPCIONES_AVISO_MIN = Object.freeze(['4.0', '4.5', '5.0', '5.5', '6.0']);

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
 * `notificable` (ADR-0004): la hora de origen es de hace ≤ `ventanaMin` minutos en el momento
 * de emitir. Un sismo con hora de origen ligeramente futura (reloj de la fuente) también lo es.
 * @param {{ tiempo: string | number }} sismo `tiempo` ISO 8601 (contrato) o ms
 * @param {number} ahora ms
 * @param {number} [ventanaMin]
 * @returns {boolean}
 */
export function esNotificable(sismo, ahora, ventanaMin = AVISO_VENTANA_MIN_POR_DEFECTO) {
  const tiempo = typeof sismo.tiempo === 'number' ? sismo.tiempo : Date.parse(sismo.tiempo);
  if (!Number.isFinite(tiempo)) return false;
  return ahora - tiempo <= ventanaMin * 60_000;
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
