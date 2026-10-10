/**
 * Estado de cada canal operativo (arquitectura §5.3; contrato `EstadoFuente`).
 *
 * Máquina de estados por canal: `iniciando` → `ok` | `degradada` | `caida`.
 * - el primer éxito → `ok` (y pone a cero los fallos seguidos);
 * - 1 fallo → `degradada`;
 * - 2 fallos seguidos, de cualquier zona → `caida`.
 *
 * Cada cambio de estado escribe **una** línea `fuente.estado` (RNF-15) y emite `cambio`, que
 * T4.6 difundirá como `estado.fuente`. T4.6 añade el canal `emsc-ws` con `registrarCanal`.
 */

import { EventEmitter } from 'node:events';

/** Fallos seguidos a partir de los cuales el canal pasa a `caida`. */
export const FALLOS_PARA_CAIDA = 2;

/**
 * @typedef {'emsc-ws' | 'emsc-fdsn' | 'usgs'} Canal
 * @typedef {'iniciando' | 'ok' | 'degradada' | 'caida'} Estado
 * @typedef {import('../http/rutas-salud.js').EstadoFuente} EstadoFuente
 */

/**
 * @param {object} deps
 * @param {ReadonlyArray<Canal>} deps.canales
 * @param {import('../infra/reloj.js').Reloj} deps.reloj
 * @param {import('../infra/log.js').Log} deps.log
 */
export function createEstadoFuentes({ canales, reloj, log }) {
  const emisor = new EventEmitter();
  /** @type {Map<Canal, { estado: Estado, cambiadoEn: number, ultimoExitoEn: number | null,
   *   proximoIntentoEn: number | null, mensaje: string | null, fallosSeguidos: number }>} */
  const canalesEstado = new Map();

  /** @param {Canal} canal */
  function registrarCanal(canal) {
    if (canalesEstado.has(canal)) return;
    canalesEstado.set(canal, {
      estado: 'iniciando',
      cambiadoEn: reloj.ahora(),
      ultimoExitoEn: null,
      proximoIntentoEn: null,
      mensaje: null,
      fallosSeguidos: 0,
    });
  }
  for (const canal of canales) registrarCanal(canal);

  /** @param {Canal} canal @returns {EstadoFuente} */
  function aContrato(canal) {
    const e = /** @type {NonNullable<ReturnType<typeof canalesEstado.get>>} */ (
      canalesEstado.get(canal)
    );
    const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());
    return {
      fuente: canal,
      estado: e.estado,
      cambiadoEn: iso(e.cambiadoEn),
      ultimoExitoEn: iso(e.ultimoExitoEn),
      proximoIntentoEn: iso(e.proximoIntentoEn),
      mensaje: e.mensaje,
    };
  }

  /**
   * @param {Canal} canal
   * @param {Estado} nuevo
   * @param {string | null} motivo
   */
  function cambiar(canal, nuevo, motivo) {
    const e = canalesEstado.get(canal);
    if (!e || e.estado === nuevo) return;
    const de = e.estado;
    e.estado = nuevo;
    e.cambiadoEn = reloj.ahora();
    const nivel = nuevo === 'ok' ? 'info' : 'warn';
    log[nivel]('fuente.estado', { fuente: canal, de, a: nuevo, motivo: motivo ?? undefined });
    emisor.emit('cambio', aContrato(canal));
  }

  return Object.freeze({
    registrarCanal,

    /** @param {Canal} canal */
    registrarExito(canal) {
      const e = canalesEstado.get(canal);
      if (!e) return;
      e.fallosSeguidos = 0;
      e.ultimoExitoEn = reloj.ahora();
      e.proximoIntentoEn = null;
      e.mensaje = null;
      cambiar(canal, 'ok', null);
    },

    /**
     * @param {Canal} canal
     * @param {string} mensaje breve, en español, sin URL ni trazas
     * @param {number | null} proximoIntentoEn ms
     */
    registrarFallo(canal, mensaje, proximoIntentoEn) {
      const e = canalesEstado.get(canal);
      if (!e) return;
      e.fallosSeguidos += 1;
      e.mensaje = mensaje.slice(0, 200);
      e.proximoIntentoEn = proximoIntentoEn;
      cambiar(canal, e.fallosSeguidos >= FALLOS_PARA_CAIDA ? 'caida' : 'degradada', mensaje);
    },

    /** Estados en el formato del contrato, en el orden de registro. @returns {EstadoFuente[]} */
    obtener() {
      return [...canalesEstado.keys()].map(aContrato);
    },

    /**
     * Suscripción a los cambios de estado (T4.6 → `estado.fuente`).
     * @param {(estado: EstadoFuente) => void} oyente
     * @returns {() => void} cancela la suscripción
     */
    alCambiar(oyente) {
      emisor.on('cambio', oyente);
      return () => emisor.off('cambio', oyente);
    },
  });
}
