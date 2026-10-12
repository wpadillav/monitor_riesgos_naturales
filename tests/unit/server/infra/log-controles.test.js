// Inyección en el terminal o en los logs (AM-29; S-01 y S-03 de docs/seguridad/revision-T5.3.md).
// Completa `tests/unit/server/log.test.js`: recorre **todos** los controles C0, DEL, C1 y los
// separadores Unicode, comprueba los bytes que llegan a la consola (UTF-8), que no se pueden
// falsificar campos ni líneas, y que los nombres de evento son siempre constantes del código.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createLog } from '../../../../src/server/infra/log.js';

const SRC = fileURLToPath(new URL('../../../../src/', import.meta.url));

/** @param {'json' | 'texto'} formato */
function capturar(formato) {
  /** @type {string[]} */
  const lineas = [];
  const log = createLog({
    formato,
    version: '2.0.0',
    ahora: () => Date.parse('2026-10-10T06:00:00.000Z'),
    salida: { write: (l) => lineas.push(l) },
  });
  return { log, lineas };
}

/** C0 (U+0000–U+001F), DEL, C1 (U+0080–U+009F) y los separadores U+2028 y U+2029. */
const CONTROLES = [
  ...Array.from({ length: 0x20 }, (_, i) => i),
  ...Array.from({ length: 0x21 }, (_, i) => 0x7f + i),
  0x2028,
  0x2029,
].map((cp) => String.fromCodePoint(cp));

const hex = (/** @type {string} */ ch) => ch.codePointAt(0)?.toString(16).padStart(4, '0');

/**
 * Bytes no imprimibles de la línea tal como se escribe en el terminal (UTF-8), sin contar el
 * salto final: C0 y DEL (1 byte), C1 (`C2 80`–`C2 9F`) y U+2028/U+2029 (`E2 80 A8`/`A9`).
 * @param {string} linea
 */
function bytesDeControl(linea) {
  const b = Buffer.from(linea.slice(0, -1), 'utf8');
  /** @type {string[]} */
  const encontrados = [];
  for (let i = 0; i < b.length; i += 1) {
    if (b[i] < 0x20 || b[i] === 0x7f) encontrados.push(b[i].toString(16));
    if (b[i] === 0xc2 && b[i + 1] >= 0x80 && b[i + 1] <= 0x9f)
      encontrados.push(`c2${b[i + 1].toString(16)}`);
    if (b[i] === 0xe2 && b[i + 1] === 0x80 && (b[i + 2] === 0xa8 || b[i + 2] === 0xa9)) {
      encontrados.push(`e280${b[i + 2].toString(16)}`);
    }
  }
  return encontrados;
}

describe('log: ningún control llega al terminal (AM-29)', () => {
  it('la tabla cubre los 67 caracteres', () => {
    expect(CONTROLES).toHaveLength(32 + 33 + 2);
  });

  describe.each(['json', 'texto'])('formato %s', (formato) => {
    it.each(CONTROLES.map((ch) => [hex(ch), ch]))(
      'U+%s en un valor sale escapado, en una sola línea',
      (_codigo, ch) => {
        const { log, lineas } = capturar(/** @type {'json' | 'texto'} */ (formato));
        log.error('error', { ruta: `/a${ch}b` });

        expect(lineas).toHaveLength(1);
        const linea = lineas[0];
        expect(linea.endsWith('\n')).toBe(true);
        expect(bytesDeControl(linea)).toEqual([]);
      },
    );

    it('el caso del modelo («\\x1b[2J» y «\\n»): sin ESC y sin saltos de línea intermedios', () => {
      const { log, lineas } = capturar(/** @type {'json' | 'texto'} */ (formato));
      log.warn('http.rechazo', { ruta: '/x\x1b[2J\x1b]0;titulo\x07\nFALSO INFO servidor.parando' });

      const bytes = Buffer.from(lineas[0], 'utf8');
      expect(bytes.includes(0x1b)).toBe(false);
      expect(bytes.includes(0x07)).toBe(false);
      expect(bytes.indexOf(0x0a)).toBe(bytes.length - 1);
      expect(lineas[0]).toContain('\\u001b[2J');
    });

    it('todos los controles juntos y texto con tildes: sin bytes de control y sin tocar «ñ, á, €»', () => {
      const { log, lineas } = capturar(/** @type {'json' | 'texto'} */ (formato));
      log.info('fuente.error', { mensaje: `Panamá ñ € ${CONTROLES.join('')} fin` });

      expect(lineas).toHaveLength(1);
      expect(bytesDeControl(lineas[0])).toEqual([]);
      expect(lineas[0]).toContain('Panamá ñ €');
    });
  });

  it('json: el valor original se recupera intacto al leer la línea', () => {
    const { log, lineas } = capturar('json');
    const valor = CONTROLES.join('');
    log.error('error', { ruta: valor });
    expect(JSON.parse(lineas[0]).ruta).toBe(valor);
  });
});

describe('log: no se pueden falsificar campos ni líneas (AM-29)', () => {
  it('texto: unas comillas en el valor no crean un campo nuevo', () => {
    const { log, lineas } = capturar('texto');
    log.warn('http.rechazo', { ruta: 'x" status=200 falso="y' });

    expect(lineas[0]).toBe(
      '2026-10-10T06:00:00.000Z WARN http.rechazo ruta="x\\" status=200 falso=\\"y"\n',
    );
  });

  it('json: un valor con comillas no cambia el nivel ni el evento', () => {
    const { log, lineas } = capturar('json');
    log.error('error', { ruta: '","nivel":"info","evento":"servidor.escuchando' });

    const leido = JSON.parse(lineas[0]);
    expect(leido.nivel).toBe('error');
    expect(leido.evento).toBe('error');
    expect(leido.ruta).toBe('","nivel":"info","evento":"servidor.escuchando');
  });
});

describe('log: los nombres de evento son constantes del código (AM-29)', () => {
  // En formato texto el nombre del evento y las claves no pasan por `JSON.stringify`: por eso
  // nunca pueden venir de datos externos. Esta prueba falla si alguien registra un evento con
  // un nombre calculado.
  /** @param {string} dir @returns {string[]} */
  const archivos = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? archivos(join(dir, e.name))
        : e.name.endsWith('.js')
          ? [join(dir, e.name)]
          : [],
    );

  it('cada llamada a log.error/warn/info/debug de src/ usa un literal en minúsculas', () => {
    /** @type {string[]} */
    const llamadas = [];
    /** @type {string[]} */
    const malas = [];
    for (const archivo of archivos(SRC)) {
      const codigo = readFileSync(archivo, 'utf8');
      for (const m of codigo.matchAll(/\blog\??\.(?:error|warn|info|debug)\(\s*([^,)]*)/g)) {
        llamadas.push(m[1]);
        if (!/^'[a-z][a-z.-]*'$/.test(m[1].trim())) malas.push(`${archivo}: ${m[1]}`);
      }
    }
    expect(llamadas.length).toBeGreaterThan(30);
    expect(malas).toEqual([]);
  });
});
