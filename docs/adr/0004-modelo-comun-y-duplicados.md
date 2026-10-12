# 0004. Modelo común de sismo y eliminación de duplicados entre fuentes

- Estado: propuesto
- Fecha: 2026-10-10 · Decisores: arquitecto-software, Director

## Contexto

Un mismo sismo llega por tres canales:
- **EMSC WebSocket** y **EMSC FDSN**, que comparten el `unid`;
- **USGS FDSN**, con `id` y la lista `ids`, que puede cambiar de id preferido (por ejemplo, de `pt…` a `us…`).

El PRD v0.2 (épica E1) fija las reglas, con valores iniciales configurables que T4.2 calibra:
1. Misma fuente y mismo identificador = mismo sismo. `update` modifica el sismo existente.
2. Entre fuentes distintas, es el mismo sismo si se cumplen las tres condiciones: **Δt ≤ 30 s**, **Δd ≤ 100 km** y **ΔM ≤ 1.0**.
3. Precedencia de datos:
   1. autor nacional dentro de EMSC (`auth=IGN` en España, `auth=IGC` en Panamá);
   2. después EMSC;
   3. después USGS.

   Colombia no tiene agencia nacional en las fuentes.

**Además:**
- la profundidad se normaliza a positivo (EMSC la publica en negativo en `coordinates[2]`);
- las altas tardías no se notifican si la hora de origen es de hace más de 1 h (configurable).

**Datos reales.** El fixture [`tests/fixtures/dedup/pares-usgs-emsc.json`](../../tests/fixtures/dedup/pares-usgs-emsc.json) se generó para este ADR. Contiene consultas FDSN en vivo del 2026-10-10: la secuencia de Panamá desde el 2026-10-08 (M ≥ 3.5) y España desde el 2026-07-01 (M ≥ 2.5).

| Medida | Resultado |
|---|---|
| Pares USGS↔EMSC del mismo sismo | **54** (todos los eventos USGS encontraron pareja) |
| Δt máximo | **9,16 s** (p50: 0 s) |
| Δd máximo | **35,3 km** (p50: 0 km en América y 3,5 km en España) |
| ΔM máximo | **0,9**: `us6000u1ck` mb 4.5 frente a `20261010_0000086` IGC M 3.6, con 0,2 s y 13,6 km |
| Pares en los que EMSC trae la solución de NEIC (`auth=NEIC`) | 23 de 54, idénticos a USGS (Δ = 0) |
| Eventos EMSC **distintos** más cercanos en el tiempo | 14,5 s pero a 331 km; 57 s y 99,6 km; 51,8 s y 231 km |
| Candidatos por evento USGS con Δt ≤ 20 s y Δd ≤ 100 km | siempre **1** (sin ambigüedad), incluso en plena secuencia de réplicas |

**Otras observaciones de los fixtures de T1.2:**
- `emsc-ws/mensajes.jsonl`: el `unid` `20261010_0000106` llegó con `auth=IGC` y M 4.4. Una hora después, FDSN lo devolvía con `auth=NEIC` y M 4.6. **El autor de un mismo `unid` cambia con el tiempo.**
- EMSC envía `create` de eventos de hace 30 h (Aleutianas).
- `coordinates[2]` es negativo en EMSC y positivo en USGS.

## Opciones consideradas

1. **Umbrales fijos Δt, Δd y ΔM, eligiendo el candidato con la puntuación más baja, nunca dos registros de la misma fuente en un sismo y asociación permanente.**
   - Pros: simple, determinista y fácil de probar.
   - Contras: los umbrales son empíricos.
2. **Servicio de conversión de ids de EMSC** (`/eventid/api/convert`), consultado por cada evento USGS.
   - Pros: es exacto cuando responde.
   - Contras: una petición externa más por evento, otra dependencia de disponibilidad y más latencia. Queda como posible mejora si la opción 1 falla en la práctica.
3. **Agrupación por ventana** (*clustering* de todo lo recibido cada N segundos).
   - Contras: añade latencia y complejidad, y no aporta nada con estos volúmenes.

## Decisión

**Opción 1.**

### Modelo común

El esquema `Sismo` de `docs/api/openapi.yaml` es la referencia.

Cada sismo canónico agrupa **como máximo un registro por fuente** (`emsc`, `usgs`). Cada registro (`RegistroFuente`) guarda los datos ya normalizados de su fuente.

**Campos de nivel superior.** Salen del **registro preferido**:
- `tiempo`, `lat`, `lon`, `profundidadKm`, `magnitud`, `magnitudTipo`, `lugar` y `autor`;
- `url`, construida por el servidor a partir del id, nunca con el `url` de la fuente (AM-02).

**Campos derivados:**
- `pais`, `zona` y `zonaHoraria`, a partir de la ubicación preferida (ADR-0005);
- `actualizadoEn`: el máximo de los `actualizadoEn` de los registros;
- `recibidoEn`: la primera recepción del sismo en el servidor;
- `revision`: aumenta con cada cambio visible.

**Identificador estable.** Es `<fuente>:<idFuente>` del **primer registro** que creó el sismo. No cambia aunque luego gane otra fuente.

### Normalización por fuente

Se aplica antes de deduplicar. Construye objetos nuevos campo a campo (AM-05).

| Campo | EMSC (WS y FDSN) | USGS |
|---|---|---|
| id | `properties.unid` | `id`; para asociar se usan también todos los de `ids` |
| tiempo | `properties.time` (ISO) | `properties.time` (ms) |
| actualizado | `properties.lastupdate` | `properties.updated` (ms) |
| lat/lon | `properties.lat/lon`; lon normalizada a [−180, 180] | `geometry.coordinates[1]/[0]` |
| profundidad | `properties.depth` (positiva); si falta, `−coordinates[2]` | `coordinates[2]` |
| magnitud y tipo | `mag`, `magtype` | `mag`, `magType` |
| autor | `auth` | `net` en mayúsculas |
| lugar | `flynn_region` | `place` |
| se descarta si | `mag` es `null`, `evtype` no es `ke` ni `se`, o falla algún rango de AM-05 | `mag` es `null`, `type` ≠ `earthquake`, o falla algún rango de AM-05 |

Se aceptan `ke` (sismo conocido) y `se` (sismo sospechado). Los demás tipos (voladuras, explosiones…) no son sismos para el usuario. Si una revisión reclasifica un sismo existente, este se retira y se emite `sismo.eliminado` con el motivo `retirado`.

### Asociación (al recibir un registro R de la fuente F)

1. **Por id:** si R coincide con un registro ya asociado (el mismo `unid` en EMSC; en USGS, cualquier id de `ids`), es una actualización:
   - se aplica **solo si su `actualizadoEn` es posterior** al guardado, de modo que una respuesta FDSN en caché más antigua que un `update` del WebSocket no lo revierte;
   - la asociación es **permanente**: aunque la revisión aleje el registro, sigue en su sismo y no hay oscilaciones.
2. **Por cercanía:** si no coincide por id, se buscan candidatos entre los sismos canónicos **que no tengan ya un registro de F** y que cumplan las tres condiciones respecto a los valores preferidos del candidato:

   | Parámetro (variable de entorno) | Valor inicial | Margen frente a lo observado |
   |---|---|---|
   | `DEDUP_DT_S` | 30 s | 3,3 veces el máximo observado (9,2 s). El par de sismos distintos más cercano en el tiempo (14,5 s) está a 331 km, fuera de `DEDUP_DD_KM` |
   | `DEDUP_DD_KM` | 100 km | 2,8 veces el máximo observado (35,3 km) |
   | `DEDUP_DM` | 1.0 | **Ajustado: el máximo observado es 0,9** |

   La búsqueda usa un índice por minuto de `tiempo`: se consultan el minuto anterior, el actual y el siguiente, así que el coste es O(1). Para la distancia se usa la fórmula de haversine **propia** (`distanciaKm` en `src/shared/geo.js`, sin dependencias, con el mismo radio que Turf: 6 371,0088 km), contrastada con `@turf/distance` 7.4.0 en las pruebas (`tests/unit/shared/geo.test.js`, diferencia < 10⁻⁹ km). *Actualización C-A (2026-10-11, R-10):* `@turf/distance` ya no se usa en ejecución y pasa a `devDependencies`, como referencia de las pruebas.
3. **Elección:** si hay varios candidatos, gana el de menor puntuación `Δt/DEDUP_DT_S + Δd/DEDUP_DD_KM + ΔM/DEDUP_DM`. En caso de empate (con una tolerancia de 10⁻⁹ para la coma flotante), gana el de `recibidoEn` más antiguo y después el id menor. La fusión tardía (paso 4) usa el mismo desempate (`mejorCandidato` en `src/shared/duplicados.js`, R-14). Si no hay ninguno, R crea un sismo nuevo.
4. **Fusión tardía:** después de cada alta o actualización, se repite la búsqueda del paso 2 para el sismo afectado frente a sismos cuyas fuentes no se solapen con las suyas.
   - Si aparece un par, se fusionan en el de `recibidoEn` más antiguo.
   - Se emite `sismo.eliminado` (`motivo: fusionado`, `reemplazadoPor`) para el absorbido y `sismo.actualizado` para el superviviente.
   - La página traslada al superviviente el estado de «ya notificado» (sin duplicar avisos, HU-11).
5. **Nunca** se fusionan dos registros de la misma fuente. Dos `unid` de EMSC son, por definición, dos sismos. Esto protege frente a las ráfagas de réplicas.

### Precedencia

Se recalcula en cada cambio, porque el autor de un `unid` puede cambiar.

| Rango | Registro |
|---|---|
| 1 | EMSC con `autor` = agencia nacional del país asignado: `IGN` si `pais = ES`, `IGC` si `pais = PA`. Para Colombia no hay ninguna (PRD) |
| 2 | Cualquier otro registro de EMSC |
| 3 | USGS |

Para el rango 1 se usa el país asignado con la ubicación del registro EMSC. Así se evita una dependencia circular entre el país y la precedencia.

### Notificable

`notificable = (ahora − tiempo) ≤ AVISO_VENTANA_MIN` (60 min por defecto, PRD E4). Se calcula en el servidor **al emitir** y viaja en el evento SSE. La regla completa de aviso se aplica en la página con `src/shared/avisos.js`:
- `notificable`;
- el país está marcado;
- la magnitud **redondeada a un decimal** es ≥ umbral (D1);
- el id no se ha notificado ya.

La carga inicial (`GET /api/sismos`) y los eventos reenviados tras `flujo.reiniciar` no notifican nunca.

## Consecuencias

- **Positivas:**
  - un solo elemento por sismo, con enlaces a todas sus fuentes (HU-01);
  - las revisiones actualizan el elemento sin crear otro;
  - las altas tardías no generan avisos;
  - las reglas se pueden probar con fixtures reales.
- **Negativas y riesgos:**
  - **ΔM = 1.0 tiene poco margen** (0,9 observado entre ML local y mb telesísmico). Si un par real lo supera, el usuario vería dos elementos del mismo sismo. T4.2 lo calibra con el fixture. Si aparecen más casos, se puede subir a 1.2 sin riesgo apreciable: los eventos distintos más próximos en el tiempo están a más de 99 km o a más de 14 s;
  - en una secuencia muy densa (varias réplicas en 30 s y 100 km), una réplica USGS podría asociarse a la réplica EMSC equivocada. Lo limita la puntuación, que incluye ΔM, y la regla de una fuente por sismo. El fixture no muestra ningún caso.
- **Más difícil:** añadir una tercera fuente con muchos eventos (por ejemplo, el GeoRSS del IGN) exige revisar la tabla de precedencia. La estructura de «un registro por fuente» ya lo admite.
- **Cómo se revierte:** los umbrales son configuración. Cambiar el algoritmo afecta solo a `src/server/dominio/catalogo.js` y a sus pruebas.
