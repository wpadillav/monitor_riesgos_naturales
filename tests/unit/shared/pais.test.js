import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import pointToPolygonDistance from '@turf/point-to-polygon-distance';
import { describe, expect, it } from 'vitest';
import { crearAsignadorPais, enRectangulo } from '../../../src/shared/pais.js';
import { ZONAS } from '../../../src/shared/zonas.js';
import { asignarPaisSinCache as asignarPaisServidor } from '../../../src/server/geo/asignar-pais.js';

/** Las mismas primitivas que inyecta el servidor (ADR-0005). */
const asignarPais = crearAsignadorPais({
  zonas: ZONAS,
  puntoEnPoligono: (p, g) => booleanPointInPolygon(p, g),
  distanciaAPoligono: (p, g) => pointToPolygonDistance(p, g, { units: 'kilometers' }),
});

/** Distancia (km) de un punto a la tierra de un país, para comprobar las precondiciones. */
const distanciaATierra = (pais, lat, lon) =>
  Math.min(
    ...ZONAS.filter((z) => z.pais === pais).map((z) =>
      pointToPolygonDistance([lon, lat], z.tierra, { units: 'kilometers' }),
    ),
  );

describe('asignarPais: territorios y casos límite de HU-03 (ADR-0005)', () => {
  it.each([
    ['Ceuta', 35.889, -5.316, 'ES-PEN'],
    ['Melilla', 35.292, -2.938, 'ES-PEN'],
    ['islas Chafarinas', 35.183, -2.433, 'ES-PEN'],
    ['isla de Alborán (corrección manual)', 35.9392, -3.0347, 'ES-PEN'],
    ['Peñón de Vélez de la Gomera (corrección manual)', 35.1728, -4.3003, 'ES-PEN'],
    ['Peñón de Alhucemas', 35.214, -3.9, 'ES-PEN'],
    ['Mallorca', 39.6, 2.9, 'ES-PEN'],
    ['Menorca', 39.95, 4.1, 'ES-PEN'],
    ['mar a unos 60 km al este de Menorca', 40.0, 5.0, 'ES-PEN'],
    ['mar de Alborán', 36.0, -3.5, 'ES-PEN'],
    ['golfo de Cádiz', 36.5, -7.0, 'ES-PEN'],
    ['mar a unos 60 km al oeste de Galicia', 43.0, -10.0, 'ES-PEN'],
    ['Cantábrico a unos 80 km de la costa', 44.2, -4.0, 'ES-PEN'],
    ['El Hierro', 27.75, -18.0, 'ES-CAN'],
    ['mar a unos 70 km al oeste de El Hierro', 27.7, -18.9, 'ES-CAN'],
    ['Alegranza', 29.4, -13.5, 'ES-CAN'],
    ['mar a unos 90 km al norte de Alegranza', 30.1, -13.5, 'ES-CAN'],
    ['San Andrés', 12.58, -81.7, 'CO-SAI'],
    ['Providencia', 13.35, -81.37, 'CO-SAI'],
    ['Malpelo', 4.0, -81.61, 'CO-CONT'],
    ['Pacífico colombiano frente a Nariño', 3.0, -78.5, 'CO-CONT'],
    ['Pacífico panameño al sur de Azuero', 7.0, -80.5, 'PA'],
  ])('%s → %s', (_lugar, lat, lon, zona) => {
    const r = asignarPais(lat, lon);
    expect(r?.zona).toBe(zona);
    expect(r?.pais).toBe(zona.slice(0, 2));
  });

  it('un sismo a unos 80 km de la costa de Almería entra (HU-03)', () => {
    const [lat, lon] = [36.0, -2.19];
    expect(distanciaATierra('ES', lat, lon)).toBeGreaterThan(70);
    expect(asignarPais(lat, lon)?.pais).toBe('ES');
  });

  it('un sismo a unos 120 km de cualquier costa española no entra (HU-03)', () => {
    const [lat, lon] = [37.6, 1.0];
    expect(distanciaATierra('ES', lat, lon)).toBeGreaterThan(115);
    expect(asignarPais(lat, lon)).toBeNull();
  });

  it('un sismo a 20 km del cayo Serranilla no es de Colombia (HU-03)', () => {
    const [lat, lon] = [15.83, -80.04];
    expect(distanciaATierra('CO', lat, lon)).toBeGreaterThan(100);
    expect(asignarPais(lat, lon)).toBeNull();
  });

  it.each([
    ['tierra marroquí a unos 30 km de Melilla', 35.02, -2.94],
    ['Tetuán (Marruecos), a unos 30 km de Ceuta', 35.57, -5.37],
    ['tierra portuguesa a unos 50 km de la frontera', 40.2, -7.6],
    ['mar a unos 45 km de la costa portuguesa y a más de 100 km de la española', 39.0, -9.9],
    ['Gibraltar (Reino Unido)', 36.14, -5.35],
    ['San Cristóbal (Venezuela), cerca de la frontera', 7.77, -72.22],
    ['San José (Costa Rica)', 9.93, -84.08],
    ['Golfito (Costa Rica), a unos 30 km de Panamá', 8.64, -83.18],
    ['mar a más de 100 km al norte de Panamá', 10.5, -80.0],
    ['mar a más de 100 km al norte de Providencia', 14.3, -81.4],
  ])('no asigna país: %s', (_lugar, lat, lon) => {
    expect(asignarPais(lat, lon)).toBeNull();
  });

  it('en el mar de la frontera CO-PA asigna el país más cercano y conserva ambos candidatos', () => {
    // Caribe, frente a Guna Yala: más cerca de Panamá.
    expect(asignarPais(9.0, -77.6)).toMatchObject({ pais: 'PA', paisesCandidatos: ['CO', 'PA'] });
    // Pacífico, frente a Juradó: más cerca de Colombia.
    expect(asignarPais(7.1, -77.9)).toMatchObject({
      pais: 'CO',
      zona: 'CO-CONT',
      paisesCandidatos: ['CO', 'PA'],
    });
  });

  it('devuelve la zona horaria de la zona (HU-08)', () => {
    expect(asignarPais(35.889, -5.316)?.zonaHoraria).toBe('Europe/Madrid');
    expect(asignarPais(27.75, -18.0)?.zonaHoraria).toBe('Atlantic/Canary');
    expect(asignarPais(12.58, -81.7)?.zonaHoraria).toBe('America/Bogota');
    expect(asignarPais(7.0, -80.5)?.zonaHoraria).toBe('America/Panama');
  });

  it.each([
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
  ])('devuelve null con coordenadas no finitas (%s, %s)', (lat, lon) => {
    expect(asignarPais(lat, lon)).toBeNull();
  });

  it('el adaptador del servidor da el mismo resultado', () => {
    for (const [lat, lon] of [
      [35.9392, -3.0347],
      [9.0, -77.6],
      [15.83, -80.04],
    ]) {
      expect(asignarPaisServidor(lat, lon)).toEqual(asignarPais(lat, lon));
    }
  });
});

describe('asignarPais: franja de 100 km (muestreo determinista)', () => {
  it('ningún punto asignado está a más de 100 km (+2 km de simplificación) de su país', () => {
    let semilla = 12345;
    const aleatorio = () => {
      semilla = (semilla * 1103515245 + 12345) % 2 ** 31;
      return semilla / 2 ** 31;
    };
    let asignados = 0;
    for (const zona of ZONAS) {
      const r = zona.rectangulo;
      for (let i = 0; i < 150; i++) {
        const lat = r.minLat + aleatorio() * (r.maxLat - r.minLat);
        const lon = r.minLon + aleatorio() * (r.maxLon - r.minLon);
        const ubicacion = asignarPais(lat, lon);
        if (!ubicacion) continue;
        asignados++;
        expect(distanciaATierra(ubicacion.pais, lat, lon)).toBeLessThanOrEqual(102);
      }
    }
    expect(asignados).toBeGreaterThan(100);
    // CPU intensivo (≈3,5 s en solitario): con la suite completa en paralelo supera los 5 s
    // por defecto de Vitest. Límite propio para que no sea inestable (T4.3).
  }, 30_000);
});

describe('crearAsignadorPais: lógica de decisión con geometría simulada', () => {
  const cuadrado = { type: 'MultiPolygon', coordinates: [] };
  const zona = (id, pais, rectangulo) => ({
    id,
    pais,
    zonaHoraria: `TZ/${id}`,
    rectangulo,
    zona: cuadrado,
    tierra: { ...cuadrado, id },
  });
  const zonas = [
    zona('CO-CONT', 'CO', { minLat: 0, maxLat: 10, minLon: 0, maxLon: 10 }),
    zona('PA', 'PA', { minLat: 5, maxLat: 15, minLon: 0, maxLon: 10 }),
  ];

  it('no consulta el contorno si el punto está fuera del rectángulo', () => {
    let llamadas = 0;
    const asignar = crearAsignadorPais({
      zonas,
      puntoEnPoligono: () => {
        llamadas++;
        return true;
      },
      distanciaAPoligono: () => 0,
    });
    expect(asignar(20, 5)).toBeNull();
    expect(llamadas).toBe(0);
  });

  it('con una sola candidata no calcula distancias', () => {
    const asignar = crearAsignadorPais({
      zonas,
      puntoEnPoligono: () => true,
      distanciaAPoligono: () => {
        throw new Error('no debería llamarse');
      },
    });
    expect(asignar(2, 5)).toEqual({
      pais: 'CO',
      zona: 'CO-CONT',
      zonaHoraria: 'TZ/CO-CONT',
      paisesCandidatos: ['CO'],
    });
  });

  it('con varias candidatas elige la tierra más cercana; en empate, la primera', () => {
    const distancias = { 'CO-CONT': 30, PA: 10 };
    const asignar = crearAsignadorPais({
      zonas,
      puntoEnPoligono: () => true,
      distanciaAPoligono: (_p, tierra) => distancias[tierra.id],
    });
    expect(asignar(7, 5)?.pais).toBe('PA');
    distancias.PA = 30;
    expect(asignar(7, 5)?.pais).toBe('CO');
  });

  it('pasa el punto como [lon, lat]', () => {
    const vistos = [];
    const asignar = crearAsignadorPais({
      zonas,
      puntoEnPoligono: (p) => {
        vistos.push(p);
        return false;
      },
      distanciaAPoligono: () => 0,
    });
    asignar(2, 3);
    expect(vistos[0]).toEqual([3, 2]);
  });

  it('enRectangulo incluye los bordes', () => {
    const r = { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 };
    expect(enRectangulo(r, 0, 1)).toBe(true);
    expect(enRectangulo(r, 1.0001, 0.5)).toBe(false);
  });
});

describe('desempate con distancia aproximada (P-02)', () => {
  const vacio = { type: 'MultiPolygon', coordinates: [] };
  const zona = (id, pais) => ({
    id,
    pais,
    zonaHoraria: `TZ/${id}`,
    rectangulo: { minLat: 0, maxLat: 10, minLon: 0, maxLon: 10 },
    zona: vacio,
    tierra: { ...vacio, id },
  });
  const zonas = [zona('CO-CONT', 'CO'), zona('PA', 'PA')];

  it('si la aproximada separa claramente, no llama a la exacta', () => {
    const aprox = { 'CO-CONT': 50, PA: 10 };
    const asignar = crearAsignadorPais({
      zonas,
      puntoEnPoligono: (_p, g) => g === vacio,
      distanciaAPoligono: () => {
        throw new Error('no debería llamarse');
      },
      distanciaAproximada: (_p, tierra) => aprox[tierra.id],
    });
    expect(asignar(5, 5)?.pais).toBe('PA');
  });

  it('dentro de una tierra la aproximada cuenta como negativa', () => {
    const asignar = crearAsignadorPais({
      zonas,
      puntoEnPoligono: (_p, g) => g === vacio || g.id === 'CO-CONT',
      distanciaAPoligono: () => {
        throw new Error('no debería llamarse');
      },
      distanciaAproximada: (_p, tierra) => (tierra.id === 'CO-CONT' ? 20 : 5),
    });
    expect(asignar(5, 5)?.pais).toBe('CO');
  });

  it.each([
    [10, 10.5],
    [100, 101.5],
  ])('cerca del empate (%s y %s km) decide la exacta', (dPa, dCo) => {
    let exactas = 0;
    const asignar = crearAsignadorPais({
      zonas,
      puntoEnPoligono: (_p, g) => g === vacio,
      distanciaAPoligono: (_p, tierra) => {
        exactas += 1;
        return tierra.id === 'PA' ? 40 : 30;
      },
      distanciaAproximada: (_p, tierra) => (tierra.id === 'PA' ? dPa : dCo),
    });
    // La aproximada daría PA; la exacta dice CO.
    expect(asignar(5, 5)?.pais).toBe('CO');
    expect(exactas).toBe(2);
  });

  it('con tres candidatas guarda la segunda mejor para el margen', () => {
    const tres = [...zonas, zona('CO-SAI', 'CO')];
    const aprox = { 'CO-CONT': 30, PA: 10, 'CO-SAI': 10.2 };
    let exactas = 0;
    const asignar = crearAsignadorPais({
      zonas: tres,
      puntoEnPoligono: (_p, g) => g === vacio,
      distanciaAPoligono: (_p, tierra) => {
        exactas += 1;
        return aprox[tierra.id];
      },
      distanciaAproximada: (_p, tierra) => aprox[tierra.id],
    });
    expect(asignar(5, 5)?.zona).toBe('PA');
    expect(exactas).toBe(3);
  });

  it('el resultado está congelado (se comparte en la caché del servidor)', () => {
    expect(Object.isFrozen(asignarPais(7.0, -80.5))).toBe(true);
  });

  it('en la malla de 0,1° de la franja CO-PA da el mismo resultado que Turf en todos los puntos', () => {
    let enFranja = 0;
    for (let i = 0; i <= 35; i += 1) {
      for (let j = 0; j <= 25; j += 1) {
        const lat = 6.5 + i / 10;
        const lon = -79.0 + j / 10;
        const turf = asignarPais(lat, lon);
        if (!turf || turf.paisesCandidatos.length < 2) continue;
        enFranja += 1;
        expect(asignarPaisServidor(lat, lon)).toEqual(turf);
      }
    }
    expect(enFranja).toBeGreaterThan(200);
  }, 120_000);
});
