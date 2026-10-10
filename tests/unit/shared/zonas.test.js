import bbox from '@turf/bbox';
import pointToPolygonDistance from '@turf/point-to-polygon-distance';
import { describe, expect, it } from 'vitest';
import { ZONA_HORARIA_POR_ZONA, ZONAS_IDS } from '../../../src/shared/constantes.js';
import { META_ZONAS, ZONAS } from '../../../src/shared/zonas.js';

/** Rectángulos escritos a mano en T1.2 (PRD E2), que se quedaban cortos. */
const RECTANGULOS_T12 = {
  'ES-PEN': { minLat: 34.8, maxLat: 44.3, minLon: -10.0, maxLon: 4.9 },
  'ES-CAN': { minLat: 26.6, maxLat: 30.0, minLon: -18.8, maxLon: -12.5 },
  'CO-CONT': { minLat: -4.5, maxLat: 12.9, minLon: -82.2, maxLon: -66.5 },
  'CO-SAI': { minLat: 11.8, maxLat: 14.0, minLon: -82.3, maxLon: -80.9 },
  PA: { minLat: 5.0, maxLat: 10.2, minLon: -83.3, maxLon: -77.0 },
};

describe('zonas generadas (ADR-0005)', () => {
  it('contiene las cinco zonas del contrato, en orden y con su zona horaria', () => {
    expect(ZONAS.map((z) => z.id)).toEqual(ZONAS_IDS);
    for (const z of ZONAS) expect(z.zonaHoraria).toBe(ZONA_HORARIA_POR_ZONA[z.id]);
  });

  it('se generó con la franja de 100 km y Natural Earth v5.1.2 verificado', () => {
    expect(META_ZONAS.franjaKm).toBe(100);
    expect(META_ZONAS.fuente.version).toBe('5.1.2');
    expect(META_ZONAS.fuente.sha256).toBe(
      '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
    );
    expect(META_ZONAS.correcciones).toEqual(['Isla de Alborán', 'Peñón de Vélez de la Gomera']);
    expect(Object.values(META_ZONAS.turf)).toEqual(['7.4.0', '7.4.0', '7.4.0', '7.4.0']);
  });

  it.each(ZONAS.map((z) => [z.id, z]))(
    'el rectángulo de %s contiene por completo su contorno ampliado (PRD E2)',
    (_id, z) => {
      const [minLon, minLat, maxLon, maxLat] = bbox(z.zona);
      const r = z.rectangulo;
      expect(r.minLat).toBeLessThanOrEqual(minLat);
      expect(r.maxLat).toBeGreaterThanOrEqual(maxLat);
      expect(r.minLon).toBeLessThanOrEqual(minLon);
      expect(r.maxLon).toBeGreaterThanOrEqual(maxLon);
      // Con el margen de 0,1° del ADR, redondeado a 0,1°.
      for (const valor of Object.values(r)) expect(Math.round(valor * 10) / 10).toBe(valor);
    },
  );

  it.each(ZONAS.map((z) => [z.id, z]))(
    'la tierra de %s queda dentro de su rectángulo',
    (_id, z) => {
      const [minLon, minLat, maxLon, maxLat] = bbox(z.tierra);
      expect(z.rectangulo.minLat).toBeLessThan(minLat);
      expect(z.rectangulo.maxLat).toBeGreaterThan(maxLat);
      expect(z.rectangulo.minLon).toBeLessThan(minLon);
      expect(z.rectangulo.maxLon).toBeGreaterThan(maxLon);
    },
  );

  it('corrige los lados cortos de T1.2: Galicia, Cantábrico, El Hierro, Alegranza, CO-SAI y PA', () => {
    const r = Object.fromEntries(ZONAS.map((z) => [z.id, z.rectangulo]));
    expect(r['ES-PEN'].minLon).toBeLessThan(RECTANGULOS_T12['ES-PEN'].minLon);
    expect(r['ES-PEN'].maxLat).toBeGreaterThan(RECTANGULOS_T12['ES-PEN'].maxLat);
    expect(r['ES-CAN'].minLon).toBeLessThan(RECTANGULOS_T12['ES-CAN'].minLon);
    expect(r['ES-CAN'].maxLat).toBeGreaterThan(RECTANGULOS_T12['ES-CAN'].maxLat);
    expect(r['CO-SAI'].maxLat).toBeGreaterThan(RECTANGULOS_T12['CO-SAI'].maxLat);
    expect(r.PA.maxLat).toBeGreaterThan(RECTANGULOS_T12.PA.maxLat);
  });

  it('las geometrías son MultiPolygon con anillos cerrados de al menos 4 vértices', () => {
    for (const z of ZONAS) {
      for (const geometria of [z.zona, z.tierra]) {
        expect(geometria.type).toBe('MultiPolygon');
        expect(geometria.coordinates.length).toBeGreaterThan(0);
        for (const poligono of geometria.coordinates) {
          for (const anillo of poligono) {
            expect(anillo.length).toBeGreaterThanOrEqual(4);
            expect(anillo.at(-1)).toEqual(anillo[0]);
          }
        }
      }
    }
  });

  it.each([
    ['isla de Alborán', 35.9392, -3.0347],
    ['Peñón de Vélez de la Gomera', 35.1728, -4.3003],
  ])('la corrección manual «%s» forma parte de la tierra de ES-PEN (A9)', (_nombre, lat, lon) => {
    const tierra = ZONAS.find((z) => z.id === 'ES-PEN').tierra;
    expect(pointToPolygonDistance([lon, lat], tierra, { units: 'kilometers' })).toBeLessThan(0.5);
  });

  it('es inmutable', () => {
    expect(Object.isFrozen(ZONAS)).toBe(true);
    expect(Object.isFrozen(ZONAS[0])).toBe(true);
    expect(Object.isFrozen(ZONAS[0].rectangulo)).toBe(true);
    expect(Object.isFrozen(META_ZONAS)).toBe(true);
  });
});
