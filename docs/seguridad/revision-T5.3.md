# Revisión de seguridad T5.3 — Entrega 1 frente al modelo de amenazas

**Autor:** arquitecto-seguridad · **Fecha:** 2026-10-11 · **Código revisado:** `main`, commit `9a0e7cd` · **Modelo:** [amenazas.md](amenazas.md) v0.1, con las diferencias de [01-arquitectura.md](../01-arquitectura.md) §14 y el contrato [openapi.yaml](../api/openapi.yaml).

**Alcance:** todas las amenazas de la tabla §6 (35 identificadores: AM-01 a AM-36, sin AM-33, que se fusionó con AM-22), revisión estática de `src/`, `public/`, `package.json`, `.npmrc` y `package-lock.json`, y pruebas dinámicas contra el servidor real (`PORT=3007 npm start`, con `--permission` y las fuentes activas).

**No se ha hecho:** ningún cambio de código ni de git. Las E2E (Playwright) no se han reejecutado porque las está corriendo T5.1 en paralelo con su propio servidor. Donde una mitigación depende de una E2E, se indica la prueba y se completa con verificación estática o dinámica. La prueba de RNF-09 desde **otro equipo** de la LAN la tiene que hacer el Director: aquí se probó la IP LAN desde el propio equipo.

---

## 1. Evidencia global

| Comprobación | Comando | Resultado |
|---|---|---|
| Pruebas | `npm test` | **32 archivos, 1001 pruebas, todas en verde** (25,5 s) |
| Linter | `npx eslint .` y `npm run lint` (ESLint + Prettier) | **exit 0**, sin avisos; «All matched files use Prettier code style!» |
| Auditoría (producción, bloqueante) | `npm audit --omit=dev --audit-level=high` | **0 vulnerabilidades**, exit 0 |
| Auditoría completa (informativa) | `npm audit` | **0 vulnerabilidades** |
| Firmas del registro | `npm audit signatures` | 156 paquetes con firma verificada y 61 con *attestation* (en `main`); 73 *attestations* en la instalación limpia. **Ninguna firma inválida** |
| Instalación limpia | `npm ci` en una copia de `package.json`, `package-lock.json` y `.npmrc` (directorio temporal) | **exit 0**, 0 vulnerabilidades |
| SBOM | `npm sbom --sbom-format cyclonedx --omit=dev` en esa copia limpia | CycloneDX 1.5 generado. En el checkout de `main` **falla** (ver S-02) |
| Dependencias de producción | `npm ls --omit=dev --depth=0` | `@hono/node-server` 2.1.4, 3 módulos `@turf` 7.4.0, `hono` 4.13.13, `leaflet` 1.9.4 y `ws` 8.22.0. Con transitivas, 22 paquetes: MIT, BSD-2-Clause (Leaflet), Unlicense (`robust-predicates`) y 0BSD (`tslib`); todas compatibles con AGPL-3.0 |
| Rangos de versión | `grep -c '"\^\|"~' package.json` | 0 |
| Wrangler y Vercel | `grep -ci "wrangler\|vercel" package-lock.json` | 0 (I2 cerrada) |
| Secretos | `git grep` de patrones de claves, *tokens* y llaves privadas | Ninguno. `.env` no existe y está en `.gitignore`. `gitleaks` no está instalado |

---

## 2. Verificación de AM-01 a AM-36

Leyenda de estado: **Cumple** = implementada, con prueba automática y verificada en esta revisión. **Cumple (deuda)** = implementada y verificada, pero a la prueba automática le falta algo que pedía el modelo. **Parcial** = falta una parte de la mitigación. **Abierta** = no implementada.

| ID | ¿Implementada? | Dónde | Prueba que la verifica | Verificación dinámica o estática (T5.3) | Estado |
|---|---|---|---|---|---|
| AM-01 XSS almacenado | Sí | `public/js/dom.js` (`crear`: `textContent`, `setAttribute`, sin `style` ni `on*`); `public/js/mapa.js` `contenidoVentana` → `L.popup().setContent(nodo)` con un **HTMLElement**; CSP §7.1 | E2E `tests/e2e/carga.spec.js:48` («texto malicioso»); vigilancia de `dialog`, `securitypolicyviolation`, consola y `pageerror` en **todas** las E2E (`tests/e2e/apoyo.js:273-300`); lint `no-unsanitized` (`tests/lint/reglas.test.js`) | `grep -rn "innerHTML\|outerHTML\|insertAdjacentHTML" public/ src/` → solo el comentario de `dom.js:3`. El único HTML como cadena es el prefijo **constante** de la atribución (`mapa.js:302`, enlace a Leaflet) y la atribución constante de Esri. CSP presente en todas las respuestas. Lint en verde | Cumple (deuda S-03: el fixture solo trae 1 de los 3 *payloads* de `lugar`) |
| AM-02 Enlace «Más info» | Sí | `src/shared/enlaces.js` (`urlFicha` con plantilla fija + `encodeURIComponent`; `esUrlFichaValida` con regex anclada); `src/shared/modelo.js` construye `url` desde el id; `mapa.js:155` repite la comprobación; `rel="noopener noreferrer"` | `tests/unit/shared/enlaces.test.js:4,39` (tabla con `javascript:`, mayúsculas, espacios, `data:`, `//evil`, dominio parecido); E2E `carga.spec.js:48` y `:63` | `grep -rn "'url'\|'detail'" src/server/fuentes` → vacío: el `url` y el `detail` de las fuentes no se leen nunca | Cumple (ver S-05, informativo) |
| AM-03 JSON malformado o tipo inesperado | Sí | `src/server/fuentes/http-cliente.js` (status y `Content-Type` antes de parsear, `JSON.parse` en `try/catch`); `normalizar-comun.js` `recorrerColeccion` (`FORMATO`); `emsc-ws.js` `interpretarMensaje` (nunca lanza); `index.js` `unhandledRejection` | `http-cliente.test.js:153,168`; `normalizadores.test.js:106`; `emsc-ws.test.js:165,360`; `tests/integracion/sismos.test.js:273` (fuente caída → 200 con las demás; usa `ign/georss-504-cloudfront.html`) | Arranque real: `carga.inicial sismos=488 fallos=0`; las tres fuentes en `ok` | Cumple |
| AM-04 Respuesta gigante o infinita | Sí | `http-cliente.js`: `MAX_BYTES_FDSN` = 32 MiB, rechazo previo por `Content-Length`, lectura en *streaming* con corte; tiempo límite 10 s (`FUENTE_TIMEOUT_MS`, 1 000–15 000); `MAX_FEATURES` = 20 000 | `http-cliente.test.js:184` (40 MiB → `LIMITE_TAMANO`), `:200` (respuesta sin fin → 10 s); `normalizadores.test.js:260` (límite de *features*) | Revisión de código: los límites no son configurables por encima de esos valores. El límite de 4 MiB del *summary* de USGS no aplica: ambas fuentes usan FDSN | Cumple |
| AM-05 Datos fuera de esquema y prototipo | Sí | `src/shared/modelo.js` `crearRegistro` (objeto nuevo campo a campo, rangos, id con patrón, tiempo ≤ ahora + 10 min); `src/shared/texto.js` `sanear` (C0, C1, DEL y bidi; 200 caracteres); `normalizar-comun.js` `propia()` (solo propiedades propias). Primitivas en `src/shared` y normalizadores por fuente (arquitectura §14) | `modelo.test.js:62`; `normalizadores.test.js:163` (`__proto__` y propiedades extra); `texto.test.js:4`; lint que prohíbe `Object.assign` en `src/server/fuentes/` | `grep` de `Object.assign`, `structuredClone` y *spread*: ninguno sobre datos crudos (solo sobre objetos internos ya validados). `sanear('a‮b⁦c‏d؜e\u001b[2Jf\u0085g h…')` → sin bidi, C0 ni C1 | Cumple |
| AM-06 MITM o TLS desactivado | Sí | URL constantes `https://`/`wss://` (`emsc-fdsn.js`, `usgs-fdsn.js`, `emsc-ws.js`); `http-cliente.js` rechaza lo que no es `https://` y usa `redirect: 'error'` (3xx = `REDIRECCION`); `ws` con `followRedirects: false`; `config.js` `checkProcess`; regla de lint para `rejectUnauthorized: false` | `config.test.js:112`; `fdsn.test.js:29`; `http-cliente.test.js:89,103,111`; `tests/lint/reglas.test.js` | `NODE_TLS_REJECT_UNAUTHORIZED=0 node src/server/index.js` → **exit 1** con «NODE_TLS_REJECT_UNAUTHORIZED=0 desactiva la verificación TLS…». `grep rejectUnauthorized src` → vacío | Cumple |
| AM-07 Sismo falso de una fuente legítima | Sí (daño limitado) | Popup: «Fuente: EMSC · autor: IGC» (`mapa.js:142`); notificación: «…Pulsa para verlo en el mapa.\nFuente: EMSC · autor: IGC. Solo informativo.» (`public/js/avisos.js:111-142`); aviso permanente «Solo informativo. No es un sistema de alerta temprana…» (`public/index.html:260`); límite de AM-22 | `tests/unit/public/avisos.test.js:70` (texto exacto); E2E `avisos.spec.js` y `carga.spec.js:63` | Revisión del texto: coincide con el formato aprobado por el Director. El aviso de resumen no lleva fuente (agrupa varios sismos) pero sí «Solo informativo.» | Cumple. Riesgo residual **medio**, aceptado por el Director |
| AM-08 Inyección de parámetros y SSRF | Sí | `src/server/http/rutas-sismos.js` (`validarConsulta`: 512 bytes, parámetros desconocidos o repetidos → 400; `leerFiltro`: listas cerradas, `Object.hasOwn` para `periodo`); `rutas-stream.js` (añade `avisoMin` y `ultimoId`); `fuentes/fdsn.js` (`URLSearchParams` con valores tipados y `numero()` que rechaza `NaN`/`Infinity`) | `tests/integracion/sismos.test.js:320`; `stream.test.js:210`; `fdsn.test.js:34` (URL exacta) | 21 casos con `curl`: `magMin=2%26format=xml`, `paises=ES&paises=ES`, `paises=XX`, `paises=ES,ES`, `paises=es`, `magMin=1e400`, `magMin=4.50`, `periodo=999d`, `periodo=__proto__`, `periodo=constructor`, `periodo=toString`, `radio=10`, parámetro desconocido, *query* de 520 bytes, `paises=ES%00`, sin `paises` → **400**; los válidos → 200. El cuerpo 400 no refleja la entrada (`<script>` no aparece) | Cumple |
| AM-09 Escucha en todas las interfaces | Sí | `src/server/config.js` (`HOSTS_LOOPBACK`: `127.0.0.1` o `::1`); `index.js` `serve({ hostname })`; `.env.example` | `config.test.js:85`; `tests/integracion/arranque.test.js:61,76` | `ss -tlnp` → solo `127.0.0.1:3007`. `curl http://192.168.40.12:3007/` → «Couldn't connect to server». `HOST=0.0.0.0`, `::`, `192.168.1.1` y `localhost` → exit 1 | Cumple (falta la prueba desde otro equipo: Director) |
| AM-10 DNS rebinding | Sí | `src/server/http/middlewares.js` `hostAllowlist`, global y antes de cualquier ruta | `tests/integracion/app.test.js:70-99`; `arranque.test.js:76` | `Host: evil.example:3007` → **421** en `/`, `/api/sismos` y `/api/stream`. `localhost` (sin puerto), `localhost.:3007`, `127.1:3007` y sin `Host` (HTTP/1.0) → 421. `Host` duplicado (en los dos órdenes) → 421. `localhost:3007`, `127.0.0.1:3007` y `[::1]:3007` → 200 | Cumple |
| AM-11 Abuso cross-site | Sí | `middlewares.js` `sameOriginOnly` en `/api/*` (incluidos `/api/salud` y el SSE); no se usa el middleware `cors` | `app.test.js:105-150`; `stream.test.js:245-261` | `Origin: http://localhost` (Apache, puerto 80), `https://evil.example` y `null` → **403**; `Sec-Fetch-Site: same-site` y `cross-site` → 403; `same-origin`, `none` y sin cabeceras → 200; `Origin` y `Sec-Fetch-Site` duplicados → 403; `/api/stream` con `Origin` ajeno → 403 **sin ocupar plaza**. Ninguna respuesta lleva `Access-Control-*` | Cumple (deuda S-03: falta la E2E con una página de otro puerto) |
| AM-12 CSRF | Sí (no hay endpoints que cambien estado) | `middlewares.js` `readOnlyMethods`, global | `app.test.js:190-201` | `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`, `TRACE` y `PROPFIND` sobre `/api/sismos` → **405** con `Allow: GET, HEAD`; `POST /` → 405; `CONNECT` lo corta Node | Cumple |
| AM-13 Clientes SSE ilimitados o lentos | Sí | `src/server/stream/difusor.js`: `MAX_CLIENTES` 8 (`SSE_MAX_CLIENTES`, 1–16), `ByteLengthQueuingStrategy` de 1 MiB y desconexión del cliente lento, **evento `latido` cada 20 s** (T5.0), cierre con `abort`; `rutas-stream.js`: 503 con `Retry-After: 10`, `HEAD` sin ocupar plaza. `@hono/node-server` respeta `drain` (`dist/index.mjs:777`), así que la contrapresión llega al `ReadableStream` y el límite de 1 MiB es efectivo | `difusor.test.js:613-725` (latido, plazas, 1 MiB); `stream.test.js:270,296,323,340` | 8 flujos abiertos → `clientesSse: 8`; el 9.º → **503** problem+json con `Retry-After: 10`; `HEAD` → 503 sin ocupar plaza; al cerrar uno → 7 y `HEAD` → 200; al cerrar todos → 0 (sin fugas). Latido recibido a los 20 s: `event: latido`, `data` con `datos: {}` y el id del último evento | Cumple |
| AM-14 `Last-Event-ID` manipulado | Sí, con los nombres del contrato | `difusor.js`: `PATRON_ID_EVENTO` `^([0-9a-z]{1,16})-([0-9]{1,15})$`, longitud ≤ 32 antes de evaluar; `planReanudacion` → `flujo.reiniciar`; historial de 2 000 eventos o 15 min | `difusor.test.js:602`; `stream.test.js:162,237` | `Last-Event-ID`: `abc`, `-1`, `1e309`, 20 dígitos, 5 000 caracteres, CRLF codificado y `__proto__` → `event: flujo.reiniciar`, sin excepción. `ultimoId` de 600 caracteres → 400 (límite de la *query*) | Cumple |
| AM-15 Inyección de campos SSE | Sí | `difusor.js` `formatearMensaje`: `id` y `event` internos (lista cerrada `TIPOS_EVENTO`), `data` = `JSON.stringify` en una línea; el latido no lleva datos | `difusor.test.js:201,679`; `stream.test.js:187` | Flujo real capturado: cada evento tiene una sola línea `data:` | Cumple |
| AM-16 Memoria del almacén | Sí | `src/server/dominio/catalogo.js` (`TOPE_SISMOS` 50 000, `MAX_RESPUESTA` 10 000, `purga` de índices); `retencion.js` (cada 60 s); `RETENCION_DIAS` ≤ 30 | `catalogo.test.js:419-470` (60 000 → 50 000 con aviso; 31 días → purga) | La medición de memoria (RNF-05, ≤ 300 MB) es de T5.4 | Cumple |
| AM-17 Ráfaga o frames enormes en el WebSocket | Sí (mejorada con `ws`, ADR-0002) | `src/server/fuentes/emsc-ws.js`: `maxPayload` 64 KiB (también tras *permessage-deflate*), medida antes de encolar y de parsear, `MAX_COLA` 1 000, `alDesbordar` → resincronización FDSN; lotes SSE de 250 ms | `emsc-ws.test.js:165,380` (10 000 frames → 1 000 en cola y 1 resincronización); `tests/integracion/emsc-ws-servidor.test.js:72` (frame de 1 MiB cortado por `ws`); `planificador.test.js:384`; `difusor.test.js:218` | — | Cumple. Se cierra la deuda de §8 (undici sin `maxPayload`) |
| AM-18 Amplificación hacia las fuentes | Sí (cobertura + *single-flight*, §14) | `src/server/fuentes/planificador.js`, `dominio/cobertura.js`, `consulta-sismos.js`; intervalos ≥ 30 s y ≥ 60 s validados en `config.js`; `Retry-After` acotado a 1 h | `planificador.test.js:323` (429 con `Retry-After: 120`), `:421`; `http-cliente.test.js:145`; `sismos.test.js:262` | `EMSC_FDSN_INTERVALO_S` < 30 o `USGS_INTERVALO_S` < 60 impiden arrancar (revisión de `config.js`) | Cumple |
| AM-19 Cabeceras y CSP | Sí | `middlewares.js` `SECURITY_HEADERS` (CSP literal de §7.1), sin HSTS ni COEP, `Cache-Control: no-store` en `/api/*`, se aplican también a 4xx y 5xx | `app.test.js:156-184`; vigilancia de CSP en las E2E | `curl -sI` sobre `/`, `/api/sismos`, `/api/stream` (HEAD) y un 404: **CSP literal** de §7.1, `nosniff`, `no-referrer`, `DENY`, COOP y CORP `same-origin`, `Permissions-Policy` de §7.2; sin `X-Powered-By`, sin HSTS, sin COEP | Cumple |
| AM-20 Leaflet desde un CDN | Sí | `src/server/http/estaticos.js` `LEAFLET_FILES` (7 rutas explícitas); `public/index.html` sin recursos externos; `integrity` sha512 de `leaflet` en `package-lock.json` | `app.test.js:207-229` | `grep -n "https://" public/*.html` → ningún `<script>` ni `<link rel=stylesheet>` externo. `/vendor/leaflet/leaflet.js` → 200; `/vendor/leaflet/leaflet-src.js` → 404 | Cumple |
| AM-21 Teselas de Esri y `Referer` | Sí | `img-src 'self' https://server.arcgisonline.com`; `Referrer-Policy: no-referrer`; atribución constante | `app.test.js:156` | Cabeceras presentes en todas las respuestas. En las E2E las teselas se simulan (`apoyo.js:194`) | Cumple |
| AM-22 Spam de notificaciones | Sí | Servidor: `notificable` solo fuera de la carga inicial y con hora de origen ≤ 60 min (`dominio/aviso.js`, `difusor.js`). Página: `public/js/avisos.js` (una vez por id, `trasladar` en fusiones, 3 por 60 s y resumen, umbral con magnitud redondeada, país marcado, `tag` = id) | `avisos.test.js:167`; `aviso-cobertura.test.js:14-38` (alta tardía de 30 h → no); `difusor.test.js:478`; E2E `avisos.spec.js:297` | — | Cumple |
| AM-23 Contenido de la notificación | Sí | `avisos.js`: `MAX_TEXTO` 120, `sanear`, `icon` propio (`/favicon.svg`), sin `image` ni `data` | `avisos.test.js:93` (lugar de 500 caracteres con bidi → ≤ 120 y sin bidi ni controles) | — | Cumple |
| AM-24 *DOM clobbering* o selectores | Sí | `public/js/lista.js` (`Map` por id y `WeakMap` botón → id; «Los ids externos nunca van al DOM»); `mapa.js` (`Map` de marcas) | Sin prueba automática (riesgo bajo; el modelo pedía revisión) | `grep -n "querySelector\|getElementById" public/` → solo selectores constantes; ningún `id` del DOM se construye con datos | Cumple |
| AM-25 Dependencias vulnerables o maliciosas | Sí | `package.json` con versiones exactas; `.npmrc` (`ignore-scripts`, `engine-strict`, `save-exact`); scripts `audit:prod`, `check` y `sbom` | Comandos (sección 1) | `npm ci` limpio exit 0; `npm audit` 0; firmas verificadas; 7 dependencias directas de producción (`ws` añadida por ADR-0002); sin `^` ni `~`; SBOM generado en la copia limpia | Cumple (S-02, baja) |
| AM-26 Regresión que el linter no detecta | Sí | `eslint.config.js` (`no-unsanitized/*`, `no-eval`, `no-implied-eval`, `no-new-func`, `no-script-url`, `document.write`, `rejectUnauthorized: false`, `Object.assign` en adaptadores), todo en `error` | `tests/lint/peligroso.js.txt` + `tests/lint/reglas.test.js:19` (prueba negativa) | `npx eslint .` → exit 0 en todo el proyecto | Cumple |
| AM-27 Preferencias corruptas | Sí | `public/js/preferencias.js` (`try/catch`, longitudes máximas, listas blancas, se descarta entero lo que no valida); `public/js/tema-inicial.js` (solo `oscuro`/`dia`, como `data-tema`) | `filtros-preferencias.test.js:172-216`; `avisos.test.js:363`; E2E `avisos.spec.js:164` | — | Cumple |
| AM-28 Trazas en las respuestas | Sí | `src/server/app.js` `onError` → `error-interno` (problem+json) con el detalle solo en el log y un `requestId`; `notFound` genérico; `errores.js` con catálogo cerrado que nunca refleja la entrada | `app.test.js:382` (sin `at ` ni `/home/`) | 404 y 400 con cuerpos fijos; el 400 no refleja `<script>` | Cumple |
| AM-29 Inyección en el terminal o en los logs | **Parcial** | `src/server/infra/log.js` (valores con `JSON.stringify`); limitador de descartes (`planificador.js`); no se registran textos libres de las fuentes | `planificador.test.js:542` (frecuencia). **No hay** la prueba del *logger* con `\x1b[2J` que pedía el modelo | `\x1b` y `\n` salen escapados en los dos formatos. **U+009B (CSI de 8 bits) pasa sin escapar** (ver S-01) | Parcial (S-01, baja) |
| AM-30 *Path traversal* en estáticos | Sí | `estaticos.js`: `rechazarRutasPeligrosas` global sobre la **ruta cruda** (`incoming.url`, hasta 3 capas de codificación, forma absoluta), `HIDDEN_SEGMENT`, rutas explícitas de Leaflet, `/shared/` solo `.js`; Hono 4.13.13 (≥ 4.13.11) y `@hono/node-server` 2.1.4 (≥ 2.1.3) | `app.test.js:207-347` (incluida la ruta cruda y un servidor HTTP real) | 40 rutas con `curl --path-as-is` y `nc`: `/..%2f.env`, `/%2e%2e/package.json`, `/..\package.json`, `/.git/HEAD`, `/vendor/leaflet/../../package.json`, `/node_modules/hono/package.json`, **`/shared/../shared/texto.js`** (el fallo corregido en T5.0), `%252e`, `%25252e`, `%c0%ae`, NUL, `//etc/passwd`, `/src/…`, `/package.json`, forma absoluta con `..` → **404**. Sin enlaces simbólicos en `public/`, `src/shared` ni `leaflet/dist` | Cumple |
| AM-31 Proceso con permisos de más | Sí (adoptado) | `package.json` `start`: `--permission` con lectura solo de `package.json`, `src/`, `public/` y `node_modules/`; `config.js` `checkProcess` (uid 0) | `tests/integracion/permisos.test.js:55-125` (sin `fs.write`, `child` ni `worker`; la app funciona); `config.test.js:108` | Servidor real con `--permission` y fuentes activas: carga inicial, WebSocket conectado y API sin `ERR_ACCESS_DENIED` | Cumple (residual: S-04) |
| AM-32 Apache sirve la carpeta del proyecto | **No** (pendiente del traslado del Director) | — | — | `http://localhost/terremotos/.git/HEAD` → **200**; `.git/config` → 200 con `name = wpadillav` y el correo del Director; `.git/logs/HEAD` → 200 (43 *commits* con el correo); `package.json`, `node_modules/…`, `docs/…`, `.claude/settings.json` y `.fabrica/estado.md` → 200. Apache escucha en `*:80` (por HTTPS, `.git/HEAD` da 404) | **Abierta.** Condición del release (sección 5) |
| AM-34 Repudio y diagnóstico | Sí | `Sismo.fuentes[]` con fuente, autor y `actualizadoEn` (`modelo.js` `componerSismo`); log `fuente.estado`; `http.rechazo` con cuenta por código; `normalizacion.descarte` por fuente y motivo | `planificador.test.js:542`; `app.test.js:407` | Log real: `fuente.estado` por fuente, `http.rechazo status=421/403/405 cuenta=…` como mucho una línea por minuto y código | Cumple |
| AM-35 Datos personales hacia las fuentes | Sí | `index.js`: `User-Agent: TerremotosEnVivo/2.0.0 (uso local; sin contacto)`, también en el WebSocket | `http-cliente.test.js:89` (sin `@`) | — | Cumple |
| AM-36 Presión sobre la CSP | Sí | `public/js/tema-inicial.js` externo y síncrono; sin `<script>` ni `style=""` inline; Leaflet usa CSSOM | `app.test.js:157` (CSP sin `unsafe-*`) y `:221` (sin inline); vigilancia de CSP en las E2E, incluido `tema.spec.js` | `grep -rn "<script>\|<style\|style=\"" public/` → vacío. No ha hecho falta la contingencia `style-src-attr` | Cumple |

**Resumen:** 33 cumplen (6 de ellas con deuda de prueba o un hallazgo bajo), 1 parcial (AM-29) y 1 abierta (AM-32, que depende del traslado).

---

## 3. Hallazgos nuevos

No hay hallazgos **críticos** ni **altos**. Todos los hallazgos tienen su corrección propuesta.

### S-01 · Baja · El *logger* no neutraliza los controles C1 (AM-29)

- **Ubicación:** `src/server/infra/log.js:44` (JSON) y `:47-50` (texto).
- **Problema:** los valores se serializan con `JSON.stringify`, que escapa U+0000–U+001F pero **no** U+007F–U+009F. U+009B es el CSI de 8 bits: algunos terminales en UTF-8 lo interpretan como el inicio de una secuencia de escape. El modelo pedía que el log saliera «sin esos bytes».
- **Reproducción:**
  ```
  node --input-type=module -e "import {createLog} from './src/server/infra/log.js'; const o=[]; createLog({salida:{write:l=>o.push(l)}}).error('error',{ruta:'/a\u009b31m'}); console.log(/\u009b/.test(o[0]))"
  → true
  ```
  El vector real es pequeño: `app.onError` registra `ruta: c.req.path`, y Hono **decodifica** `%C2%9B` en la ruta. Pero solo llega al log si una petición provoca una excepción no controlada. Los textos de las fuentes no se registran.
- **Impacto:** manipular la consola del Director (falsear o borrar líneas). Probabilidad baja, impacto 1–2.
- **Corrección** (en `log.js`, aplicada a la línea ya serializada en los dos formatos):
  ```js
  /** C1, DEL y separadores de línea Unicode: JSON.stringify no los escapa (AM-29). */
  const NO_IMPRIMIBLES = /[\u007f-\u009f  ]/g;
  const escapar = (linea) =>
    linea.replace(NO_IMPRIMIBLES, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  // …
  salida.write(`${escapar(JSON.stringify({ ts, nivel: nivelEvento, evento, version, ...campos }))}\n`);
  // y en el formato texto: salida.write(`${escapar(`${ts} … ${pares}`)}\n`);
  ```
  Añadir a `tests/unit/server/log.test.js` el caso del modelo: `{ ruta: '/a\x1b[2J\n\u009bX' }` en los dos formatos, comprobando que la línea no contiene `\x1b`, `\u009b` ni más de un `\n`.

### S-02 · Baja · El `node_modules` del checkout de `main` no coincide con el lock: `npm ls` y `npm run sbom` fallan (AM-25)

- **Ubicación:** `/var/www/html/terremotos/node_modules` (entorno, no código).
- **Reproducción:** `npm ls --depth=0` y `npm run sbom` → `ELSPROBLEMS`/`ESBOMPROBLEMS`: `missing: @axe-core/playwright@4.13.0`, `missing: @vitest/coverage-v8@5.0.3`. Las dos se añadieron en T5.0L y no se ha vuelto a ejecutar `npm ci` en `main`.
- **Impacto:** la evidencia de AM-25 (`npm ci` + SBOM) no se puede reproducir en el checkout principal; las pruebas pasan porque no usan esas dos dependencias. Además, `sbom.cdx.json` no está en `.gitignore` y se escribe en la carpeta que hoy publica Apache (AM-32).
- **Corrección:** ejecutar `npm ci` en `main` antes del cierre de la Fase 5. Añadir `sbom.cdx.json` a `.gitignore` (o versionarlo a propósito en `docs/`, si el Director lo quiere como entregable). La evidencia de esta revisión se tomó en una copia limpia: `npm ci` exit 0 y SBOM CycloneDX 1.5.

### S-03 · Baja · Huecos en las pruebas que pedía el modelo (AM-01, AM-11, AM-29)

Las mitigaciones están implementadas y verificadas a mano en esta revisión. Lo que falta son las pruebas automáticas que eviten regresiones:

1. **AM-01:** el modelo pedía el fixture `tests/fixtures/maliciosos/xss.json` con tres *payloads* de `lugar`: `<img src=x onerror=alert(1)>`, `"><svg onload=alert(1)>` y `<script>alert(1)</script>`. La E2E (`apoyo.js` `sismosEjemplo`) solo trae el primero. **Corrección:** añadir dos sismos al juego de ejemplo con los otros dos *payloads* y aserciones equivalentes a `carga.spec.js:48`. La vigilancia global de diálogos y CSP ya cubre la ejecución.
2. **AM-11:** falta la E2E «una página servida en otro puerto intenta `fetch('http://localhost:3000/api/sismos')` y `new EventSource(...)`; las dos fallan». Hoy solo hay integración con cabeceras simuladas, que no demuestra que el navegador envíe `Sec-Fetch-Site`. **Corrección:** en Playwright, servir con `page.route` una página en `http://localhost:<otro puerto>/` y comprobar el 403 (o el error de red) de las dos llamadas.
3. **AM-29:** falta la prueba del *logger* con secuencias ANSI (va con S-01).

### S-04 · Baja · Límites del *sandbox* de AM-31

- **Ubicación:** `package.json` (`scripts.dev`) y el modelo de permisos de Node 24.
- **Problema:** (a) `npm run dev` arranca **sin** `--permission`; (b) en Node 24 el modelo de permisos no restringe la red (`--allow-net` no existe en esta rama). Una dependencia comprometida podría abrir conexiones salientes y enviar lo que el proceso puede leer: el proyecto, `node_modules` y las variables de entorno (sin secretos).
- **Impacto:** bajo; no hay secretos y la lectura está limitada al proyecto.
- **Corrección:** (a) usar en `dev` los mismos `--allow-fs-read` que en `start` (`node --watch` es compatible con `--permission`) o documentar en el README que `dev` no tiene *sandbox*; (b) revisarlo en la migración a Node 26 (ADR-0003): si la rama LTS trae `--allow-net`, añadir una lista de destinos (`www.seismicportal.eu`, `earthquake.usgs.gov`). Riesgo residual registrado en `amenazas.md` §8.

### S-05 · Informativo · Ids formados solo por puntos

- **Ubicación:** `src/shared/enlaces.js:7` (`PATRON_ID_FUENTE = /^[A-Za-z0-9_.-]{1,64}$/`).
- **Observación:** `urlFicha('usgs', '..')` → `https://earthquake.usgs.gov/earthquakes/eventpage/..`, que el navegador resuelve como `https://earthquake.usgs.gov/earthquakes/`. El host no cambia, así que no hay XSS ni *phishing*: es solo un enlace roto con datos manipulados.
- **Corrección opcional:** `^(?!\.+$)[A-Za-z0-9_.-]{1,64}$` (y la misma restricción en `UrlFicha` del contrato).

### S-06 · Informativo · Robustez del saneado

- `sanear` no quita los caracteres de anchura cero U+200B–U+200D ni U+2060. No estaban en la lista de AM-05. Permitirían que una fuente comprometida mostrara un autor visualmente igual a otro, lo que no aporta nada a AM-07. **Opcional:** añadirlos a `PROHIBIDOS`.
- La clase `PROHIBIDOS` de `src/shared/texto.js:10` contiene las marcas bidi **como caracteres literales invisibles**. Funciona (comprobado), pero no se ve en una revisión de código (patrón «Trojan Source»). **Opcional:** escribirlas como `؜‎‏‪-‮⁦-⁩`.
- Las peticiones en forma absoluta con otra autoridad (`GET http://evil:3007/js/main.js` con `Host: localhost:3007`) se atienden con el `Host` válido. Los navegadores no envían esa forma a un servidor de origen, así que no sirve para *DNS rebinding*. No requiere acción.

---

## 4. Riesgo residual actualizado

| Amenaza | Residual (T5.3) | Cambio frente a §8 | Aceptación |
|---|---|---|---|
| AM-01, AM-02, AM-26 | **Baja**: escapado por construcción, CSP sin `unsafe-*` y lint bloqueante, verificados | = | Se acepta |
| AM-07 | **Media**: no se puede verificar la veracidad de una agencia | = | Aceptado por el Director (atribución «Fuente · autor» y «Solo informativo») |
| AM-09, AM-10, AM-11 | **Baja**: loopback, `Host` y `Origin`/`Sec-Fetch-Site` verificados en dinámico, incluidas las cabeceras duplicadas | = | Se acepta. Falta la prueba desde otro equipo de la LAN (Director) |
| AM-13 | **Baja**: un proceso local o 8 pestañas propias pueden ocupar las plazas; la página lo indica (`sin-plazas`) | Nuevo detalle | Se acepta (uso de un solo usuario) |
| AM-17 | **Baja**: `ws` con `maxPayload` de 64 KiB | **Baja la deuda**: se cierra lo de undici | Se acepta |
| AM-25 | **Media-baja**: *día cero* en una dependencia | = | Revisión trimestral del STACK.lock; `npm ci` en `main` (S-02) |
| AM-29 | **Baja**: C1 en el log solo con una excepción y una ruta manipulada | Nuevo (S-01) | Corregir en la Fase 6 |
| AM-31 | **Baja**: `--permission` adoptado; sin límite de red en Node 24 y sin *sandbox* en `dev` | Antes era «decisión en T4.8» | Se acepta (S-04) |
| AM-32 | **Alta mientras el proyecto siga en `/var/www/html`** (verificado hoy: `.git` con el correo del Director accesible por `*:80`); **ninguno** tras el traslado | = | Condición del release |
| AM-21 | Esri y las fuentes ven la IP del equipo | = | Se acepta (RNF-14) |

**Datos personales (Ley 1581 de 2012 y RGPD):** la aplicación no trata datos personales: no guarda ubicación ni datos de sismos en `localStorage`, no envía cabeceras con datos del usuario y el log no contiene textos libres. El único dato personal expuesto es la identidad de git del Director (nombre y correo institucional), por AM-32.

---

## 5. Veredicto

### **APROBADO CON CAMBIOS**

El código de la entrega 1 (`9a0e7cd`) implementa y prueba las mitigaciones del modelo de amenazas. Las 25 amenazas de riesgo medio o alto, salvo AM-32, están verificadas con pruebas automáticas y con comprobaciones dinámicas sobre el servidor real. No hay hallazgos críticos ni altos en el código.

**Condiciones:**

1. **Bloqueante para el release (no es del código): AM-32.** Antes de declarar la entrega como publicada, el Director traslada el proyecto fuera de `/var/www/html`, tal como tiene decidido. Verificación tras el traslado: `curl -s -o /dev/null -w '%{http_code}' http://localhost/terremotos/.git/HEAD` ≠ 200, y `pwd` del repositorio fuera de `/var/www/html`. Si en ese momento se quiere limpiar la exposición pasada, hay que tener en cuenta que el historial ya pudo copiarse desde la LAN: contiene el nombre y el correo del Director y ningún secreto.
2. **Con plan (Fase 6, no bloquean):** S-01 (escapado de C1 en el log y su prueba), S-02 (`npm ci` en `main` y `sbom.cdx.json` en `.gitignore`), S-03 (los tres huecos de prueba) y S-04 (`--permission` en `dev` o documentarlo).
3. **Opcionales:** S-05 y S-06.
