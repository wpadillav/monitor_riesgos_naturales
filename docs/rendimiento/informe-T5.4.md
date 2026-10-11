# Informe T5.4: rendimiento de la entrega 1

| Campo | Valor |
|---|---|
| Código medido | `main` en el commit `9a0e7cd`, sin modificar `src/` ni `public/` |
| Fecha | 2026-10-11 |
| Equipo | Linux, 4 núcleos, 12 GB de RAM; Node 24.21.0; Chromium 156.0.8078.4 (Playwright 1.64.0) |
| Autor | ingeniero-rendimiento |
| Datos en bruto | [`docs/rendimiento/datos/`](datos/) (un JSON por medición y dos perfiles `.cpuprofile`) |

> **Condiciones de medida.** El equipo se comparte con otros agentes que ejecutan pruebas en paralelo; la carga media osciló entre 1,2 y 11. Las cifras de las tablas son las de las ejecuciones con carga media < 3 (de 15:46 a 15:57). Las ejecuciones previas con el equipo cargado dieron tiempos de 1,5 a 3 veces mayores. Se indica cuando una cifra procede de ellas.

## 1. Resumen y veredicto

**Veredicto: CUMPLE CON CONDICIONES.**

Con el volumen real (unos 500 a 700 sismos en 30 días) y con el techo de diseño de RNF-03 (10 000 sismos), la entrega 1 cumple:

- RNF-01, RNF-03 y RNF-04;
- los Core Web Vitals, con margen.

Hay tres reservas:

1. **P-01 (alta).** La página repinta la lista y el mapa completos **por cada evento** del stream. Una ráfaga de 1 000 eventos congela la página:
   - 4,4 s con 334 sismos en pantalla;
   - 10,1 s con 10 000, en una sola tarea de 8,5 s.

   Esto ocurre en casos reales:
   - la reanudación de `EventSource` reenvía hasta 2 000 eventos del historial;
   - la primera consulta «Todas» difunde cientos de altas en un lote;
   - las secuencias sísmicas.

   Hay que corregirla antes de cerrar la entrega.
2. **RNF-05 no se cumple con el techo de diseño bajo carga.** Con 10 000 sismos, el RSS sube a 427–439 MB al servir respuestas de 30 días (7,3 MB cada una). En el tope de 50 000, el RSS ya es de 362 MB en reposo. Con el volumen real, el RSS es de 108–123 MB y sí cumple. Ver P-03.
3. **P-02 (media).** Asignar país en la franja marina CO-PA cuesta unos 44 ms por llamada (Turf), y la operación se repite varias veces por sismo. Con los datos reales afecta a 2 de 489 sismos. Bloquea el bucle de eventos en proporción a los sismos que caen en la franja.

No se han encontrado fugas de memoria:

- 400 cambios de filtros: el heap vuelve a 24,4 MB en el mismo estado;
- 10 minutos de stream: +0,9 MB para 585 sismos nuevos, proporcional a los datos.

## 2. Tabla de RNF

| RNF | Objetivo (PRD §7) | Medido | ¿Cumple? |
|---|---|---|---|
| **RNF-01** Latencia interna | p95 ≤ 2 s de la recepción en el servidor a la pantalla (50 eventos) | 50 eventos de uno en uno: p95 **465 ms** (24 h, 334 sismos en pantalla); p95 **1 002 ms** (30 días, 10 000). Ráfaga de 1 000 en un lote: p95 **4 402 ms** (334) y **10 094 ms** (10 000), fuera del método del PRD (P-01) | **Sí** con el método del PRD; **no** con ráfagas (P-01) |
| **RNF-02** Latencia extremo a extremo | Tiempo real: p95 ≤ 10 s. Consulta periódica: p95 ≤ 90 s (publicación → pantalla) | Muestra de 20 min con fuentes reales: WebSocket p95 **1 436 ms** (n = 2) + RNF-01 p95 465 ms ≈ **1,9 s**. Consulta periódica: n = 0 en la ventana | **Sí, indicativo** (la muestra no basta; la verificación es la sesión de 24 h de RNF-16) |
| **RNF-03** 30 días con 10 000 sismos | ≤ 3 s hasta lista y mapa utilizables | **1,00–1,11 s** hasta los datos pintados y utilizables (3 rondas). Con la CPU ×4: **3,01–3,25 s** hasta los datos y 3,19–3,51 s hasta utilizables | **Sí** (en el límite en un equipo 4 veces más lento, P-07) |
| **RNF-03** Fluidez | Ninguna tarea > 200 ms al desplazar la lista o el mapa | Lista (100 pasos de rueda + Fin/Inicio): **0** tareas largas, frame p95 33 ms. Mapa (10 zooms + 4 arrastres): **0** tareas largas, frame p95 50 ms. Con la CPU ×4: máximo **55 ms** (lista) y **156 ms** (mapa) | **Sí**. Riesgos: los eventos del stream durante el desplazamiento (P-01) y los halos (P-06) |
| **RNF-04** API desde memoria | p95 ≤ 300 ms (≤ 24 h), con 100 peticiones | 24 h. Datos reales (100 peticiones): p95 **6,5 ms**. Sintéticos (200 peticiones por escenario): 10 000 sismos: p95 **22 ms** (c=1) y **64 ms** (c=8). 50 000: p95 **41 ms** (c=1) y **237 ms** (c=8) | **Sí** |
| **RNF-04** API consultando fuentes | ≤ 10 s (7 y 30 días), con límite por fuente | Carga inicial de 30 días (10 peticiones): **1 451 ms**. Primera consulta «Todas» de 30 días: **781 ms**. Después, 7 días sale de memoria (5,9 ms) | **Sí** |
| **RNF-05** Memoria | ≤ 300 MB de RSS con 30 días | Datos reales: **108 MB** tras la carga, **115–123 MB** tras usarse y **93–102 MB** en 20 min de sesión. Arranque en reposo: **75 MB**. 10 000 sismos: **173 MB** en reposo, **pico de 427–439 MB** al servir 30 días y 252 MB tras GC. 50 000: **362 MB** en reposo y pico de 529 MB | **Sí** con el volumen real; **no** con el techo bajo carga ni en el tope (P-03) |
| **RNF-16** Sesiones largas (relacionado) | 24 h sin superar RNF-05 | No hay sesión de 24 h (fuera de T5.4). Página: 10 min con un sismo por segundo, heap 21,4 → 22,3 MB. Servidor real: 20 min, RSS de 93 a 102 MB, estable al final | Sin evidencia de fuga; falta la sesión de 24 h |
| **AM-13** Plazas SSE (arquitectura) | 8 clientes; el 9.º recibe 503 | El 9.º recibe **503** en las 4 pruebas | **Sí** |
| **Difusor SSE** (arquitectura §5.7) | Lotes de 250 ms con 8 clientes | 10 000 sismos y ráfaga de 1 000 en un lote: los 8 clientes reciben 1 000/1 000, emisión p95 **1 128 ms**, CPU **1,2 s**, bucle bloqueado hasta 587 ms. En el tope (50 000) y en lotes de 1: emisión p95 **7 066 ms** (P-05) | **Sí** con 10 000; **no** en el tope con lotes de 1 |
| **Core Web Vitals** (carga normal, datos reales) | «Bueno»: LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms | Escritorio: LCP **468 ms**, CLS **0,007**, INP aprox. **88 ms**. Móvil (Pixel 7): LCP **388 ms**, CLS **0**, INP aprox. **64 ms** (medianas de 5 rondas) | **Sí** |

## 3. Metodología

### 3.1 Principios

- **No se toca el código medido.** Los scripts de [`scripts/rendimiento/`](../../scripts/rendimiento/) importan los módulos de `src/` y los componen igual que `src/server/index.js`. La única diferencia es que no tienen fuentes. Los datos se inyectan con `catalogo.ingerirLote`, el mismo punto de entrada que usan el planificador FDSN y el WebSocket de EMSC.
- **Datos sintéticos realistas** ([`sinteticos.js`](../../scripts/rendimiento/sinteticos.js)):
  - pasan por el normalizador real (`crearRegistro`);
  - sus posiciones caen dentro de las zonas de `asignarPais`; el 3 % cae en la franja CO-PA;
  - las magnitudes van de 2,0 a 6,5 (Gutenberg-Richter);
  - el 50 % lleva un duplicado de USGS que el catálogo fusiona, así que hay dos registros por sismo, como en el cálculo de memoria de la arquitectura;
  - la semilla es fija, así que los datos son reproducibles.
- **Página con el servidor y el stream reales:**
  - no se simula `/api/*`: la página habla con el servidor sintético;
  - las teselas de Esri se sirven con un PNG local para aislar la aplicación, salvo en los Core Web Vitals, que usan las teselas reales;
  - las métricas del hilo principal salen de `PerformanceObserver` (`longtask` = «Task» del panel Rendimiento de Chrome, y `long-animation-frame`);
  - el heap y los nodos se leen tras forzar la GC por CDP.
- **RNF-01 en la página.** Se envuelven los oyentes `sismo.nuevo` de `EventSource` y se anota `Date.now() − recibidoEn` en el frame siguiente a aplicar cada evento. El servidor y el navegador comparten reloj.

### 3.2 Comandos

Todos se ejecutan desde la raíz del repositorio con `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`. Puertos: 3008 para la aplicación y 3009 para el control del servidor sintético.

```sh
# Servidor: reposo real, 0 / 10 000 / 50 000 sismos → memoria, carga de la API y ráfagas SSE.
# Escribe docs/rendimiento/datos/servidor-*.json (unos 4 min).
node scripts/rendimiento/medir-servidor.js 0,10000,50000

# Por separado (con el servidor sintético en marcha):
N_SISMOS=10000 node --expose-gc scripts/rendimiento/servidor-sintetico.js &   # 3008 + control 3009
node scripts/rendimiento/carga-api.js 200 1,8      # GET /api/sismos: p50/p95/p99, CPU y RSS pico
node scripts/rendimiento/sse-rafaga.js 1000 1000   # 8 clientes, 1 000 sismos en un lote
node scripts/rendimiento/sse-rafaga.js 1000 1      # 8 clientes, 1 000 sismos en lotes de 1

# Fuentes reales (necesita red): carga inicial, API desde memoria y consultando las fuentes.
node scripts/rendimiento/arranque-real.js > docs/rendimiento/datos/arranque-real.json
MINUTOS=20 node scripts/rendimiento/sesion-real.js > docs/rendimiento/datos/sesion-real.json

# Coste de la ingesta y de asignarPais (sin red; perfil opcional con --cpu-prof).
node scripts/rendimiento/micro-ingesta.js 1000 > docs/rendimiento/datos/micro-ingesta.json

# Página (servidor sintético con N_SISMOS=10000 recién arrancado, sin ráfagas previas).
node scripts/rendimiento/pagina.js carga  > docs/rendimiento/datos/pagina-carga.json        # RNF-03
CPU_X=4 node scripts/rendimiento/pagina.js carga > docs/rendimiento/datos/pagina-carga-cpu4x.json
PERIODO=30d node scripts/rendimiento/pagina.js rafaga > docs/rendimiento/datos/pagina-rafaga-30d.json  # RNF-01
PERIODO=24h node scripts/rendimiento/pagina.js rafaga > docs/rendimiento/datos/pagina-rafaga-24h.json  # (servidor nuevo)
PERIODO=30d MINUTOS=10 node scripts/rendimiento/pagina.js soak > docs/rendimiento/datos/pagina-soak.json
PERIODO=30d CAMBIOS=400 node scripts/rendimiento/pagina.js filtros > docs/rendimiento/datos/pagina-filtros-400.json
CAMBIOS=150 node scripts/rendimiento/diagnostico-fuga.js > docs/rendimiento/datos/diagnostico-fuga.json
node scripts/rendimiento/perfil-pagina.js > docs/rendimiento/datos/perfil-pagina.json   # perfiles .cpuprofile

# Core Web Vitals con el servidor real y teselas reales:
PORT=3008 npm start &
RONDAS=5 node scripts/rendimiento/pagina.js cwv > docs/rendimiento/datos/pagina-cwv.json
```

Los scripts pasan `eslint` y `prettier --check`.

## 4. Resultados del servidor

### 4.1 Memoria (RNF-05)

| Escenario | RSS (`ps`) | Heap usado / total tras GC | Fuente |
|---|---|---|---|
| `npm start` sin fuentes, en reposo | 75 MB | n/d | `servidor-reposo-real.json` |
| Sintético, 0 sismos (con `--expose-gc`) | 91 MB | 9,9 / 13,9 MB | `servidor-0.json` |
| Fuentes reales, 489 visibles y 629 en memoria | 108 MB tras la carga y 123 MB tras las consultas | n/d | `arranque-real.json` |
| 10 000 sismos (15 000 registros) | **173 MB** en reposo; 252 MB tras la prueba de carga y GC | 33,4 / 44,2 MB | `servidor-10000.json` |
| 10 000, durante 200 peticiones de 30 días | **pico de 427 MB** (c=1) y **439 MB** (c=8) | n/d | ídem |
| 50 000 sismos (tope) | **362 MB** en reposo; 380 MB al final | 118,7 / 267,1 MB | `servidor-50000.json` |
| 50 000, durante las peticiones | **pico de 529 MB** | n/d | ídem |

La arquitectura (§5.5) estimaba unos 2 KB por sismo: 20 MB para 10 000 y 100 MB para 50 000. El heap usado se ajusta a esa estimación (unos 2,4 KB por sismo). El RSS no se ajusta, por tres razones:

- la base del proceso con Turf y las zonas ya ocupa unos 90 MB;
- V8 retiene el heap total (267 MB con 50 000);
- cada respuesta de 30 días crea al menos unos 15 MB de objetos temporales: la cadena JSON de 7,3 MB y su copia codificada en UTF-8.

### 4.2 `GET /api/sismos` (RNF-04)

Son 200 peticiones por escenario tras 10 de calentamiento, con conexiones persistentes. «cpu/pet» es la CPU del servidor por petición.

| Sismos | Consulta | c | p50 | p95 | p99 | Tamaño | cpu/pet |
|---|---|---|---|---|---|---|---|
| real (489) | 24 h | 1 | 3,6 ms | **6,5 ms** | 180,8 ms (máx., la 1.ª) | 74 KB | n/d |
| real (489) | 30 días | 1 | 13,3 ms | 17,8 ms | 25,8 ms | 348 KB | n/d |
| 10 000 | 24 h | 1 / 8 | 5,6 / 32 ms | **22 / 64 ms** | 28 / 130 ms | 244 KB | 5 ms |
| 10 000 | 30 días | 1 / 8 | 100 / 547 ms | **110 / 1 043 ms** | 114 / 1 536 ms | **7,3 MB** | 76 ms |
| 10 000 | ES, 7 días | 1 / 8 | 14 / 64 ms | 39 / 118 ms | 44 / 147 ms | 706 KB | 10 ms |
| 50 000 | 24 h | 1 / 8 | 21 / 114 ms | **41 / 237 ms** | 44 / 330 ms | 1,2 MB | 18 ms |
| 50 000 | 30 días (truncada a 10 000) | 1 / 8 | 100 / 588 ms | 108 / 1 368 ms | 110 / 1 818 ms | 7,3 MB | 81 ms |
| 50 000 | ES, 7 días | 1 / 8 | 47 / 280 ms | 63 / 572 ms | 65 / 677 ms | 3,5 MB | 40 ms |

No hubo errores en ninguna de las 2 400 peticiones. Consultas que no cubre la memoria, con fuentes reales:

- la carga inicial de 30 días tardó **1 451 ms**;
- la primera consulta «Todas» de 30 días tardó **781 ms** y pasó de 489 a 716 sismos;
- el límite es de 8 s por fuente.

### 4.3 Difusor SSE: 8 clientes y ráfaga de 1 000 sismos

| Sismos en memoria | Ingesta | Ingesta síncrona | Emisión p50 / p95 / máx | Recibidos | CPU total | Bucle bloqueado (máx) |
|---|---|---|---|---|---|---|
| 10 000 | 1 lote de 1 000 (como FDSN) | 556 ms | 1 087 / **1 128** / 1 133 ms | 8 × 1 000 | 1,22 s | 587 ms |
| 10 000 | 1 000 lotes de 1 (como el WebSocket) | 443 ms | 637 / **879** / 893 ms | 8 × 1 000 | 0,93 s | 460 ms |
| 50 000 (tope) | 1 lote de 1 000 | 425 ms | 839 / **882** / 886 ms | 8 × 1 000 | 0,93 s | 445 ms |
| 50 000 (tope) | 1 000 lotes de 1 | **7 047 ms** | 3 941 / **7 066** / 7 425 ms | 8 × 1 000 | 7,47 s | **7 067 ms** |

Cada cliente recibe unos 791 KB por ráfaga. La serialización se hace una vez por evento y tipo (caché por entrada) y sale barata. El coste se reparte así:

- la ingesta, sobre todo `asignarPais` (P-02);
- la espera del lote (250 ms);
- en el tope, `aplicarTope` (P-05).

### 4.4 Ingesta y asignación de país (micro-medición)

Datos de [`micro-ingesta.json`](datos/micro-ingesta.json) y del perfil de CPU (`--cpu-prof`):

- `asignarPais` cuesta **0,017 ms** con una zona candidata y **43,9 ms** con varias (la franja CO-PA). En ese caso llama a `pointToPolygonDistance` de Turf sobre la tierra de CO-CONT (1 762 vértices).
- En el perfil, el **88 %** del tiempo de ingesta está en `asignarPais` → `pointToPolygonDistance`. El 41 % del tiempo propio es `__spreadProps`: Turf crea objetos por cada segmento.
- Ingesta: 1,24 ms por registro sin duplicados y 1,86 ms con un 50 % de duplicados, con el 2,9 % de las posiciones en la franja.
- Con los datos reales hay **2 de 489** sismos en la franja, que suman 121 ms de `asignarPais`.

## 5. Resultados de la página (Chromium)

### 5.1 RNF-03: carga de 30 días con 10 000 sismos

Escritorio de 1440 × 900, con servidor sintético nuevo y 3 rondas. «Datos pintados» es el frame siguiente a `pintarDatos`, que ya ha actualizado la lista y sincronizado el mapa. «Utilizable» es el final de la última tarea larga antes de 1 s de calma.

| CPU | API (7,3 MB) | Datos pintados | Utilizable | Tareas > 200 ms en la carga (mayor) | Fuente |
|---|---|---|---|---|---|
| ×1 | 0,32–0,44 s → 0,56–0,66 s | **0,996 / 1,050 / 1,111 s** | 0,996–1,111 s | 1 (202–214 ms) | `pagina-carga.json` |
| ×4 | 0,88–1,02 s → 1,26–1,48 s | **3,006 / 3,038 / 3,250 s** | 3,19–3,51 s | 4 (747–756 ms) | `pagina-carga-cpu4x.json` |
| ×1 con 1 064 sismos de la última hora | igual | 1,17–1,30 s | **2,06–2,18 s** | 3 (723–727 ms) | `pagina-carga-con-recientes.json` |

Perfil de la carga ([`perfil-pagina.json`](datos/perfil-pagina.json)):

- `pintarDatos` suma 432 ms, de los que `mapa.sincronizar` se lleva 355 ms;
- Leaflet suma 341 ms en `addTo`/`_layerAdd`, porque hay un `addTo` por marcador;
- la GC suma 276 ms.

### 5.2 RNF-03: fluidez del desplazamiento y del zoom

| Prueba | CPU | Tareas largas | Mayor tarea | LoAF > 200 ms | Frame p95 | Frames > 50 ms |
|---|---|---|---|---|---|---|
| Lista: 100 × rueda de 300 px, 10 saltos, Fin/Inicio | ×1 | 0 | 0 ms | 0 | 33 ms | 2 de 349 |
| Mapa: 10 zooms de rueda y 4 arrastres | ×1 | 0 | 0 ms | 0 | 50 ms | 12 de 309 |
| Lista | ×4 | 2 | 55 ms | 0 | 33 ms | 6 de 340 |
| Mapa | ×4 | 5 | 156 ms | 2 | 50 ms | 15 de 301 |
| Mapa con 1 064 halos SVG | ×1 | 6 | 135 ms | 2 | **67 ms** | **33 de 269** |

La virtualización de la lista funciona: siempre hay 8–10 `<li>` en el DOM con 10 000 sismos.

### 5.3 RNF-01 en la página: sismos por el stream real

| En pantalla | Ráfaga | Latencia p50 / p95 / máx | Mayor tarea | Fuente |
|---|---|---|---|---|
| 334 (24 h) | 50 de uno en uno | 428 / **465** / 466 ms | 149 ms | `pagina-rafaga-24h.json` |
| 334 (24 h) | 1 000 en un lote | 4 398 / **4 402** / 4 402 ms | **3 102 ms** | ídem |
| 10 000 (30 días) | 50 de uno en uno | 955 / **1 002** / 1 002 ms | 507 ms | `pagina-rafaga-30d.json` |
| 10 000 (30 días) | 1 000 en un lote | 10 091 / **10 094** / 10 094 ms | **8 463 ms** | ídem |

Perfil de 200 sismos llegados de uno en uno con 10 000 en pantalla:

- `pintarDatos` se lleva **5,4 s**, unos 27 ms por sismo;
- de ellos, `lista.actualizar` gasta 2,5 s y `mapa.sincronizar` otros 2,5 s.

### 5.4 Memoria tras 10 minutos con el stream (soak)

Escenario: 30 días con 10 000 sismos y un sismo nuevo por segundo por el SSE real, 585 en total. El heap y los nodos se miden tras la GC cada 30 s ([`pagina-soak.json`](datos/pagina-soak.json)).

- **Heap:** 21,4 MB → 22,3 MB (+0,9 MB, unos 1,5 KB por sismo nuevo). El crecimiento es lineal con los datos y no es una fuga.
- **Oyentes:** 262 → 317, estable desde el minuto 4.
- **Nodos:** suben unos 0,9 por sismo, uno por cada halo SVG de los sismos de la última hora. Los halos se retiran al cumplir 1 h.
- **Hilo principal:** 381 tareas largas (p50 72 ms, p95 141 ms), una por sismo, por P-01. Dos superan los 200 ms. Esta ejecución se hizo con el equipo cargado.

### 5.5 Fugas al cambiar los filtros

| Prueba | Heap en el mismo estado (2.0 y 30 días, tras GC) | Oyentes | Conexiones SSE | Fuente |
|---|---|---|---|---|
| 400 cambios de magnitud y periodo | inicio 20,4; cambio 100: **24,4**; cambio 300: **24,4** MB | 275 → 275 | 1 → 1 | `pagina-filtros-400.json` |
| 150 cambios de periodo (24 h ↔ 30 días), contando objetos | 20,6 → 23,6 → 23,1 → 23,0 MB; `L.CircleMarker` y `EventSource` estables | n/d | 1 `EventSource` vivo | `diagnostico-fuga.json` |

- **Sin fuga.** Los +3–4 MB de los primeros cambios son estructuras acotadas, como el `Map` de magnitudes conocidas del notificador (`MAX_RECORDADOS`).
- **Tiempo de cada cambio.** Del cambio a «En vivo»: p50 692 ms y p95 1 521 ms, incluidos los 400 ms de espera de `filtros-ui.js`.
- **Nota de método.** Una primera versión de `diagnostico-fuga.js` daba un falso positivo: sin `Runtime.releaseObjectGroup`, CDP retiene los objetos que devuelve `queryObjects`. El script corregido lo libera.

### 5.6 Sesión con fuentes reales (RNF-02, RNF-05)

Escenario: 20 minutos con `npm start` y las fuentes reales, de 15:57 a 16:17 ([`sesion-real.json`](datos/sesion-real.json)).

- **Carga inicial:** 2 797 ms (492 sismos visibles y 632 en memoria). En la primera ejecución (`arranque-real.json`) fueron 1 451 ms.
- **RNF-02 (publicación → recepción):** el WebSocket de EMSC registró **2 sismos**, con p50 1 383 ms y p95 1 436 ms. Sumando el p95 de RNF-01 (465 ms), el total queda en unos **1,9 s**, frente a los ≤ 10 s exigidos. La consulta periódica no trajo ningún sismo nuevo en esa ventana (n = 0).
  - La muestra **no es estadísticamente suficiente**. La cifra es indicativa: RNF-02 se verifica con la sesión de 24 h de RNF-16, cuyos resúmenes `latencia.resumen` salen cada hora.
- **RSS por minuto (RNF-05):** 109 MB al cargar, 93 MB tras la primera GC, y luego subida lenta hasta 102 MB, estable en los últimos 7 minutos. Todo queda por debajo de 300 MB.

### 5.7 Core Web Vitals (carga normal)

Escenario: servidor real (`npm start`), filtros por defecto (3 países, 2.0 o más, 24 h; 109 sismos) y teselas reales. Son 5 rondas por perfil ([`pagina-cwv.json`](datos/pagina-cwv.json)). INP es aproximado: es el máximo de las interacciones de la sesión (clic en una fila, cambio de tema y, en móvil, abrir y cerrar los filtros).

| Perfil | FCP | LCP (elemento) | CLS | INP aprox. |
|---|---|---|---|---|
| Escritorio 1440 × 900 | 168 ms | **468 ms** (tesela) | **0,007** | **88 ms** |
| Móvil (Pixel 7) | 120 ms | **388 ms** (tesela) | **0** | **64 ms** |

## 6. Hallazgos

### P-01. La página repinta la lista y el mapa completos por cada evento del stream

- **Severidad:** alta
- **Evidencia:**
  - `main.js:234` agrupa con `queueMicrotask(pintarDatos)`. `EventSource` entrega cada mensaje en su propio *callback*, y entre uno y otro se vacían las microtareas, así que no se agrupa nada: hay un `pintarDatos` por evento.
  - Cada `pintarDatos` es O(n):
    - `estado.lista()` reordena todo;
    - `lista.actualizar` reconstruye el índice `Map` y llama a `tomarAncla`/`recalcular`;
    - `mapa.sincronizar` recorre todas las entradas y crea un `Set` de vigentes.
  - Perfil: 200 sismos con 10 000 en pantalla cuestan 5,4 s, unos 27 ms por sismo.
  - Ráfaga de 1 000: una sola tarea de **8 463 ms** con 10 000 en pantalla y de **3 102 ms** con 334. La latencia es de 10,1 s y 4,4 s, frente a los 2 s de RNF-01.
  - Soak: una tarea larga por sismo (p50 72 ms).
- **Por qué importa:** la arquitectura (§9, RNF-01) prometía que la página «actualiza solo el elemento afectado (sin reconstruir la lista)», y no es así. Las ráfagas aparecen en casos reales:
  - la reanudación con `Last-Event-ID` reenvía hasta **2 000** eventos del historial;
  - una cobertura nueva («Todas») difunde las altas en un solo lote: la primera vez fueron 227 sismos reales;
  - las secuencias sísmicas.
- **Corrección propuesta:**
  1. Agrupar por frame con `requestAnimationFrame(pintarDatos)` en lugar de `queueMicrotask`. Así, N eventos producen un solo repintado. Es un cambio de una línea y el que más rinde.
  2. Actualización incremental:
     - `estado` mantiene el array ordenado con inserción binaria y emite los ids afectados;
     - `mapa.sincronizar(ids)` toca solo esos marcadores;
     - `lista.actualizar` reconstruye el índice solo en `reemplazo`.
  3. Prueba de regresión: E2E con una ráfaga de 1 000 sobre 10 000 y ninguna tarea > 200 ms.
- **Objetivo:** ráfaga de 1 000 con 10 000 en pantalla en menos de 300 ms de hilo principal, y RNF-01 p95 < 2 s también en ráfaga.

### P-02. `asignarPais` en la franja CO-PA cuesta unos 44 ms y se repite varias veces por sismo

- **Severidad:** media
- **Evidencia:**
  - Micro-medición: 43,9 ms frente a 0,017 ms por llamada (unas 2 500 veces más).
  - Perfil: el 88 % del tiempo de ingesta está en `pointToPolygonDistance` de Turf.
  - Por cada sismo se llama varias veces:
    - `recomponer` (catálogo), una vez por registro, porque la memoización solo dura la transacción;
    - `paisesDe` del difusor, una vez para `anterior` y otra para `actual` en cada cambio.
  - Datos reales: 2 de 489 sismos (121 ms). Con un 3 % en la franja: cargar 10 000 sismos cuesta de 13 a 16 s de CPU con el equipo descargado (hasta 52 s con el equipo cargado), una ráfaga de 1 000 cuesta 0,43–0,56 s y el bucle llega a bloquearse 587 ms.
  - `ingerirLote` procesa la respuesta FDSN entera sin ceder el bucle (hasta 20 000 registros).
- **Corrección propuesta:**
  1. Caché LRU `(lat, lon) → UbicacionPais` en `src/server/geo/asignar-pais.js`.
  2. Que el difusor use los `paisesCandidatos` que ya calcula el catálogo (`Entrada.paisesCandidatos`) en lugar de volver a llamar a `asignarPais`.
  3. Para la distancia, usar una versión simplificada de `tierra` (tolerancia de unos 1 km) o una distancia punto-segmento propia sin crear objetos.
  4. Trocear `ingerirLote` cada 500 registros con `setImmediate`.
- **Objetivo:** < 1 ms por asignación en la franja y bucle bloqueado < 50 ms en una ingesta de 1 000.

### P-03. RNF-05 no se cumple con el techo de diseño bajo carga ni en el tope

- **Severidad:** media
- **Evidencia (§4.1):**
  - 10 000 sismos: 173 MB en reposo y picos de 427–439 MB al servir 30 días (7,3 MB por respuesta y 76 ms de CPU por petición).
  - 50 000 (tope de AM-16): 362 MB en reposo y 529 MB de pico.
  - La estimación de la arquitectura (2 KB por sismo, «se cumple con mucho margen») vale para el heap usado, no para el RSS.
  - Con el volumen real sí cumple: 108–123 MB.
- **Corrección propuesta:**
  1. Cachear el JSON serializado de cada `Sismo` por `revision` y componer la respuesta concatenando. Así se evitan unos 15 MB de basura por petición.
  2. Acotar el heap en `npm start` (`--max-old-space-size=160`, a validar con esta misma batería).
  3. Revisar el tope de 50 000. Con unos 2,4 KB de heap por sismo y una base de 90 MB, un tope de unos 20 000 debería dejar el RSS por debajo de 300 MB. Hay que medirlo con esta batería, y es una decisión de arquitectura.
  4. Valorar quitar `fuentes[]` de la respuesta de lista: duplica las URL y los autores, y supone el 38 % del tamaño con los datos reales (492 sismos, 104 con dos fuentes).

### P-04. `/api/sismos` recorre y ordena el catálogo entero en cada petición

- **Severidad:** baja
- **Evidencia:**
  - `catalogo.listar` filtra las n entradas y ordena las coincidencias en cada petición.
  - 50 000 sismos, 24 h: 18 ms de CPU por petición y p95 de 237 ms con c=8, cerca del límite de RNF-04.
  - 30 días con c=8: p95 de 1 043 ms (10 000) y 1 368 ms (50 000).
  - Con un usuario y el volumen real, p95 de 6,5–18 ms.
- **Corrección propuesta:**
  - mantener un índice ordenado por `tiempo` (inserción binaria al ingerir; búsqueda binaria de `desde`);
  - junto con la caché de JSON de P-03, una caché de la respuesta por `(filtro, ultimoEventoId)`.

### P-05. `aplicarTope` ordena las 50 000 entradas en cada lote cuando se supera el tope

- **Severidad:** media
- **Evidencia:**
  - En el tope, cada `ingerirLote` que añade un sismo hace `[...entradas.values()].sort()`, unos 7 ms.
  - Con el WebSocket, que en una ráfaga drena lotes de 1, 1 000 sismos cuestan 7,05 s de CPU bloqueante.
  - La emisión SSE llega a un p95 de 7,07 s y el bucle se bloquea 7,07 s (§4.3).
  - Solo ocurre en el tope, a 5 veces el volumen de diseño.
- **Corrección propuesta:**
  - recortar con histéresis: al superar el tope, bajar al 95 % (un `sort` cada 2 500 altas);
  - o expulsar por el minuto más antiguo de `porMinuto`, guardando la clave mínima.

### P-06. Halos y pulsos SVG de los sismos de la última hora

- **Severidad:** media
- **Evidencia:**
  - Con 1 064 sismos en la última hora, la carga añade una tarea de **723–727 ms** tras pintar los datos (de 1,1 s a 2,1 s hasta utilizable).
  - Durante el zoom: frame p95 de 67 ms y 33 de 269 frames > 50 ms (§5.1 y §5.2).
  - En una ejecución intermedia con unos 2 200 sismos de la última hora, que no se conserva porque se repitió con el servidor limpio, la tarea fue de 1,85–1,92 s.
  - Cada sismo reciente crea un `circleMarker` SVG de halo y otro de pulso animado con CSS.
- **Corrección propuesta:**
  - dibujar los halos en el renderizador canvas de los marcadores;
  - limitar los pulsos simultáneos, por ejemplo a los 20 más recientes o a los que superen el umbral de aviso;
  - no animar pulsos de sismos que llegan en una carga.

### P-07. Coste de la carga inicial con 10 000 sismos en equipos lentos

- **Severidad:** baja
- **Evidencia:**
  - Con la CPU ×4, los datos aparecen a los 3,0–3,25 s y la página es utilizable a los 3,2–3,5 s (RNF-03 pide ≤ 3 s).
  - Hay tareas de hasta 756 ms. En el perfil, `mapa.sincronizar` hace un `addTo` por marcador y la GC suma 276 ms.
  - Sin ralentizar: 1,0–1,1 s.
- **Corrección propuesta:**
  - añadir los marcadores en bloque (`L.layerGroup(marcadores)`) o en trozos con `requestAnimationFrame`;
  - reducir el JSON (ver P-03, `fuentes[]`).

### Comprobaciones sin hallazgo

- Sin fugas de memoria en la página: 400 cambios de filtros y 10 min de stream.
- Sin conexiones SSE huérfanas al cambiar los filtros.
- La virtualización de la lista funciona con 10 000 filas.
- El límite de 8 plazas SSE se respeta y la 9.ª conexión recibe 503.

## 7. Riesgos de capacidad

| Volumen | Servidor | Página | Estado |
|---|---|---|---|
| Real (unos 500–700 sismos en 30 días) | 108–123 MB; API p95 < 20 ms; carga inicial de 1,5 s | Carga < 0,6 s; CWV buenos; ráfagas de 1 000: unos 4 s congelada (P-01) | OK salvo P-01 |
| Techo de RNF-03 (10 000) | 173 MB en reposo y picos > 400 MB (P-03); API de 30 días a 110 ms | Carga de 1,0 s (3,0 s con CPU ×4); ráfagas de 1 000: 10 s congelada | Requiere P-01 y P-03 |
| Tope de AM-16 (50 000) | 362 MB en reposo (P-03); WebSocket en ráfaga: 7 s de bloqueo (P-05) | La API trunca a 10 000: igual que el techo | Fuera de RNF-05 |

## 8. Veredicto

**CUMPLE CON CONDICIONES.**

- Todos los RNF de rendimiento tienen medición y cifra (§2).
- Con el volumen real se cumplen RNF-01, RNF-03, RNF-04 y RNF-05, y los Core Web Vitals son «buenos».
- RNF-02 se cumple solo de forma indicativa (n = 2): falta la sesión de 24 h de RNF-16.
- Con el techo de diseño se cumplen RNF-03 y RNF-04. RNF-05 no se cumple bajo carga.

**Condición para cerrar la entrega 1:** corregir **P-01 (alta)** y repetir `pagina.js rafaga` con 30 y 24 h. P-02, P-03 y P-05 se recomiendan antes de la sesión de 24 h de RNF-16. P-04, P-06 y P-07 pueden ir a la entrega 2.
