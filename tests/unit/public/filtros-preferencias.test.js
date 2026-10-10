import { describe, expect, it } from 'vitest';
import {
  FILTROS_POR_DEFECTO,
  construirQuery,
  cumpleFiltros,
  difiereDeDefecto,
  duracionPeriodo,
  filtrosIguales,
  filtrosPorDefecto,
  resumenFiltros,
  textoPaises,
  validarFiltros,
} from '../../../public/js/filtros.js';
import {
  CLAVE_FILTROS,
  guardarFiltros,
  guardarTema,
  leerFiltros,
  leerTema,
  resolverTema,
} from '../../../public/js/preferencias.js';

/** Almacén en memoria con la interfaz de `Storage`. */
function almacen(inicial = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    datos,
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => void datos.set(k, String(v)),
    removeItem: (k) => void datos.delete(k),
  };
}

const roto = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

describe('filtros por defecto (D5)', () => {
  it('tres países, 2.0 o más y últimas 24 h', () => {
    expect(filtrosPorDefecto()).toEqual({
      paises: ['ES', 'CO', 'PA'],
      magMin: '2.0',
      periodo: '24h',
    });
    expect(Object.isFrozen(FILTROS_POR_DEFECTO)).toBe(true);
  });

  it('la copia es independiente', () => {
    const f = filtrosPorDefecto();
    f.paises.pop();
    expect(filtrosPorDefecto().paises).toHaveLength(3);
  });
});

describe('validarFiltros (HU-06)', () => {
  it('acepta y ordena los países', () => {
    expect(validarFiltros({ paises: ['PA', 'ES'], magMin: 'todas', periodo: '30d' })).toEqual({
      paises: ['ES', 'PA'],
      magMin: 'todas',
      periodo: '30d',
    });
  });

  it('acepta ningún país (el usuario los desmarcó)', () => {
    expect(validarFiltros({ paises: [], magMin: '2.0', periodo: '24h' })?.paises).toEqual([]);
  });

  it.each([
    [null],
    ['texto'],
    [[]],
    [{ paises: 'ES', magMin: '2.0', periodo: '24h' }],
    [{ paises: ['FR'], magMin: '2.0', periodo: '24h' }],
    [{ paises: ['ES', 'ES'], magMin: '2.0', periodo: '24h' }],
    [{ paises: ['ES'], magMin: 2, periodo: '24h' }],
    [{ paises: ['ES'], magMin: '3.5', periodo: '24h' }],
    [{ paises: ['ES'], magMin: '2.0', periodo: '1a' }],
    [{ paises: ['ES', 'CO', 'PA', 'ES'], magMin: '2.0', periodo: '24h' }],
  ])('rechaza %j', (valor) => {
    expect(validarFiltros(valor)).toBeNull();
  });
});

describe('construirQuery (contrato GET /api/sismos)', () => {
  it('por defecto', () => {
    expect(construirQuery(filtrosPorDefecto())).toBe('paises=ES%2CCO%2CPA&magMin=2.0&periodo=24h');
  });

  it('«Todas» no envía magMin', () => {
    expect(construirQuery({ paises: ['PA'], magMin: 'todas', periodo: '7d' })).toBe(
      'paises=PA&periodo=7d',
    );
  });

  it('orden canónico de países', () => {
    const q = new URLSearchParams(
      construirQuery({ paises: ['PA', 'ES'], magMin: '3.0', periodo: '1h' }) ?? '',
    );
    expect(q.get('paises')).toBe('ES,PA');
  });

  it('sin países no hay consulta (HU-03)', () => {
    expect(construirQuery({ paises: [], magMin: '2.0', periodo: '24h' })).toBeNull();
  });
});

describe('textos de resumen (textos.md §4)', () => {
  it.each([
    [['ES', 'CO', 'PA'], '3 países'],
    [['ES', 'CO'], 'España y Colombia'],
    [['PA'], 'Solo Panamá'],
    [[], 'Ningún país'],
  ])('%j → %s', (paises, texto) => {
    expect(textoPaises(paises)).toBe(texto);
  });

  it('resumen completo', () => {
    expect(resumenFiltros(filtrosPorDefecto())).toBe('3 países · 2.0 o más · Últimas 24 h');
    expect(resumenFiltros({ paises: ['PA'], magMin: '3.0', periodo: '7d' })).toBe(
      'Solo Panamá · 3.0 o más · 7 días',
    );
    expect(resumenFiltros({ paises: [], magMin: '3.0', periodo: '7d' })).toBe('Ningún país');
  });

  it('difiere de los valores por defecto', () => {
    expect(difiereDeDefecto(filtrosPorDefecto())).toBe(false);
    expect(difiereDeDefecto({ paises: ['PA', 'CO', 'ES'], magMin: '2.0', periodo: '24h' })).toBe(
      false,
    );
    expect(difiereDeDefecto({ ...filtrosPorDefecto(), periodo: '1h' })).toBe(true);
    expect(filtrosIguales(filtrosPorDefecto(), { ...filtrosPorDefecto(), paises: ['ES'] })).toBe(
      false,
    );
  });
});

describe('cumpleFiltros (para el stream de T4.6b)', () => {
  const ahora = Date.parse('2026-10-10T12:00:00Z');
  const base = { pais: 'CO', magnitud: 2.95, tiempo: '2026-10-10T11:00:00Z' };
  const f = { paises: ['CO'], magMin: '3.0', periodo: '24h' };

  it('compara la magnitud redondeada (2.95 → 3.0)', () => {
    expect(cumpleFiltros(base, f, ahora)).toBe(true);
    expect(cumpleFiltros({ ...base, magnitud: 2.94 }, f, ahora)).toBe(false);
  });

  it('país no marcado o fuera del periodo', () => {
    expect(cumpleFiltros({ ...base, pais: 'PA' }, f, ahora)).toBe(false);
    expect(cumpleFiltros({ ...base, tiempo: '2026-10-09T11:59:59Z' }, f, ahora)).toBe(false);
    expect(cumpleFiltros({ ...base, tiempo: 'no' }, f, ahora)).toBe(false);
  });

  it('«Todas» acepta cualquier magnitud', () => {
    expect(cumpleFiltros({ ...base, magnitud: -1 }, { ...f, magMin: 'todas' }, ahora)).toBe(true);
  });

  it('duración de los periodos', () => {
    expect(['1h', '24h', '7d', '30d'].map(duracionPeriodo)).toEqual([
      3_600_000, 86_400_000, 604_800_000, 2_592_000_000,
    ]);
  });
});

describe('preferencias en localStorage', () => {
  it('guarda y lee los filtros', () => {
    const a = almacen();
    const f = { paises: ['PA'], magMin: '3.0', periodo: '7d' };
    expect(guardarFiltros(a, f)).toBe(true);
    expect(JSON.parse(a.datos.get(CLAVE_FILTROS))).toEqual(f);
    expect(leerFiltros(a)).toEqual(f);
  });

  it('sin preferencias, dañadas o enormes → por defecto, sin lanzar', () => {
    expect(leerFiltros(almacen())).toEqual(filtrosPorDefecto());
    expect(leerFiltros(almacen({ filtros: '{roto' }))).toEqual(filtrosPorDefecto());
    expect(leerFiltros(almacen({ filtros: '{"paises":["FR"]}' }))).toEqual(filtrosPorDefecto());
    expect(leerFiltros(almacen({ filtros: 'x'.repeat(5000) }))).toEqual(filtrosPorDefecto());
    expect(leerFiltros(null)).toEqual(filtrosPorDefecto());
  });

  it('almacén bloqueado: lee por defecto y no guarda, sin lanzar', () => {
    expect(leerFiltros(roto)).toEqual(filtrosPorDefecto());
    expect(guardarFiltros(roto, filtrosPorDefecto())).toBe(false);
    expect(leerTema(roto)).toBe('sistema');
    expect(guardarTema(roto, 'dia')).toBe(false);
  });

  it('solo guarda las tres claves de filtro (nada de datos)', () => {
    const a = almacen();
    guardarFiltros(a, { ...filtrosPorDefecto(), extra: 'x' });
    expect(Object.keys(JSON.parse(a.datos.get(CLAVE_FILTROS)))).toEqual([
      'paises',
      'magMin',
      'periodo',
    ]);
  });

  it('tema: «sistema» borra la clave; valores no válidos → «sistema»', () => {
    const a = almacen();
    expect(guardarTema(a, 'oscuro')).toBe(true);
    expect(leerTema(a)).toBe('oscuro');
    guardarTema(a, 'sistema');
    expect(a.datos.has('tema')).toBe(false);
    expect(leerTema(almacen({ tema: '<script>' }))).toBe('sistema');
    expect(guardarTema(a, /** @type {any} */ ('rosa'))).toBe(false);
  });

  it('resolverTema', () => {
    expect(resolverTema('sistema', true)).toBe('dia');
    expect(resolverTema('sistema', false)).toBe('oscuro');
    expect(resolverTema('oscuro', true)).toBe('oscuro');
    expect(resolverTema('dia', false)).toBe('dia');
  });
});
