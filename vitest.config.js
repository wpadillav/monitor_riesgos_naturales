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
    // Cobertura (T5.0L): solo se activa con `npx vitest run --coverage`. Sin umbrales: los fija QA.
    // `include` hace que aparezcan también los archivos sin pruebas (con 0 %).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'public/js/**/*.js'],
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
});
