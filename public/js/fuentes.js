/**
 * Línea de avisos de fuentes (textos.md §3, HU-02) a partir de `fuentes` de `GET /api/sismos`
 * o de `GET /api/salud` (esquema `EstadoFuente`). Lógica pura.
 */

/** Tiempo con todas las fuentes caídas a partir del cual se usa el texto general (HU-02). */
export const TODAS_CAIDAS_MS = 2 * 60_000;

/**
 * @typedef {{ fuente: string, estado: string, cambiadoEn?: string }} EstadoFuente
 */

/**
 * Texto de la línea de fuentes, o `null` si no hay nada que avisar.
 * - EMSC se considera caída si su consulta periódica lo está y el tiempo real no la sustituye.
 * - Solo `caida` cuenta; `degradada` e `iniciando` no se avisan.
 * @param {unknown} fuentes
 * @param {number} ahora ms
 * @returns {string | null}
 */
export function textoFuentes(fuentes, ahora) {
  if (!Array.isArray(fuentes)) return null;
  /** @type {Map<string, EstadoFuente>} */
  const por = new Map();
  for (const f of fuentes) {
    if (f && typeof f.fuente === 'string' && typeof f.estado === 'string') por.set(f.fuente, f);
  }
  const caida = (/** @type {string} */ id) => por.get(id)?.estado === 'caida';
  const ws = por.get('emsc-ws');
  const emscCaida = caida('emsc-fdsn') && (!ws || ws.estado === 'caida');
  const usgsCaida = caida('usgs');

  if (emscCaida && usgsCaida) {
    const desde = Math.max(
      ...['emsc-fdsn', 'usgs', 'emsc-ws']
        .map((id) => Date.parse(por.get(id)?.cambiadoEn ?? ''))
        .filter(Number.isFinite),
    );
    if (Number.isFinite(desde) && ahora - desde >= TODAS_CAIDAS_MS) {
      return 'Las fuentes de datos no responden. Se muestran los últimos sismos recibidos.';
    }
    return 'EMSC y USGS no disponibles';
  }
  if (emscCaida) return 'EMSC no disponible';
  if (usgsCaida) return 'USGS no disponible';
  if (ws?.estado === 'caida') {
    return 'Tiempo real no disponible: los sismos nuevos pueden tardar hasta 1 min.';
  }
  return null;
}
