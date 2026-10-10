# 0005. Filtro de país: rectángulo para consultar y contorno con franja marina para filtrar, generados con un script

- Estado: propuesto
- Fecha: 2026-10-10 · Decisores: arquitecto-software, Director

## Contexto

- **Lo que cubre cada país** (A3):
  - España: península, Baleares, Canarias, Ceuta, Melilla, Alborán y Chafarinas;
  - Colombia: continente, ambas costas, Malpelo, San Andrés y Providencia. **Sin** Serrana ni Serranilla en la entrega 1;
  - Panamá.
- **Franja marina:** 100 km, igual para los tres países y configurable (D2).
- **Doble filtro:** las fuentes FDSN solo filtran por rectángulo; el filtro fino es por contorno (plan §3.4). El WebSocket de EMSC emite todo el mundo.
- **Frontera Colombia-Panamá:** un sismo en la franja de ambos se muestra si cualquiera de los dos está marcado y se asigna al país con la costa o frontera más cercana (HU-03).
- **Requisito de cobertura (PRD v0.2, E2):** el rectángulo de cada zona debe contener por completo el contorno ampliado, y **una prueba lo verifica**. Los rectángulos escritos a mano en T1.2 se quedan cortos (Galicia, Cantábrico, El Hierro, Alegranza y el norte de CO-SAI y de PA).
- **Coste de `@turf/buffer`:** arrastra `@turf/jsts`, con licencia EDL-1.0/EPL-1.0, y `d3-geo`. Pesa y no hace falta en producción (STACK.lock).

**Comprobación hecha para este ADR** sobre Natural Earth 10m `admin_0_countries` v5.1.2. Archivo: 13,3 MB, SHA-256 `239eec57…8f255`.

| Territorio | ¿Está en el polígono del país? |
|---|---|
| Ceuta, Melilla, Chafarinas, El Hierro, Menorca, Providencia y Coiba | Sí |
| San Andrés, Malpelo | Sí: hay vértices a 0,8 y 1,7 km del punto de prueba |
| **Isla de Alborán** | **No.** El vértice español más cercano está a 68 km |
| **Peñón de Vélez de la Gomera** | **No.** Queda dentro del polígono de Marruecos |
| Alegranza | No, pero Lanzarote está a 12 km, así que la cubre la franja |
| Serranilla y Bajo Nuevo | Son entidades propias («Serranilla Bank», «Bajo Nuevo Bank»), así que quedan fuera de Colombia, como pide el PRD |

## Opciones consideradas

**A. Forma del filtro fino**
1. **Solo el rectángulo.**
   - Contras: incluye media Francia, Portugal, Marruecos, Venezuela, Ecuador… Incumple HU-03.
2. **El polígono del país ampliado 100 km.**
   - Contras: la ampliación también cubre **tierra de los vecinos**:
     - el norte de Marruecos alrededor de Ceuta y Melilla;
     - una franja de Portugal y Francia;
     - zonas de Venezuela, Ecuador, Perú, Brasil y Costa Rica.
   - Esos sismos se asignarían a España o a Colombia, cuando el requisito habla de **franja marina**.
3. **El polígono del país ampliado 100 km, menos la tierra de los demás países.** Se queda el territorio propio más el mar a ≤ 100 km de su costa.
   - Pros: es lo que significa «franja marina».
   - Contras: un paso más en la generación (`@turf/difference`).

**B. Cuándo se calcula**
1. **Al arrancar el servidor.**
   - Contras:
     - `@turf/buffer`, jsts y la descarga de Natural Earth pasarían a producción;
     - cuesta segundos de CPU en cada arranque;
     - el resultado no se puede revisar en un diff;
     - un fallo de geometría tumba el arranque.
2. **Con un script de preparación que genera un artefacto versionado.**
   - Pros:
     - en producción solo hace falta punto-en-polígono y distancia;
     - el artefacto se revisa y se prueba;
     - el arranque es instantáneo y determinista.
   - Contras: cambiar la franja exige regenerar el archivo (`npm run zonas`).

## Decisión

**A3 + B2.**

**Script** `scripts/generar-zonas.js` (`npm run zonas`, solo con dependencias de desarrollo):
1. **Entrada:** Natural Earth 10m `admin_0_countries` **v5.1.2** (dominio público). Se descarga de `raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson` y se **comprueba el SHA-256** `239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255`. Se guarda en una caché local ignorada por git.
2. **Correcciones manuales** versionadas en `scripts/datos/territorios-extra.geojson`:
   - Isla de Alborán;
   - Peñón de Vélez de la Gomera.

   Cada una es un polígono pequeño con la fuente de sus coordenadas. Una prueba exige que cada territorio de la lista de A3 caiga dentro de su zona.
3. **Partición en zonas.** Cada parte del país se asigna a una zona por su centroide:

   | Zona | Partes |
   |---|---|
   | `ES-PEN` | Península, Baleares, Ceuta, Melilla, Chafarinas, Alborán y Vélez |
   | `ES-CAN` | Canarias |
   | `CO-CONT` | Continente y Malpelo |
   | `CO-SAI` | San Andrés y Providencia |
   | `PA` | Panamá |

   La ampliación se hace **por zona**: `@turf/buffer` proyecta alrededor del centroide de cada zona, y hacerlo por zona evita la distorsión de ampliar España y Canarias juntas.
4. **Cálculo por zona:** `ampliado = buffer(partes, FRANJA_KM)` y después `zona = ampliado − tierra de los demás países`, con `@turf/difference` contra todos los demás países de Natural Earth.
5. **Simplificación** (`@turf/simplify`, tolerancia de 0,01°, unos 1 km) del polígono `zona` y del polígono `tierra` (las partes del país sin ampliar). `tierra` sirve para desempatar en la frontera.
6. **Rectángulo de consulta** = envolvente de `zona` + 0,1° de margen, **redondeada hacia fuera a 0,1°**. **Los rectángulos se calculan, no se escriben a mano**: así se cumple el requisito de cobertura por construcción.
7. **Salida:** `src/server/geo/zonas.json`, versionado. Por zona incluye `id`, `pais`, `zonaHoraria`, `rectangulo`, `zona` (MultiPolygon) y `tierra` (MultiPolygon). En `meta` guarda:
   - `franjaKm`;
   - la fuente, su versión y su SHA-256;
   - la fecha de generación;
   - las versiones de Turf;
   - el recuento de vértices.

**En ejecución** (`src/server/geo/asignar-pais.js`; dependencias `@turf/boolean-point-in-polygon` y `@turf/point-to-polygon-distance`):
1. Candidatas: las zonas cuyo `rectangulo` contiene el punto y cuyo polígono `zona` también lo contiene.
2. Si ninguna zona lo contiene, el sismo no es de ningún país. Se guarda para deduplicar, pero no se sirve.
3. Si las candidatas son de un solo país, se asigna ese país, con la zona y la zona horaria de la candidata.
4. Si son de varios países (frontera CO-PA en el mar), se asigna el país cuyo polígono `tierra` esté más cerca (`pointToPolygonDistance`). En HU-03 se muestra si **cualquiera** de los países candidatos está marcado. Para ello el sismo lleva internamente `paisesCandidatos`; el contrato solo expone `pais`.

**Zona horaria por zona:**

| Zona | Zona horaria |
|---|---|
| `ES-PEN` | `Europe/Madrid`. Ceuta y Melilla tienen las mismas reglas (CET/CEST) que `Africa/Ceuta`, y el texto es «hora peninsular» |
| `ES-CAN` | `Atlantic/Canary` |
| `CO-CONT`, `CO-SAI` | `America/Bogota` |
| `PA` | `America/Panama` |

**Pruebas obligatorias** (T4.2):
- para cada zona, el rectángulo contiene la envolvente del polígono `zona`;
- cada territorio de A3 cae en su zona;
- los casos de HU-03: un sismo a 80 km de la costa de Almería entra y uno a 120 km de cualquier costa española no; uno cerca de Serranilla no entra;
- un sismo en tierra marroquí a 30 km de Melilla **no** entra en ES;
- un sismo en tierra portuguesa a 50 km de la frontera **no** entra en ES;
- un sismo en el mar a 50 km de la costa portuguesa y a más de 100 km de la española **no** entra;
- en la frontera CO-PA, en el mar, se asigna el país más cercano.

## Consecuencias

- **Positivas:**
  - en producción solo hay dos módulos pequeños de Turf;
  - los rectángulos siempre cubren la franja;
  - las asignaciones son deterministas y se pueden probar;
  - jsts no sale del entorno de desarrollo.
- **Negativas:**
  - **la interpretación «franja marina = mar» excluye los sismos en tierra de los países vecinos**, aunque estén a menos de 100 km de la frontera (por ejemplo, el norte de Marruecos o el Alentejo). La nota de D2, «se aceptan algunos sismos de países vecinos cerca de la frontera», se cumple solo en el mar. **Lo confirma el Director** al aprobar la arquitectura. Si prefiere incluir también la tierra vecina, basta con quitar el paso 4 del script; el código de ejecución no cambia;
  - el archivo `zonas.json` pesa del orden de cientos de KB, que solo carga el servidor;
  - los rectángulos derivados son más amplios que los de T1.2 (por ejemplo, `ES-PEN` crece hacia el norte y el oeste), así que llegarán más eventos de fuera que se descartan. Es un coste despreciable.
- **Más difícil:** cambiar la franja (D2) exige `FRANJA_KM=<km> npm run zonas` y volver a pasar las pruebas. No es una variable de ejecución. El servidor registra al arrancar el `franjaKm` del artefacto.
- **Entrega 2 (filtro de radio):** es un predicado más (`@turf/distance`) sobre el mismo sismo. No toca las zonas.
- **Cómo se revierte:** se regenera el archivo con otros parámetros u otra fuente de contornos. La interfaz de `asignarPais(lat, lon)` no cambia.
