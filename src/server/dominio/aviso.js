/**
 * Reglas de aviso que decide el servidor (ADR-0004 «Notificable»; PRD E4, D1 y D4). T4.6 las
 * usa al emitir por SSE: `notificable` viaja en `DatosSismo` y `avisoMin` amplía el filtro de
 * cada cliente. `GET /api/sismos` no notifica nunca (carga inicial).
 *
 * El redondeo (`redondear1`), los umbrales (`OPCIONES_AVISO_MIN`) y los predicados de aviso
 * (`alcanzaAviso`, `cumpleFiltroAviso`) son comunes con la página y están en
 * `src/shared/reglas.js` (R-06). Aquí solo queda lo que depende del reloj y de la
 * configuración del servidor.
 */

/** Ventana de aviso por defecto: 60 min (`AVISO_VENTANA_MIN`). */
export const AVISO_VENTANA_MIN_POR_DEFECTO = 60;

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
