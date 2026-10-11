// Pruebas E2E de la página (T4.5). Arrancan el servidor real sin fuentes (FUENTES_ACTIVAS=no) y
// simulan `/api/*` y las teselas de Esri interceptando la red: no salen a Internet.
// Ejecución: `npm run test:e2e` (requiere `npx playwright install chromium firefox`).

import { defineConfig, devices } from '@playwright/test';

const PUERTO = 3013;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  // Estabilidad (T5.1): 2 workers fijos, sea cual sea la máquina. Con más, Firefox y Chromium
  // compiten por la CPU (cada página pinta un mapa de Leaflet y la lista) y las pruebas con
  // tiempos (RNF-03) o con esperas encadenadas se vuelven lentas. Las esperas son siempre por
  // condición: el margen de `expect` se amplía para máquinas cargadas, no para tapar fallos.
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
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
    {
      // Firefox (T5.0L): `npx playwright install firefox`, sin sudo ni `install-deps` (Firefox 157
      // trae sus propias NSS). Mint 22.3 usa la build de Ubuntu 24.04 (STACK.lock, A6). Ejecución
      // aislada: `npx playwright test --project=firefox`.
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
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
