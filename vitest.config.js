import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// La página importa `src/shared` como `/shared/…` (lo sirve el servidor, arquitectura §5.8).
const SHARED = fileURLToPath(new URL('./src/shared/', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^\/shared\/(.*)$/, replacement: `${SHARED}$1` }],
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    restoreMocks: true,
    // Cobertura (T5.0L): solo se activa con `npx vitest run --coverage`.
    // `include` hace que aparezcan también los archivos sin pruebas (con 0 %).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'public/js/**/*.js'],
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Umbrales (T5.1): suelo por debajo de la cobertura medida el 2026-10-11, para que falle si
      // baja. El total es bajo porque la interfaz (`public/js/main.js`, `lista.js`, `mapa.js`…)
      // y el arranque (`src/server/index.js`) se prueban con Playwright, que no suma aquí. Los
      // módulos críticos llevan su propio umbral. Al añadir pruebas, subir el suelo.
      thresholds: {
        lines: 66,
        statements: 66,
        functions: 67,
        branches: 67,
        'src/shared/**': { lines: 100, statements: 100, functions: 100, branches: 99 },
        'src/server/dominio/**': { lines: 98, statements: 98, functions: 100, branches: 88 },
        'src/server/fuentes/**': { lines: 99, statements: 97, functions: 97, branches: 90 },
        'src/server/stream/**': { lines: 98, statements: 98, functions: 100, branches: 99 },
        'src/server/http/**': { lines: 99, statements: 98, functions: 100, branches: 98 },
      },
    },
  },
});
