// Pintado incremental de la página (P-01 y P-06 del informe T5.4; C8 de la revisión T5.5):
// agrupador por frame, orden incremental del estado, orden de dibujo y límite de pulsos del mapa.

import { describe, expect, it, vi } from 'vitest';
import { LIMITE_IDS, crearAgrupador } from '../../../public/js/agrupador.js';
import { crearEstado } from '../../../public/js/estado.js';
import { resumenFiltros } from '../../../public/js/filtros.js';
import {
  MAX_PULSOS,
  crearPulsos,
  elegirPulsos,
  ordenDibujo,
  posicionDibujo,
} from '../../../public/js/orden-mapa.js';

const T0 = Date.parse('2026-10-10T12:00:00Z');

/** @param {Partial<Record<string, unknown>>} c */
const sismo = (c) => ({
  id: 'emsc:1',
  tiempo: '2026-10-10T11:00:00Z',
  lat: 8,
  lon: -77,
  magnitud: 4,
  revision: 1,
  ...c,
});

/** Programador manual: guarda las funciones y las ejecuta con `frame()`. */
function programadorManual() {
  /** @type {(() => void)[]} */
  let cola = [];
  return {
    programar: (/** @type {() => void} */ fn) => cola.push(fn),
    frame() {
      const actual = cola;
      cola = [];
      for (const fn of actual) fn();
    },
    get pendientes() {
      return cola.length;
    },
  };
}

describe('agrupador de cambios por frame (P-01)', () => {
  it('mil cambios en el mismo frame producen un solo pintado con todos los ids', () => {
    const reloj = programadorManual();
    const pintar = vi.fn();
    const a = crearAgrupador({ pintar, programar: reloj.programar });
    for (let i = 0; i < 1000; i += 1) a.anotar({ tipo: 'nuevo', ids: [`s${i}`] });
    expect(reloj.pendientes).toBe(1);
    expect(pintar).not.toHaveBeenCalled();
    reloj.frame();
    expect(pintar).toHaveBeenCalledTimes(1);
    const lote = pintar.mock.calls[0][0];
    expect(lote.completo).toBe(false);
    expect(lote.ids.size).toBe(1000);
    expect(a.pendiente).toBe(false);
  });

  it('un reemplazo convierte el lote en completo y descarta los ids sueltos', () => {
    const reloj = programadorManual();
    const pintar = vi.fn();
    const a = crearAgrupador({ pintar, programar: reloj.programar });
    a.anotar({ tipo: 'nuevo', ids: ['x'] });
    a.anotar({ tipo: 'reemplazo', ids: ['a', 'b'] });
    a.anotar({ tipo: 'eliminado', ids: ['y'] });
    reloj.frame();
    expect(pintar).toHaveBeenCalledWith({ completo: true, ids: new Set() });
  });

  it('por encima del límite de ids pasa a completo (memoria acotada)', () => {
    const reloj = programadorManual();
    const pintar = vi.fn();
    const a = crearAgrupador({ pintar, programar: reloj.programar, limite: 3 });
    a.anotar({ tipo: 'nuevo', ids: ['a', 'b'] });
    a.anotar({ tipo: 'purga', ids: ['c', 'd'] });
    reloj.frame();
    expect(pintar.mock.calls[0][0].completo).toBe(true);
    expect(LIMITE_IDS).toBeGreaterThanOrEqual(1000);
  });

  it('vaciar() pinta en el acto y el frame programado ya no repite', () => {
    const reloj = programadorManual();
    const pintar = vi.fn();
    const a = crearAgrupador({ pintar, programar: reloj.programar });
    a.vaciar();
    expect(pintar).not.toHaveBeenCalled();
    a.anotar({ tipo: 'actualizado', ids: ['a'] });
    a.vaciar();
    expect(pintar).toHaveBeenCalledTimes(1);
    reloj.frame();
    expect(pintar).toHaveBeenCalledTimes(1);
    // Un cambio posterior programa otro frame.
    a.anotar({ tipo: 'nuevo', ids: ['b'] });
    reloj.frame();
    expect(pintar).toHaveBeenCalledTimes(2);
    expect(pintar.mock.calls[1][0].ids).toEqual(new Set(['b']));
  });

  it('si pintar lanza, reprograma y el siguiente lote es completo (N-01)', () => {
    const reloj = programadorManual();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let fallar = true;
    /** @type {{ completo: boolean, ids: ReadonlySet<string> }[]} */
    const lotes = [];
    const pintar = vi.fn((lote) => {
      lotes.push({ completo: lote.completo, ids: new Set(lote.ids) });
      if (fallar) {
        fallar = false;
        throw new Error('fallo de pintado');
      }
    });
    const a = crearAgrupador({ pintar, programar: reloj.programar });
    a.anotar({ tipo: 'nuevo', ids: ['a', 'b'] });

    expect(() => reloj.frame()).not.toThrow();
    expect(lotes[0]).toEqual({ completo: false, ids: new Set(['a', 'b']) });
    expect(error).toHaveBeenCalledTimes(1);
    // Los cambios no se pierden: sigue pendiente y hay otro frame programado.
    expect(a.pendiente).toBe(true);
    expect(reloj.pendientes).toBe(1);

    // Un cambio suelto mientras tanto no rebaja el lote: sigue siendo completo.
    a.anotar({ tipo: 'nuevo', ids: ['c'] });
    expect(reloj.pendientes).toBe(1);
    reloj.frame();
    expect(pintar).toHaveBeenCalledTimes(2);
    expect(lotes[1]).toEqual({ completo: true, ids: new Set() });
    expect(a.pendiente).toBe(false);
    expect(reloj.pendientes).toBe(0);
    error.mockRestore();
  });

  it('un fallo en vaciar() no se propaga al que lo llama y se recupera en el frame (N-01)', () => {
    const reloj = programadorManual();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pintar = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('fallo de pintado');
      })
      .mockImplementation(() => {});
    const a = crearAgrupador({ pintar, programar: reloj.programar });
    a.anotar({ tipo: 'actualizado', ids: ['a'] });
    expect(() => a.vaciar()).not.toThrow();
    reloj.frame();
    expect(pintar).toHaveBeenCalledTimes(2);
    expect(pintar.mock.calls[1][0].completo).toBe(true);
    expect(a.pendiente).toBe(false);
    error.mockRestore();
  });
});

describe('estado: orden incremental (P-01)', () => {
  /** @param {ReturnType<typeof crearEstado>} e */
  const ids = (e) => e.lista().map((x) => x.sismo.id);
  /** @param {ReturnType<typeof crearEstado>} e */
  const ordenadoDeVerdad = (e) =>
    [...e.lista()]
      .sort((a, b) => b.instante - a.instante || (a.sismo.id < b.sismo.id ? -1 : 1))
      .map((x) => x.sismo.id);

  it('altas, revisiones con cambio de hora, bajas y purga mantienen el orden sin reordenar', () => {
    const e = crearEstado({ ahora: () => T0 });
    e.reemplazar([
      sismo({ id: 'a', tiempo: '2026-10-10T10:00:00Z' }),
      sismo({ id: 'c', tiempo: '2026-10-10T08:00:00Z' }),
    ]);
    const lista = e.lista();
    e.aplicarSismo(sismo({ id: 'b', tiempo: '2026-10-10T09:00:00Z' }));
    e.aplicarSismo(sismo({ id: 'z', tiempo: '2026-10-10T11:30:00Z' }));
    // Mismo instante que «a»: desempate por id.
    e.aplicarSismo(sismo({ id: '0', tiempo: '2026-10-10T10:00:00Z' }));
    expect(ids(e)).toEqual(['z', '0', 'a', 'b', 'c']);
    // Es el mismo array, actualizado en el sitio (no se reconstruye ni se reordena).
    expect(e.lista()).toBe(lista);

    // Revisión que cambia la hora: la entrada se mueve a su sitio.
    e.aplicarSismo(sismo({ id: 'c', tiempo: '2026-10-10T11:45:00Z', revision: 2 }));
    expect(ids(e)).toEqual(['c', 'z', '0', 'a', 'b']);
    expect(e.obtener('c')).toBe(e.lista()[0]);

    e.eliminarSismo('0');
    expect(ids(e)).toEqual(['c', 'z', 'a', 'b']);
    e.purgar(Date.parse('2026-10-10T09:30:00Z'));
    expect(ids(e)).toEqual(['c', 'z', 'a']);
    expect(ids(e)).toEqual(ordenadoDeVerdad(e));
  });

  it('muchas altas desordenadas dejan la lista igual que ordenarla entera', () => {
    const e = crearEstado({ ahora: () => T0 });
    e.reemplazar([]);
    e.lista();
    let semilla = 7;
    const azar = () => {
      semilla = (semilla * 48271) % 2147483647;
      return semilla / 2147483647;
    };
    for (let i = 0; i < 500; i += 1) {
      const t = T0 - Math.floor(azar() * 86_400_000);
      e.aplicarSismo(sismo({ id: `s${i}`, tiempo: new Date(t).toISOString() }));
      if (i % 7 === 0) e.eliminarSismo(`s${Math.floor(azar() * i)}`);
    }
    expect(ids(e)).toEqual(ordenadoDeVerdad(e));
    expect(e.lista()).toHaveLength(e.tamano);
  });
});

describe('mapa: orden de dibujo y pulsos (P-01, P-06)', () => {
  it('los grandes debajo; a igual magnitud, el más reciente encima', () => {
    const m = [
      { id: 'p', magnitud: 2, instante: 5 },
      { id: 'g', magnitud: 6, instante: 1 },
      { id: 'r', magnitud: 2, instante: 9 },
      { id: 'm', magnitud: 4, instante: 3 },
    ].sort(ordenDibujo);
    expect(m.map((x) => x.id)).toEqual(['g', 'm', 'p', 'r']);
  });

  it('posicionDibujo inserta donde lo dejaría ordenar entero', () => {
    /** @type {{ id: string, magnitud: number, instante: number }[]} */
    const orden = [];
    const todos = [];
    for (let i = 0; i < 200; i += 1) {
      const x = { id: `x${i}`, magnitud: ((i * 37) % 70) / 10, instante: (i * 53) % 101 };
      orden.splice(posicionDibujo(orden, x), 0, x);
      todos.push(x);
    }
    expect(orden).toEqual([...todos].sort(ordenDibujo));
  });

  it('elegirPulsos: como mucho los huecos libres, los más recientes', () => {
    const c = Array.from({ length: 30 }, (_, i) => ({ instante: i }));
    const elegidos = elegirPulsos(c, MAX_PULSOS);
    expect(elegidos).toHaveLength(MAX_PULSOS);
    expect(elegidos.map((x) => x.instante)).toEqual([29, 28, 27, 26, 25, 24, 23, 22, 21, 20]);
    expect(elegirPulsos(c, 0)).toEqual([]);
    expect(elegirPulsos(c, -2)).toEqual([]);
    expect(elegirPulsos(c.slice(0, 2), 5)).toHaveLength(2);
  });
});

describe('mapa: registro de pulsos por id (N-04)', () => {
  function montar() {
    const reloj = programadorManual();
    /** @type {Set<string>} capas en el mapa */
    const enMapa = new Set();
    const cancelados = [];
    const alTerminar = vi.fn();
    const pulsos = crearPulsos({
      crear: (/** @type {string} */ nombre) => {
        enMapa.add(nombre);
        return nombre;
      },
      retirar: (capa) => enMapa.delete(capa),
      duracionMs: 5000,
      alTerminar,
      programar: reloj.programar,
      cancelar: (t) => cancelados.push(t),
    });
    return { reloj, enMapa, cancelados, alTerminar, pulsos };
  }

  it('quitar el sismo retira su pulso en el acto y libera el hueco del límite', () => {
    const { reloj, enMapa, cancelados, alTerminar, pulsos } = montar();
    pulsos.lanzar('a', 'capa-a');
    pulsos.lanzar('b', 'capa-b');
    expect(pulsos.activos).toBe(2);

    expect(pulsos.quitar('a')).toBe(true);
    expect(pulsos.activos).toBe(1);
    expect(enMapa).toEqual(new Set(['capa-b']));
    expect(cancelados).toHaveLength(1);
    expect(pulsos.quitar('a')).toBe(false);

    // El temporizador del pulso ya retirado no descuenta otra vez.
    reloj.frame();
    expect(pulsos.activos).toBe(0);
    expect(enMapa.size).toBe(0);
    expect(alTerminar).toHaveBeenCalledTimes(1);
  });

  it('retenerSolo (sincronización) retira los pulsos de los sismos que ya no están', () => {
    const { enMapa, pulsos } = montar();
    for (const id of ['a', 'b', 'c']) pulsos.lanzar(id, `capa-${id}`);
    pulsos.retenerSolo(new Set(['b', 'x']));
    expect(pulsos.activos).toBe(1);
    expect(pulsos.capa('b')).toBe('capa-b');
    expect(pulsos.capa('a')).toBeUndefined();
    expect(enMapa).toEqual(new Set(['capa-b']));
  });

  it('relanzar el mismo id sustituye el pulso sin contarlo dos veces', () => {
    const { reloj, enMapa, pulsos } = montar();
    pulsos.lanzar('a', 'capa-1');
    pulsos.lanzar('a', 'capa-2');
    expect(pulsos.activos).toBe(1);
    expect(enMapa).toEqual(new Set(['capa-2']));
    reloj.frame();
    expect(pulsos.activos).toBe(0);
    expect(enMapa.size).toBe(0);
  });

  it('por defecto usa setTimeout y clearTimeout', () => {
    vi.useFakeTimers();
    try {
      const retirar = vi.fn();
      const pulsos = crearPulsos({ crear: () => 'capa', retirar, duracionMs: 1000 });
      pulsos.lanzar('a', null);
      pulsos.lanzar('b', null);
      pulsos.quitar('b');
      vi.advanceTimersByTime(1000);
      expect(retirar).toHaveBeenCalledTimes(2);
      expect(pulsos.activos).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resumen de filtros con avisos (C8)', () => {
  it('añade «Avisos activados» al final, también sin países', () => {
    const f = { paises: /** @type {any} */ (['ES', 'CO', 'PA']), magMin: '2.0', periodo: '24h' };
    expect(resumenFiltros(/** @type {any} */ (f))).toBe('3 países · 2.0 o más · Últimas 24 h');
    expect(resumenFiltros(/** @type {any} */ (f), { avisos: true })).toBe(
      '3 países · 2.0 o más · Últimas 24 h · Avisos activados',
    );
    expect(resumenFiltros(/** @type {any} */ ({ ...f, paises: [] }), { avisos: true })).toBe(
      'Ningún país · Avisos activados',
    );
  });
});
