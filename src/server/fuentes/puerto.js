/**
 * Puerto común de las fuentes de consulta (arquitectura §4). Solo tipos JSDoc: los adaptadores
 * `emsc-fdsn.js` y `usgs-fdsn.js` lo implementan y el planificador solo depende de él. La
 * entrega 2 añade fuentes de tsunami con el mismo ciclo de vida.
 *
 * @typedef {object} Rectangulo
 * @property {number} minLat
 * @property {number} maxLat
 * @property {number} minLon
 * @property {number} maxLon
 *
 * @typedef {object} ParametrosConsulta
 * @property {Rectangulo} rectangulo rectángulo fijo de la zona (ADR-0005)
 * @property {number | null} magMin magnitud mínima; `null` = todas
 * @property {number} desde ms UTC (`starttime`)
 * @property {number | null} actualizadoDesde ms UTC (`updatedafter`); `null` = sin filtro
 *
 * @typedef {object} OpcionesConsulta
 * @property {number} [timeoutMs]
 * @property {AbortSignal} [signal]
 *
 * @typedef {object} ResultadoConsulta
 * @property {Readonly<import('../../shared/modelo.js').RegistroFuente>[]} registros
 * @property {string[]} retirados
 * @property {Record<string, number>} descartes
 * @property {number} recibidoEn ms UTC en que llegó la respuesta
 *
 * @typedef {object} FuenteConsulta
 * @property {'emsc-fdsn' | 'usgs'} canal id operativo (contrato `IdFuenteOperativa`)
 * @property {'emsc' | 'usgs'} fuente fuente de datos (contrato `Fuente`)
 * @property {(p: ParametrosConsulta) => string} construirUrl
 * @property {(p: ParametrosConsulta, o?: OpcionesConsulta) => Promise<ResultadoConsulta>} consultar
 *   lanza `FuenteError` si la consulta falla
 */

export {};
