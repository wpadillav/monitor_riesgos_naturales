import { describe, expect, it, vi } from 'vitest';
import { ErrorApi, consultarFuentes, consultarSismos } from '../../../public/js/api.js';
import {
  DURACION_NUEVO_MS,
  crearEstado,
  esNuevo,
  esSismoValido,
} from '../../../public/js/estado.js';
import { textoFuentes } from '../../../public/js/fuentes.js';

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

describe('estado de la vista (punto de integración de T4.6b/T4.7)', () => {
  it('reemplazar ordena por tiempo descendente y descarta inválidos y repetidos', () => {
    const e = crearEstado({ ahora: () => T0 });
    e.reemplazar([
      sismo({ id: 'a', tiempo: '2026-10-10T10:00:00Z' }),
      sismo({ id: 'b', tiempo: '2026-10-10T11:30:00Z' }),
      sismo({ id: 'b', tiempo: '2026-10-10T09:00:00Z' }),
      { id: 'roto' },
      sismo({ id: 'c', lat: 95 }),
    ]);
    expect(e.lista().map((x) => x.sismo.id)).toEqual(['b', 'a']);
    expect(e.tamano).toBe(2);
  });

  it('notifica a los suscriptores y permite cancelar', () => {
    const e = crearEstado();
    const oyente = vi.fn();
    const cancelar = e.suscribir(oyente);
    e.reemplazar([sismo({ id: 'a' })]);
    expect(oyente).toHaveBeenCalledWith({ tipo: 'reemplazo', ids: ['a'] });
    cancelar();
    e.eliminarSismo('a');
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('aplicarSismo: alta con «Nuevo» y actualización con magnitud anterior («Revisado»)', () => {
    let t = T0;
    const e = crearEstado({ ahora: () => t });
    e.reemplazar([sismo({ id: 'a', magnitud: 3.8 })]);
    expect(e.aplicarSismo(sismo({ id: 'n' }))).toBe('nuevo');
    const nuevo = e.obtener('n');
    expect(nuevo && esNuevo(nuevo, t)).toBe(true);
    t += DURACION_NUEVO_MS;
    expect(nuevo && esNuevo(nuevo, t)).toBe(false);

    const antes = e.obtener('a')?.version;
    expect(e.aplicarSismo(sismo({ id: 'a', magnitud: 4.2, revision: 2 }))).toBe('actualizado');
    const a = e.obtener('a');
    expect(a?.magnitudAnterior).toBe(3.8);
    expect(a?.version).not.toBe(antes);
    expect(a?.llegadoEn).toBeNull();
    expect(e.aplicarSismo({ id: 'x' })).toBeNull();
  });

  it('una revisión sin cambio de magnitud redondeada no marca «Revisado»', () => {
    const e = crearEstado();
    e.reemplazar([sismo({ id: 'a', magnitud: 4.01 })]);
    e.aplicarSismo(sismo({ id: 'a', magnitud: 4.04, revision: 2 }));
    expect(e.obtener('a')?.magnitudAnterior).toBeNull();
  });

  it('recarga periódica: solo los ids que no estaban se marcan como «Nuevo»', () => {
    const e = crearEstado({ ahora: () => T0 });
    e.reemplazar([sismo({ id: 'a' })]);
    e.reemplazar([sismo({ id: 'a' }), sismo({ id: 'b' })], { marcarNuevos: true });
    expect(e.obtener('a')?.llegadoEn).toBeNull();
    expect(e.obtener('b')?.llegadoEn).toBe(T0);
  });

  it('conserva la versión si el sismo no cambió (la vista no repinta)', () => {
    const e = crearEstado();
    e.reemplazar([sismo({ id: 'a' })]);
    const v = e.obtener('a')?.version;
    e.reemplazar([sismo({ id: 'a' })]);
    expect(e.obtener('a')?.version).toBe(v);
  });

  it('purgar quita los que salen del periodo (HU-05)', () => {
    const e = crearEstado();
    e.reemplazar([
      sismo({ id: 'viejo', tiempo: '2026-10-10T10:58:00Z' }),
      sismo({ id: 'nuevo', tiempo: '2026-10-10T11:30:00Z' }),
    ]);
    expect(e.purgar(Date.parse('2026-10-10T11:00:00Z'))).toEqual(['viejo']);
    expect(e.lista().map((x) => x.sismo.id)).toEqual(['nuevo']);
    expect(e.purgar(0)).toEqual([]);
  });

  it('eliminarSismo', () => {
    const e = crearEstado();
    e.reemplazar([sismo({ id: 'a' })]);
    expect(e.eliminarSismo('a')).toBe(true);
    expect(e.eliminarSismo('a')).toBe(false);
  });

  it('esSismoValido exige id, tiempo, coordenadas y magnitud', () => {
    expect(esSismoValido(sismo({}))).toBe(true);
    expect(esSismoValido(sismo({ magnitud: Number.NaN }))).toBe(false);
    expect(esSismoValido(sismo({ tiempo: 'ayer' }))).toBe(false);
    expect(esSismoValido(sismo({ id: '' }))).toBe(false);
    expect(esSismoValido(null)).toBe(false);
  });
});

describe('textoFuentes (HU-02)', () => {
  const f = (fuente, estado, cambiadoEn = '2026-10-10T11:59:00Z') => ({
    fuente,
    estado,
    cambiadoEn,
  });

  it('nada que avisar', () => {
    expect(textoFuentes([f('emsc-fdsn', 'ok'), f('usgs', 'degradada')], T0)).toBeNull();
    expect(textoFuentes(null, T0)).toBeNull();
  });

  it('una fuente caída', () => {
    expect(textoFuentes([f('emsc-fdsn', 'ok'), f('usgs', 'caida')], T0)).toBe('USGS no disponible');
    expect(textoFuentes([f('emsc-fdsn', 'caida'), f('usgs', 'ok')], T0)).toBe('EMSC no disponible');
  });

  it('EMSC FDSN caída con el tiempo real activo no es «EMSC no disponible»', () => {
    expect(
      textoFuentes([f('emsc-ws', 'ok'), f('emsc-fdsn', 'caida'), f('usgs', 'ok')], T0),
    ).toBeNull();
  });

  it('tiempo real caído', () => {
    expect(textoFuentes([f('emsc-ws', 'caida'), f('emsc-fdsn', 'ok'), f('usgs', 'ok')], T0)).toBe(
      'Tiempo real no disponible: los sismos nuevos pueden tardar hasta 1 min.',
    );
  });

  it('las dos caídas: primero el plural; tras 2 min, el texto general', () => {
    expect(textoFuentes([f('emsc-fdsn', 'caida'), f('usgs', 'caida')], T0)).toBe(
      'EMSC y USGS no disponibles',
    );
    expect(
      textoFuentes(
        [
          f('emsc-fdsn', 'caida', '2026-10-10T11:57:00Z'),
          f('usgs', 'caida', '2026-10-10T11:58:00Z'),
        ],
        T0,
      ),
    ).toBe('Las fuentes de datos no responden. Se muestran los últimos sismos recibidos.');
  });
});

describe('cliente de la API', () => {
  /** @param {unknown} cuerpo @param {number} [status] */
  const respuesta = (cuerpo, status = 200) =>
    vi.fn(async () => ({ ok: status < 400, status, json: async () => cuerpo }));

  it('pide /api/sismos con la query del contrato', async () => {
    const fetchImpl = respuesta({ sismos: [], fuentes: [], ultimoEventoId: 'a-1' });
    const r = await consultarSismos(
      { paises: ['ES'], magMin: '3.0', periodo: '1h' },
      { fetchImpl },
    );
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/sismos?paises=ES&magMin=3.0&periodo=1h');
    expect(r?.ultimoEventoId).toBe('a-1');
  });

  it('sin países no consulta', async () => {
    const fetchImpl = respuesta({});
    expect(
      await consultarSismos({ paises: [], magMin: '2.0', periodo: '24h' }, { fetchImpl }),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('clasifica los errores: red, 5xx y cuerpo inesperado', async () => {
    const f = { paises: ['ES'], magMin: '2.0', periodo: '24h' };
    const red = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(consultarSismos(f, { fetchImpl: red })).rejects.toMatchObject({ tipo: 'red' });
    await expect(consultarSismos(f, { fetchImpl: respuesta({}, 503) })).rejects.toMatchObject({
      tipo: 'servidor',
      status: 503,
    });
    await expect(consultarSismos(f, { fetchImpl: respuesta({ nada: 1 }) })).rejects.toBeInstanceOf(
      ErrorApi,
    );
  });

  it('una consulta cancelada propaga el AbortError (no es un error que mostrar)', async () => {
    const ctrl = new AbortController();
    const fetchImpl = vi.fn(async () => {
      ctrl.abort();
      throw new DOMException('cancelada', 'AbortError');
    });
    await expect(
      consultarSismos(
        { paises: ['ES'], magMin: '2.0', periodo: '24h' },
        { fetchImpl, signal: ctrl.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('consultarFuentes devuelve el array de fuentes o vacío', async () => {
    expect(
      await consultarFuentes({ fetchImpl: respuesta({ fuentes: [{ fuente: 'usgs' }] }) }),
    ).toEqual([{ fuente: 'usgs' }]);
    expect(await consultarFuentes({ fetchImpl: respuesta({}) })).toEqual([]);
  });
});
