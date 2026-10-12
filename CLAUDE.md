# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

**Monitor de Riesgos Naturales** (`monitor-riesgos-naturales`), versión 2: sismos en tiempo real para España (incluye Canarias, Baleares, Ceuta y Melilla), Colombia y Panamá. Es un servidor local en Node.js con Hono y una página con Leaflet, sin paso de build (JavaScript con JSDoc). Todo el texto visible está en español.

- **Solo uso local:** el servidor escucha únicamente en `127.0.0.1` y no se publica en internet (decisión del Director). El proyecto vive en `/home/conserje/terremotos`; no lo devuelvas a `/var/www/html` (AM-32).
- La página v1 («Terremotos en vivo», un `index.html` estático) ya no forma parte del proyecto.

## Comandos

Node: la versión exacta de `.nvmrc` (24.21.0) vía nvm. En shells no interactivos `nvm use` puede fallar; usa `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`.

| Comando | Para qué |
|---|---|
| `npm ci` | Instala las versiones exactas |
| `npm start` | Servidor en `http://localhost:3000` con `--permission` (solo lectura de `package.json`, `src/`, `public/` y `node_modules/`) |
| `npm run dev` | Igual, con `--watch` y **sin** `--permission` (incompatibles en Node 24) |
| `npm test` | Vitest: pruebas unitarias e integración, sin red |
| `npx vitest run tests/unit/shared/reglas.test.js` | Un solo archivo; añade `-t "nombre"` para una sola prueba |
| `npx vitest run --coverage` | Cobertura; hay umbrales por carpeta en `vitest.config.js` que no deben bajar |
| `npm run test:e2e` | Playwright en Chromium y Firefox (puerto 3013, red simulada). La primera vez: `npx playwright install chromium firefox` |
| `npx playwright test tests/e2e/filtros.spec.js --project=chromium` | Una sola E2E |
| `npm run lint` / `npm run format` | ESLint (incluye `no-unsanitized`) y Prettier. Prettier no revisa `*.md` ni `docs/` |
| `npm run api:lint` | Valida `docs/api/openapi.yaml` con Redocly |
| `npm run check` | lint + pruebas + contrato + `npm audit` de producción |
| `npm run perf:pagina -- carga\|rafaga` | Medición estricta de rendimiento (RNF-01 y RNF-03); necesita antes `node scripts/rendimiento/servidor-sintetico.js` |
| `npm run zonas` | Regenera `src/shared/zonas.js` desde Natural Earth; es reproducible y no lleva fecha |

Variables de entorno: ver `.env.example` y la tabla del README. `FUENTES_ACTIVAS=no` arranca sin consultar fuentes.

## Arquitectura

La fuente de verdad es [docs/01-arquitectura.md](docs/01-arquitectura.md), junto con los ADR de [docs/adr/](docs/adr/) y el contrato [docs/api/openapi.yaml](docs/api/openapi.yaml). Resumen del flujo:

1. **Fuentes** (`src/server/fuentes/`):
   - WebSocket de EMSC (`emsc-ws.js`, paquete `ws`) para el tiempo real;
   - consultas FDSN periódicas a EMSC cada 30 s y a USGS cada 60 s (`planificador.js`, con `updatedafter`);
   - todo pasa por los normalizadores hacia `crearRegistro` de `src/shared/modelo.js`.
2. **Catálogo en memoria** (`src/server/dominio/catalogo.js`):
   - quita duplicados entre fuentes (`src/shared/duplicados.js`: ≤ 30 s, ≤ 100 km, ΔM ≤ 1.0; precedencia agencia nacional > EMSC > USGS);
   - asigna país con las zonas de `src/shared/zonas.js` (franja marina de 100 km; en CO-PA un sismo puede tener dos `paisesCandidatos`);
   - retiene 30 días, con un tope de 15 000 sismos e histéresis del 95 %;
   - emite `alta`, `actualizacion` y `baja`.
3. **HTTP** (Hono, `src/server/http/`):
   - `GET /api/sismos` se envía en trozos;
   - `GET|HEAD /api/stream` es SSE con `Last-Event-ID`, `event: latido` cada 20 s y como máximo 8 clientes (después responde 503); el difusor está en `src/server/stream/difusor.js`;
   - `GET /api/salud`;
   - estáticos de `public/`, `/shared/` desde `src/shared` y Leaflet desde `node_modules`.
4. **Página** (`public/js/`, módulos ES sin build):
   - `cargador.js` hace la carga inicial y `stream.js` mantiene el `EventSource`;
   - `estado.js` guarda el estado, y `agrupador.js` pinta como mucho una vez por `requestAnimationFrame` de forma incremental sobre `lista.js` (virtualizada) y `mapa.js`;
   - `avisos.js` gestiona la Notification API: umbral M ≥ 4.5 redondeado a un decimal, como mucho 3 por minuto y después un resumen.

### Reglas que no se pueden romper

- **`src/shared/` es puro:** sin imports de npm ni de `node:`, y sin globales de navegador ni de Node; ESLint lo impone. Lo usan el servidor y la página (servido en `/shared/`). Las dependencias como Turf se inyectan desde `src/server/geo/`.
- **Reglas en un solo sitio:** filtros, opciones y avisos viven en `src/shared/reglas.js`. La lista usa la **magnitud cruda** (`cumpleFiltroLista`) y los avisos la **redondeada** (`cumpleFiltroAviso`); los dos miran `paisesCandidatos`. No dupliques constantes ni predicados en la página ni en el servidor.
- **CSP estricta**, con un middleware propio y no `secureHeaders`: nada de scripts ni estilos inline, ni atributos `style=`. Prohibido `innerHTML` con datos externos; usa `textContent` o nodos DOM. El enlace «Más info» lo construye el servidor a partir del id.
- **Seguridad del servidor:** lista blanca de `Host` (responde 421), `Origin` y `Sec-Fetch-Site` en `/api/*` (responde 403), solo GET y HEAD, y guardia de rutas crudas contra el recorrido de directorios. Antes de tocar `src/server/http/`, revisa [docs/seguridad/amenazas.md](docs/seguridad/amenazas.md).
- **Errores:** una `uncaughtException` apaga de forma ordenada y sale con código 1 (`src/server/infra/apagado.js`). Los fallos de una fuente o de un lote no tumban el proceso.
- **Versiones:** solo las de [STACK.lock.md](STACK.lock.md), firmado, con versiones exactas en `package.json`. Una dependencia nueva requiere la política de versiones y una licencia compatible con la AGPL.
- **Node 26:** `npm start` **no arranca** en Node ≥ 25 sin `--allow-net`. No cambies de versión sin aplicar el plan de migración del STACK.lock (ventana del 2026-10-28 al 2026-11-15).
- Hay que mantener el aviso «Solo informativo. No es un sistema de alerta temprana…» y la atribución de EMSC, USGS y Esri («Powered by Esri»).

## Git y licencia

- Repositorio público: https://github.com/wpadillav/monitor_riesgos_naturales. Licencia **AGPL-3.0-or-later** ([LICENSE](LICENSE)). Toda dependencia nueva debe tener una licencia compatible con la AGPL.
- Los commits van **solo a nombre de `wpadillav`**, con la identidad local del repositorio. No añadas `Co-Authored-By` ni ninguna otra atribución a Claude, ni en commits ni en PRs. Esta regla se aplica también a los encargos a subagentes.
- Git ignora `.claude/` y `.fabrica/`. `tests/` sí se versiona.

## Entorno de Claude (`.claude/`)

El directorio `.claude/` contiene el marco "Fábrica de Software": subagentes, comandos, skills y hooks. Su configuración está en [.claude/settings.json](.claude/settings.json).

- **Hook SessionStart:** inyecta [.claude/hooks/contexto-coordinador.md](.claude/hooks/contexto-coordinador.md) en cada sesión. Ese archivo define el rol de coordinador, el flujo por fases con aprobaciones 🔒 del Director y las reglas, y obliga a comunicarse en español. No se duplica aquí: ese archivo es la fuente de verdad.
- **Hook PreToolUse (Bash):** [.claude/hooks/guardian-comandos.sh](.claude/hooks/guardian-comandos.sh) bloquea con salida 2 estos comandos:
  - `rm -rf` sobre `/` o el home;
  - push forzado o borrado de `main`/`master`/`develop`/`release`;
  - `DROP`/`TRUNCATE` sobre bases de producción;
  - `mkfs`/`dd` a discos;
  - leer `.env` de producción.

  Si te bloquea, pide al usuario que ejecute el comando él mismo; no intentes rodear el bloqueo.
- **Estado del proyecto:** [.fabrica/estado.md](.fabrica/estado.md). El plan está en [docs/02-plan.md](docs/02-plan.md) y el PRD en [docs/00-prd.md](docs/00-prd.md). La entrega 1 (sismos) está terminada y la entrega 2 (tsunamis y filtro por radio) está planificada.
- Los subagentes que trabajan en *worktrees* deben usar puertos distintos y no ejecutar `pkill -f`: solo `kill <pid>` de sus propios procesos.
