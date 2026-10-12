import { describe, expect, it } from 'vitest';
import {
  formatearCoordenadas,
  formatearLugar,
  formatearNumero,
  formatearProfundidad,
  lineaPaisProfundidad,
  nombrePais,
  textoContador,
} from '../../../public/js/formato.js';
import {
  COLOR_BANDA,
  bandaMagnitud,
  bordeMarcador,
  formatearMagnitud,
  radioMarcador,
} from '../../../public/js/magnitud.js';

describe('escala de magnitud (tokens.md §3)', () => {
  it.each([
    [-0.5, 1],
    [2.94, 1],
    [2.95, 2],
    [3.0, 2],
    [3.94, 2],
    [3.95, 3],
    [4.44, 3],
    [4.45, 4],
    [4.5, 4],
    [5.94, 4],
    [5.95, 5],
    [7.8, 5],
  ])('M %f → banda %i (magnitud redondeada a un decimal)', (m, banda) => {
    expect(bandaMagnitud(m)).toBe(banda);
  });

  it('redondea con `redondear1` compartido con el servidor: 4.35 → 4.4 y 4.45 → 4.5 (R-06)', () => {
    expect(formatearMagnitud(4.35)).toBe('4.4');
    expect(formatearMagnitud(4.45)).toBe('4.5');
    expect(formatearMagnitud(4.44)).toBe('4.4');
  });

  it('formato con punto decimal y un decimal', () => {
    expect(formatearMagnitud(5)).toBe('5.0');
    expect(formatearMagnitud(4.25)).toBe('4.3');
    expect(formatearMagnitud(Number.NaN)).toBe('?');
  });

  it('radio M × 2.6 con mínimo de 4 px', () => {
    expect(radioMarcador(1)).toBe(4);
    expect(radioMarcador(-1)).toBe(4);
    expect(radioMarcador(5)).toBeCloseTo(13);
    expect(radioMarcador(Number.NaN)).toBe(4);
  });

  it('el borde engorda en B4 y B5 (no depende solo del color)', () => {
    expect([2.5, 3.5, 4.2, 4.6, 6.1].map(bordeMarcador)).toEqual([1, 1, 1, 2, 3]);
  });

  it('colores de los tokens', () => {
    expect(COLOR_BANDA).toEqual(['#4a5568', '#f2c94c', '#f08a3c', '#c62828', '#6a1b9a']);
  });
});

describe('formatearLugar', () => {
  it('pasa las mayúsculas de EMSC a mayúsculas y minúsculas', () => {
    expect(formatearLugar('PANAMA-COSTA RICA BORDER REGION')).toBe(
      'Panama-Costa Rica Border Region',
    );
    expect(formatearLugar('STRAIT OF GIBRALTAR')).toBe('Strait of Gibraltar');
    expect(formatearLugar('OFF COAST OF NORTHERN SPAIN')).toBe('Off Coast of Northern Spain');
    expect(formatearLugar('PYRENEES')).toBe('Pyrenees');
  });

  it('respeta los textos que ya traen minúsculas (USGS) y no los traduce', () => {
    expect(formatearLugar('12 km SW of Lorca, Spain')).toBe('12 km SW of Lorca, Spain');
  });

  it('el texto malicioso se conserva literal (se inserta como texto)', () => {
    expect(formatearLugar('<img src=x onerror=alert(1)>')).toBe('<img src=x onerror=alert(1)>');
  });

  it('vacío, ausente o solo espacios → «Lugar sin nombre»', () => {
    expect(formatearLugar('')).toBe('Lugar sin nombre');
    expect(formatearLugar(null)).toBe('Lugar sin nombre');
    expect(formatearLugar('  ‮ ')).toBe('Lugar sin nombre');
  });
});

describe('textos de la fila', () => {
  it('país y profundidad', () => {
    expect(lineaPaisProfundidad({ pais: 'CO', profundidadKm: 12.4 })).toBe(
      'Colombia · 12 km de profundidad',
    );
    expect(lineaPaisProfundidad({ pais: 'PA', profundidadKm: null })).toBe(
      'Panamá · profundidad desconocida',
    );
    expect(lineaPaisProfundidad({ pais: 'ES', profundidadKm: -0.2 })).toBe(
      'España · 0 km de profundidad',
    );
  });

  it('nombre de país desconocido vacío', () => {
    expect(nombrePais('FR')).toBe('');
    expect(nombrePais('ES')).toBe('España');
  });

  it('profundidad no numérica → null', () => {
    expect(formatearProfundidad('12')).toBeNull();
    expect(formatearProfundidad(147.6)).toBe('148 km');
  });

  it('coordenadas con dos decimales, latitud primero', () => {
    expect(formatearCoordenadas(8.3123, -76.9456)).toBe('8.31, -76.95');
  });

  it('contador y números', () => {
    expect(textoContador(0)).toBe('Ningún sismo');
    expect(textoContador(1)).toBe('1 sismo');
    expect(textoContador(1234)).toBe('1234 sismos');
    expect(textoContador(10_000)).toBe('10.000 sismos');
    expect(formatearNumero(10_000)).toBe('10.000');
  });
});
