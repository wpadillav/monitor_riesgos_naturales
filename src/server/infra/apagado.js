/**
 * Apagado ordenado del proceso (R-04, N-02; arquitectura §7).
 *
 * Se extrae de `index.js` con las dependencias inyectadas para poder probar la política sin
 * arrancar el servidor. El primer `apagar(codigo)` ejecuta los pasos de parada, cierra el servidor
 * y sale cuando termina (o al vencer el plazo). Una segunda llamada durante el apagado sale al
 * momento. En todas las salidas se usa el **código más alto** recibido: un SIGTERM (código 0)
 * durante el apagado por una excepción (código 1) no puede convertir el fallo en una salida limpia.
 */

/** Plazo para que se cierren las conexiones antes de forzar la salida. */
export const PLAZO_APAGADO_MS = 5000;

/**
 * @param {object} deps
 * @param {ReadonlyArray<() => void>} deps.pasos detener fuentes, retención, difusor, temporizadores…
 * @param {(alCerrar: () => void) => void} deps.cerrarServidor p. ej. `(fn) => server.close(fn)`
 * @param {(codigo: number) => void} deps.salir p. ej. `process.exit`
 * @param {(fn: () => void, ms: number) => unknown} [deps.programar] por defecto, `setTimeout` sin
 *   retener el proceso (`unref`)
 * @param {number} [deps.plazoMs]
 * @returns {{ apagar: (codigo: number) => void, readonly codigo: number, readonly apagando: boolean }}
 */
export function createApagado({
  pasos,
  cerrarServidor,
  salir,
  programar = (fn, ms) => setTimeout(fn, ms).unref(),
  plazoMs = PLAZO_APAGADO_MS,
}) {
  let apagando = false;
  let codigoSalida = 0;

  const terminar = () => salir(codigoSalida);

  return Object.freeze({
    /** @param {number} codigo código de salida pedido */
    apagar(codigo) {
      codigoSalida = Math.max(codigoSalida, codigo);
      if (apagando) {
        terminar();
        return;
      }
      apagando = true;
      for (const paso of pasos) paso();
      cerrarServidor(terminar);
      // Si alguna conexión no se cierra a tiempo, se fuerza la salida.
      programar(terminar, plazoMs);
    },
    get codigo() {
      return codigoSalida;
    },
    get apagando() {
      return apagando;
    },
  });
}
