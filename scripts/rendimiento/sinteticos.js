/**
 * Generador de registros sintéticos para las pruebas de rendimiento (T5.4).
 *
 * - Usa `crearRegistro` (el normalizador real, AM-05) y posiciones que `asignarPais` acepta, así
 *   que cada sismo es visible y recorre el mismo camino que uno de EMSC o USGS.
 * - Magnitudes ≥ 2.0 (filtro por defecto, D5) con una cola tipo Gutenberg-Richter hasta 6.5.
 * - `fraccionDuplicados` de los sismos llevan además un registro de USGS a 5 s y ~10 km, que el
 *   catálogo fusiona (ADR-0004): dos registros por sismo, el caso de memoria de la arquitectura.
 * - Semilla fija: dos ejecuciones generan los mismos datos.
 */

import { asignarPais } from '../../src/server/geo/asignar-pais.js';
import { crearRegistro } from '../../src/shared/modelo.js';
import { ZONAS } from '../../src/shared/zonas.js';

/** PRNG determinista (mulberry32). */
export function crearAzar(semilla = 20261011) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LUGARES = [
  'SPAIN',
  'PYRENEES',
  'STRAIT OF GIBRALTAR',
  'CANARY ISLANDS, SPAIN REGION',
  'NORTHERN COLOMBIA',
  'CENTRAL COLOMBIA',
  'NEAR WEST COAST OF COLOMBIA',
  'PANAMA',
  'SOUTH OF PANAMA',
  'PANAMA-COSTA RICA BORDER REGION',
];

/**
 * Posiciones válidas (con país) repartidas por las cinco zonas.
 * @param {number} n
 * @param {() => number} azar
 * @returns {Array<{ lat: number, lon: number }>}
 */
export function crearPosiciones(n, azar) {
  const pos = [];
  let intentos = 0;
  while (pos.length < n && intentos < n * 50) {
    intentos += 1;
    const z = ZONAS[Math.floor(azar() * ZONAS.length)];
    const r = z.rectangulo;
    const lat = Math.round((r.minLat + azar() * (r.maxLat - r.minLat)) * 1000) / 1000;
    const lon = Math.round((r.minLon + azar() * (r.maxLon - r.minLon)) * 1000) / 1000;
    if (asignarPais(lat, lon) !== null) pos.push({ lat, lon });
  }
  return pos;
}

/**
 * @param {() => number} azar
 * @returns {number} magnitud en [2.0, 6.5], con una décima
 */
function magnitud(azar) {
  // Exponencial con b ≈ 1: la mayoría entre 2 y 3.
  const m = 2 - Math.log10(1 - azar() * 0.99996);
  return Math.min(6.5, Math.round(m * 10) / 10);
}

/**
 * Registros normalizados de `n` sismos con `tiempo` en [desde, hasta].
 * @param {object} opciones
 * @param {number} opciones.n
 * @param {number} opciones.desde ms
 * @param {number} opciones.hasta ms
 * @param {number} opciones.ahora ms (para la validación de `crearRegistro`)
 * @param {string} opciones.prefijo prefijo de los ids (único por lote)
 * @param {number} [opciones.fraccionDuplicados]
 * @param {Array<{ lat: number, lon: number }>} opciones.posiciones
 * @param {() => number} opciones.azar
 * @returns {Array<Readonly<import('../../src/shared/modelo.js').RegistroFuente>>}
 */
export function crearRegistros({
  n,
  desde,
  hasta,
  ahora,
  prefijo,
  fraccionDuplicados = 0.5,
  posiciones,
  azar,
}) {
  const registros = [];
  // Espaciado uniforme (más reciente primero, como las respuestas FDSN) con un poco de ruido.
  const paso = n > 1 ? (hasta - desde) / n : 0;
  for (let i = 0; i < n; i += 1) {
    const tiempo = Math.round(hasta - i * paso - azar() * paso * 0.5);
    const p = posiciones[Math.floor(azar() * posiciones.length)];
    const mag = magnitud(azar);
    const lugar = LUGARES[Math.floor(azar() * LUGARES.length)];
    const emsc = crearRegistro(
      {
        fuente: 'emsc',
        idFuente: `${prefijo}e${i}`,
        tiempo,
        actualizadoEn: tiempo + 60_000,
        lat: p.lat,
        lon: p.lon,
        profundidadKm: Math.round(azar() * 300) / 10,
        magnitud: mag,
        magnitudTipo: 'ml',
        autor: azar() < 0.5 ? 'IGN' : 'EMSC',
        lugar,
      },
      ahora,
    );
    if (emsc.ok) registros.push(emsc.registro);
    if (azar() < fraccionDuplicados) {
      const usgs = crearRegistro(
        {
          fuente: 'usgs',
          idFuente: `${prefijo}u${i}`,
          ids: [`${prefijo}u${i}`, `${prefijo}x${i}`],
          tiempo: tiempo + 5000,
          actualizadoEn: tiempo + 120_000,
          lat: p.lat + 0.05,
          lon: p.lon + 0.05,
          profundidadKm: 10,
          magnitud: Math.max(2, Math.round((mag + 0.2) * 10) / 10),
          magnitudTipo: 'mb',
          autor: 'US',
          lugar: `${lugar} (USGS)`,
        },
        ahora,
      );
      if (usgs.ok) registros.push(usgs.registro);
    }
  }
  return registros;
}
