import { describe, expect, it } from 'vitest';
import { sanear } from '../../../src/shared/texto.js';

describe('sanear (AM-05, AM-23)', () => {
  it('deja intacto un texto normal con tildes', () => {
    expect(sanear('12 km al SO de Lorca, España', 200)).toBe('12 km al SO de Lorca, España');
  });

  it.each([
    ['C0 (NUL y ESC)', 'A\u0000B\u001bC', 'ABC'],
    ['DEL', 'A\u007fB', 'AB'],
    ['C1 (U+0085, U+009B)', 'A\u0085B\u009bC', 'ABC'],
    ['RLO U+202E', 'abc‮gpj.exe', 'abcgpj.exe'],
    ['marcas LRM/RLM', '‎abc‏', 'abc'],
    ['aislantes U+2066–2069', '⁦a⁧b⁨c⁩', 'abc'],
    ['ALM U+061C', 'a؜b', 'ab'],
  ])('elimina %s', (_caso, entrada, esperado) => {
    expect(sanear(entrada, 200)).toBe(esperado);
  });

  it('convierte tabuladores y saltos de línea en un espacio y recorta los extremos', () => {
    expect(sanear('  NORTE\tDE\r\n\nMARRUECOS  ', 200)).toBe('NORTE DE MARRUECOS');
  });

  it('recorta a la longitud máxima sin partir pares sustitutos', () => {
    expect(sanear('a'.repeat(300), 200)).toHaveLength(200);
    expect(sanear('🌋🌋🌋', 2)).toBe('🌋🌋');
  });

  it.each([null, undefined, 42, {}, ['x']])('devuelve cadena vacía si no es texto (%s)', (v) => {
    expect(sanear(v, 200)).toBe('');
  });
});
