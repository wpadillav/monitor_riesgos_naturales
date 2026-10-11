# STACK.lock — Terremotos en vivo v2

> **Revisado y firmado por arquitecto-software (T3.1) el 2026-10-10.** Queda vinculante cuando el Director apruebe la Fase 3 🔒.
>
> Es la fuente de verdad de las versiones. Ningún agente usa otra versión sin un ADR aprobado, salvo la migración a Node 26 que ya autoriza el [ADR-0003](docs/adr/0003-version-de-node.md).
>
> - **Generado** con `politica-versiones/scripts/versiones.py` el 2026-10-10. Umbral: 18 meses.
> - **Redactado por** investigador-stack (T1.1). **Revisado** por arquitecto-software (T3.1). **Responsable:** arquitecto-software.
>
> Todas las consultas se hicieron **en vivo el 2026-10-10**. Abreviaturas de fuente:
> - **EOLd**: https://endoflife.date/api/v1/products/nodejs/ (a través de `versiones.py` y en directo).
> - **ND**: https://nodejs.org/dist/index.json.
> - **npm**: `npm view <paquete> version time engines peerDependencies license`, con npm 11.x contra registry.npmjs.org.
> - **GH**: API de GitHub (releases, commits y security-advisories del repositorio).
>
> **Actualización T5.0L (2026-10-11), investigador-stack:** se añaden `@axe-core/playwright` 4.13.0 (con `axe-core` 4.13.0) y `@vitest/coverage-v8` 5.0.3, y Firefox de Playwright. Consultas en vivo del **2026-10-11**. **Las filas marcadas con «T5.0L» están pendientes de revisión del arquitecto.**

## Cambios de T5.0L (2026-10-11) — pendiente de revisión del arquitecto para estas filas

1. **Se añaden como `devDependencies`** (versión exacta):
   - `@axe-core/playwright` **4.13.0**: accesibilidad automática en E2E (WCAG 2.2 AA, RNF-12). Arrastra `axe-core` **4.13.0**;
   - `@vitest/coverage-v8` **5.0.3**: cobertura de Vitest, misma versión exacta que `vitest`.
2. **Firefox de Playwright 157.0** (revisión 1555, la de `@playwright/test` 1.64.0): se instala sin sudo con `npx playwright install firefox`. No hace falta `install-deps`. Se añade el proyecto `firefox` a `playwright.config.js`. Ver A6 y A10.
3. `vitest.config.js` recibe la configuración mínima de cobertura (`provider: 'v8'`, sin umbrales: los fija QA).
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
4. **Prettier** pasa de 3.9.9 a **3.9.10**, el último parche, publicado hoy. Ver A8.
5. **Node:** se mantiene 24.21.0, con una migración planificada a 26 LTS (ADR-0003). Se cierra A1.
6. **Se resuelven** A1, A2 y A5; se mantienen A3, A4, A6 y A7; se añaden A8 y A9.

## Plataforma

| Componente | Versión (rama) | Parche fijado | LTS | EOL | Fuente (consulta 2026-10-10) | Notas |
|---|---|---|---|---|---|---|
| Sistema operativo (desarrollo y uso) | Linux Mint 22.3 «Zena» (base Ubuntu 24.04 «noble») | — | sí | 2029-04-30 (30,7 meses) | EOLd `linuxmint`; `/etc/os-release` | Es el único entorno: uso local |
| Runtime | **Node.js 24 «Krypton»** | **24.21.0** (2026-09-08, npm 11.19.0) | sí (LTS desde 2025-10-28; soporte activo hasta 2026-10-20) | **2028-04-30** (18,7 meses) | EOLd `nodejs`; ND | **Migración planificada a Node 26 LTS** entre el 2026-10-28 y el 2026-11-15, antes de la Fase 5 (ADR-0003). Instalado con nvm: `~/.nvm/versions/node/v24.21.0`, alias `default` → 24.21.0 |
| Runtime (destino ADR-0003) | Node.js 26 | Último parche 26.x **LTS** el día de la migración (hoy *Current*: 26.11.1 del 2026-10-07, npm 11.20.0) | Desde el **2026-10-28** | **2029-04-30** (≈ 30 meses) | EOLd `nodejs`; ND | No se usa hasta que sea LTS y pase la verificación del ADR-0003 |
| Framework del servidor | Hono 4.x | **4.13.13** (2026-10-04) | — (sin LTS formal) | No publica | npm `hono`; GH honojs/hono | engines `node >=16.9.0`. Mínimo por seguridad **≥ 4.13.11** (GHSA-5r4p-p66f-jhc7, `serveStatic`). Ver A3 (Hono 5 rc) |
| Adaptador Node | @hono/node-server 2.x | **2.1.4** (2026-10-08) | — | — | npm; GH honojs/node-server | engines `node >=20`, peer `hono ^4 \|\| ^5.0.0-0`. Mínimo por seguridad **≥ 2.1.3** (GHSA-rmxm-3fg6-px4f) |
| Gestor de paquetes | npm 11.x (el incluido con Node) | **11.19.0** (con Node 24.21.0; pasará a 11.20.x con Node 26) | — | Sigue a Node | ND | Sin pnpm ni yarn: pocas dependencias. Se usa siempre `npm ci` |
| Base de datos / caché | — | — | — | — | — | **No hay.** Estado en memoria del proceso, con retención de 30 días (arquitectura §5.5) |
| Contenedores / despliegue | — | — | — | — | — | No se usan. Arranque manual con `npm start` |

## Librerías de producción (`dependencies`)

| Paquete | Versión | Propósito | Licencia | Última release / mantenimiento | Alternativa evaluada |
|---|---|---|---|---|---|
| `hono` | 4.13.13 | Servidor HTTP, SSE (`hono/streaming`), cabeceras (`hono/secure-headers`) | MIT | 2026-10-04 | Express 5 o Fastify: el Director eligió Hono (plan §3.2, ADR-0001) |
| `@hono/node-server` | 2.1.4 | Adaptador Node y `serveStatic` | MIT | 2026-10-08 | Rama 1.19.x: descartada, porque la 2.x es la actual |
| `ws` | **8.22.0** | Cliente WebSocket de EMSC con *ping*/*pong* y `maxPayload` (ADR-0002) | MIT | 2026-09-26 (GH websockets/ws). Sin dependencias. Mínimo por seguridad **≥ 8.21.0** (GHSA-96hv-2xvq-fx4p, alto; GHSA-58qx-3vcg-4xpx, medio) | `WebSocket` nativo de Node (undici): no puede enviar *ping* ni limitar los frames (verificado el 2026-10-10) |
| `leaflet` | 1.9.4 | Mapa en la página. **Lo sirve el propio servidor** desde `node_modules/leaflet/dist` con rutas explícitas, sin CDN (amenazas §7.3) | BSD-2-Clause | 2023-05-18 (npm); commits activos en 2026-09 (GH) | 2.0.0-alpha.1 (prerelease, A4); MapLibre GL (WebGL, más peso) |
| `@turf/boolean-point-in-polygon` | 7.4.0 | País por contorno (ADR-0005) | MIT | 2026-08-03 | `@turf/turf` completo: demasiado grande |
| `@turf/point-to-polygon-distance` | 7.4.0 | Desempate en la frontera CO-PA (ADR-0005) | MIT | 2026-08-03 | Distancia propia a segmentos: más código que probar |
| `@turf/distance` | 7.4.0 | Haversine para duplicados (ADR-0004); en la entrega 2, filtro de radio | MIT | 2026-08-03 | Haversine propio (~10 líneas): válido, pero se elige Turf por coherencia |

Son **7 dependencias de producción**. Todos los módulos de Turf van a la **misma versión exacta (7.4.0)**, porque comparten `@turf/helpers`, `@turf/meta` e `@turf/invariant`.

## Librerías y herramientas de desarrollo (`devDependencies`)

| Herramienta | Versión | Uso | Fuente y compatibilidad (2026-10-10) |
|---|---|---|---|
| `@turf/buffer` | 7.4.0 | Franja marina, **solo en el script** `scripts/generar-zonas.js` | MIT. Transitivas `@turf/jsts` 2.7.2 (EDL-1.0 OR EPL-1.0, no copyleft) y `d3-geo` 2.0.2 (BSD-3). No llegan a producción |
| `@turf/difference` | 7.4.0 | Restar la tierra de los países vecinos (ADR-0005) | MIT; `polyclip-ts` 0.16.8 (MIT) |
| `@turf/simplify` | 7.4.0 | Simplificar los polígonos generados | MIT |
| `@turf/bbox` | 7.4.0 | Rectángulos de consulta derivados | MIT |
| `eslint` | **10.12.0** (2026-10-02) | Lint del servidor, `src/shared` y la página | engines `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| `@eslint/js` | 10.0.1 | Reglas recomendadas | peer `eslint ^10` |
| `globals` | 17.13.0 | Globales de Node y del navegador por directorio | engines `>=18` |
| `eslint-plugin-no-unsanitized` | **4.1.5** (MPL-2.0) | Bloquea `innerHTML` y similares (RNF-07, AM-26) | peer `eslint ^9 \|\| ^10`. MPL-2.0 de archivo, solo en desarrollo |
| `prettier` | **3.9.10** (2026-10-10) | Formato | engines `>=14`. Ver A8 |
| `vitest` | **5.0.3** (2026-09-30) | Pruebas unitarias y de integración | engines `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`; peer **`vite ^6.4 \|\| ^7 \|\| ^8` (obligatorio)**. Ver A2 |
| `vite` | **8.3.4** (2026-10-08) | *Peer* obligatorio de Vitest 5 (no se usa como empaquetador) | engines `^20.19.0 \|\| >=22.12.0` |
| `@playwright/test` | **1.64.0** (2026-10-07, Apache-2.0) | E2E en Chrome y Firefox | engines `>=20`; la documentación admite Node 22, 24 y 26. Ver A6 |
| `@axe-core/playwright` *(T5.0L, pendiente de revisión del arquitecto)* | **4.13.0** (2026-08-11, MPL-2.0) | Análisis de accesibilidad en la E2E (`AxeBuilder`, etiquetas `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`; RNF-12) | Consulta 2026-10-11. npm: dist-tag `latest` = 4.13.0 (`next`/`rc` son *snapshots* `-sha`, no estables). Sin `engines`; peer `playwright-core >= 1.0.0` (resuelve la 1.64.0 del lock, *deduped*). Depende de `axe-core ~4.13.0`. Mantenimiento: último commit en GH dequelabs/axe-core-npm el 2026-10-09. GHSA: ninguno (GH security-advisories de axe-core-npm y axe-core). MPL-2.0: copyleft débil por archivo, compatible con AGPL-3.0 (MPL §3.3) y solo en desarrollo. Ver A10 |
| `axe-core` (transitiva de la anterior) *(T5.0L)* | **4.13.0** (2026-08-05, MPL-2.0) | Motor de reglas de axe | Consulta 2026-10-11. npm: existe 4.14.0 (2026-10-05), pero `@axe-core/playwright` 4.13.0 pide `~4.13.0`, y 4.13.0 es el último parche de esa rama. engines `>=4`. Sin GHSA. Ver A10 |
| `@vitest/coverage-v8` *(T5.0L, pendiente de revisión del arquitecto)* | **5.0.3** (2026-09-30, MIT) | Cobertura con el proveedor V8 (`npx vitest run --coverage`) | Consulta 2026-10-11. npm: dist-tag `latest` = 5.0.3; peer **`vitest` 5.0.3 exacto** (coincide con el lock); peer `@vitest/browser` opcional (no se instala). Mantenimiento: último commit en GH vitest-dev/vitest el 2026-10-10. GHSA del repositorio: ninguno afecta a `@vitest/coverage-v8`; los de `vitest`/`@vitest/mocker` 5.x se corrigieron en 5.0.0-rc.2 y los de `@vitest/browser` (no instalado) en betas anteriores a 5.0.0 |
| `@redocly/cli` | **2.62.1** (2026-10-09, MIT) | `npm run api:lint` sobre `docs/api/openapi.yaml` | engines `>=22.12.0`. Verificado: el contrato pasa el lint (`recommended`) |
| Escáner de dependencias | `npm audit --omit=dev --audit-level=high` y `npm audit signatures` (incluidos en npm) | Auditoría en `npm run check` | AM-25 |

**ESLint frente a Biome (2.5.15):** se elige ESLint porque `eslint-plugin-no-unsanitized` hace cumplir automáticamente la regla de «ningún `innerHTML` con datos externos». Biome no tiene una regla equivalente para DOM sin React.

**TypeScript:** no se usa en la entrega 1 (JavaScript + JSDoc; ADR-0001). Si se añade `checkJs`, la versión se consulta en ese momento (hoy `typescript` 7.0.2) y se registra aquí.

## Datos de terceros versionados

| Dato | Versión | Uso | Licencia | Verificación |
|---|---|---|---|---|
| Natural Earth 10m `admin_0_countries` | **v5.1.2** (2022-05-13; sin versiones posteriores) | Entrada del script de zonas (ADR-0005) | Dominio público | SHA-256 `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255` (13 287 234 bytes), comprobado el 2026-10-10 |

## Matriz de compatibilidad verificada

- [x] **Node 24.21.0 y 26.x ↔ Hono 4.13.13** (`>=16.9.0`) y **@hono/node-server 2.1.4** (`>=20`, peer `hono ^4`).
- [x] **Node 24.21.0 y 26.x ↔ ws 8.22.0** (`>=10.0.0`, sin dependencias).
- [x] **Node 24.21.0 y 26.x ↔ Vitest 5.0.3** (`^24.0.0 || >=26.0.0`) **↔ Vite 8.3.4** (peer `^8.0.0`; Vite exige `>=22.12.0`).
- [x] **Node 24.21.0 y 26.x ↔ ESLint 10.12.0** (`>=24`), **@eslint/js 10.0.1** y **no-unsanitized 4.1.5** (peer `^10`).
- [x] **Node 24.21.0 y 26.x ↔ Playwright 1.64.0** (`>=20`; la documentación oficial lista 22, 24 y 26) y **@redocly/cli 2.62.1** (`>=22.12.0`).
- [x] **(T5.0L, pendiente de revisión del arquitecto) Vitest 5.0.3 ↔ @vitest/coverage-v8 5.0.3** (peer exacto `5.0.3`). Verificado el 2026-10-11: `npx vitest run --coverage` genera el informe (914 pruebas en verde).
- [x] **(T5.0L, pendiente de revisión del arquitecto) Playwright 1.64.0 ↔ @axe-core/playwright 4.13.0** (peer `playwright-core >= 1.0.0`, resuelve 1.64.0 *deduped*) **↔ axe-core 4.13.0** (`~4.13.0`). Importación de `AxeBuilder` comprobada con Node 24.21.0.
- [x] **(T5.0L, pendiente de revisión del arquitecto) Playwright 1.64.0 ↔ Firefox 157.0 (revisión 1555) en Linux Mint 22.3.** La documentación oficial (playwright.dev/docs/intro, consulta 2026-10-11) admite Ubuntu 22.04, 24.04 y 26.04 (x86-64 y arm64); Mint no figura, y Playwright descarga la build `firefox-ubuntu-24.04.zip` con el aviso «OS is not officially supported». Se instaló sin sudo en `~/.cache/ms-playwright/firefox-1555`. Firefox trae sus propias NSS: `ldd` no muestra bibliotecas del sistema que falten, así que **no hace falta `install-deps`**. Arranca (`firefox --headless --version` → `Mozilla Firefox 157.0`) y ejecuta la E2E (ver A10).
- [x] **Turf 7.4.0:** todos los módulos a la misma versión; JS puro, válido en Node.
- [x] **Leaflet 1.9.4:** UMD con `L` global; compatible con `script-src 'self'` servido localmente.
- [x] **WebSocket nativo de Node 24:** existe, pero no expone `ping()` (comprobado con `node -e`). Por eso se usa `ws`.
- [x] **Seguridad:** `hono` ≥ 4.13.11, `@hono/node-server` ≥ 2.1.3 y `ws` ≥ 8.21.0 incluyen las correcciones de todos los GHSA publicados hasta el 2026-10-10 (GH security-advisories). Leaflet no tiene avisos.
- [x] **Contrato:** `npx @redocly/cli@2.62.1 lint --config docs/api/redocly.yaml docs/api/openapi.yaml` → válido (2026-10-10).
- [ ] **Pendiente (T4.1):** `npm ci`, `npm audit --omit=dev --audit-level=high` y `npm audit signatures` con el `package-lock.json` real; `npm ls --omit=dev` debe listar solo las 7 dependencias de producción.
- [ ] **Pendiente (ADR-0003, ventana del 2026-10-28 al 2026-11-15):** `npm ci && npm run check && npm test` y la E2E en el último parche de 26 LTS, incluido el modelo de permisos (`--permission`).

## Entorno local (Linux Mint 22.3)

- **Node con nvm** (0.40.4 instalado; última v0.40.8). Versiones instaladas: `v24.15.0` y `v24.21.0`; el alias `default` apunta a `24.21.0`.
  - **Recomendación:** `nvm uninstall 24.15.0`, que no es el último parche y le faltan dos versiones de seguridad (24.17.0 y 24.18.1).
  - Ojo: los shells no interactivos de los agentes resolvían `node` a `v24.15.0` el 2026-10-10. T4.1 debe ejecutar `nvm use` (lee `.nvmrc`) y comprobar `node -v`.
- **Migración a 26** (cuando el ADR-0003 lo indique): `nvm install 26 && nvm alias default 26 && nvm use`. Después, `node -v` debe coincidir con el lock.
- **Playwright:** `npx playwright install chromium firefox` (sin sudo; los navegadores van a `~/.cache/ms-playwright`). **No usar `--with-deps`** ni `install-deps`: piden sudo y en este equipo no hacen falta (comprobado el 2026-10-11 para Chromium y Firefox). Ver A6.

## Advertencias y excepciones

| # | Componente | Motivo | ADR | Estado / revisión |
|---|---|---|---|---|
| A1 | Node.js 24 | Hacia el 2026-10-30 le quedarán menos de 18 meses, y Node 26 será LTS el 2026-10-28. | **ADR-0003**: migración a 26 LTS entre el 2026-10-28 y el 2026-11-15, antes de la Fase 5 | **Cerrada por el ADR-0003.** Punto de control el 2026-10-28 |
| A2 | Vitest | Antes se fijaba la 4.1.11 por `@cloudflare/vitest-pool-workers` (`vitest ^4.1.0`). **Esa restricción desaparece con Cloudflare.** Según la política (última estable, mantenida y compatible), se fija la **5.0.3**: 4 parches desde la 5.0.0 (2026-09-03), dist-tag `latest`, y compatible con Node 24 y 26. La 4.x sigue mantenida (`V4` = 4.1.11) como plan B si la 5 diera problemas. Vitest 5 exige `vite` como *peer* no opcional: se añade 8.3.4 | No (librería) | **Cerrada.** Revisión trimestral |
| A3 | Hono | Existe 5.0.0-rc.0 (2026-10-08). Se mantiene la 4.x estable. Cuando salga la 5.0.0, se vigilará el soporte de la 4.x y se planificará la migración con un ADR | No | 2027-01-10 |
| A4 | Leaflet | La 1.9.4 es la última estable (más de 3 años). La 2.0 sigue en alfa y rompe la API (ESM, sin `L` global). No se adopta un alfa | No | 2027-01-10 |
| A5 | vercel CLI | **Retirado** del lock: Vercel está descartado | — | **Cerrada** |
| A6 | Playwright en Mint 22.3 | No tiene soporte oficial en la distribución; usa los binarios de Ubuntu 24.04. Si falla, la E2E se ejecuta en un Ubuntu 24.04. **T5.0L (2026-10-11):** Chromium 156 y Firefox 157 se instalan y ejecutan sin sudo ni dependencias del sistema | No | T5.1 |
| A7 | Productos sin EOL publicado | Hono, `ws`, Leaflet, Turf, Vitest, Vite, Playwright, ESLint, Prettier, Redocly, `@vitest/coverage-v8` y axe (T5.0L) no publican fechas de EOL. Se aplica el criterio de librerías: estable, mantenida en los últimos 12 meses (todas lo cumplen) y compatible con Node 24 y 26 | No | Trimestral |
| A8 | Prettier 3.9.10 | Publicada el **2026-10-10 a las 08:35Z** (horas de antigüedad). La política pide el último parche. Si T4.1 detecta una regresión, se fija la 3.9.9 (2026-09-23) y se anota aquí. Solo afecta al formato, en desarrollo | No | T4.1 |
| A10 *(T5.0L, pendiente de revisión del arquitecto)* | `@axe-core/playwright` y Firefox | (1) `axe-core` queda en 4.13.0 aunque existe la 4.14.0, porque el envoltorio 4.13.0 fija `~4.13.0`; se sube cuando salga `@axe-core/playwright` 4.14.x. No se usa `overrides` para no desalinear el envoltorio. (2) La primera ejecución en Firefox (2026-10-11) dio 45 de 48 en verde; fallan de forma estable `teclado.spec.js` (foco en la lista con Tab) y `tema.spec.js` (`emulateMedia` con tema oscuro), y de forma intermitente `filtros.spec.js` y `carga.spec.js` (RNF-03) con el equipo cargado. Lo corrige QA (Fase 5) | No | T5.1 |
| A9 | Natural Earth v5.1.2 | Dato de 2022 sin versiones posteriores. No incluye la Isla de Alborán ni el Peñón de Vélez dentro de España: se completan con `scripts/datos/territorios-extra.geojson` (ADR-0005) | ADR-0005 | T4.2 |

## Cómo se hace cumplir (para T4.1)

- `package.json`:
  - `"type": "module"`;
  - `"engines": { "node": ">=24.21.0 <27" }`, que admite la transición del ADR-0003;
  - **versiones exactas**, sin `^` ni `~`, para todo lo de este lock.
- `.nvmrc` con la versión exacta del lock: hoy `24.21.0`.
- `.npmrc` con `ignore-scripts=true` y `engine-strict=true`.
- `package-lock.json` versionado en git; siempre `npm ci`.
- `npm run check` = lint + pruebas + `npm audit --omit=dev --audit-level=high`.
- Las versiones mínimas por seguridad (`hono` ≥ 4.13.11, `@hono/node-server` ≥ 2.1.3, `ws` ≥ 8.21.0) se revisan en cada actualización.

## Próxima revisión

- **Trimestral:** 2027-01-10.
- **Última actualización:** 2026-10-11 (T5.0L, herramientas de calidad; pendiente de revisión del arquitecto para esas filas).
- **Punto de control anticipado:** 2026-10-28 (Node 26 LTS, ADR-0003).
- **Responsable de la revisión:** investigador-stack. **Firma:** arquitecto-software.
