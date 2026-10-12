# STACK.lock — Terremotos en vivo v2

> **Firmado por arquitecto-software (T6.1) el 2026-10-12 para el release de la entrega 1.** Describe exactamente `package.json`, `package-lock.json` y `.nvmrc` de `main` (`04bb0c8`). Vinculante desde la aprobación de la Fase 3 🔒 (2026-10-10).
>
> Es la fuente de verdad de las versiones. Ningún agente usa otra versión sin un ADR aprobado, salvo la migración a Node 26 LTS que ya autoriza el [ADR-0003](docs/adr/0003-version-de-node.md) (con el plan actualizado en T6.1, ver «Plan de migración a Node 26 LTS»).
>
> - **Generado** con `politica-versiones/scripts/versiones.py` el 2026-10-10. Umbral: 18 meses.
> - **Redactado por** investigador-stack (T1.1, T5.0L). **Revisado y firmado** por arquitecto-software (T3.1, T6.1). **Responsable:** arquitecto-software.
>
> Consultas en vivo del **2026-10-10** (base), del **2026-10-11** (T5.0L) y del **2026-10-12** (firma T6.1). Abreviaturas de fuente:
> - **EOLd**: https://endoflife.date/api/v1/products/nodejs/ (a través de `versiones.py` y en directo).
> - **ND**: https://nodejs.org/dist/index.json.
> - **npm**: `npm view <paquete> version time engines peerDependencies license`, con npm 11.x contra registry.npmjs.org.
> - **GH**: API de GitHub (releases, commits y security-advisories del repositorio).

## Firma T6.1 (2026-10-12): verificación contra el código de `main` (`04bb0c8`)

**Resultado: firmado.** Las versiones de este lock coinciden con lo instalado. Comprobaciones hechas en el worktree de T6.1 con Node 24.21.0 y npm 11.19.0:

| Comprobación | Resultado |
|---|---|
| `npm ci` | Limpio, 0 vulnerabilidades |
| `npm ls --depth=0` | 22 paquetes directos, **todos con la versión exacta de este lock** (6 de producción y 16 de desarrollo) |
| `npm ls --omit=dev --depth=0` | Exactamente las **6 dependencias de producción** de la tabla de abajo |
| `package.json` | Versiones exactas, sin `^` ni `~`; `engines` `>=24.21.0 <27`; `.nvmrc` = `24.21.0`; `.npmrc` con `ignore-scripts`, `engine-strict` y `save-exact` |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilidades |
| `npm audit signatures` | 170 paquetes con firma de registro verificada (73 con *attestations*) |
| GHSA nuevos desde el 2026-10-10 en `hono`, `@hono/node-server`, `ws` y `vitest` (GH) | Ninguno. Los mínimos por seguridad siguen siendo válidos |
| Última versión en npm frente al lock (2026-10-12) | Igual en 20 de 22. Solo `vitest` y `@vitest/coverage-v8` tienen la 5.0.4, publicada hoy: ver A11 |
| `npm run api:lint` | Contrato válido |
| Node 24 en EOLd y ND | 24.21.0 sigue siendo el último parche de la 24 (soporte activo hasta el 2026-10-20, EOL 2028-04-30) |

**Filas de T5.0L revisadas y firmadas** (estaban «pendientes de revisión del arquitecto»):
- `@axe-core/playwright` **4.13.0** (con `axe-core` 4.13.0): es la última estable (`latest` el 2026-10-12), sin GHSA, peer `playwright-core >= 1.0.0` resuelto con la 1.64.0 *deduped* (`npm ls`). MPL-2.0 solo en desarrollo: no se distribuye con la aplicación, así que no afecta a la AGPL. **Aceptada.**
- `@vitest/coverage-v8` **5.0.3**: peer exacto `vitest 5.0.3`, que coincide con el lock. Se usa con los umbrales de cobertura que fijó QA (T5.1). **Aceptada.** La 5.0.4 se trata en A11.
- **Firefox 157.0 de Playwright** (revisión 1555, la de `@playwright/test` 1.64.0): instalado en `~/.cache/ms-playwright/firefox-1555` y comprobado hoy (`firefox --headless --version` → `Mozilla Firefox 157.0`). La E2E completa pasa en Firefox (86 de 86 en E-QA, `04bb0c8`, sin `fixme`). **Aceptado.**
- **Advertencia A10:** la parte (2), los fallos de Firefox, queda **cerrada** porque QA los corrigió (T5.1, C-B y E-QA). La parte (1), `axe-core` 4.13.0 frente a la 4.14.0, sigue abierta hasta que salga `@axe-core/playwright` 4.14.x. Ver la tabla de advertencias.

## Cambio de C-A (2026-10-11): `@turf/distance` pasa a desarrollo (R-10)

- **Movimiento, no cambio de versión:** `@turf/distance` **7.4.0** pasa de `dependencies` a `devDependencies`. El servidor calcula la distancia con su haversine propio (`distanciaKm`, `src/shared/geo.js:18`, ADR-0004), y Turf queda como referencia de las pruebas (`tests/unit/shared/geo.test.js`).
- Quedan **6 dependencias de producción**. `@turf/distance` 7.4.0 sigue en el árbol de producción como transitiva de `@turf/point-to-polygon-distance` (a través de `@turf/point-to-line-distance` y `@turf/nearest-point-on-line`, misma versión, *deduped*; comprobado con `npm ls @turf/distance` el 2026-10-12). Por eso `package-lock.json` solo cambia la lista de dependencias directas.
- No se añade ninguna dependencia.

## Cambios de T5.0L (2026-10-11), firmados en T6.1

1. **Se añaden como `devDependencies`** (versión exacta):
   - `@axe-core/playwright` **4.13.0**: accesibilidad automática en E2E (WCAG 2.2 AA, RNF-12). Arrastra `axe-core` **4.13.0**;
   - `@vitest/coverage-v8` **5.0.3**: cobertura de Vitest, misma versión exacta que `vitest`.
2. **Firefox de Playwright 157.0** (revisión 1555, la de `@playwright/test` 1.64.0): se instala sin sudo con `npx playwright install firefox`. No hace falta `install-deps`. `playwright.config.js` tiene los proyectos `chromium`, `chromium-avisos` y `firefox`. Ver A6.
3. `vitest.config.js` recibe la configuración de cobertura (`provider: 'v8'`; los umbrales los fijó QA en T5.1).
4. Transitivas nuevas, todas solo de desarrollo y MIT: `@babel/parser` 7.29.9, `@babel/types` 7.29.8, `@babel/helper-string-parser` 7.29.7, `@babel/helper-validator-identifier` 7.29.7, `@bcoe/v8-coverage` 1.0.2, `@vitest/istanbul-lib-coverage` 1.0.2, `@vitest/istanbul-lib-report` 1.0.2, `ast-v8-to-istanbul` 1.0.7, `js-tokens` 10.0.0, `magicast` 0.5.5 y `tinyrainbow` 3.2.0. `axe-core` es MPL-2.0.

## Cambios de la revisión T3.1 (2026-10-10)

1. **Se quitan Wrangler, Vercel CLI, `@cloudflare/vitest-pool-workers` y toda referencia a Cloudflare Workers y Vercel.** El proyecto es solo local (decisión del Director del 2026-10-10).
2. **Vitest pasa de 4.1.11 a 5.0.3.** Ver A2.
3. **Se añaden:**
   - `ws` 8.22.0 (ADR-0002);
   - `@turf/point-to-polygon-distance` 7.4.0 (ADR-0005);
   - `vite` 8.3.4, *peer* obligatorio de Vitest 5;
   - `@turf/difference`, `@turf/simplify` y `@turf/bbox` 7.4.0 (script de zonas, ADR-0005);
   - `@redocly/cli` 2.62.1 (validación del contrato).
4. **Prettier** pasa de 3.9.9 a **3.9.10**, el último parche. Ver A8.
5. **Node:** se mantiene 24.21.0, con una migración planificada a 26 LTS (ADR-0003). Se cierra A1.
6. **Se resuelven** A1, A2 y A5; se mantienen A3, A4, A6 y A7; se añaden A8 y A9.

## Plataforma

| Componente | Versión (rama) | Parche fijado | LTS | EOL | Fuente | Notas |
|---|---|---|---|---|---|---|
| Sistema operativo (desarrollo y uso) | Linux Mint 22.3 «Zena» (base Ubuntu 24.04 «noble») | — | sí | 2029-04-30 (30,7 meses) | EOLd `linuxmint`; `/etc/os-release` (2026-10-10) | Es el único entorno: uso local |
| Runtime | **Node.js 24 «Krypton»** | **24.21.0** (2026-09-08, npm 11.19.0) | sí (LTS desde 2025-10-28; soporte activo hasta 2026-10-20) | **2028-04-30** (18,6 meses) | EOLd `nodejs`; ND (2026-10-12: sigue siendo el último parche de la 24) | **Versión del release de la entrega 1.** Migración a Node 26 LTS entre el 2026-10-28 y el 2026-11-15 con el plan de abajo (ADR-0003). Instalado con nvm: `~/.nvm/versions/node/v24.21.0`, alias `default` → 24.21.0 |
| Runtime (destino ADR-0003) | Node.js 26 | Último parche 26.x **LTS** el día de la migración (el 2026-10-12, *Current*: 26.11.1 del 2026-10-07, npm 11.20.0) | Desde el **2026-10-28** | **2029-04-30** (≈ 30 meses) | EOLd `nodejs`; ND (2026-10-12) | **No se usa hasta que sea LTS y se aplique el plan de migración.** Con los indicadores actuales, `npm start` **no arranca** en Node 26 (ver A1) |
| Framework del servidor | Hono 4.x | **4.13.13** (2026-10-04) | — (sin LTS formal) | No publica | npm `hono`; GH honojs/hono | engines `node >=16.9.0`. Mínimo por seguridad **≥ 4.13.11** (GHSA-5r4p-p66f-jhc7, `serveStatic`). Ver A3 (Hono 5 rc) |
| Adaptador Node | @hono/node-server 2.x | **2.1.4** (2026-10-08) | — | — | npm; GH honojs/node-server | engines `node >=20`, peer `hono ^4 \|\| ^5.0.0-0`. Mínimo por seguridad **≥ 2.1.3** (GHSA-rmxm-3fg6-px4f) |
| Gestor de paquetes | npm 11.x (el incluido con Node) | **11.19.0** (con Node 24.21.0; pasará a 11.20.x con Node 26) | — | Sigue a Node | ND | Sin pnpm ni yarn: pocas dependencias. Se usa siempre `npm ci` |
| Base de datos / caché | — | — | — | — | — | **No hay.** Estado en memoria del proceso, con retención de 30 días y tope de 15 000 sismos (arquitectura §5.5) |
| Contenedores / despliegue | — | — | — | — | — | No se usan. Arranque manual con `npm start` |

## Librerías de producción (`dependencies`)

| Paquete | Versión | Propósito | Licencia | Última release / mantenimiento | Alternativa evaluada |
|---|---|---|---|---|---|
| `hono` | 4.13.13 | Enrutado y middlewares HTTP (`Hono`, `app.request()` en las pruebas). Las cabeceras de seguridad son un middleware propio (`src/server/http/middlewares.js`, sin `hono/secure-headers`) y el flujo SSE lo escribe el difusor propio como `ReadableStream` (`src/server/stream/difusor.js`, sin `hono/streaming`) | MIT | 2026-10-04 | Express 5 o Fastify: el Director eligió Hono (plan §3.2, ADR-0001) |
| `@hono/node-server` | 2.1.4 | Adaptador Node y `serveStatic` | MIT | 2026-10-08 | Rama 1.19.x: descartada, porque la 2.x es la actual |
| `ws` | **8.22.0** | Cliente WebSocket de EMSC con *ping*/*pong* y `maxPayload` (ADR-0002) | MIT | 2026-09-26 (GH websockets/ws). Sin dependencias. Mínimo por seguridad **≥ 8.21.0** (GHSA-96hv-2xvq-fx4p, alto; GHSA-58qx-3vcg-4xpx, medio) | `WebSocket` nativo de Node (undici): no puede enviar *ping* ni limitar los frames (verificado el 2026-10-10) |
| `leaflet` | 1.9.4 | Mapa en la página. **Lo sirve el propio servidor** desde `node_modules/leaflet/dist` con rutas explícitas, sin CDN (amenazas §7.3) | BSD-2-Clause | 2023-05-18 (npm); commits activos en 2026-09 (GH) | 2.0.0-alpha.1 (prerelease, A4); MapLibre GL (WebGL, más peso) |
| `@turf/boolean-point-in-polygon` | 7.4.0 | País por contorno (ADR-0005). Se inyecta en `src/shared/pais.js` desde `src/server/geo/asignar-pais.js` | MIT | 2026-08-03 | `@turf/turf` completo: demasiado grande |
| `@turf/point-to-polygon-distance` | 7.4.0 | Desempate exacto en la frontera CO-PA (ADR-0005). Desde C-A solo se llama cerca de la línea equidistante: antes decide una distancia aproximada propia (P-02) | MIT | 2026-08-03 | Distancia propia a segmentos: se usa como filtro previo, Turf sigue siendo el árbitro |

Son **6 dependencias de producción** (C-A, 2026-10-11: `@turf/distance` pasa a desarrollo, R-10). Todos los módulos de Turf van a la **misma versión exacta (7.4.0)**, porque comparten `@turf/helpers`, `@turf/meta` e `@turf/invariant`.

## Librerías y herramientas de desarrollo (`devDependencies`)

| Herramienta | Versión | Uso | Fuente y compatibilidad |
|---|---|---|---|
| `@turf/buffer` | 7.4.0 | Franja marina, **solo en el script** `scripts/generar-zonas.js` | MIT. Transitivas `@turf/jsts` 2.7.2 (EDL-1.0 OR EPL-1.0, no copyleft) y `d3-geo` 2.0.2 (BSD-3). No llegan a producción |
| `@turf/difference` | 7.4.0 | Restar la tierra de los países vecinos (ADR-0005) | MIT; `polyclip-ts` 0.16.8 (MIT) |
| `@turf/simplify` | 7.4.0 | Simplificar los polígonos generados | MIT |
| `@turf/bbox` | 7.4.0 | Rectángulos de consulta derivados | MIT |
| `@turf/distance` | 7.4.0 | Referencia de las pruebas del haversine propio (ADR-0004). Antes en `dependencies` (movida en C-A, R-10) | MIT; también llega a producción como transitiva de `@turf/point-to-polygon-distance` |
| `eslint` | **10.12.0** (2026-10-02) | Lint del servidor, `src/shared` y la página | engines `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| `@eslint/js` | 10.0.1 | Reglas recomendadas | peer `eslint ^10` |
| `globals` | 17.13.0 | Globales de Node y del navegador por directorio | engines `>=18` |
| `eslint-plugin-no-unsanitized` | **4.1.5** (MPL-2.0) | Bloquea `innerHTML` y similares (RNF-07, AM-26) | peer `eslint ^9 \|\| ^10`. MPL-2.0 de archivo, solo en desarrollo |
| `prettier` | **3.9.10** (2026-10-10) | Formato | engines `>=14`. Ver A8 |
| `vitest` | **5.0.3** (2026-09-30) | Pruebas unitarias y de integración | engines `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`; peer **`vite ^6.4 \|\| ^7 \|\| ^8` (obligatorio)**. Ver A2 y A11 |
| `vite` | **8.3.4** (2026-10-08) | *Peer* obligatorio de Vitest 5 (no se usa como empaquetador) | engines `^20.19.0 \|\| >=22.12.0` |
| `@playwright/test` | **1.64.0** (2026-10-07, Apache-2.0) | E2E en Chromium (revisión 1248) y Firefox 157.0 (revisión 1555) | engines `>=20`; la documentación admite Node 22, 24 y 26. Ver A6 |
| `@axe-core/playwright` | **4.13.0** (2026-08-11, MPL-2.0) | Análisis de accesibilidad en la E2E (`AxeBuilder`, etiquetas `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`; RNF-12) | Consulta 2026-10-11, confirmada el 2026-10-12. npm: dist-tag `latest` = 4.13.0 (`next`/`rc` son *snapshots* `-sha`, no estables). Sin `engines`; peer `playwright-core >= 1.0.0` (resuelve la 1.64.0 del lock, *deduped*). Depende de `axe-core ~4.13.0`. Mantenimiento: último commit en GH dequelabs/axe-core-npm el 2026-10-09. GHSA: ninguno. MPL-2.0: copyleft débil por archivo, compatible con AGPL-3.0 (MPL §3.3) y solo en desarrollo. **Firmada en T6.1.** Ver A10 |
| `axe-core` (transitiva de la anterior) | **4.13.0** (2026-08-05, MPL-2.0) | Motor de reglas de axe | npm: existe 4.14.0 (2026-10-05), pero `@axe-core/playwright` 4.13.0 pide `~4.13.0`, y 4.13.0 es el último parche de esa rama. engines `>=4`. Sin GHSA. **Firmada en T6.1.** Ver A10 |
| `@vitest/coverage-v8` | **5.0.3** (2026-09-30, MIT) | Cobertura con el proveedor V8 (`npx vitest run --coverage`) | npm: peer **`vitest` 5.0.3 exacto** (coincide con el lock); peer `@vitest/browser` opcional (no se instala). GHSA del repositorio: ninguno afecta a `@vitest/coverage-v8`; los de `vitest`/`@vitest/mocker` 5.x se corrigieron en 5.0.0-rc.2 y los de `@vitest/browser` (no instalado) en betas anteriores a 5.0.0. **Firmada en T6.1.** Ver A11 |
| `@redocly/cli` | **2.62.1** (2026-10-09, MIT) | `npm run api:lint` sobre `docs/api/openapi.yaml` | engines `>=22.12.0`. Verificado: el contrato pasa el lint (2026-10-12) |
| Escáner de dependencias | `npm audit --omit=dev --audit-level=high` y `npm audit signatures` (incluidos en npm) | `npm run audit:prod`, dentro de `npm run check` | AM-25 |

**ESLint frente a Biome (2.5.15):** se elige ESLint porque `eslint-plugin-no-unsanitized` hace cumplir automáticamente la regla de «ningún `innerHTML` con datos externos». Biome no tiene una regla equivalente para DOM sin React.

**TypeScript:** no se usa en la entrega 1 (JavaScript + JSDoc; ADR-0001). Si se añade `checkJs`, la versión se consulta en ese momento y se registra aquí.

## Datos de terceros versionados

| Dato | Versión | Uso | Licencia | Verificación |
|---|---|---|---|---|
| Natural Earth 10m `admin_0_countries` | **v5.1.2** (2022-05-13; sin versiones posteriores) | Entrada del script de zonas (ADR-0005). El resultado está en `src/shared/zonas.js` (`META_ZONAS.fuente`) | Dominio público | SHA-256 `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255` (13 287 234 bytes), comprobado el 2026-10-10 y registrado en `META_ZONAS.fuente.sha256` |

## Matriz de compatibilidad verificada

- [x] **Node 24.21.0 y 26.x ↔ Hono 4.13.13** (`>=16.9.0`) y **@hono/node-server 2.1.4** (`>=20`, peer `hono ^4`).
- [x] **Node 24.21.0 y 26.x ↔ ws 8.22.0** (`>=10.0.0`, sin dependencias).
- [x] **Node 24.21.0 y 26.x ↔ Vitest 5.0.3** (`^24.0.0 || >=26.0.0`) **↔ Vite 8.3.4** (peer `^8.0.0`; Vite exige `>=22.12.0`).
- [x] **Node 24.21.0 y 26.x ↔ ESLint 10.12.0** (`>=24`), **@eslint/js 10.0.1** y **no-unsanitized 4.1.5** (peer `^10`).
- [x] **Node 24.21.0 y 26.x ↔ Playwright 1.64.0** (`>=20`; la documentación oficial lista 22, 24 y 26) y **@redocly/cli 2.62.1** (`>=22.12.0`).
- [x] **Vitest 5.0.3 ↔ @vitest/coverage-v8 5.0.3** (peer exacto `5.0.3`). Verificado el 2026-10-11: `npx vitest run --coverage` genera el informe. Firmado en T6.1.
- [x] **Playwright 1.64.0 ↔ @axe-core/playwright 4.13.0** (peer `playwright-core >= 1.0.0`, resuelve 1.64.0 *deduped*, comprobado con `npm ls` el 2026-10-12) **↔ axe-core 4.13.0** (`~4.13.0`). Firmado en T6.1.
- [x] **Playwright 1.64.0 ↔ Firefox 157.0 (revisión 1555) en Linux Mint 22.3.** La documentación oficial (playwright.dev/docs/intro, consulta 2026-10-11) admite Ubuntu 22.04, 24.04 y 26.04 (x86-64 y arm64); Mint no figura, y Playwright descarga la build `firefox-ubuntu-24.04.zip` con el aviso «OS is not officially supported». Instalado sin sudo en `~/.cache/ms-playwright/firefox-1555`; Firefox trae sus propias NSS, así que **no hace falta `install-deps`**. La E2E completa pasa (Firefox 86/86 en `04bb0c8`). Firmado en T6.1.
- [x] **Turf 7.4.0:** todos los módulos a la misma versión; JS puro, válido en Node.
- [x] **Leaflet 1.9.4:** UMD con `L` global; compatible con `script-src 'self'` servido localmente.
- [x] **WebSocket nativo de Node 24:** existe, pero no expone `ping()` (comprobado con `node -e`). Por eso se usa `ws`.
- [x] **Seguridad:** `hono` ≥ 4.13.11, `@hono/node-server` ≥ 2.1.3 y `ws` ≥ 8.21.0 incluyen las correcciones de todos los GHSA publicados hasta el 2026-10-12 (GH security-advisories). Leaflet no tiene avisos.
- [x] **Contrato:** `npm run api:lint` → válido (2026-10-12).
- [x] **Hecho (antes «pendiente T4.1»):** `npm ci`, `npm audit --omit=dev --audit-level=high` (0) y `npm audit signatures` (170 verificadas) con el `package-lock.json` real; `npm ls --omit=dev` lista solo las 6 dependencias de producción (2026-10-12).
- [ ] **Pendiente (ADR-0003, ventana del 2026-10-28 al 2026-11-15):** aplicar el plan de migración a Node 26 LTS de abajo. **Prueba previa con 26.11.1 (*Current*) el 2026-10-12:** `vitest run` da 1334 de 1335; la única que falla es `tests/integracion/permisos.test.js` («el servidor arranca… con esos permisos»), porque sin `--allow-net` el `listen` en loopback lanza `ERR_ACCESS_DENIED`. Con `--allow-net`, el servidor arranca, carga 30 días de EMSC y USGS (703 sismos en memoria) y `/api/salud` da las tres fuentes en `ok`.

## Plan de migración a Node 26 LTS (ADR-0003, actualizado en T6.1)

**Hallazgo (2026-10-12, Node 26.11.1).** Desde Node 25.0.0, el modelo de permisos también restringe la red: `--permission` sin `--allow-net` impide **escuchar** (incluso en `127.0.0.1`) y conectar. Con el `npm start` actual, el proceso registra `proceso.excepcion` («Access to this API has been restricted. Use --allow-net…») y sale con código 1 por la política de `uncaughtException` (arquitectura §7). `--allow-net` es **booleano** (no admite una lista de destinos) y está en estabilidad 1.1 (*Active development*): Node escribe un `ExperimentalWarning` en stderr al arrancar. Fuentes: nodejs.org/api/cli.html#--allow-net y nodejs.org/api/permissions.html (documentación v26.11.1, consultada el 2026-10-12) y prueba local con el binario oficial 26.11.1 (SHA-256 comprobado con `SHASUMS256.txt`).

**Riesgo mientras tanto:** `engines` (`>=24.21.0 <27`) ya admite la 26. Si alguien hace `nvm use 26` antes de aplicar el plan, `npm start` no arranca. Hasta la migración se usa **solo 24.21.0** (`.nvmrc`).

**Pasos** (una tarea de backend-senior, más investigador-stack y QA, entre el 2026-10-28 y el 2026-11-15):
1. **investigador-stack:** `versiones.py nodejs` y ND → último parche 26.x LTS. Comprueba que `engines` de Vitest, Vite, ESLint, Playwright y Redocly siguen admitiendo esa versión.
2. **backend-senior** (código y pruebas, fuera del alcance de T6.1):
   - añade `--allow-net` a `npm start` (`package.json`) y a los scripts que copian sus opciones: `scripts/rendimiento/arranque-real.js`, `medir-servidor.js` y `sesion-real.js`;
   - adapta `tests/integracion/permisos.test.js`: hoy exige que toda opción `--allow-*` sea `--allow-fs-read=./…`. Debe admitir **exactamente** `--allow-net`, seguir prohibiendo `--allow-fs-write`, `--allow-child-process`, `--allow-worker`, `--allow-addons` y `--allow-wasi`, y comprobar `process.permission.has('net') === true`;
   - en Node 24, `--allow-net` no existe. Como `.nvmrc` y el lock cambian a la vez que `package.json`, no hace falta compatibilidad simultánea con las dos ramas: `engines` pasa a `>=26.<parche> <27`;
   - opcional: un mensaje claro en español si el arranque falla con `ERR_ACCESS_DENIED` (HU-12), en lugar de la traza de `proceso.excepcion`.
3. **QA:** `npm ci && npm run check` y la E2E completa (Chromium y Firefox) con la 26; repite la medición de memoria del tope (arquitectura §5.5, `scripts/rendimiento/medir-servidor.js`), porque cambia la versión de V8.
4. **arquitecto-seguridad:** actualiza AM-31 y S-04 (b) en `docs/seguridad/`: con `--allow-net` la red queda abierta entera; no hay lista de destinos posible en la 26. Lo que sí se gana frente a la 24 es que la red pasa a ser un permiso explícito.
5. **Director:** `nvm install 26 && nvm alias default 26 && nvm use`; `node -v` debe coincidir con el lock.
6. **arquitecto-software:** actualiza este lock (fila de runtime, `.nvmrc`, A1) y firma.

**Si la 26 rompe algo más** (por ejemplo, una dependencia), se aplica el punto 5 del ADR-0003: se queda la 24 con una excepción en A1 y revisión mensual, como mucho hasta el 2027-04-30.

## Entorno local (Linux Mint 22.3)

- **Node con nvm** (0.40.4 instalado; última v0.40.8). Versiones instaladas: `v24.15.0` y `v24.21.0`; el alias `default` apunta a `24.21.0`.
  - **Recomendación:** `nvm uninstall 24.15.0`, que no es el último parche y le faltan dos versiones de seguridad (24.17.0 y 24.18.1).
  - Ojo: los shells no interactivos de los agentes pueden resolver `node` a `v24.15.0`. Hay que exportar `PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH` o ejecutar `nvm use` (lee `.nvmrc`) y comprobar `node -v`.
- **Migración a 26:** solo con el plan de arriba.
- **Playwright:** `npx playwright install chromium firefox` (sin sudo; los navegadores van a `~/.cache/ms-playwright`). **No usar `--with-deps`** ni `install-deps`: piden sudo y en este equipo no hacen falta (comprobado el 2026-10-11 para Chromium y Firefox). Ver A6.

## Advertencias y excepciones

| # | Componente | Motivo | ADR | Estado / revisión |
|---|---|---|---|---|
| A1 | Node.js 24 → 26 | Hacia el 2026-10-30 a la 24 le quedarán menos de 18 meses, y la 26 será LTS el 2026-10-28. **T6.1:** el release de la entrega 1 sale en 24.21.0 (la 26 aún no es LTS). La migración necesita `--allow-net` en `npm start` y un cambio de prueba (ver el plan) | **ADR-0003** (nota de actualización T6.1) | **Abierta hasta la migración.** Punto de control el 2026-10-28; fecha límite el 2026-11-15 |
| A2 | Vitest | Antes se fijaba la 4.1.11 por `@cloudflare/vitest-pool-workers` (`vitest ^4.1.0`). **Esa restricción desaparece con Cloudflare.** Se fija la **5.0.3**: dist-tag `latest` en su día y compatible con Node 24 y 26. La 4.x sigue mantenida como plan B. Vitest 5 exige `vite` como *peer* no opcional: se añade 8.3.4 | No (librería) | **Cerrada.** Revisión trimestral |
| A3 | Hono | Existe 5.0.0-rc.0 (2026-10-08). Se mantiene la 4.x estable. Cuando salga la 5.0.0, se vigilará el soporte de la 4.x y se planificará la migración con un ADR | No | 2027-01-10 |
| A4 | Leaflet | La 1.9.4 es la última estable (más de 3 años). La 2.0 sigue en alfa y rompe la API (ESM, sin `L` global). No se adopta un alfa | No | 2027-01-10 |
| A5 | vercel CLI | **Retirado** del lock: Vercel está descartado | — | **Cerrada** |
| A6 | Playwright en Mint 22.3 | No tiene soporte oficial en la distribución; usa los binarios de Ubuntu 24.04. **T6.1:** Chromium (revisión 1248) y Firefox 157 (revisión 1555) se instalan y ejecutan sin sudo; la E2E completa pasa (172/172 en `04bb0c8`). Si una versión futura fallara, la E2E se ejecuta en un Ubuntu 24.04 | No | **Cerrada para la entrega 1.** Se revisa en cada subida de Playwright |
| A7 | Productos sin EOL publicado | Hono, `ws`, Leaflet, Turf, Vitest, Vite, Playwright, ESLint, Prettier, Redocly, `@vitest/coverage-v8` y axe no publican fechas de EOL. Se aplica el criterio de librerías: estable, mantenida en los últimos 12 meses (todas lo cumplen) y compatible con Node 24 y 26 | No | Trimestral |
| A8 | Prettier 3.9.10 | Se publicó el 2026-10-10 y se adoptó con horas de antigüedad. Sin regresiones en toda la Fase 4 y 5 (`npm run lint` en verde) | No | **Cerrada** (T6.1) |
| A9 | Natural Earth v5.1.2 | Dato de 2022 sin versiones posteriores. No incluye la Isla de Alborán ni el Peñón de Vélez dentro de España: se completan con `scripts/datos/territorios-extra.geojson` (ADR-0005; `META_ZONAS.correcciones`) | ADR-0005 | **Cerrada** (T4.2). Se revisa si sale una versión nueva |
| A10 | `@axe-core/playwright` y Firefox | (1) `axe-core` queda en 4.13.0 aunque existe la 4.14.0, porque el envoltorio 4.13.0 fija `~4.13.0`; se sube cuando salga `@axe-core/playwright` 4.14.x (el 2026-10-12, `latest` sigue siendo 4.13.0). No se usa `overrides` para no desalinear el envoltorio. (2) Los fallos de Firefox de la primera ejecución (`teclado`, `tema`, `filtros`, `carga`) los corrigió QA: Firefox 86/86 sin `fixme` en `04bb0c8` | No | (1) abierta, revisión trimestral; (2) **cerrada** (T6.1) |
| A11 | `vitest` y `@vitest/coverage-v8` 5.0.4 | Publicadas el **2026-10-12 a las 09:45Z**, el mismo día de la firma. Es un parche con funciones experimentales y correcciones (cobertura del navegador, `--changed`, caché), sin GHSA. La política pide el último parche, pero **no se cambia una herramienta de pruebas el día del release**: el lock firma 5.0.3, la que validó toda la Fase 5. Se suben juntas (peer exacto) en la próxima tarea que toque el lock, como muy tarde en la migración a Node 26, con `npm run check` en verde | No | Abierta; se cierra en la migración a Node 26 (2026-11-15) |

## Cómo se hace cumplir

- `package.json`:
  - `"type": "module"`;
  - `"engines": { "node": ">=24.21.0 <27" }`, que admite la transición del ADR-0003 (ojo con A1: en la 26 hace falta `--allow-net`);
  - **versiones exactas**, sin `^` ni `~`, para todo lo de este lock.
- `.nvmrc` con la versión exacta del lock: hoy `24.21.0`.
- `.npmrc` con `ignore-scripts=true`, `engine-strict=true` y `save-exact=true`.
- `package-lock.json` versionado en git; siempre `npm ci`.
- `npm run check` = lint + pruebas + `api:lint` + `npm audit --omit=dev --audit-level=high`.
- Las versiones mínimas por seguridad (`hono` ≥ 4.13.11, `@hono/node-server` ≥ 2.1.3, `ws` ≥ 8.21.0) se revisan en cada actualización.

## Próxima revisión

- **Punto de control anticipado:** 2026-10-28 (Node 26 LTS, ADR-0003); migración como muy tarde el 2026-11-15.
- **Trimestral:** 2027-01-10.
- **Última actualización:** 2026-10-12 (T6.1: firma del release de la entrega 1; filas de T5.0L firmadas; A6, A8, A9 y A10 (2) cerradas; A11 nueva; plan de migración a Node 26 con `--allow-net`).
- **Responsable de la revisión:** investigador-stack. **Firma:** arquitecto-software, 2026-10-12.
