/**
 * Estado de cada canal operativo (arquitectura §5.3; contrato `EstadoFuente`).
 *
 * Máquina de estados por canal: `iniciando` → `ok` | `degradada` | `caida`.
 * - el primer éxito → `ok` (y pone a cero los fallos seguidos);
 * - 1 fallo → `degradada`;
 * - 2 fallos seguidos, de cualquier zona → `caida`.
 *
 * Cada cambio de estado escribe **una** línea `fuente.estado` (RNF-15) y emite `cambio`, que
 * el difusor SSE emite como `estado.fuente`. Un cambio de `proximoIntentoEn` o de `mensaje` sin
 * cambio de estado también se emite (la página muestra el próximo intento), pero sin línea de log
 * (R-12). Los oyentes se invocan uno a uno: si uno lanza, se registra y se sigue con el resto,
 * como en el catálogo. El canal `emsc-ws` usa `registrarEstado` (T4.6).
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

  /** @param {Canal} canal */
  function emitir(canal) {
    const carga = aContrato(canal);
    for (const oyente of emisor.listeners('cambio')) {
      try {
        oyente(carga);
      } catch (err) {
        log.error('error', {
          mensaje: `Oyente de fuente.estado: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  /**
   * @param {Canal} canal
   * @param {Estado} nuevo
   * @param {string | null} motivo
   * @param {boolean} [visible] cambió `proximoIntentoEn` o `mensaje`: se emite aunque el estado
   *   sea el mismo
   */
  function cambiar(canal, nuevo, motivo, visible = false) {
    const e = canalesEstado.get(canal);
    if (!e) return;
    if (e.estado === nuevo) {
      if (visible) emitir(canal);
      return;
    }
    const de = e.estado;
    e.estado = nuevo;
    e.cambiadoEn = reloj.ahora();
    const nivel = nuevo === 'ok' ? 'info' : 'warn';
    log[nivel]('fuente.estado', { fuente: canal, de, a: nuevo, motivo: motivo ?? undefined });
    emitir(canal);
  }

  /**
   * Actualiza `mensaje` y `proximoIntentoEn`. Devuelve si alguno ha cambiado.
   * @param {NonNullable<ReturnType<typeof canalesEstado.get>>} e
   * @param {string | null} mensaje
   * @param {number | null} proximoIntentoEn
   */
  function fijarDetalle(e, mensaje, proximoIntentoEn) {
    const cambia = e.mensaje !== mensaje || e.proximoIntentoEn !== proximoIntentoEn;
    e.mensaje = mensaje;
    e.proximoIntentoEn = proximoIntentoEn;
    return cambia;
  }

  return Object.freeze({
    registrarCanal,

    /** @param {Canal} canal */
    registrarExito(canal) {
      const e = canalesEstado.get(canal);
      if (!e) return;
      e.fallosSeguidos = 0;
      e.ultimoExitoEn = reloj.ahora();
      // `ultimoExitoEn` cambia en cada ciclo y no se difunde (sería un evento cada pocos
      // segundos); sí se difunde que desaparezca un próximo intento o un mensaje.
      const visible = fijarDetalle(e, null, null);
      cambiar(canal, 'ok', null, visible);
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
      const visible = fijarDetalle(e, mensaje.slice(0, 200), proximoIntentoEn);
      cambiar(
        canal,
        e.fallosSeguidos >= FALLOS_PARA_CAIDA ? 'caida' : 'degradada',
        mensaje,
        visible,
      );
    },

    /**
     * Fija el estado de un canal sin contar fallos seguidos. Lo usa el WebSocket de EMSC, cuyo
     * criterio es temporal (arquitectura §5.3): cierre → `degradada`; sin reconectar en 30 s →
     * `caida`. Si el estado no cambia, solo actualiza `mensaje` y `proximoIntentoEn`.
     * @param {Canal} canal
     * @param {'degradada' | 'caida'} nuevo
     * @param {string} mensaje breve, en español, sin URL ni trazas
     * @param {number | null} proximoIntentoEn ms
     */
    registrarEstado(canal, nuevo, mensaje, proximoIntentoEn) {
      const e = canalesEstado.get(canal);
      if (!e) return;
      const visible = fijarDetalle(e, mensaje.slice(0, 200), proximoIntentoEn);
      cambiar(canal, nuevo, mensaje, visible);
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
