/**
 * Constantes comunes al servidor y a la página. Este directorio se sirve tal cual en
 * `/shared/`: solo módulos ES sin dependencias (arquitectura §5.8).
 */

export const NOMBRE_APLICACION = 'Monitor de Riesgos Naturales';

/** Países del proyecto (ISO 3166-1 alfa-2, contrato `CodigoPais`). */
export const PAISES = Object.freeze(['ES', 'CO', 'PA']);

/** Zonas de consulta (contrato `Zona`, ADR-0005). Los rectángulos están en `zonas.js`. */
export const ZONAS_IDS = Object.freeze(['ES-PEN', 'ES-CAN', 'CO-CONT', 'CO-SAI', 'PA']);

/** Zona IANA de cada zona (ADR-0005; Ceuta y Melilla usan `Europe/Madrid`). */
export const ZONA_HORARIA_POR_ZONA = Object.freeze({
  'ES-PEN': 'Europe/Madrid',
  'ES-CAN': 'Atlantic/Canary',
  'CO-CONT': 'America/Bogota',
  'CO-SAI': 'America/Bogota',
  PA: 'America/Panama',
});

/** Fuentes de datos (contrato `Fuente`). `emsc` agrupa el WebSocket y el FDSN de EMSC. */
export const FUENTES = Object.freeze(['emsc', 'usgs']);

/**
 * Agencia nacional por país (PRD E1, ADR-0004): su solución dentro de EMSC tiene la máxima
 * precedencia. Colombia no tiene agencia nacional en las fuentes.
 */
export const AGENCIA_NACIONAL = Object.freeze({ ES: 'IGN', PA: 'IGC' });

/**
 * Umbrales iniciales de duplicados entre fuentes (ADR-0004; variables `DEDUP_DT_S`,
 * `DEDUP_DD_KM` y `DEDUP_DM`). Calibrados en T4.2 con los 54 pares reales del fixture:
 * máximos observados 9,2 s, 35,3 km y ΔM 0,9.
 */
export const UMBRALES_DEDUP = Object.freeze({ dtS: 30, ddKm: 100, dm: 1.0 });
