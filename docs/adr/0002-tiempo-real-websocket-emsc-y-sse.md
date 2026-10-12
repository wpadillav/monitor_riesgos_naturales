# 0002. Tiempo real con el WebSocket de EMSC en el servidor y SSE hacia el navegador

- Estado: aceptado (Fase 3, 2026-10-10). Actualizado en T6.1 (2026-10-12) con la nota del final
- Fecha: 2026-10-10 · Decisores: arquitecto-software, Director

## Contexto

- **El objetivo** (O1, RNF-01 y RNF-02) es que un sismo aparezca en pantalla en segundos: p95 ≤ 2 s del servidor a la pantalla y ≤ 10 s desde la publicación en EMSC.
- **EMSC WebSocket** (investigación §2.1):
  - emite todo el mundo, sin filtros;
  - entrega cada publicación unos 2 s después;
  - el volumen es bajo (3 mensajes en 12,5 min);
  - envía `create` de eventos antiguos (altas tardías) y `update` de los ya publicados;
  - el ejemplo oficial usa un *ping* cada 15 s.
- **EMSC FDSN y USGS** admiten `updatedafter`, que cubre los huecos.
- **La página** solo debe hablar con su propio origen: CSP `connect-src 'self'` (amenazas §7.1, supuesto S3).
- **Decisión I1 del coordinador:** el WebSocket y el SSE son del servidor (T4.6, backend-senior). La página solo consume con `EventSource` (T4.6b).
- **Requisitos de resiliencia:**
  - RNF-06: primer reintento ≤ 5 s y espera máxima de 60 s;
  - 0 eventos perdidos tras un corte de 30 s entre la página y el servidor;
  - HU-02: la página se recupera sola.
- **El flujo es unidireccional**, del servidor a la página. Los filtros los fija la página al suscribirse.

## Opciones consideradas

1. **El servidor mantiene el WebSocket de EMSC y la página recibe por SSE (`EventSource`).**
   - Pros:
     - SSE es HTTP normal y unidireccional, que es justo lo que se necesita;
     - `EventSource` reconecta solo y reenvía `Last-Event-ID`;
     - Hono tiene `streamSSE`;
     - la CSP queda en `connect-src 'self'`;
     - hay una sola conexión con EMSC sea cual sea el número de pestañas.
   - Contras: el filtrado por cliente se hace en el servidor (lo exige igualmente HU-01).
2. **El servidor mantiene el WebSocket y la página recibe por WebSocket propio.**
   - Contras: es bidireccional sin necesidad; la reconexión y la reanudación habría que programarlas a mano; necesitaría otra librería de servidor.
3. **La página abre directamente el WebSocket de EMSC.**
   - Contras:
     - rompe la CSP y el supuesto S3;
     - duplica la normalización y la eliminación de duplicados en el navegador;
     - abre una conexión por pestaña.
   - Descartada por I1.
4. **Solo consulta periódica (sin WebSocket) y sondeo desde la página.**
   - Contras: latencia de 30 a 60 s; incumple RNF-02 en tiempo real.

**Cliente WebSocket en el servidor:**
- **a) `WebSocket` nativo de Node 24 (undici).**
  - Pros: sin dependencias.
  - Contras:
    - **no puede enviar *ping***: `typeof ws.ping === 'undefined'`, verificado el 2026-10-10;
    - no limita el tamaño de los frames (riesgo residual de AM-17).
  - Sin *ping*, una conexión medio abierta (sin FIN) pasa desapercibida: el volumen es tan bajo que el silencio no indica un fallo.
- **b) Paquete `ws` 8.22.0** (MIT, sin dependencias, mantenido; última versión el 2026-09-26).
  - Pros:
    - `ping()`/`pong` para detectar conexiones muertas;
    - `maxPayload` para limitar los frames (resuelve la deuda de AM-17);
    - es la librería de WebSocket más usada en Node.
  - Contras: una dependencia más.

## Decisión

**Opción 1 con el cliente `ws`.**

**Lado de las fuentes** (componente `fuentes/emsc-ws`):
- se conecta a `wss://www.seismicportal.eu/standing_order/websocket` con `maxPayload: 64 KiB` y sin seguir redirecciones;
- envía un *ping* cada 15 s y da la conexión por muerta si no llega el *pong* en 10 s;
- **reconexión con espera creciente y aleatoriedad**: 1 s, 2 s, 4 s… hasta un máximo de 60 s, con ±20 % de *jitter*. La espera vuelve a 1 s cuando la conexión lleva 60 s estable;
- cada frame se descarta si supera 64 KiB y, si no, se parsea con `try/catch`, se normaliza y se pasa al catálogo;
- la cola de entrada está acotada a 1 000 mensajes (AM-17).

Los huecos del WebSocket **no se recuperan con una lógica aparte**: los cubre la consulta periódica de EMSC FDSN, cada 30 s por zona con `updatedafter` (ver arquitectura §5.3). Al reconectar no hay que hacer nada especial, y la fusión por `unid` y `lastupdate` es idempotente.

**Lado de la página** (componente `http/stream`):
- `GET /api/stream` con los filtros en la query (contrato en `docs/api/openapi.yaml`);
- cada evento lleva el id `<arranque>-<secuencia>`;
- **historial circular** de los últimos 2 000 eventos o 15 min;
- al reconectar, el navegador envía `Last-Event-ID` y el servidor reenvía lo posterior que cumpla los filtros de ese cliente;
- en la primera conexión, la página pasa `ultimoId`, el `ultimoEventoId` que devolvió `GET /api/sismos`. Así no hay hueco entre la carga y la suscripción;
- si el id es de otro arranque o es más antiguo que el historial, el servidor envía `flujo.reiniciar` y la página recarga;
- `retry: 3000`, un comentario `: ping` cada 20 s y un vigilante en la página que reabre la conexión si pasan 45 s sin datos (**sustituido en T5.0** por el evento `latido`; ver la nota de actualización);
- como máximo 8 clientes; el noveno recibe `503` (el máximo es configurable con `SSE_MAX_CLIENTES`, de 1 a 16, `src/server/config.js:123`; desde T5.0, `HEAD /api/stream` lo consulta sin ocupar plaza);
- los cambios se agrupan cada 250 ms;
- un cliente lento se desconecta si acumula más de 1 MiB.

Al cambiar los filtros, la página cierra el `EventSource`, vuelve a pedir `GET /api/sismos` y abre otro stream con el nuevo `ultimoId`. `EventSource` no permite cambiar la URL, y el cambio de filtros es poco frecuente.

## Consecuencias

- **Positivas:**
  - latencia de unos 2 s de EMSC al servidor, más ≤ 250 ms de lote y la red local: cumple RNF-01 y RNF-02 con margen;
  - un corte de 30 s se recupera sin perder eventos (RNF-06);
  - el número de pestañas no multiplica las conexiones con EMSC.
- **Negativas:**
  - la reanudación depende del historial en memoria: tras un reinicio del servidor la página recarga completa (aceptable);
  - una dependencia más (`ws`).
- **Más difícil:** filtrar por cliente obliga a evaluar los filtros por evento y por conexión. Con como máximo 8 clientes y pocos eventos por minuto, el coste es despreciable.
- **Entrega 2:** los avisos de tsunami se emitirán como `tsunami.*` por el mismo stream. Los clientes de la entrega 1 ignoran los tipos que no conocen (regla del contrato), así que no se rompe nada.
- **Cómo se revierte:** si `ws` dejara de mantenerse, el adaptador `emsc-ws` puede volver al `WebSocket` nativo y detectar conexiones muertas por silencio (más de 10 min sin mensajes con FDSN mostrando eventos nuevos). El cambio queda confinado a un archivo.

## Nota de actualización (T6.1, 2026-10-12): lo que cambió desde la decisión

La decisión (WebSocket de EMSC en el servidor con `ws` y SSE hacia la página) **se mantiene**. Cambian tres detalles del lado de la página, introducidos en T5.0 (`52109b9`) y recogidos en el contrato (`docs/api/openapi.yaml`, `suscribirStream` y `comprobarStream`):

1. **Latido visible: `event: latido` en lugar del comentario `: ping`.**
   - **Motivo:** `EventSource` no entrega los comentarios SSE a la página, así que el vigilante de 45 s no los veía y reabría el stream cada 45 s en reposo, aunque la conexión estuviera viva.
   - **Ahora:** el difusor envía cada 20 s (`HEARTBEAT_MS`, `src/server/stream/difusor.js:37`; `latir()`, `:442`) un evento `latido` con el sobre común y `datos: {}`. **No consume secuencia:** lleva el id del último evento emitido, así que reanudar desde él no pierde nada. El texto es el mismo para todos los clientes, sin datos del cliente ni de las fuentes (AM-15). `latir()` captura sus propios errores (R-04), para no llegar a `uncaughtException` desde el intervalo.
   - **En la página:** cada latido reinicia la vigilancia (`SIN_DATOS_MS` = 45 s, `public/js/stream.js:42`) y renueva el «actualizado a las…». En reposo ya no hay reconexiones.
2. **`HEAD /api/stream`** (operación `comprobarStream`).
   - Valida los mismos parámetros que `GET` y responde `200` con las cabeceras del flujo, o `503` + `Retry-After: 10` si no hay plaza. **No abre el flujo ni ocupa plaza** (`src/server/http/rutas-stream.js:87`; `difusor.hayPlaza()`, `difusor.js:532`).
   - **Motivo:** `EventSource` no expone el código HTTP. Cuando el navegador se rinde (estado `CLOSED`), la página no puede distinguir «sin plazas» de «servidor caído» sin preguntar.
3. **Estado `sin-plazas` en la página.**
   - Cuando `EventSource` se rinde, la página llama a `comprobarPlazas()` (`public/js/stream.js:185`), que hace el `HEAD`. Con `503`, el indicador pasa a «sin plazas» (`public/js/barra-estado.js:44`, textos.md §3): los sismos cargados siguen visibles y se reintenta al cabo de `Retry-After` (acotado por la página). Con otra respuesta, «Reconectando…» y espera creciente.

**Otros ajustes posteriores a la decisión:**
- **El flujo lo escribe el difusor propio** como `ReadableStream` (`difusor.js`, `conectar()`), no con `streamSSE` de Hono. Así controla el formato exacto (AM-15), la contrapresión de 1 MiB y el cierre en el apagado. La ventaja de Hono que se citaba en la opción 1 no se usa; la decisión no depende de ella.
- **El componente del lado de la página** es `src/server/http/rutas-stream.js` (validación y plazas) más `src/server/stream/difusor.js` (lotes, historial, filtro por cliente y latido). En la decisión se llamaba `http/stream`.
- **El filtro por cliente** usa `cumpleFiltroStream` de `src/shared/reglas.js`, la misma regla que aplica la página (C-A y D-1; R-01, R-02 y R-06). Un sismo de la franja CO-PA cuenta para cualquiera de sus `paisesCandidatos`.
- **Una cola del WebSocket que se desborda** provoca como mucho una resincronización FDSN de EMSC por intervalo (R-07; `alDesbordar` en `src/server/index.js`).
- **Errores en el drenaje del WebSocket** (N-07): se capturan, se registran y el canal `emsc-ws` pasa a `degradada` hasta la siguiente ingesta correcta. Lo perdido lo recupera la consulta FDSN (`updatedafter`). Ver arquitectura §7.
