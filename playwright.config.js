// Pruebas E2E de la página (T4.5). Arrancan el servidor real sin fuentes (FUENTES_ACTIVAS=no) y
// simulan `/api/*` y las teselas de Esri interceptando la red: no salen a Internet.
// Ejecución: `npm run test:e2e` (requiere `npx playwright install chromium`).

import { defineConfig, devices } from '@playwright/test';

const PUERTO = 3013;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/avisos.spec.js',
    },
    {
      // Notificaciones (T4.7): Chromium «headless shell» devuelve `Notification.permission ===
      // 'denied'` aunque el contexto conceda el permiso; el modo sin interfaz nuevo
      // (`channel: 'chromium'`) se comporta como el navegador normal. Es más pesado, así que va
      // después del resto para no falsear las pruebas con tiempos (RNF-03).
      name: 'chromium-avisos',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
      testMatch: '**/avisos.spec.js',
      dependencies: ['chromium'],
    },
  ],
  webServer: {
    command: 'node src/server/index.js',
    url: `http://localhost:${PUERTO}/api/salud`,
    env: { PORT: String(PUERTO), FUENTES_ACTIVAS: 'no', LOG_NIVEL: 'warn' },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
