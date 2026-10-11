# Plan de pruebas — Entrega 1 (T5.1)

> Última revisión: 2026-10-11 (qa-automatizacion, rama `test/T5.1-qa` sobre `9a0e7cd`).
> Fuente de los requisitos: [PRD](../00-prd.md) (HU-01 a HU-12, RNF-01 a RNF-16), [textos](../diseno/textos.md) y [wireframes](../diseno/wireframes.html) §9 (teclado).

## 1. Estrategia

| Nivel | Herramienta | Dónde | Qué cubre |
|---|---|---|---|
| Unitarias | Vitest 5.0.3 (entorno `node`) | `tests/unit/` | Dominio (`src/shared`, `src/server/dominio`), fuentes y normalizadores, difusor SSE y la lógica pura de la página (`public/js`: filtros, estado, stream, avisos, formato) |
| Integración | Vitest + servidor Hono real en memoria o en un proceso hijo | `tests/integracion/` | API HTTP (`/api/salud`, `/api/sismos`, `/api/stream`), cabeceras de seguridad, estáticos, arranque, permisos de Node y WebSocket de EMSC contra un servidor `ws` local |
| Lint como prueba | Vitest + ESLint | `tests/lint/` | Regla «sin `innerHTML` con datos externos» (RNF-07) y frontera de `src/shared` |
| E2E | Playwright 1.64.0, **Chromium y Firefox** | `tests/e2e/` | Flujos de la página con `/api/*` y teselas simulados (sin Internet) y un servidor SSE simulado por prueba |
| Accesibilidad | `@axe-core/playwright` 4.13.0 | `tests/e2e/accesibilidad.spec.js` | WCAG 2.0 A/AA, 2.1 AA y 2.2 AA en 10 estados de la página, en los dos navegadores |

**Datos:** solo fixtures y fábricas: `tests/fixtures/` (respuestas reales recortadas de EMSC, USGS, GDACS, NOAA e IGN, sin datos personales), y `sismo()`, `sismosEjemplo()` y `muchosSismos(n)` en `tests/e2e/apoyo.js`. No se usan datos de producción.

**Determinismo:**
- reloj inyectado en el servidor (`reloj.ahora`) y reloj de Playwright instalado en todas las E2E (`AHORA` = 2026-07-15 12:30 UTC, horario de verano);
- zona `Europe/Madrid` y `locale` `es-ES` fijados en `playwright.config.js`;
- sin red real: Playwright intercepta `/api/*` y `server.arcgisonline.com`;
- todas las E2E vigilan a la vez las violaciones de CSP, los errores de consola y los diálogos (fixture `vigilancia` de `apoyo.js`).

**Esperas:** siempre por condición (`expect` con reintento, `expect.poll`), nunca por tiempo fijo. Las esperas de la página (los 400 ms de los filtros, el latido de 20 s o el «sin datos» de 45 s) se prueban **parando o adelantando el reloj** (`pararReloj` + `page.clock.runFor`, `page.clock.fastForward`). No queda ningún `waitForTimeout` en la E2E.

## 2. Matriz de trazabilidad

Leyenda de niveles: **U** unitaria, **I** integración, **E** E2E (Chromium + Firefox, salvo que se indique), **A** axe.

### Épica E1 — Datos en vivo

| Historia / escenario | Pruebas (archivo › nombre) | Nivel |
|---|---|---|
| **HU-01** Llega un sismo que cumple los filtros | `vivo.spec.js` › «alta, actualización y eliminación sin recargar la página»; «abre el stream con los filtros y el ultimoEventoId de la carga, e indica «En vivo»» | E |
| | `difusor.test.js` › «emite sismo.nuevo con el sobre del contrato tras el lote de 250 ms»; `stream.test.js` (público) › `aplicarEvento` | U |
| | `integracion/stream.test.js` › «GET /api/stream», «servidor HTTP real» | I |
| HU-01 No cumple los filtros | `difusor.test.js` › «cada cliente recibe solo lo de sus países y su magnitud», «filtro por cliente (HU-01…)»; `stream.test.js` (público) › «fuera del periodo o de un país no marcado: no se pinta» | U |
| HU-01 Varias fuentes (duplicados) | `duplicados.test.js` › «calibración con los 54 pares reales USGS↔EMSC», `elegirCandidato`, `sePuedenFusionar`; `catalogo.test.js` › «duplicados entre fuentes y precedencia (ADR-0004)» | U |
| HU-01 Revisión de magnitud | `catalogo.test.js` › «alta y asociación por id»; `difusor.test.js` › «una revisión dentro del filtro es sismo.actualizado…»; `vivo.spec.js` › «alta, actualización y eliminación…» | U, E |
| HU-01 Profundidad negativa | `modelo.test.js` › «profundidadPositiva (PRD E1)», «el cero no tiene signo (T5.1)» | U |
| **HU-02** Cae una fuente periódica | `planificador.test.js` › «fallos de una fuente (HU-02, AM-03)»; `integracion/sismos.test.js` › «GET /api/sismos: fuente caída (AM-03)»; `carga.spec.js` › «fuente caída: «USGS no disponible» (HU-02)»; `vivo.spec.js` › «estado.fuente actualiza la línea de fuentes» | U, I, E |
| HU-02 Se corta el WebSocket de EMSC | `emsc-ws.test.js` › «reconexión y estado de la fuente», «casos límite… (T5.1)»; `integracion/emsc-ws-servidor.test.js` | U, I |
| HU-02 Corte página ↔ servidor | `vivo.spec.js` › «corte: «Reconectando…», a los 10 s «Sin conexión…» y vuelta con Last-Event-ID», «sin mensajes en 45 s…», «con latidos cada 20 s…», «503: indica «sin plazas»…»; `difusor.test.js` › «reanudación con Last-Event-ID» | E, U |
| HU-02 Servidor local parado | `estado-fuentes-api.test.js` › «clasifica los errores: red, 5xx y cuerpo inesperado»; `carga.spec.js` › «error del servidor sin datos: mensaje, reintento manual y recuperación» (5xx) | U, E |
| HU-02 Todas las fuentes caen | `planificador.test.js` › «fallos de una fuente»; `estado-fuentes.test.js`; `estado-fuentes-api.test.js` › «textoFuentes (HU-02)» | U |

### Épica E2 — Filtros

| Historia / escenario | Pruebas | Nivel |
|---|---|---|
| **HU-03** Valores por defecto | `filtros.spec.js` › «valores por defecto: tres países, 2.0 o más y últimas 24 h»; `filtros-preferencias.test.js` › «filtros por defecto (D5)» | E, U |
| HU-03 Desmarcar un país | `filtros.spec.js` › «desmarcar Colombia pide los datos sin Colombia…»; `movil.spec.js` › «desplegar filtros, cambiar un país…» | E |
| HU-03 Territorios, franja de mar, Serrana/Serranilla | `pais.test.js` › «territorios y casos límite de HU-03 (ADR-0005)», «franja de 100 km», «crearAsignadorPais…»; `zonas.test.js` | U |
| HU-03 Ningún país marcado | `filtros.spec.js` › «ningún país marcado: no consulta y lo dice (HU-03)» | E |
| **HU-04** Valor por defecto, opciones, subir el mínimo | `filtros.spec.js` › «magnitud 3.0: la petición la incluye…», ««Todas» omite magMin…»; `integracion/sismos.test.js` › «respuesta y filtros»; `catalogo.test.js` › «listar con magMin exacto… (frontera)» | E, I, U |
| HU-04 Sin resultados | `filtros.spec.js` › «sin resultados: mensaje del PRD y «Restablecer filtros»» | E |
| **HU-05** Opciones y 30 días | `filtros.spec.js` › ««Todas» omite magMin y «30 días» pide periodo=30d»; `filtros-preferencias.test.js` › `construirQuery` | E, U |
| HU-05 Los sismos salen del periodo | `estado-fuentes-api.test.js` › «purgar quita los que salen del periodo (HU-05)»; `filtros-preferencias.test.js` › «duración de los periodos» | U |
| **HU-06** Reabrir la aplicación | `filtros.spec.js` › «recuerda los filtros al recargar (HU-06)»; `filtros-preferencias.test.js` › «preferencias en localStorage» | E, U |
| HU-06 Preferencias dañadas | `filtros.spec.js` › «preferencias dañadas: valores por defecto sin error visible (HU-06)»; `filtros-preferencias.test.js` › «validarFiltros (HU-06)» | E, U |
| Espera de 400 ms (wireframes §1.1) | `filtros.spec.js` › «cambios seguidos se agrupan en una sola consulta (espera de 400 ms)» | E |

### Épica E3 — Visualización

| Historia / escenario | Pruebas | Nivel |
|---|---|---|
| **HU-07** Contenido del elemento | `carga.spec.js` › «pide los filtros por defecto y muestra lista, estado, mapa y pie»; `magnitud-formato.test.js` › «textos de la fila», `formatearLugar` | E, U |
| HU-07 De la lista al mapa | `teclado.spec.js` › «Intro abre la ventana con el foco en el título…»; `carga.spec.js` › «ventana emergente: fuente, autor…» | E |
| HU-07 Fuente y autor | `carga.spec.js` › «ventana emergente: fuente, autor, hora completa y enlace seguro (HU-07)» | E |
| HU-07 Aviso y atribución | `carga.spec.js` › «pide los filtros por defecto…»; `movil.spec.js` › «mapa encima de la lista… y pie visible» | E |
| HU-07 Nota de cobertura (Colombia) | `movil.spec.js` › ««Fuentes y canales oficiales» despliega los enlaces y la nota de Colombia» | E |
| HU-07 Texto malicioso (RNF-07) | `carga.spec.js` › «texto malicioso: literal en la lista y la ventana…»; `vivo.spec.js` › «un evento mal formado se descarta…»; `texto.test.js` › `sanear`; `enlaces.test.js`; `lint/reglas.test.js` | E, U |
| Halo de la última hora | `carga.spec.js` › «un sismo de la última hora lleva halo; uno antiguo no» | E |
| **HU-08** Canarias, península en invierno, Colombia/Panamá | `hora.test.js` › «horaLista (HU-08, RNF-13)», «horaCompleta y horaCorta», «zona desconocida o inválida… (T5.1)»; `carga.spec.js` › «hora local por zona (HU-08) y textos de reserva» | U, E |
| **HU-09** Primera visita | `tema.spec.js` › «primera visita: sigue al sistema (claro)…» | E |
| HU-09 Cambiar y recordar | `tema.spec.js` › «elegir «Oscuro»… se mantiene al recargar sin parpadeo», ««Día» con el sistema oscuro y vuelta a «Sistema»…», «el script del tema es externo, bloqueante…» | E |

### Épica E4 — Avisos

Las pruebas de `avisos.spec.js` se ejecutan en `chromium-avisos` (modo sin interfaz nuevo, con la API `Notification` real) y en `firefox`.

| Historia / escenario | Pruebas | Nivel |
|---|---|---|
| **HU-10** No se pide permiso al cargar; conceder | `avisos.spec.js` › «no se pide permiso al cargar; al conceder: «Avisos activados» con el umbral» | E |
| HU-10 Denegar | `avisos.spec.js` › «denegar: «Avisos bloqueados en el navegador»…», «cerrar el diálogo sin responder…», «navegador sin avisos…» | E |
| HU-10 Cambiar el umbral | `avisos.spec.js` › «no se pide permiso…» (cambia «Avisar desde» a 5.0 y comprueba `avisoMin` en el stream); `avisos.test.js` › «preferencia de avisos (HU-10, AM-27)», «umbral elegible: con 5.0, un 4.9 no avisa» | E, U |
| **HU-11** Sismo por encima del umbral | `avisos.spec.js` › «texto exacto, ventana sin mover el foco y clic que abre el sismo»; `avisos.test.js` › «textos de la notificación» | E, U |
| HU-11 Límite del umbral (4.5 / 4.46 / 4.44) | `avisos.spec.js` › «límite del umbral (4.5 se avisa, 4.44 no, 4.46 sí)…»; `aviso-cobertura.test.js` › «alcanzaAviso (D1, D4) con umbral 4.5»; `difusor.test.js` › «M 4.5 exacta llega con notificable…» | E, U |
| HU-11 País no marcado | `avisos.spec.js` › «límite del umbral…, país desmarcado y alta tardía»; `difusor.test.js` › «un sismo de un país desmarcado no llega al cliente» | E, U |
| HU-11 Por debajo del filtro de la lista | `avisos.spec.js` › «por debajo del filtro de la lista sí se avisa…» | E |
| HU-11 Sin duplicados | `avisos.spec.js` › «…sin duplicados por revisión o fusión», «agrupación: más de 3 avisos en 60 s…»; `avisos.test.js` › «notificador: deduplicación, límite y agrupación (AM-22)» | E, U |
| HU-11 La carga inicial no notifica | `avisos.spec.js` › «la carga inicial y los avisos desactivados no notifican»; `difusor.test.js` › «durante la carga inicial nada es notificable» | E, U |
| HU-11 Alta tardía | `difusor.test.js` › «un sismo con origen de hace más de 1 h llega con notificable: false»; `aviso-cobertura.test.js` › `esNotificable` | U |
| HU-11 Revisión que cruza el umbral | `avisos.test.js` › «revisión: avisa solo si cruza el umbral, con la magnitud anterior» | U |

### Épica E5 — Ejecución local

| Historia / escenario | Pruebas | Nivel |
|---|---|---|
| **HU-12** Arranque limpio | `integracion/arranque.test.js` › «escucha en 127.0.0.1, anuncia la URL y aplica la lista de Host»; `integracion/permisos.test.js` › «el servidor arranca y sirve la página, Leaflet y la API con esos permisos» | I |
| HU-12 Cambiar el puerto | `config.test.js` › `loadConfig`; `integracion/arranque.test.js` › «rechaza PORT fuera de rango…»; la E2E arranca el servidor en el puerto 3013 | U, I, E |
| HU-12 Puerto ocupado | `integracion/arranque.test.js` › «con el puerto ocupado explica cómo cambiarlo…» | I |
| HU-12 Acceso desde otro equipo | `integracion/arranque.test.js` › «rechaza un HOST que no es loopback…»; `integracion/app.test.js` › «lista blanca de Host (AM-10)», «Origin y Sec-Fetch-Site…» | I |

### Requisitos no funcionales

| RNF | Pruebas | Nivel | Notas |
|---|---|---|---|
| RNF-01 Latencia interna p95 ≤ 2 s | — | — | Sin prueba automática: ver §3 |
| RNF-02 Latencia de extremo a extremo | `metricas-latencia.test.js` (cálculo de p50/p95); `emsc-ws.test.js` › «reproduce mensajes.jsonl… con su latencia» | U | La medición real se hace en la sesión de 24 h (§3) |
| RNF-03 10 000 sismos | `carga.spec.js` › «lista virtualizada con 10 000 sismos (RNF-03)»: ≤ 3 s de la respuesta a la lista, < 80 filas pintadas, `aria-setsize`/`aria-posinset`, Fin llega al último | E | La medición formal con el panel Rendimiento (tareas > 200 ms) es T5.4 |
| RNF-04 Respuesta de la API | `integracion/sismos.test.js` | I | Sin prueba de carga de 100 peticiones (T5.4) |
| RNF-05 Memoria ≤ 300 MB | `catalogo.test.js` › «retención y tope de memoria (AM-16)»; `retencion.test.js` | U | La medición con `ps` es manual (§3) |
| RNF-06 Resiliencia | `emsc-ws.test.js` › «el primer reintento llega en ≤ 5 s…», `calcularEspera`; `vivo.spec.js` › «corte…», «503…»; `planificador.test.js` | U, E | |
| RNF-07 XSS | `lint/reglas.test.js`; `carga.spec.js` › «texto malicioso…»; `texto.test.js`; `enlaces.test.js` | U, E | |
| RNF-08 CSP | `integracion/app.test.js` › «cabeceras de seguridad (AM-19, AM-21)»; todas las E2E fallan ante una violación de CSP | I, E | |
| RNF-09 Solo el propio equipo | `integracion/arranque.test.js`; `integracion/app.test.js` › «lista blanca de Host» | I | Falta el intento real desde otra IP (§3) |
| RNF-10 Frecuencia de consulta | `planificador.test.js` › «ciclos escalonados (RNF-10)»; `fdsn.test.js` | U | |
| RNF-11 Accesibilidad WCAG 2.2 AA | `accesibilidad.spec.js` (10 estados); `teclado.spec.js`; `movil.spec.js` › «Esc pliega el panel…» | A, E | Falta la revisión manual con Orca (§3) |
| RNF-12 Chromium y Firefox, 360–2560 px | Toda la E2E en los proyectos `chromium` y `firefox`; `movil.spec.js` a 360 × 740 | E | No se prueba 2560 px automáticamente |
| RNF-13 Español y zonas horarias | `hora.test.js` (verano e invierno, 5 zonas); `carga.spec.js` › «hora local por zona» | U, E | |
| RNF-14 Datos personales | `filtros-preferencias.test.js` › «preferencias en localStorage» (solo preferencias) | U | Revisión del tráfico en T5.3 |
| RNF-15 Observabilidad | `log.test.js`; `planificador.test.js` › `createLimitadorDescartes`; `emsc-ws.test.js` (líneas de log) | U | |
| RNF-16 Sesión de 24 h | — | — | Ver §3 |

## 3. Lo que no tiene prueba automática y por qué

| Requisito | Motivo | Cómo se verifica |
|---|---|---|
| RNF-16 sesión de 24 h, RNF-05 memoria tras 24 h, RNF-02 latencia real y RNF-10 peticiones reales | Necesitan fuentes reales (EMSC, USGS) y 24 h de reloj real; no caben en CI ni son deterministas | Sesión manual de 24 h con `npm start`, revisando los resúmenes horarios del log y `ps` |
| RNF-01 latencia interna p95 con 50 eventos | Medir p95 en E2E sobre una máquina compartida da resultados ruidosos; el PRD lo asigna a una E2E específica | Pendiente de T5.4, con la máquina descargada |
| HU-11 notificación con la pestaña **en segundo plano real** | Playwright no puede ocultar de verdad la pestaña ni asegurar que el navegador la frene; los navegadores sin interfaz no muestran notificaciones del sistema | La E2E comprueba la lógica con `Notification` real (Chromium) y simulada; la prueba con la pestaña oculta es manual |
| HU-11 «al pulsarla se enfoca la pestaña» | El foco de la ventana del sistema no es observable en modo sin interfaz | La E2E simula el clic (`onclick`) y comprueba la ventana emergente; el foco de la pestaña es manual |
| RNF-03 «ninguna tarea > 200 ms al desplazar» | Requiere el panel Rendimiento o trazas de Chrome; no es fiable en Firefox ni con varios workers | T5.4 |
| RNF-04 prueba de carga de 100 peticiones | Prueba de rendimiento, no funcional | T5.4 |
| RNF-09 conexión desde otra IP | Necesita un segundo equipo en la red | Manual (T5.3) |
| RNF-11 revisión con Orca y teclado completo | axe detecta como mucho la mitad de los problemas de WCAG; anuncios y orden de lectura requieren un lector de pantalla | Manual (T5.1 manual / T5.2) |
| RNF-12 a 2560 px | Solo se automatizan 360 px (móvil) y el escritorio por defecto (1280 × 720) | Manual o captura visual |
| Interfaz `public/js` sin unitarias (`main.js`, `lista.js`, `mapa.js`, `filtros-ui.js`, `barra-estado.js`, `dom.js`, `avisos-ui.js`) | Manipulan el DOM y Leaflet; el entorno de Vitest es `node` y añadir `jsdom` o `happy-dom` sería una dependencia nueva | Se cubren con la E2E; por eso la cobertura total de Vitest (≈ 66 %) es baja |

## 4. Cobertura (Vitest, 2026-10-11)

`npx vitest run --coverage` falla si la cobertura baja de los umbrales de `vitest.config.js`.

| Carpeta | Líneas | Sentencias | Funciones | Ramas | Umbral (líneas / ramas) |
|---|---|---|---|---|---|
| `src/shared` | 100 % | 100 % | 100 % | 99,45 % | 100 / 99 |
| `src/server/dominio` | 98,89 % | 98,77 % | 100 % | 88,94 % | 98 / 88 |
| `src/server/fuentes` | 99,66 % | 97,20 % | 97,06 % | 91,08 % | 99 / 90 |
| `src/server/stream` | 98,69 % | 98,94 % | 100 % | 99,17 % | 98 / 99 |
| `src/server/http` | 99,41 % | 98,45 % | 100 % | 98,11 % | 99 / 98 |
| `src/server/infra` | 100 % | 100 % | 93,75 % | 100 % | (global) |
| `src/server/geo` | 100 % | 100 % | 100 % | — | (global) |
| `src/server` (`app.js`, `config.js`, `index.js`) | 59,87 % | 59,15 % | 48,48 % | 81,82 % | (global) |
| `public/js` | 36,79 % | 37,16 % | 41,29 % | 41,81 % | (global) |
| **Total** | **66,55 %** | **66,42 %** | **67,67 %** | **67,70 %** | 66 / 67 |

Base (`9a0e7cd`): total 65,86 % de líneas; `src/server/dominio` 94,81 % (con `retencion.js` al 0 %), `src/server/fuentes` 98,27 % de líneas y 85,82 % de ramas, `src/server/stream` 97,38 %.

## 5. Pruebas en cuarentena (`test.fixme`)

| Prueba | Navegador | Defecto | Se quita cuando |
|---|---|---|---|
| `teclado.spec.js` › «la lista es un único punto de tabulación…» | Firefox | DEF-01: `#lista-scroll` es un punto de tabulación más en Firefox | Se corrija DEF-01 |
| `accesibilidad.spec.js` › «estado vacío: ningún país marcado» | Ambos | DEF-02: axe `scrollable-region-focusable` en `#lista-scroll` | Se corrija DEF-02 |

## 6. Cómo ejecutar todo

Requisitos: Node 24.21.0 (`nvm use`), `npm ci` y, una sola vez, `npx playwright install chromium firefox` (sin sudo).

```bash
npm test                         # unitarias, integración y lint como prueba (Vitest)
npx vitest run --coverage        # lo mismo con cobertura y umbrales; informe en coverage/
npm run test:e2e                 # E2E: chromium, chromium-avisos y firefox (2 workers)
npx playwright test --project=firefox            # solo Firefox
npx playwright test tests/e2e/accesibilidad.spec.js   # solo axe
npm run lint                     # ESLint + Prettier
npm run check                    # lint + test + api:lint + audit:prod
```

Para depurar una E2E que falla: `npx playwright show-trace test-results/<prueba>/trace.zip` (se guarda la traza de las que fallan).

## 7. Riesgos de las pruebas

- **Máquina compartida.** La E2E fija 2 workers y amplía el margen de `expect` a 10 s. Si se suben los workers, RNF-03 y las pruebas de Firefox se vuelven lentas.
- **Firefox y COOP.** Con `Cross-Origin-Opener-Policy: same-origin`, Playwright 1.64 pierde en Firefox la emulación de `prefers-color-scheme` en la primera navegación. `tema.spec.js` emula después de cargar y recarga. Revisarlo al subir de Playwright.
- **El tiempo de RNF-03 se mide dentro de la página**, desde la respuesta hasta la lista. El tiempo de pared incluye pasar unos 7 MB por el protocolo de Playwright y no representa al usuario.
