// Configuración de ESLint (flat config). Reglas de seguridad de AM-01 y AM-26, y la frontera
// de `src/shared` (arquitectura §5.8): sin paquetes npm, sin `node:*` y sin globales de entorno.

import js from '@eslint/js';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import globals from 'globals';

/** Reglas de seguridad comunes (AM-26): siempre error, nunca aviso. */
const reglasSeguridad = {
  'no-unsanitized/method': 'error',
  'no-unsanitized/property': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-restricted-properties': [
    'error',
    { object: 'document', property: 'write', message: 'Prohibido document.write (AM-26).' },
    { object: 'document', property: 'writeln', message: 'Prohibido document.writeln (AM-26).' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: "Property[key.name='rejectUnauthorized'][value.value=false]",
      message: 'Prohibido desactivar la verificación TLS (AM-06, AM-26).',
    },
  ],
};

export default [
  {
    ignores: [
      'node_modules/',
      'coverage/',
      'playwright-report/',
      'test-results/',
      '.claude/',
      '.fabrica/',
      'tests/fixtures/',
      'index.html',
    ],
  },
  js.configs.recommended,
  {
    plugins: { 'no-unsanitized': noUnsanitized },
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: reglasSeguridad,
  },
  {
    files: ['src/server/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // AM-26: en los adaptadores de fuentes no se copian objetos externos con Object.assign.
    files: ['src/server/fuentes/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        ...reglasSeguridad['no-restricted-syntax'],
        {
          selector: "CallExpression[callee.object.name='Object'][callee.property.name='assign']",
          message:
            'Construye el registro campo a campo; no uses Object.assign con datos externos (AM-05, AM-26).',
        },
      ],
    },
  },
  {
    // §5.8: src/shared se sirve tal cual al navegador.
    files: ['src/shared/**/*.js'],
    languageOptions: { globals: { URLSearchParams: 'readonly' } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^node:',
              message: 'src/shared no puede importar módulos de Node (arquitectura §5.8).',
            },
            {
              regex: '^(?!\\.{1,2}/)',
              message:
                'src/shared solo importa archivos de src/shared con ruta relativa y extensión .js (arquitectura §5.8).',
            },
            {
              regex: '^\\.\\./',
              message:
                'src/shared es plano: no importa nada de fuera de src/shared (arquitectura §5.8).',
            },
            {
              regex: '^\\.{1,2}/.*(?<!\\.js)$',
              message:
                'Las importaciones de src/shared llevan la extensión .js (arquitectura §5.8).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'No disponible en el navegador (§5.8).' },
        { name: 'Buffer', message: 'No disponible en el navegador (§5.8).' },
        { name: 'window', message: 'No disponible en Node (§5.8).' },
        { name: 'document', message: 'No disponible en Node (§5.8).' },
        { name: 'require', message: 'Solo módulos ES (§5.8).' },
      ],
    },
  },
];
