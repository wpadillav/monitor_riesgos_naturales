// Pruebas de las reglas de ESLint (AM-26 y arquitectura §5.8).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd: RAIZ });

/**
 * @param {string} codigo
 * @param {string} ruta ruta virtual: decide qué bloque de la configuración se aplica
 */
async function reglasVioladas(codigo, ruta) {
  const [resultado] = await eslint.lintText(codigo, { filePath: `${RAIZ}${ruta}` });
  return resultado.messages.map((m) => m.ruleId);
}

describe('prueba negativa del linter (AM-26)', () => {
  it('peligroso.js.txt viola no-unsanitized, no-eval y la regla de TLS', async () => {
    const codigo = readFileSync(new URL('./peligroso.js.txt', import.meta.url), 'utf8');
    const reglas = await reglasVioladas(codigo, 'public/js/peligroso.js');

    expect(reglas).toEqual(
      expect.arrayContaining(['no-unsanitized/property', 'no-eval', 'no-restricted-syntax']),
    );
  });

  it.each([
    ['el.insertAdjacentHTML("beforeend", dato);', 'no-unsanitized/method'],
    ['el.outerHTML = dato;', 'no-unsanitized/property'],
    ['document.write(dato);', 'no-unsanitized/method'],
    ['new Function(dato)();', 'no-new-func'],
    ['setTimeout("alerta()", 10);', 'no-implied-eval'],
  ])('`%s` → %s', async (linea, regla) => {
    const codigo = `export function f(el, dato) {\n  ${linea}\n}\n`;
    expect(await reglasVioladas(codigo, 'public/js/x.js')).toContain(regla);
  });

  it('textContent con datos externos está permitido', async () => {
    const codigo = 'export function f(el, dato) {\n  el.textContent = dato;\n}\n';
    expect(await reglasVioladas(codigo, 'public/js/x.js')).toEqual([]);
  });

  it('prohíbe Object.assign en los adaptadores de fuentes', async () => {
    const codigo = 'export const f = (dato) => Object.assign({}, dato);\n';
    expect(await reglasVioladas(codigo, 'src/server/fuentes/x.js')).toContain(
      'no-restricted-syntax',
    );
  });
});

describe('frontera de src/shared (arquitectura §5.8)', () => {
  it.each([
    "import { readFileSync } from 'node:fs';",
    "import { Hono } from 'hono';",
    "import distance from '@turf/distance';",
    "import fs from 'fs';",
    "import { x } from '../server/app.js';",
    "import { x } from './magnitud';",
  ])('rechaza `%s`', async (importacion) => {
    const codigo = `${importacion}\nexport const y = 1;\n`;
    expect(await reglasVioladas(codigo, 'src/shared/x.js')).toContain('no-restricted-imports');
  });

  it('admite importar otro módulo de src/shared con extensión .js', async () => {
    const codigo = "import { NOMBRE_APLICACION } from './constantes.js';\nexport const y = NOMBRE_APLICACION;\n";
    expect(await reglasVioladas(codigo, 'src/shared/x.js')).toEqual([]);
  });

  it.each(['process.env.X', 'Buffer.from("a")', 'window.alert', 'document.title'])(
    'rechaza el global de entorno `%s`',
    async (expresion) => {
      const codigo = `export const y = () => ${expresion};\n`;
      expect(await reglasVioladas(codigo, 'src/shared/x.js')).toEqual(
        expect.arrayContaining([expect.stringMatching(/^no-(restricted-globals|undef)$/)]),
      );
    },
  );

  it('el mismo import de npm sí está permitido en el servidor', async () => {
    const codigo = "import { Hono } from 'hono';\nexport const app = new Hono();\n";
    expect(await reglasVioladas(codigo, 'src/server/x.js')).toEqual([]);
  });
});
