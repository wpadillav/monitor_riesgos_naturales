// Disparador de una excepción no capturada para `tests/integracion/excepcion.test.js` (N-03).
//
// Solo se carga con `node --import` desde esa prueba: no forma parte del servidor, no se sirve
// por HTTP y no depende de ninguna variable de entorno. Al recibir SIGUSR2 lanza una excepción
// fuera de cualquier `try`, en su propia tarea, así que llega al `uncaughtException` del servidor.
process.once('SIGUSR2', () => {
  setImmediate(() => {
    throw new Error('excepción provocada por la prueba (N-03)');
  });
});
