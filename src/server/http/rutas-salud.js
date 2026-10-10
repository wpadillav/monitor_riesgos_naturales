/**
 * `GET /api/salud` (contrato: operationId `consultarSalud`, esquema `Salud`).
 * Responde 200 mientras el proceso atienda peticiones. No consulta las fuentes.
 */

/**
 * @typedef {object} EstadoFuente
 * @property {'emsc-ws' | 'emsc-fdsn' | 'usgs'} fuente
 * @property {'iniciando' | 'ok' | 'degradada' | 'caida'} estado
 * @property {string} cambiadoEn
 * @property {string | null} [ultimoExitoEn]
 * @property {string | null} [proximoIntentoEn]
 * @property {string | null} [mensaje]
 */

/**
 * @typedef {object} SaludDeps
 * @property {string} version
 * @property {number} arrancadoEn instante de arranque (ms desde la época)
 * @property {import('../infra/reloj.js').Reloj} reloj
 * @property {() => EstadoFuente[]} obtenerFuentes
 * @property {() => number} contarSismos
 * @property {() => number} contarClientesSse
 * @property {() => number} medirMemoriaRssMb
 */

/**
 * Construye el cuerpo `Salud`. Función pura salvo por las dependencias inyectadas.
 * @param {SaludDeps} deps
 */
export function buildHealth(deps) {
  const fuentes = deps.obtenerFuentes();
  return {
    estado: fuentes.every((f) => f.estado === 'ok') ? 'ok' : 'degradado',
    version: deps.version,
    arrancadoEn: new Date(deps.arrancadoEn).toISOString(),
    segundosActivo: Math.max(0, Math.floor((deps.reloj.ahora() - deps.arrancadoEn) / 1000)),
    fuentes,
    sismosEnMemoria: deps.contarSismos(),
    clientesSse: deps.contarClientesSse(),
    memoriaRssMb: Math.round(deps.medirMemoriaRssMb() * 10) / 10,
  };
}

/**
 * @param {import('hono').Hono} app
 * @param {SaludDeps} deps
 */
export function registerHealthRoutes(app, deps) {
  app.get('/api/salud', (c) =>
    c.body(JSON.stringify(buildHealth(deps)), 200, {
      'Content-Type': 'application/json; charset=utf-8',
    }),
  );
}
