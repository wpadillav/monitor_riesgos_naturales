/**
 * Caso de uso de `GET /api/sismos` (arquitectura §5.6): asegura la cobertura de la memoria
 * para el filtro, lee el catálogo y compone `RespuestaSismos` del contrato.
 *
 * Una fuente caída nunca rompe la respuesta: se responde con lo que hay en memoria y se indica
 * en `completo` y `fuentes` (arquitectura §8.2).
 */

import { PERIODOS_MS } from '../../shared/reglas.js';

/**
 * @typedef {import('../../shared/reglas.js').Periodo} Periodo
 *
 * @typedef {object} FiltroSismos ya validado en la frontera (`http/rutas-sismos.js`)
 * @property {import('../../shared/modelo.js').CodigoPais[]} paises
 * @property {number | null} magMin `null` = todas
 * @property {Periodo} periodo
 *
 * @typedef {object} ServicioSismos
 * @property {(filtro: FiltroSismos) => Promise<object>} consultar devuelve `RespuestaSismos`
 *
 * @typedef {object} DepsConsulta
 * @property {Pick<ReturnType<typeof import('./catalogo.js').createCatalogo>, 'listar'>} catalogo
 * @property {{ asegurarCobertura: (zonas: ReadonlyArray<string>, magMin: number | null) =>
 *   Promise<{ completo: boolean }> } | null} planificador `null` si no hay fuentes activas
 * @property {() => import('../http/rutas-salud.js').EstadoFuente[]} obtenerFuentes
 * @property {() => string} obtenerUltimoEventoId id SSE del último evento (T4.6)
 * @property {ReadonlyArray<{ id: string, pais: string }>} zonas
 * @property {import('../infra/reloj.js').Reloj} reloj
 */

/**
 * @param {DepsConsulta} deps
 * @returns {ServicioSismos}
 */
export function createConsultaSismos({
  catalogo,
  planificador,
  obtenerFuentes,
  obtenerUltimoEventoId,
  zonas,
  reloj,
}) {
  return Object.freeze({
    /** @param {FiltroSismos} filtro */
    async consultar(filtro) {
      const zonaIds = zonas.filter((z) => filtro.paises.includes(z.pais)).map((z) => z.id);
      const { completo } = planificador
        ? await planificador.asegurarCobertura(zonaIds, filtro.magMin)
        : { completo: false };

      // El id del último evento se toma antes de leer la memoria: un cambio posterior llegará
      // por el stream (la página fusiona por `id` y `revision`, sin perder nada).
      const ultimoEventoId = obtenerUltimoEventoId();
      const ahora = reloj.ahora();
      const desde = ahora - PERIODOS_MS[filtro.periodo];
      const { sismos, total, truncado } = catalogo.listar({
        paises: filtro.paises,
        magMin: filtro.magMin,
        desde,
      });
      return {
        generadoEn: new Date(ahora).toISOString(),
        filtro: {
          paises: filtro.paises,
          magMin: filtro.magMin,
          periodo: filtro.periodo,
          desde: new Date(desde).toISOString(),
        },
        ultimoEventoId,
        completo,
        total,
        truncado,
        fuentes: obtenerFuentes(),
        sismos,
      };
    },
  });
}
