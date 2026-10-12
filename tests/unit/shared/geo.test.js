import distance from '@turf/distance';
import pointToPolygonDistance from '@turf/point-to-polygon-distance';
import { describe, expect, it } from 'vitest';
import { distanciaABordeKm, distanciaKm, normalizarLongitud } from '../../../src/shared/geo.js';
import { ZONAS } from '../../../src/shared/zonas.js';

describe('distanciaKm (haversine)', () => {
  it('vale 0 para el mismo punto', () => {
    expect(distanciaKm(7.7463, -81.3092, 7.7463, -81.3092)).toBe(0);
  });

  it('un grado de latitud son unos 111,2 km', () => {
    expect(distanciaKm(40, -3, 41, -3)).toBeCloseTo(111.195, 2);
  });

  it.each([
    [35.889, -5.316, 35.292, -2.938],
    [12.58, -81.7, 13.35, -81.37],
    [-4.2, -69.9, 12.4, -71.7],
    [27.75, -18.0, 43.4, 3.3],
    [0, 179.9, 0, -179.9],
  ])(
    'coincide con @turf/distance 7.4.0, la referencia del ADR-0004 (%s, %s → %s, %s)',
    (lat1, lon1, lat2, lon2) => {
      const turf = distance([lon1, lat1], [lon2, lat2], { units: 'kilometers' });
      expect(distanciaKm(lat1, lon1, lat2, lon2)).toBeCloseTo(turf, 9);
    },
  );
});

describe('normalizarLongitud', () => {
  it.each([
    [0, 0],
    [-81.3, -81.3],
    [180, 180],
    [-180, -180],
    [181, -179],
    [278.7, -81.3],
    [-278.7, 81.3],
    [360, 0],
    [540, 180],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarLongitud(entrada)).toBeCloseTo(esperado, 9);
  });
});

describe('distanciaABordeKm (P-02)', () => {
  const cuadrado = [
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  ];

  it('vale 0 sobre el borde y mide hasta el vértice o el lado más cercano', () => {
    expect(distanciaABordeKm(0, 0.5, cuadrado)).toBeCloseTo(0, 9);
    expect(distanciaABordeKm(-1, 0.5, cuadrado)).toBeCloseTo(111.195, 2);
    expect(distanciaABordeKm(0.5, 0.5, cuadrado)).toBeCloseTo(55.6, 1);
  });

  it('admite segmentos degenerados (dos vértices iguales)', () => {
    const punto = [
      [
        [
          [2, 2],
          [2, 2],
        ],
      ],
    ];
    expect(distanciaABordeKm(2, 3, punto)).toBeCloseTo(111.127, 2);
  });

  it('se aparta menos del 1 % de Turf (geodésica) en la franja CO-PA', () => {
    const tierras = ZONAS.filter((z) => z.id === 'CO-CONT' || z.id === 'PA').map((z) => z.tierra);
    for (const [lat, lon] of [
      [9.0, -77.6],
      [7.1, -77.9],
      [9.5, -77.1],
      [8.3, -78.2],
    ]) {
      for (const tierra of tierras) {
        const turf = Math.abs(pointToPolygonDistance([lon, lat], tierra, { units: 'kilometers' }));
        const propia = distanciaABordeKm(lat, lon, tierra.coordinates);
        expect(Math.abs(propia - turf)).toBeLessThanOrEqual(Math.max(0.5, turf * 0.01));
      }
    }
  }, 30_000);
});
