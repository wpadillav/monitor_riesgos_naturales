import { describe, expect, it, vi } from 'vitest';
import {
  LIMITE_AVISOS,
  MAX_RECORDADOS,
  MAX_TEXTO,
  VENTANA_LIMITE_MS,
  crearMostrador,
  crearNotificador,
  decidirAviso,
  textoAvisoPrueba,
  textoAvisoResumen,
  textoAvisoSismo,
} from '../../../public/js/avisos.js';
import { estadoInicialAvisos } from '../../../public/js/avisos-ui.js';
import { CLAVE_AVISOS, guardarAvisos, leerAvisos } from '../../../public/js/preferencias.js';

const T0 = Date.parse('2026-10-10T12:30:00Z');

/** @param {Record<string, unknown>} c */
const sismo = (c = {}) =>
  /** @type {any} */ ({
    id: 'emsc:1',
    tiempo: '2026-10-10T12:29:00Z',
    lat: 8.31,
    lon: -76.95,
    profundidadKm: 12,
    magnitud: 5.2,
    lugar: 'Golfo de Urabá',
    pais: 'CO',
    zonaHoraria: 'America/Bogota',
    autor: 'IGC',
    fuentePreferida: 'emsc',
    revision: 1,
    ...c,
  });

describe('decidirAviso (PRD E4, D1, D4)', () => {
  const base = { notificable: true, paises: ['PA', 'CO'], umbral: 4.5, yaNotificado: false };
  it.each([
    [4.5, 'avisar'],
    [4.46, 'avisar'],
    [4.44, 'bajo-umbral'],
    [4.45, 'avisar'],
  ])('magnitud %s → %s (se compara redondeada a un decimal)', (magnitud, motivo) => {
    const r = decidirAviso({ ...base, sismo: sismo({ magnitud }), magnitudPrevia: undefined });
    expect(r.motivo).toBe(motivo);
  });
  it('país no marcado, no notificable (carga inicial o alta tardía) y ya notificado', () => {
    const s = sismo();
    expect(
      decidirAviso({ ...base, sismo: { ...s, pais: 'ES' }, magnitudPrevia: undefined }).motivo,
    ).toBe('pais-no-marcado');
    expect(
      decidirAviso({ ...base, notificable: false, sismo: s, magnitudPrevia: undefined }).motivo,
    ).toBe('no-notificable');
    expect(
      decidirAviso({ ...base, yaNotificado: true, sismo: s, magnitudPrevia: undefined }).motivo,
    ).toBe('ya-notificado');
  });
  it('revisión: avisa solo si cruza el umbral, con la magnitud anterior', () => {
    expect(decidirAviso({ ...base, sismo: sismo({ magnitud: 4.8 }), magnitudPrevia: 4.3 })).toEqual(
      { motivo: 'avisar', antes: 4.3 },
    );
    expect(
      decidirAviso({ ...base, sismo: sismo({ magnitud: 5.1 }), magnitudPrevia: 4.9 }).motivo,
    ).toBe('ya-superaba');
  });
});

describe('textos de la notificación (textos.md §8.3, AM-07, AM-23)', () => {
  it('título y cuerpo exactos', () => {
    expect(textoAvisoSismo(sismo())).toEqual({
      titulo: 'M 5.2 · Golfo de Urabá · 07:29 (hora de Colombia)',
      cuerpo:
        'Colombia · 12 km de profundidad. Pulsa para verlo en el mapa.\nFuente: EMSC · autor: IGC. Solo informativo.',
    });
  });
  it('cuerpo por revisión y profundidad desconocida; lugar en mayúsculas con formato', () => {
    const t = textoAvisoSismo(
      sismo({
        lugar: 'PANAMA-COSTA RICA BORDER REGION',
        profundidadKm: null,
        fuentePreferida: 'usgs',
        autor: 'US',
      }),
      { antes: 4.3 },
    );
    expect(t.titulo).toBe('M 5.2 · Panama-Costa Rica Border Region · 07:29 (hora de Colombia)');
    expect(t.cuerpo).toBe(
      'Colombia · profundidad desconocida · magnitud revisada (antes 4.3). Pulsa para verlo en el mapa.\nFuente: USGS · autor: US. Solo informativo.',
    );
  });
  it('lugar de 500 caracteres con marcas bidi: título ≤ 120 y sin bidi ni controles', () => {
    const lugar = `‮${'Á'.repeat(250)}‏\u0007${'b'.repeat(250)}`;
    const t = textoAvisoSismo(sismo({ lugar, autor: `‮${'x'.repeat(300)}` }));
    expect(Array.from(t.titulo).length).toBeLessThanOrEqual(MAX_TEXTO);
    expect(t.titulo.endsWith(' · 07:29 (hora de Colombia)')).toBe(true);
    expect(t.titulo).toContain('…');
    // eslint-disable-next-line no-control-regex -- es lo que se comprueba
    const prohibidos = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F؜‎‏‪-‮⁦-⁩]/;
    expect(prohibidos.test(t.titulo)).toBe(false);
    expect(prohibidos.test(t.cuerpo)).toBe(false);
    for (const linea of t.cuerpo.split('\n')) {
      expect(Array.from(linea).length).toBeLessThanOrEqual(MAX_TEXTO);
    }
  });
  it('resumen y prueba', () => {
    expect(textoAvisoResumen(17, 4.5, sismo({ magnitud: 5.64 }))).toEqual({
      titulo: '17 sismos de magnitud 4.5 o más',
      cuerpo: 'El mayor: M 5.6 · Golfo de Urabá. Pulsa para verlos en la lista.\nSolo informativo.',
    });
    expect(textoAvisoPrueba(5)).toEqual({
      titulo: 'Aviso de prueba',
      cuerpo: 'Así verás los avisos de sismos de magnitud 5.0 o más.',
    });
  });
});

/** Reloj y temporizadores simulados. */
function reloj() {
  let t = T0;
  /** @type {{ en: number, fn: () => void, id: number }[]} */
  let cola = [];
  let n = 0;
  return {
    ahora: () => t,
    programar: (/** @type {() => void} */ fn, /** @type {number} */ ms) => {
      n += 1;
      cola.push({ en: t + ms, fn, id: n });
      return n;
    },
    cancelar: (/** @type {unknown} */ id) => {
      cola = cola.filter((x) => x.id !== id);
    },
    /** @param {number} ms */
    avanzar(ms) {
      const fin = t + ms;
      for (;;) {
        cola.sort((a, b) => a.en - b.en);
        const sig = cola[0];
        if (!sig || sig.en > fin) break;
        cola.shift();
        t = sig.en;
        sig.fn();
      }
      t = fin;
    },
  };
}

function notificador({ activo = true, umbral = 4.5 } = {}) {
  const r = reloj();
  const mostrar = vi.fn();
  const n = crearNotificador({
    mostrar,
    ahora: r.ahora,
    programar: r.programar,
    cancelar: r.cancelar,
  });
  n.configurar({ activo, umbral });
  const paises = ['ES', 'CO', 'PA'];
  /** @param {Record<string, unknown>} c @param {boolean} [notificable] */
  const llega = (c, notificable = true) => n.procesar({ sismo: sismo(c), notificable, paises });
  return { r, mostrar, n, llega };
}

describe('notificador: deduplicación, límite y agrupación (AM-22)', () => {
  it('20 sismos en 10 s → 3 avisos y 1 resumen', () => {
    const { r, mostrar, llega } = notificador();
    for (let i = 0; i < 20; i += 1) {
      llega({ id: `s${i}`, magnitud: i === 7 ? 6.1 : 4.6 });
      r.avanzar(500);
    }
    expect(mostrar).toHaveBeenCalledTimes(LIMITE_AVISOS);
    expect(mostrar.mock.calls.map((c) => c[0].etiqueta)).toEqual(['s0', 's1', 's2']);
    r.avanzar(VENTANA_LIMITE_MS);
    expect(mostrar).toHaveBeenCalledTimes(4);
    const resumen = mostrar.mock.calls[3][0];
    expect(resumen.tipo).toBe('resumen');
    expect(resumen.titulo).toBe('17 sismos de magnitud 4.5 o más');
    expect(resumen.cuerpo).toMatch(/^El mayor: M 6\.1 · /);
  });

  it('nunca más de 3 avisos en una ventana de 60 s (ráfaga sostenida)', () => {
    const { r, mostrar, llega } = notificador();
    /** @type {number[]} */
    const instantes = [];
    mostrar.mockImplementation(() => instantes.push(r.ahora()));
    for (let i = 0; i < 300; i += 1) {
      llega({ id: `s${i}`, magnitud: 4.7 });
      r.avanzar(1000);
    }
    r.avanzar(120_000);
    for (let i = LIMITE_AVISOS; i < instantes.length; i += 1) {
      expect(instantes[i] - instantes[i - LIMITE_AVISOS]).toBeGreaterThanOrEqual(VENTANA_LIMITE_MS);
    }
  });

  it('si solo queda uno retenido, se envía como aviso normal', () => {
    const { r, mostrar, llega } = notificador();
    for (let i = 0; i < 4; i += 1) llega({ id: `s${i}` });
    r.avanzar(VENTANA_LIMITE_MS);
    expect(mostrar).toHaveBeenCalledTimes(4);
    expect(mostrar.mock.calls[3][0]).toMatchObject({ tipo: 'sismo', etiqueta: 's3' });
  });

  it('el mismo id desde dos fuentes o revisado → 1 aviso', () => {
    const { mostrar, llega } = notificador();
    expect(llega({ id: 'a', magnitud: 5 })).toBe('avisar');
    expect(llega({ id: 'a', magnitud: 5.3, revision: 2 })).toBe('ya-notificado');
    expect(mostrar).toHaveBeenCalledTimes(1);
  });

  it('fusión: el «ya notificado» pasa al id que lo sustituye', () => {
    const { mostrar, llega, n } = notificador();
    llega({ id: 'emsc:a', magnitud: 5 });
    n.trasladar('emsc:a', 'usgs:b');
    expect(llega({ id: 'usgs:b', magnitud: 5.1 })).toBe('ya-notificado');
    expect(mostrar).toHaveBeenCalledTimes(1);
  });

  it('4.3 → 4.8 → 4.4 → 4.9 → 1 aviso (con «magnitud revisada»)', () => {
    const { mostrar, llega } = notificador();
    for (const magnitud of [4.3, 4.8, 4.4, 4.9]) llega({ id: 'x', magnitud });
    expect(mostrar).toHaveBeenCalledTimes(1);
    expect(mostrar.mock.calls[0][0].cuerpo).toContain('magnitud revisada (antes 4.3)');
  });

  it('alta tardía (no notificable) → 0 avisos', () => {
    const { mostrar, llega } = notificador();
    expect(llega({ id: 'viejo', magnitud: 6, tiempo: '2026-10-08T12:00:00Z' }, false)).toBe(
      'no-notificable',
    );
    expect(mostrar).not.toHaveBeenCalled();
  });

  it('carga inicial: lo conocido por encima del umbral no avisa al revisarse', () => {
    const { mostrar, llega, n } = notificador();
    n.conocer([sismo({ id: 'k', magnitud: 6 }), sismo({ id: 'j', magnitud: 4.1 })]);
    expect(llega({ id: 'k', magnitud: 6.2 })).toBe('ya-superaba');
    expect(llega({ id: 'j', magnitud: 4.6 })).toBe('avisar');
    expect(mostrar).toHaveBeenCalledTimes(1);
  });

  it('una carga de 10 000 sismos se recuerda entera y deprisa; la memoria está acotada', () => {
    const { llega, n } = notificador();
    const muchos = Array.from({ length: 10_000 }, (_, i) => sismo({ id: `c${i}`, magnitud: 5 }));
    const inicio = performance.now();
    n.conocer(muchos);
    expect(performance.now() - inicio).toBeLessThan(500);
    expect(llega({ id: 'c0', magnitud: 5.1 })).toBe('ya-superaba');
    expect(llega({ id: 'c9999', magnitud: 5.1 })).toBe('ya-superaba');
    // Al pasar del máximo se olvidan los más antiguos.
    n.conocer(
      Array.from({ length: MAX_RECORDADOS * 1.25 }, (_, i) => sismo({ id: `d${i}`, magnitud: 5 })),
    );
    expect(llega({ id: 'c1', magnitud: 5.1 })).toBe('avisar');
    expect(llega({ id: `d${MAX_RECORDADOS * 1.25 - 1}`, magnitud: 5.1 })).toBe('ya-superaba');
  });

  it('desactivados no avisan, pero recuerdan la magnitud; desactivar vacía lo retenido', () => {
    const { r, mostrar, llega, n } = notificador({ activo: false });
    expect(llega({ id: 'a', magnitud: 4.7 })).toBe('inactivo');
    n.configurar({ activo: true });
    expect(llega({ id: 'a', magnitud: 4.8 })).toBe('ya-superaba');
    for (let i = 0; i < 6; i += 1) llega({ id: `s${i}` });
    n.configurar({ activo: false });
    r.avanzar(VENTANA_LIMITE_MS * 2);
    expect(mostrar).toHaveBeenCalledTimes(3);
  });

  it('umbral elegible: con 5.0, un 4.9 no avisa', () => {
    const { llega } = notificador({ umbral: 5 });
    expect(llega({ id: 'a', magnitud: 4.94 })).toBe('bajo-umbral');
    expect(llega({ id: 'b', magnitud: 4.96 })).toBe('avisar');
  });

  it('«Probar aviso» no cuenta para el límite', () => {
    const { mostrar, llega, n } = notificador();
    n.probar();
    n.probar();
    for (let i = 0; i < 3; i += 1) llega({ id: `s${i}` });
    expect(mostrar).toHaveBeenCalledTimes(5);
    expect(mostrar.mock.calls[0][0]).toMatchObject({ tipo: 'prueba', titulo: 'Aviso de prueba' });
  });
});

describe('crearMostrador (API Notification)', () => {
  it('crea la notificación con tag, idioma e icono propio; el clic enfoca y abre', () => {
    /** @type {any[]} */
    const creadas = [];
    class N extends EventTarget {
      static permission = 'granted';
      /** @param {string} t @param {any} o */
      constructor(t, o) {
        super();
        this.t = t;
        this.o = o;
        this.close = vi.fn();
        creadas.push(this);
      }
    }
    const alPulsar = vi.fn();
    const enfocarPestana = vi.fn();
    const mostrar = crearMostrador({
      NotificationImpl: /** @type {any} */ (N),
      alPulsar,
      enfocarPestana,
    });
    const aviso = {
      tipo: /** @type {const} */ ('sismo'),
      titulo: 'T',
      cuerpo: 'C',
      etiqueta: 'emsc:1',
      sismo: null,
    };
    expect(mostrar(aviso)).toBe(true);
    expect(creadas[0].o).toEqual({ body: 'C', tag: 'emsc:1', lang: 'es', icon: '/favicon.svg' });
    const e = new Event('click', { cancelable: true });
    creadas[0].dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(enfocarPestana).toHaveBeenCalled();
    expect(creadas[0].close).toHaveBeenCalled();
    expect(alPulsar).toHaveBeenCalledWith(aviso);
  });

  it('sin permiso o si el constructor falla (Android), no lanza', () => {
    const aviso = {
      tipo: /** @type {const} */ ('prueba'),
      titulo: 'T',
      cuerpo: 'C',
      etiqueta: 'p',
      sismo: null,
    };
    const Denegado = /** @type {any} */ ({ permission: 'denied' });
    expect(crearMostrador({ NotificationImpl: Denegado, alPulsar: vi.fn() })(aviso)).toBe(false);
    class Roto {
      static permission = 'granted';
      constructor() {
        throw new TypeError('Illegal constructor');
      }
    }
    expect(
      crearMostrador({ NotificationImpl: /** @type {any} */ (Roto), alPulsar: vi.fn() })(aviso),
    ).toBe(false);
  });
});

describe('estado inicial del bloque «Avisos» (textos.md §8.1)', () => {
  it.each([
    [null, null, 'no-soportado'],
    ['default', null, 'inicial'],
    ['default', true, 'inicial'],
    ['denied', true, 'bloqueados'],
    ['granted', true, 'activados'],
    ['granted', false, 'desactivados'],
    ['granted', null, 'inicial'],
  ])('permiso %s y preferencia %s → %s', (permiso, activos, estado) => {
    expect(estadoInicialAvisos(/** @type {any} */ (permiso), activos)).toBe(estado);
  });
});

describe('preferencia de avisos (HU-10, AM-27)', () => {
  /** @param {Record<string, string>} [inicial] */
  function almacen(inicial = {}) {
    const datos = new Map(Object.entries(inicial));
    return {
      datos,
      getItem: (/** @type {string} */ k) => (datos.has(k) ? datos.get(k) : null),
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => void datos.set(k, String(v)),
    };
  }
  it('guarda y lee', () => {
    const a = almacen();
    expect(guardarAvisos(a, { activos: true, umbral: '5.0' })).toBe(true);
    expect(a.datos.get(CLAVE_AVISOS)).toBe('{"activos":true,"umbral":"5.0"}');
    expect(leerAvisos(a)).toEqual({ activos: true, umbral: '5.0' });
  });
  it.each(['{', '{"activos":"si","umbral":"4.5"}', '{"activos":true,"umbral":"99"}', '[]', 'null'])(
    'dañada (%s) → por defecto',
    (crudo) => {
      expect(leerAvisos(almacen({ [CLAVE_AVISOS]: crudo }))).toEqual({
        activos: null,
        umbral: '4.5',
      });
    },
  );
  it('no guarda valores fuera de la lista ni con el almacén bloqueado', () => {
    expect(guardarAvisos(almacen(), { activos: true, umbral: '7.0' })).toBe(false);
    const bloqueado = {
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(guardarAvisos(bloqueado, { activos: true, umbral: '4.5' })).toBe(false);
    expect(leerAvisos(null)).toEqual({ activos: null, umbral: '4.5' });
  });
});
