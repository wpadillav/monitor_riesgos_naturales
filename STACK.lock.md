# STACK.lock — Terremotos en vivo v2

> **BORRADOR — pendiente de revisión por arquitecto-software (Fase 3, T3.1).** Ninguna versión es vinculante hasta su aprobación.
>
> Fuente de verdad de versiones. Ningún agente usa otra versión sin un ADR aprobado.
> Generado con `politica-versiones/scripts/versiones.py` el 2026-10-10 · Umbral: 18 meses · Responsable: arquitecto-software · Redactado por: investigador-stack (T1.1)
>
> Todas las consultas se hicieron el **2026-10-10**. Abreviaturas de fuente:
> - **EOLd**: https://endoflife.date/api/v1/products/nodejs/ (a través de `versiones.py`).
> - **ND**: https://nodejs.org/dist/index.json.
> - **npm**: `npm view <paquete> version time engines peerDependencies license`, con npm 11.x contra registry.npmjs.org.
> - **GH**: API de GitHub (releases, commits y security-advisories del repositorio).

## Plataforma

| Componente | Versión (rama) | Parche fijado | LTS | EOL | Fuente (consulta 2026-10-10) | Notas |
|---|---|---|---|---|---|---|
| Sistema operativo (desarrollo) | Linux Mint 22.3 «Zena» (base Ubuntu 24.04 «noble») | — | sí | 2029-04-30 (30,7 meses) | EOLd `linuxmint`; `/etc/os-release` | Es el entorno local del Director, no un objetivo de despliegue. |
| Runtime | **Node.js 24 «Krypton»** | **24.21.0** (2026-09-07, npm 11.19.0) | sí (LTS desde 2025-10-28) | **2028-04-30** (18,7 meses). El soporte activo termina el 2026-10-20 y desde entonces pasa a mantenimiento. | EOLd `nodejs`; ND | **Ver advertencia A1.** La alternativa es Node 26: será LTS el 2026-10-28, tiene EOL el 2029-04-30 y su último parche es 26.11.1. |
| Framework backend | Hono 4.x | **4.13.13** (2026-10-04) | — (sin LTS formal) | No publica fecha | npm `hono`; GH honojs/hono | engines `node >=16.9.0`. Mínimo por seguridad **≥ 4.13.11** (GHSA-5r4p-p66f-jhc7, `serveStatic`). Ya hay una 5.0.0-rc.0 (2026-10-08): ver advertencia A3. |
| Adaptador Node | @hono/node-server 2.x | **2.1.4** (2026-10-08) | — | — | npm `@hono/node-server`; GH honojs/node-server | engines `node >=20`, peer `hono ^4 \|\| ^5.0.0-0`. Mínimo por seguridad **≥ 2.1.3** (GHSA-rmxm-3fg6-px4f, `serveStatic`). |
| Frontend (mapa) | Leaflet 1.9 | **1.9.4** (2023-05-18) | — | — | npm `leaflet` (dist-tag `latest` = 1.9.4); GH Leaflet/Leaflet | **No hay ninguna 2.x estable.** Solo existen 2.0.0-alpha (2025-05-18) y 2.0.0-alpha.1 (2025-08-16). El repositorio sigue activo (último commit 2026-09-19). Ver advertencia A4. |
| Despliegue Cloudflare | Wrangler 4.x | **4.149.0** (2026-10-08) | — | — | npm `wrangler`; GH cloudflare/workers-sdk | engines `node >=22.0.0`. Publica varias versiones por semana, así que el parche se actualiza en cada revisión. El último aviso alto (GHSA-36p8-mvp6-cv38) está corregido desde la 4.59.1. |
| Despliegue Vercel (opcional) | vercel CLI 63.x | **63.1.2** (2026-10-09) | — | — | npm `vercel` | engines `node >=20`. La mayor 63 se publicó el 2026-10-08: ver advertencia A5. Solo se instala si el ADR-003 elige Vercel. |
| Gestor de paquetes | npm 11.x (el incluido con Node) | **11.19.0** (incluido en Node 24.21.0) | — | Sigue a Node | ND (campo `npm`); npm `npm` (12.2.0 existe) | No hay una razón fuerte para pnpm o yarn: pocas dependencias y Vercel y Cloudflare detectan npm sin configuración. No se fija la 12.x para no separarse del npm que trae Node. |
| Base de datos / caché | — | — | — | — | — | No hay base de datos. El caché será Workers KV o el caché en memoria, según el ADR-003 (T1.4). |
| Contenedores | — | — | — | — | — | No se usan. |

## Librerías principales

| Paquete | Versión | Propósito | Licencia | Última release | Alternativa evaluada |
|---|---|---|---|---|---|
| `hono` | 4.13.13 | Servidor HTTP portable (Node, Workers, Vercel) | MIT | 2026-10-04 (npm) | Express 5: solo funciona en Node y no es portable a Workers. Se descarta por la decisión de §3.2 del plan. |
| `@hono/node-server` | 2.1.4 | Adaptador de Hono para ejecutar en local | MIT | 2026-10-08 (npm) | Rama 1.19.x (dist-tag `latest-1`, 1.19.17): se descarta porque la 2.x es la actual y la 1.x ha tenido más avisos de `serveStatic`. |
| `leaflet` | 1.9.4 | Mapa en la página | BSD-2-Clause | 2023-05-18 (npm); commits activos 2026-09 (GH) | 2.0.0-alpha.1: se descarta por ser prerelease (ver A4). MapLibre GL: se descarta por WebGL, mayor peso y una API distinta sin necesidad. |
| `@turf/boolean-point-in-polygon` | 7.4.0 | Filtro preciso por contorno de país | MIT | 2026-08-03 (npm) | `@turf/turf` completo (7.4.0): se descarta por su tamaño; solo se necesitan 3 módulos. |
| `@turf/distance` | 7.4.0 | Filtro de radio (haversine) | MIT | 2026-08-03 (npm) | Un haversine propio (~10 líneas) también sería válido; se elige Turf por coherencia y porque ya está probado. |
| `@turf/buffer` | 7.4.0 | Ampliar los polígonos con la franja marina | MIT. **Dependencia transitiva `@turf/jsts` 2.7.2 con licencia (EDL-1.0 OR EPL-1.0)**; `d3-geo` 2.0.2 con BSD-3-Clause | 2026-08-03 (npm) | Recomendación: usarlo **solo en un script de preparación** (devDependency) que genere los GeoJSON ampliados, para no enviar jsts al Worker ni al navegador. EDL-1.0 es una licencia tipo BSD y no es copyleft: se puede usar en este proyecto. |

Todos los módulos de Turf se fijan a la **misma versión exacta (7.4.0)**, porque comparten `@turf/helpers` y `@turf/invariant` 7.4.0.

## Herramientas de calidad

| Herramienta | Versión | Uso | Fuente (consulta 2026-10-10) |
|---|---|---|---|
| Linter | `eslint` **10.12.0** (2026-10-02) con `@eslint/js` 10.0.1 y `globals` 17.13.0 | Análisis estático de JS (servidor y página) | npm. engines `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| Regla de seguridad | `eslint-plugin-no-unsanitized` **4.1.5** (MPL-2.0, Mozilla) | Bloquea `innerHTML`, `insertAdjacentHTML` y similares con datos no escapados. Es el criterio de T4.5 y el punto 3.6 del plan. | npm. peer `eslint ^9 \|\| ^10`. Licencia MPL-2.0 de archivo: solo se usa en desarrollo, sin impacto. |
| Formateador | `prettier` **3.9.9** (MIT) | Formato | npm. engines `node >=14` |
| Pruebas unitarias | `vitest` **4.1.11** (2026-08-18, MIT) | Pruebas del módulo compartido y de los adaptadores | npm. engines `^20 \|\| ^22 \|\| >=24`; peer `vite ^6 \|\| ^7 \|\| ^8`. **Ver advertencia A2** (Vitest 5.0.3 descartada por ahora). |
| Pruebas E2E | `@playwright/test` **1.64.0** (2026-10-07, Apache-2.0) | E2E de filtros, tsunamis simulados y notificaciones | npm. engines `>=20`. Requisitos oficiales: Node 22, 24 o 26 en su último parche; Ubuntu 22.04, 24.04 o 26.04 (`docs/src/intro-js.md`, rama main). Ver advertencia A6. |
| Escáner de dependencias | `npm audit --omit=dev` (incluido en npm 11.19.0) | Auditoría en el CI | Skill seguridad-owasp |

**ESLint frente a Biome (2.5.15):** se elige ESLint porque `eslint-plugin-no-unsanitized` hace cumplir automáticamente la regla de «ningún `innerHTML` con datos externos». Biome no tiene una regla equivalente para DOM sin React. El costo es tener una dependencia más (Prettier).

## Matriz de compatibilidad verificada

- [x] **Node 24.21.0 ↔ Hono 4.13.13**: Hono exige `>=16.9.0` (npm `engines`).
- [x] **Node 24.21.0 ↔ @hono/node-server 2.1.4**: exige `>=20`. Su peer `hono ^4 || ^5.0.0-0` se cumple con la 4.13.13 (npm).
- [x] **Node 24.21.0 ↔ Wrangler 4.149.0**: Wrangler exige `>=22.0.0` (npm). **Node 20 queda excluido.**
- [x] **Node 24.21.0 ↔ Vitest 4.1.11**: `^20 || ^22 || >=24` (npm). Si se usara Vitest 5.0.3, exigiría `^22.12 || ^24 || >=26`.
- [x] **Node 24.21.0 ↔ Playwright 1.64.0**: `>=20` (npm). La documentación oficial pide el último parche de Node 22, 24 o 26.
- [x] **Node 24.21.0 ↔ ESLint 10.12.0**: `>=24` se cumple (npm).
- [x] **Node 24 ↔ Vercel Functions**: Vercel ofrece 24.x (por defecto), 22.x y 20.x. **No ofrece 26.x** (https://vercel.com/docs/functions/runtimes/node-js/node-js-versions, actualizada el 2026-02-27). Se fija con `"engines": {"node": "24.x"}`.
- [x] **Hono ↔ Cloudflare Workers**: está soportado oficialmente con Wrangler. Los estáticos se sirven con `"assets": { "directory": "public" }` en `wrangler.jsonc`, y hay que definir `compatibility_date` (https://hono.dev/docs/getting-started/cloudflare-workers). En Workers no se usa `@hono/node-server`.
- [x] **Hono ↔ Vercel**: funciona sin configuración con `export default app` y se despliega con `vc deploy` (https://hono.dev/docs/getting-started/vercel).
- [x] **Vitest ↔ pruebas en el runtime de Workers**: `@cloudflare/vitest-pool-workers` 0.23.0 tiene peer `vitest ^4.1.0` (npm). Esto confirma la elección de Vitest 4.1.x.
- [x] **Turf 7.4.0 en Workers y en el navegador**: es JS puro sin APIs de Node. `@turf/buffer` se usa solo en tiempo de preparación (recomendado).
- [x] **Leaflet 1.9.4**: es compatible con el `index.html` actual (API `L.*` y UMD). No requiere migración.
- [x] **Seguridad**: las versiones fijadas de `hono` (≥ 4.13.11) y `@hono/node-server` (≥ 2.1.3) incluyen la corrección de todos los avisos GHSA publicados hasta el 2026-10-10 (GH security-advisories). Leaflet no tiene avisos publicados (GH).
- [ ] **Pendiente (T4.1)**: ejecutar `npm audit` con el `package-lock.json` real y comprobar el tamaño del bundle del Worker.
- [ ] **Pendiente (T1.4 / ADR-003)**: confirmar los límites gratuitos. Este documento no los cubre.

## Entorno local (Linux Mint 22.3)

**Estado actual, verificado sin modificar nada:**
- `which node` → `/home/conserje/.nvm/versions/node/v24.15.0/bin/node`. Es un binario del usuario, así que **Node está instalado con nvm**.
- La versión de nvm instalada es la 0.40.4 (`~/.nvm/package.json`); la última es la v0.40.8 (2026-09-21, GH nvm-sh/nvm). nvm se carga desde `~/.bashrc`, líneas 136 a 138. El alias `default` apunta a `24`.
- No hay paquete `nodejs` de apt ni repositorios NodeSource. El Node del sistema no se toca.
- **v24.15.0 NO es el último parche.** Le faltan 6 versiones hasta la 24.21.0, y **dos de ellas son de seguridad**: 24.17.0 (2026-06-17) y 24.18.1 (2026-07-28), según ND.

**Recomendación: seguir con nvm**, que ya está instalado, trabaja en el home del usuario, no usa `sudo` y no interfiere con apt. Pasos para el Director; el agente no ha instalado nada:

```bash
nvm install 24.21.0          # descarga el último parche de la rama 24
nvm alias default 24.21.0    # opcional: fijarlo como predeterminado
nvm use                      # en el proyecto, lee .nvmrc (lo crea T4.1 con "24.21.0")
node -v                      # debe mostrar v24.21.0
# opcional: después de comprobarlo, nvm uninstall 24.15.0
```

Alternativas evaluadas: **fnm** es más rápido, pero obliga a migrar sin necesidad. **NodeSource (apt)** instala en todo el sistema con `sudo` y fija una sola versión. **Node 18 de apt en Ubuntu 24.04** está fuera de soporte. Se descartan las tres.

**Playwright en Mint:** `npx playwright install --with-deps chromium firefox` descarga los navegadores para `ubuntu24.04`, pero Playwright marca Mint como «no soportado oficialmente» (`packages/utils/hostPlatform.ts`, v1.64.0). Lo normal es que funcione. Si falla, la opción es ejecutar la E2E en el CI con Ubuntu 24.04.

## Advertencias y excepciones

| # | Componente | Motivo | ADR | Fecha de revisión |
|---|---|---|---|---|
| A1 | **Node.js 24** | Cumple la política **por muy poco**: 18,7 meses hoy, así que bajará de 18 meses hacia el **2026-10-30**. El **2026-10-28 Node 26 pasa a LTS**, con EOL el 2029-04-30 (≈ 30 meses). A partir de entonces la regla 1 de la política elegiría la 26. **Costo de quedarse en la 24:** unos 12 meses menos de soporte y una migración a la 26 antes del 2027-10 (la 24 tendrá < 6 meses de EOL a finales de 2027). Hoy no exige ningún cambio, sirve en Vercel y es compatible con todo el lock. **Costo de pasar a la 26:** Vercel aún no la ofrece, con lo que el local y Vercel quedarían desalineados (en Cloudflare no influye, porque Workers no usa Node). Además la 26 tendría pocos días como LTS al cerrar el lock, y Vitest 5 o Playwright la soportan, pero el ecosistema la ha probado menos. **Recomendación:** mantener **24.21.0** y registrar la excepción en un ADR de la Fase 3 por la regla 6 (coherencia con Vercel). Volver a evaluar en la revisión de 2027-01, o antes si Vercel publica la 26.x. Si el ADR-003 descarta Vercel, **subir a la 26 (último parche) a partir del 2026-10-28** es la opción que cumple la política sin excepción. | Pendiente (Fase 3) | 2026-10-28 |
| A2 | Vitest | Se elige la **4.1.11** y no la 5.0.3 (latest) por dos motivos: la 5.0.0 tiene solo 37 días (2026-09-03) y `@cloudflare/vitest-pool-workers` 0.23.0 exige `vitest ^4.1.0`. La 4.x sigue con mantenimiento (dist-tag `V4`, última release el 2026-08-18). Se migrará a la 5 cuando el pool de Workers la soporte. | No (librería) | 2027-01-10 |
| A3 | Hono | Hay una 5.0.0-rc.0 publicada (2026-10-08). Se mantiene la 4.x estable. Cuando salga la 5.0.0, hay que vigilar el soporte de la 4.x y planificar la migración con un ADR. | No | 2027-01-10 |
| A4 | Leaflet | La 1.9.4 es la última estable y tiene más de 3 años, pero el repositorio sigue activo. La 2.0 sigue en alfa sin fecha de versión estable (blog oficial, 2025-05-18). Rompe la API: pasa a ESM y elimina el global `L`, quita los métodos fábrica (`L.circleMarker()` pasa a `new CircleMarker()`), usa PointerEvents y obliga a `<script type="module">`. **No se adopta un alfa en producción.** Cuando salga la 2.0 estable, se evaluará con un ADR y el polyfill V1. | No | 2027-01-10 |
| A5 | vercel CLI | Publica versiones mayores con frecuencia (la 63.0.0 salió el 2026-10-08). Es opcional y conviene usarla como `devDependency` con versión exacta solo si el ADR-003 elige Vercel. | No | Al cerrar el ADR-003 |
| A6 | Playwright en Mint 22.3 | No tiene soporte oficial en la distribución; usa los binarios de Ubuntu 24.04. | No | T5.1 |
| A7 | Productos sin EOL publicado | Hono, Leaflet, Turf, Wrangler, Vitest, Playwright, ESLint y Prettier no publican fechas de EOL. Se aplica el criterio de librerías: estable, mantenida en los últimos 12 meses (todas lo cumplen) y compatible con Node 24. | No | Trimestral |

## Cómo se hace cumplir (para T4.1)

- `package.json`: `"engines": { "node": "24.x" }`, y **versiones exactas** (sin `^`) para las de este lock.
- `.nvmrc`: `24.21.0`.
- `package-lock.json` versionado en git.
- `wrangler.jsonc`: `compatibility_date` igual a la fecha de creación del Worker.
- CI: `actions/setup-node` con `node-version-file: .nvmrc`.

## Próxima revisión: 2027-01-10 (trimestral) · Punto de control anticipado: 2026-10-28 (Node 26 LTS, advertencia A1) · Responsable: investigador-stack
