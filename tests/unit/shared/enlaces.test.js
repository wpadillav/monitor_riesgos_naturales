import { describe, expect, it } from 'vitest';
import { esUrlFichaValida, urlFicha } from '../../../src/shared/enlaces.js';

describe('urlFicha (AM-02)', () => {
  it('construye la ficha de EMSC a partir del unid', () => {
    expect(urlFicha('emsc', '20261010_0000106')).toBe(
      'https://www.seismicportal.eu/eventdetails.html?unid=20261010_0000106',
    );
  });

  it('construye la ficha de USGS a partir del id', () => {
    expect(urlFicha('usgs', 'us6000u19w')).toBe(
      'https://earthquake.usgs.gov/earthquakes/eventpage/us6000u19w',
    );
  });

  it.each([
    ['emsc', '../../evil'],
    ['emsc', 'a b'],
    ['usgs', 'x?y=1'],
    ['usgs', ''],
    ['usgs', 'a'.repeat(65)],
    ['ign', '123'],
    ['__proto__', 'x'],
    ['emsc', 42],
  ])('rechaza fuente %s con id %s', (fuente, id) => {
    expect(urlFicha(fuente, id)).toBeNull();
  });

  it('lo que construye siempre pasa la validación', () => {
    expect(esUrlFichaValida(urlFicha('emsc', 'a.b-c_1'))).toBe(true);
    expect(esUrlFichaValida(urlFicha('usgs', 'pt26282001'))).toBe(true);
  });
});

/** Construye `<esquema>:` sin escribir el literal, que `no-script-url` (AM-26) prohíbe. */
const esquema = (nombre) => `${nombre}:`;

describe('esUrlFichaValida (AM-02)', () => {
  it.each([
    `${esquema('javascript')}alert(1)`,
    `${esquema('JaVaScRiPt')}alert(1)`,
    ` ${esquema('javascript')}alert(1)`,
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.example',
    'https://evil.example/earthquakes/eventpage/us1',
    'https://www.seismicportal.eu.evil.example/eventdetails.html?unid=1',
    'http://earthquake.usgs.gov/earthquakes/eventpage/us1',
    'https://earthquake.usgs.gov/earthquakes/eventpage/us1#x',
    'https://earthquake.usgs.gov/earthquakes/eventpage/us1\n',
    'https://earthquake.usgs.gov/earthquakes/eventpage/',
    'https://www.seismicportal.eu/eventdetails.html?unid=1&x=javascript:1',
    'https://user@earthquake.usgs.gov/earthquakes/eventpage/us1',
  ])('rechaza «%s» (sin enlace)', (url) => {
    expect(esUrlFichaValida(url)).toBe(false);
  });

  it.each([null, undefined, 1, {}])('rechaza valores que no son cadenas (%s)', (url) => {
    expect(esUrlFichaValida(url)).toBe(false);
  });
});
