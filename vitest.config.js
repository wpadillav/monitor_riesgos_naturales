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
  },
});
