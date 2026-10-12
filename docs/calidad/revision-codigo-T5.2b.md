# Revisión de las correcciones de la Fase 5 (T5.2b)

- **Revisor:** revisor-codigo
- **Diff revisado:** `9a0e7cd..bc165ca` (`src` y `public`, con sus pruebas)
- **Fecha:** 2026-10-12
- **Veredicto:** **APROBADO CON CAMBIOS.** No hay hallazgos bloqueantes ni altos. Hay que corregir N-01 y N-02 antes de la sesión de 24 h (RNF-16).

## Estado de R-01…R-21

- **Cerrados (17):** R-01, R-02, R-03, R-04 (sin prueba de la política del proceso: ver N-03), R-06, R-07, R-08, R-09, R-10, R-11, R-12, R-13, R-14, R-15, R-17, R-18, R-20 y R-21.
- **Parciales:**
  - R-05: falta el traslado del proyecto, que es condición del release (AM-32);
  - R-16: siguen esperas fijas en `rafaga.spec.js` y `stream.test.js:88` (ver N-06).
- **Abierto:** R-19, una sugerencia que pasa a la Fase 6.

## Otros informes

- **Cerrados:** S-01; P-01 a P-06; C1 a C8 (revisados en el código).
- **S-04:** sigue como riesgo aceptado.

## Hallazgos nuevos

| ID | Severidad | Dónde | Descripción | Corrección |
|---|---|---|---|---|
| N-01 | **media** | `public/js/agrupador.js:38-46` | `vaciar()` limpia los ids antes de `pintar(lote)`, que no está protegido. Si `pintar` lanza, esos cambios se pierden y el mapa queda desincronizado | `try/catch`: si falla, marcar el siguiente lote como completo y reprogramar; añadir una prueba |
| N-02 | baja | `src/server/index.js:217-221` | Un SIGTERM durante el apagado por `uncaughtException` sale con código 0 | Conservar el código de salida más alto |
| N-03 | baja | `src/server/index.js:198-245` | La política de `uncaughtException` no tiene prueba | Prueba de integración: código 1, línea `proceso.excepcion` y puerto libre |
| N-04 | baja | `public/js/mapa.js:423-440,494` | El pulso no se retira al quitar el sismo | Asociar el pulso al id y retirarlo en `quitar` |
| N-05 | baja | `public/js/main.js:429-437,238-240` | La ventana emergente pendiente se abre al volver a la pestaña, quizá minutos después | Abrirla solo si la pestaña está visible y el sismo es reciente |
| N-06 | baja | `tests/e2e/rafaga.spec.js:80,103`; `tests/integracion/stream.test.js:88` | Esperas fijas | `expect.poll` o temporizadores simulados |
| N-07 | baja | `src/server/fuentes/emsc-ws.js:413-422` | Un error a mitad de `ingerirLote` no encaja con la política de «estado corrupto» de `uncaughtException` | Documentar que el catálogo es recuperable, o marcar la fuente como degradada |
| N-08 | sugerencia | `rutas-sismos.js:155,200` | Un error en `pull` no llega al log estructurado | `try/catch` con `log.error` y `controller.error` |
| N-09 | sugerencia | `planificador.js:399` | `fuente.resincronizacion` se registra aunque `n === 0` | Registrar solo si `n > 0` |
| N-10 | sugerencia | `asignar-pais.js` | La caché LRU depende de que las zonas sean estáticas | Documentarlo en el JSDoc, o usar la versión de las zonas en la clave |

## Revisado sin defectos

Índice perezoso y histéresis del catálogo, agrupador (ids eliminados con un frame pendiente y reemplazos), desempate aproximado en CO-PA y respuesta en trozos (JSON idéntico y contrapresión).

## Evidencia

- `npm test`: 1312 de 1312 pruebas en verde, en dos ejecuciones.
- `npm run lint` y `npm run api:lint`: limpios.
- Cobertura: 70,05 % de líneas.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Apache: `.git/HEAD` → 200; `index.html` → 404.
