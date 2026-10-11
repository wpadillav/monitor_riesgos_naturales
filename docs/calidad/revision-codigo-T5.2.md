# Revisión de código — entrega 1 (T5.2)

- **Revisor:** revisor-codigo
- **Commit revisado:** `9a0e7cd`
- **Fecha:** 2026-10-11
- **Veredicto:** **APROBADO CON CAMBIOS.** Obligatorios R-01 a R-05; el resto es recomendable.

**Puntos fuertes:**
- frontera de `src/shared` pura y aplicada por ESLint;
- normalizador único (AM-05);
- `http-cliente` con límites en streaming;
- difusor SSE bien diseñado;
- página sin `innerHTML`;
- JSDoc completo;
- `src/shared` con un 100 % de cobertura.

## Hallazgos

| ID | Severidad | Dónde | Hallazgo | Corrección propuesta |
|---|---|---|---|---|
| R-01 | **bloqueante** | `public/js/filtros.js:198`, `avisos.js:74`, `stream.js:222` frente a `catalogo.js:552` e `index.js:130` | La página filtra por `sismo.pais` y el servidor por `paisesCandidatos` (franja CO-PA, 260 puntos en una malla de 0,1°; ej. 9.5, −77.1 → `PA` con candidatos `[CO, PA]`). Con solo Colombia marcada, la página no pinta los nuevos, borra los cargados al llegar un `sismo.actualizado` y nunca avisa. Incumple HU-03, HU-11 y ADR-0005 | Añadir `paisesCandidatos` al `Sismo` (contrato y `componerSismo`). La página filtra y avisa con `paises.some(...)`. El difusor usa ese campo (R-11). Prueba unitaria y E2E en 9.5, −77.1 |
| R-02 | alta | `public/js/filtros.js:199` frente a `difusor.js:92` y `catalogo.js:551` | Magnitud de la lista: la página usa la redondeada y el servidor la cruda. Con `magMin=5.0` y `avisoMin=4.5`, un M 4.96 entra en la lista y desaparece al recargar | Una sola regla en `src/shared`. Ver la decisión del coordinador más abajo |
| R-03 | alta | `tests/unit/server/dominio/catalogo.test.js:447` | La prueba de 60 000 sismos tarda unos 5,35 s y falla con el timeout de 5 s cuando el equipo está cargado | Timeout explícito o un `tope` inyectado más pequeño |
| R-04 | alta | `emsc-ws.js:416-444`, `difusor.js:228`, `index.js:199` | Una excepción en `drenar`, `vaciarLote` o el latido llega a `uncaughtException` y el proceso se cae | `catch` con log en esos tres puntos y política documentada para `uncaughtException`. Prueba con un catálogo que lanza |
| R-05 | alta | despliegue (AM-32) | Apache sirve `.git`, `package.json`, `src/` y el `index.html` v1 de la raíz, que tiene XSS con datos de USGS | Trasladar el proyecto (decisión del Director: al final) y retirar el `index.html` de la raíz |
| R-06 | media | constantes en servidor y página | Reglas y constantes del contrato duplicadas: opciones de magnitud, periodos, redondeo, umbrales, patrón de id y nombres de país | Moverlas a `src/shared` (arquitectura §5.8 y §6) |
| R-07 | media | `emsc-ws.js:347-358`, `planificador.js:367-380` | `resincronizar` no tiene límite de frecuencia y adelanta zonas que estaban en espera de reintento: rompe RNF-10 y RNF-06 | Como máximo una por intervalo y canal; no adelantar las zonas con `fallos > 0` |
| R-08 | media | `retencion.js` (0 %), `tests/unit/public/*` (36,8 %) | Huecos de pruebas en `retencion.js`, la franja CO-PA de la página y las excepciones del drenaje | Añadir pruebas y umbrales por directorio |
| R-09 | media | `public/js/main.js` (605 líneas) | Orquestación mezclada con el DOM, con 0 % de cobertura unitaria | Extraer `crearCargador({...})` con dependencias inyectadas |
| R-10 | baja | `package.json` | `@turf/distance` está en `dependencies` sin uso en producción | Pasarla a `devDependencies`; actualizar el lock y el ADR-0004 |
| R-11 | baja | `index.js:130`, `difusor.js:146` | `paisesDe` repite el cálculo con Turf aunque el catálogo ya guarda `paisesCandidatos` | Usar el campo del `Sismo` |
| R-12 | baja | `estado-fuentes.js:79,119-125` | Los oyentes no están protegidos y no se difunde el cambio de `proximoIntentoEn` | Patrón `emitir` del catálogo |
| R-13 | baja | `difusor.js:363,480` | `toleranciaBytes` permanente tras el reenvío inicial | Reducirla a medida que se vacía la cola (AM-13) |
| R-14 | baja | `catalogo.js:324-330` | El desempate de la fusión tardía no usa `EPSILON` | Reutilizar `elegirCandidato` |
| R-15 | baja | `catalogo.js:437-450` | Con el catálogo en el tope, cada `ingerir` ordena las 50 000 entradas | Histéresis (purgar hasta el 95 %) o una cola ordenada |
| R-16 | baja | `tests/integracion/stream.test.js:89`, `tests/e2e/filtros.spec.js:77,93` | Esperas reales con tiempos fijos | Temporizadores simulados o `expect.poll` |
| R-17 | sugerencia | `api.js`, `estado.js`, `filtros.js`, `barra-estado.js` | Comentarios desfasados | Actualizarlos |
| R-18 | sugerencia | `mapa.js` (`pulsados`) | El `Set` de ids pulsados crece sin límite | Quitar el id en `quitar(id)` |
| R-19 | sugerencia | `emsc-ws.js:33`, `normalizar-comun.js:7` | Acoplamientos cruzados entre capas | Mover el limitador a `infra/` y `FuenteError` a `fuentes/errores.js` |
| R-20 | sugerencia | `src/shared/texto.js:10` | Caracteres bidi invisibles en la regex | Escribirlos como escapes `\u…` |
| R-21 | sugerencia | `rutas-sismos.js:133` | `HEAD /api/sismos` hace todo el trabajo de GET | Responder a HEAD sin pedir cobertura a las fuentes |

## Evidencia

- `npm run lint` y `npm run api:lint`: sin errores.
- `npm test`: 1000/1001 en la primera ejecución (R-03); 1001/1001 con `--testTimeout=20000`.
- Cobertura de líneas: 65,9 % en total; `src/shared` 100 %; `dominio` 94,8 %; `fuentes` 98,3 %; `http` 99,4 %; `stream` 97,4 %; `public/js` 36,8 %.
- `npm ls --omit=dev`: las 7 dependencias del lock en versión exacta. `npm audit`: 0 vulnerabilidades.

## Decisión del coordinador sobre R-02 (2026-10-11)

El **filtro de la lista** usa la **magnitud cruda**, como el contrato y el `minmag` de FDSN. El **redondeo a un decimal** se aplica solo a los **avisos** (decisión D1 del PRD). Las dos reglas se implementan en un único módulo de `src/shared`, y el PRD (HU-04) recoge la aclaración.
