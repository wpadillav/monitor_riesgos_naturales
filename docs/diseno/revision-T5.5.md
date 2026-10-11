# Revisión UX T5.5 — Cambios introducidos en la Fase 4

**Tarea:** T5.5 · **Autor:** disenador-ux-ui · **Fecha:** 2026-10-11 · **Base revisada:** `main` @ 9a0e7cd
**Material:** `public/index.html`, `public/css/app.css`, `public/js/` (barra-estado, mapa, avisos, filtros-ui, main) y las cuatro capturas de `docs/diseno/capturas/`.

Es una revisión de la interfaz construida, no un rediseño. Cada punto del encargo tiene una decisión: **Aprobado** o **Cambio** (con archivo, selector o identificador y valor exactos). Ningún cambio toca colores: todos los pares de color que aparecen ya están verificados en [tokens.md §2.3](tokens.md). Los textos definitivos están en [textos.md](textos.md), que ya no tiene marcas «pendiente de validar».

## Resumen de decisiones

| # | Punto del encargo | Decisión | Severidad | Cambio |
|---|---|---|---|---|
| 1.1 | Estado `sin-plazas` | **Cambio de texto.** Complemento, icono y color aprobados | Media | C1 |
| 1.2 | «El servidor local ha devuelto un error. Reintentando…» | **Aprobado el texto.** Cambio menor de icono | Baja | C2 |
| 1.3 | Nota de Colombia | **Cambio de texto** menor | Baja | C3 |
| 1.4 | Atribución de Esri | **Cambio**: falta «Powered by Esri», que Esri exige | **Alta** | C4 |
| 1.5 | Segunda línea de la notificación | **Aprobado**. Encaja con la ventana emergente y el pie | — | — |
| 2.1 | Pie a todo el ancho en escritorio | **Aprobado** | — | — |
| 2.2 | Orden del DOM cabecera → main (filtros, lista, mapa) → pie | **Aprobado**. Actualizo el wireframe | — | — |
| 2.3 | «SGC y UNGRD» como dos enlaces | **Aprobado**, con un ajuste de marcado en los cuatro canales | Baja | C6 |
| 3.1 | Escritorio de poca altura: la lista muestra 2 o 3 filas | **Cambio**: panel «Filtros y avisos» plegable cuando la altura es de 900 px o menos | Media | C7 (+ C8 opcional) |
| 3.2 | Móvil: la atribución de Esri ocupa 3 líneas | **Cambio**: en móvil, el mapa muestra una línea y la lista de proveedores pasa al despliegue del pie | Media | C5 |

Orden de aplicación recomendado: C4 → C5 → C7 → C1 → C6 → C3 → C2 → C8.

---

## 1. Textos nuevos

### 1.1 Estado `sin-plazas` — Cambio C1 (media)

**Qué falla en el texto actual.** «Tiempo real no disponible: hay demasiadas pestañas abiertas. Reintentando…»
- Explica la causa, pero no dice qué puede hacer el usuario, y es lo único que lo arregla (heurística 9 de Nielsen; patrón «qué pasó + qué hacer» de textos.md §1).
- Empieza igual que el aviso de fuente «Tiempo real no disponible: los sismos nuevos pueden tardar hasta 1 min.» (textos.md §3), que habla de otra cosa: el WebSocket de EMSC con el servidor. Los dos pueden salir a la vez, uno en la línea de estado y otro en la línea de fuentes. Usar la misma frase para dos causas distintas confunde (heurística 4).

**Cambio.**

| Archivo | Identificador | Valor actual | Valor nuevo |
|---|---|---|---|
| `public/js/barra-estado.js` | `ESTADOS['sin-plazas'].texto` | `Tiempo real no disponible: hay demasiadas pestañas abiertas. Reintentando…` | `Sin actualizaciones en vivo: hay demasiadas pestañas abiertas. Cierra alguna. Reintentando…` |
| `public/js/barra-estado.js` | comentario de la línea 43 («Texto nuevo (T5.0), pendiente de validar…») | — | Borrarlo. El texto ya está validado en textos.md §3. |
| `tests/e2e/vivo.spec.js` | líneas 220 y 234 | texto anterior | texto nuevo |

**Se aprueba sin cambios:**
- el complemento `· {n} sismos · último dato a las {HH:MM:SS}`. El contador es útil porque la lista sigue visible, y «último dato a las» es la misma fórmula que en «Reconectando…»;
- el icono de flechas en círculo (`i-reconectando`);
- la clase `e-aviso`. El servidor responde y los datos siguen ahí, así que es un aviso y no un error: mismo criterio que «Reconectando…». Contraste ya verificado: `#f6c35b` sobre `#161920` da 10,7:1 y `#8a5300` sobre `#ffffff` da 6,32:1.

### 1.2 «El servidor local ha devuelto un error. Reintentando…» — Aprobado; cambio C2 (baja)

**El texto se aprueba.** Sigue la misma fórmula que «Sin conexión con el servidor local. Reintentando…» y que el estado vacío de la lista («El servidor local ha devuelto un error. Volveremos a intentarlo en {n} s.»). La acción manual ya la ofrece el botón «Reintentar ahora» de la lista. El color de error es correcto.

**Icono.** Ahora usa `sin-conexion` (círculo tachado), que significa «no hay conexión». Aquí sí hay conexión: el servidor responde, pero con un error. Para que la forma no diga algo distinto que el texto:

| Archivo | Identificador | Valor actual | Valor nuevo |
|---|---|---|---|
| `public/js/barra-estado.js` | `ESTADOS['error-servidor'].icono` | `'sin-conexion'` | `'triangulo'` (el símbolo `#i-triangulo` ya está en el sprite de `index.html`) |

### 1.3 Nota de Colombia — Cambio C3 (baja)

El contenido es correcto y cumple el escenario «Nota de cobertura» del PRD: `main.js` solo la muestra con Colombia marcada. Ajusto tres cosas:
- «inferior a 4.0» pasa a «menor que 4.0», más cercano al lenguaje de la leyenda («Menos de 3.0»);
- «la lista puede mostrar menos sismos» pasa a «la lista puede tener menos sismos que la del…», para que la comparación sea entre listas;
- se añade «(SGC)», que enlaza con el enlace «SGC» de la misma línea del pie.

| Archivo | Selector | Valor nuevo (texto completo del `<p>`) |
|---|---|---|
| `public/index.html` | `#nota-colombia` | `En Colombia, EMSC y USGS registran pocos sismos de magnitud menor que 4.0: la lista puede tener menos sismos que la del Servicio Geológico Colombiano (SGC).` |

### 1.4 Atribución de Esri — Cambio C4 (**alta**)

**Problema.** Las condiciones de atribución de Esri para mapas interactivos exigen el texto **«Powered by Esri»** (literal, sin traducir), con «Esri» enlazado a `https://www.esri.com`. Además piden la atribución de los proveedores de datos. El texto actual («Teselas © Esri — Esri, HERE, Garmin, …») solo incluye lo segundo. Es un incumplimiento de los términos de uso de las teselas.

**Lo que se aprueba:**
- la lista de proveedores. Coincide con el `copyrightText` del servicio, que he comprobado hoy: «Esri, HERE, Garmin, (c) OpenStreetMap contributors, and the GIS user community»;
- su traducción. «© colaboradores de OpenStreetMap» es la fórmula oficial en español de OSM; los nombres de los proveedores no se traducen.

**Cambio.**

| Archivo | Identificador | Valor nuevo |
|---|---|---|
| `public/js/mapa.js` | `ATRIBUCION_ESRI` | ver el bloque de abajo |
| `public/js/mapa.js` | `setPrefix(...)` | añadir el texto oculto de pestaña nueva al enlace de Leaflet: `'<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet<span class="vh"> (se abre en otra pestaña)</span></a>'` |
| `tests/e2e/carga.spec.js` | línea 27 | `toContainText('Powered by Esri')` y, aparte, `toContainText('colaboradores de OpenStreetMap')` en escritorio |

```js
/** Atribución de Esri (términos de Esri: «Powered by Esri» + proveedores del copyrightText). */
const ATRIBUCION_ESRI =
  '<span lang="en">Powered by</span> ' +
  '<a href="https://www.esri.com" target="_blank" rel="noopener noreferrer">Esri<span class="vh"> (se abre en otra pestaña)</span></a>' +
  '<span class="atrib-fuentes"> | Fuentes: Esri, HERE, Garmin, © colaboradores de OpenStreetMap y la comunidad de usuarios de SIG</span>';
```

- Es una constante del código, no un dato de una fuente, así que no contradice RNF-07. Leaflet la inserta como HTML.
- `lang="en"` hace que los lectores de pantalla pronuncien «Powered by» en inglés (3.1.2).
- Cómo queda en escritorio: `Leaflet | Powered by Esri | Fuentes: Esri, HERE, Garmin, © colaboradores de OpenStreetMap y la comunidad de usuarios de SIG`, en una sola línea a partir de unos 900 px de ancho de mapa.
- Colores sin cambios: `--color-texto-secundario` y `--color-enlace` sobre `--color-superficie` dan 7,79:1 y 8,34:1 en oscuro, y 7,51:1 y 6,38:1 en día.

### 1.5 Segunda línea de la notificación — Aprobado

«Fuente: EMSC · autor: IGC. Solo informativo.» encaja con el resto:
- usa la misma fórmula que la ventana emergente («Fuente: EMSC · autor: IGC», fijada en el PRD, escenario «Fuente y autor en la ventana emergente»);
- «Solo informativo.» repite el arranque del aviso del pie;
- el caso sin autor («Fuente: EMSC. Solo informativo.») y el caso sin fuente («Solo informativo.») también son correctos;
- la línea va separada con `\n`, que los sistemas muestran como segunda línea o como espacio, y en los dos casos se lee bien.

No hay cambios.

---

## 2. Desviaciones de diseño

### 2.1 Pie a todo el ancho en escritorio — Aprobado

- Le devuelve a la lista unos 75 px, justo donde más falta hace (punto 3.1).
- El aviso «Solo informativo…» sigue siempre visible y gana visibilidad al ocupar todo el ancho (PRD O6, HU-07).
- La atribución de Esri sigue dentro del mapa, encima del pie, sin taparse.
- El mapa pierde esos mismos píxeles de alto, lo que no afecta a ninguna tarea.

He actualizado `wireframes.html` §1.2 para que diga lo mismo.

### 2.2 Orden del DOM — Aprobado

El diseño decía cabecera → filtros → lista → pie → mapa. El construido, cabecera → `main` (filtros, lista, mapa) → pie, es **mejor**:
- el mapa forma parte del contenido principal y queda dentro de `<main>`;
- el `<footer>` es el último landmark (`contentinfo`), fuera de `main`, como pide la semántica;
- en escritorio el orden de lectura y de tabulación coincide con el visual, ahora que el pie está abajo a todo el ancho (1.3.2, 2.4.3).

Consecuencia: los enlaces a canales oficiales llegan con el tabulador después de los controles del mapa (zoom, leyenda y atribución), unas 4 o 6 pulsaciones más. Se acepta, porque el enlace «Ir a la lista de sismos» y el tabindex itinerante de la lista mantienen corto el camino principal.

En móvil, el mapa se ve entre los filtros y la lista y en el DOM va después de la lista. Es la misma situación que ya aceptaba el diseño (la lista es la vía principal con teclado).

He actualizado `wireframes.html` §1.2 y la tabla §9.1.

### 2.3 «SGC y UNGRD» como dos enlaces — Aprobado, con el ajuste C6 (baja)

**Dos enlaces es lo correcto:** son dos organismos con dos webs, y un solo enlace llevaría a una de ellas con el nombre de las dos.

Al revisarlo aparece la misma pega en los demás canales:
- «IGN y 112 (España)» es un único enlace a `ign.es`, pero el 112 es un teléfono, no esa web;
- el país va unas veces dentro del enlace y otras fuera;
- en la lista de enlaces del lector de pantalla, «SGC» o «UNGRD» solos no dicen qué son.

**Cambio C6.** El país va siempre fuera del enlace, cada enlace es solo la sigla, y el nombre completo va en texto oculto (empieza por el texto visible, así que cumple 2.5.3).

| Archivo | Selector | Valor nuevo |
|---|---|---|
| `public/index.html` | `#pie-mas > p:first-child` (el párrafo «Canales oficiales:») | el bloque de abajo |

```html
<p>
  Canales oficiales:
  <a href="https://www.ign.es" target="_blank" rel="noopener noreferrer"
    >IGN<span class="vh"> (Instituto Geográfico Nacional; se abre en otra pestaña)</span></a
  >
  y 112 (España) ·
  <a href="https://www.sgc.gov.co" target="_blank" rel="noopener noreferrer"
    >SGC<span class="vh"> (Servicio Geológico Colombiano; se abre en otra pestaña)</span></a
  >
  y
  <a href="https://portal.gestiondelriesgo.gov.co" target="_blank" rel="noopener noreferrer"
    >UNGRD<span class="vh"> (Unidad Nacional para la Gestión del Riesgo de Desastres; se abre en otra pestaña)</span></a
  >
  (Colombia) ·
  <a href="https://www.sinaproc.gob.pa" target="_blank" rel="noopener noreferrer"
    >SINAPROC<span class="vh"> (Sistema Nacional de Protección Civil; se abre en otra pestaña)</span></a
  >
  (Panamá)
</p>
```

Texto visible resultante: «Canales oficiales: IGN y 112 (España) · SGC y UNGRD (Colombia) · SINAPROC (Panamá)», igual que hoy. Solo cambia qué parte es enlace.

---

## 3. Problemas detectados

### 3.1 Escritorio con poca altura — Cambio C7 (media)

**Medición en la captura de 1440 × 900:**

| Bloque | Alto aproximado |
|---|---|
| Cabecera | 135 px |
| Filtros y avisos | 375 px |
| Cabecera de la lista | 40 px |
| Pie | 70 px |
| **Queda para las filas** (unos 82 px cada una) | **unos 280 px, 3 filas** |
| Lo mismo a 800 px de alto | unos 180 px, 2 filas |

Recortar márgenes o textos de «Avisos» solo gana entre 30 y 60 px, menos de una fila. La solución que sí cambia el resultado ya existe y está probada: el **panel plegable «Filtros y avisos» de móvil**. Muestra el resumen (`3 países · 2.0 o más · Últimas 24 h`), el botón «Ver {n} sismos», cierra con Esc y tiene `aria-expanded`. Plegado ocupa unos 52 px, así que libera unos 320 px:
- a 800 px de alto, unas 6 filas;
- a 900 px, unas 7.

También es más consistente (heurística 4): el mismo control en las dos situaciones con poco espacio.

**Umbral:** `max-height: 900px` de ventana. Con el panel abierto hacen falta unos 1030 px de alto para ver 5 filas. Con 900 px:
- se pliega en los portátiles de 1366 × 768, 1440 × 900 y 1536 × 864 (sus ventanas útiles miden entre 650 y 800 px);
- se deja abierto en pantallas de 1080 px o más.

De paso, mejora los móviles en horizontal (más de 700 px de ancho y unos 400 px de alto), que hoy reciben el diseño de escritorio con el panel entero.

**Cambio en `public/css/app.css`.** Hay que **sacar** del bloque `@media (max-width: 699.98px)` de «Móvil» las reglas de estos selectores:
- `.btn-filtros`;
- `.btn-filtros:focus-visible`;
- `.btn-filtros .t`;
- `.btn-filtros .t-tit`;
- `.btn-filtros .t-resumen`;
- `.panel-fil`;
- `.fil.abierto .panel-fil`;
- `.btn-ver`;
- `.solo-movil`.

Esas reglas se ponen, **sin cambiar sus valores**, en un bloque nuevo justo antes de `/* ---------- Móvil (< 700 px) ---------- */`:

```css
/* ---------- Panel plegable: móvil o ventana baja (T5.5) ---------- */
@media (max-width: 699.98px), (max-height: 900px) {
  .btn-filtros {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    min-height: 44px;
    padding: 6px var(--espacio-4);
    border: 0;
    background: var(--color-superficie);
    color: var(--color-texto);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .btn-filtros:focus-visible {
    outline-offset: -3px;
  }

  .btn-filtros .t {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  .btn-filtros .t-tit {
    font-size: var(--texto-md);
    font-weight: 700;
  }

  .btn-filtros .t-resumen {
    font-size: var(--texto-sm);
    color: var(--color-texto-secundario);
  }

  .panel-fil {
    display: none;
    border-top: 1px solid var(--color-borde);
  }

  .fil.abierto .panel-fil {
    display: block;
  }

  .btn-ver {
    display: flex;
    width: 100%;
    margin-top: 14px;
  }

  .solo-movil {
    display: inline-flex;
  }
}
```

- **No cambia ningún color.** El resumen usa `--color-texto-secundario` sobre `--color-superficie`, ya verificado: 7,79:1 en oscuro y 7,51:1 en día.
- **No hace falta tocar JS.** `filtros-ui.js` solo cambia la clase `abierto` y `aria-expanded`, y no depende de `esMovil()`.
- Con el panel abierto en escritorio, la lista baja a su mínimo (`minmax(8rem, 1fr)`) y `.app` se desplaza (`overflow-y: auto`), como en móvil. «Ver {n} sismos» pliega el panel y lleva el foco a la lista.
- El botón «Abrir filtros» del estado «Selecciona al menos un país» (`.solo-movil`) pasa a verse también en este caso, que es lo correcto porque el panel está plegado. El nombre de la clase queda impreciso; renombrarla es opcional.
- **E2E:** añadir un caso a 1280 × 720 que compruebe:
  - que se ve `#btn-filtros` con `aria-expanded="false"`;
  - que hay al menos 5 filas visibles;
  - que el panel se abre y se cierra con Esc.

**C8 (baja, opcional).** Con el panel plegado no se ve si los avisos están activados. Propuesta para `resumenFiltros()` / `filtros-ui.js`, que también sirve en móvil: cuando los avisos estén activados, añadir `· Avisos activados` al resumen. Ejemplo: `3 países · 2.0 o más · Últimas 24 h · Avisos activados`. Ya está en textos.md §4.

### 3.2 Móvil: atribución de Esri en 3 líneas — Cambio C5 (media; depende de C4)

Esri permite «una interfaz desplegable para mostrar todos los nombres cuando no caben en pantallas pequeñas», siempre que «Powered by Esri» siga visible. El pie móvil ya tiene ese despliegue: «Fuentes y canales oficiales».

**Resultado en móvil:**
- el control del mapa ocupa una línea: `Leaflet | Powered by Esri`;
- en el pie siempre visible sigue «… Mapa: Esri.»;
- la lista completa de proveedores aparece al desplegar «Fuentes y canales oficiales».

**Cambios.**

| Archivo | Selector | Valor |
|---|---|---|
| `public/css/app.css`, dentro de `@media (max-width: 699.98px)` | `.leaflet-control-attribution .atrib-fuentes` | `display: none;` |
| `public/css/app.css`, fuera de las media queries (sección «Pie») | `.pie-mapa` | `display: none;` (en escritorio el texto ya está en el control del mapa) |
| `public/css/app.css`, dentro de `@media (max-width: 699.98px)` | `.pie-mapa` | `display: block;` (solo se ve cuando `.pie.abierto` muestra `.pie-mas`) |
| `public/index.html` | dentro de `#pie-mas`, después de `#nota-colombia` | `<p class="pie-mapa">Mapa: <span lang="en">Powered by</span> Esri. Fuentes del mapa: Esri, HERE, Garmin, © colaboradores de OpenStreetMap y la comunidad de usuarios de SIG.</p>` |

- Colores sin cambios: el texto del pie es `--color-texto-secundario` sobre `--color-superficie`, ya verificado.
- **E2E móvil:** comprobar que `.leaflet-control-attribution` contiene «Powered by Esri» y mide como mucho 24 px de alto a 360 px de ancho.

---

## 4. Otras observaciones (fuera del encargo, sin cambio obligatorio)

1. **Las cuatro capturas muestran «Datos cargados»**, el estado de los navegadores sin `EventSource`, y no «En vivo». Probablemente se tomaron sin el stream activo. El texto «Datos cargados» no estaba en textos.md: lo apruebo y lo documento en §3. Conviene repetir las capturas con el stream activo para validar «En vivo» y su complemento.
2. **El complemento del estado se parte en dos líneas** en la columna de 360 px, y la segunda empieza por «·» («· 123 sismos · actualizado a las 01:27:25»). Es cosmético (baja). Si se aborda, hay que usar la forma corta de textos.md §3 (`· {n} sismos · {HH:MM:SS}`) también en la columna de escritorio, no solo en móvil.
3. **La ventana emergente repite la magnitud a la vista**: insignia «4.8» y título «M 4.8 · Panama». El diseño solo tenía el título. Severidad baja. La insignia ya lleva `aria-hidden="true"`, así que el lector de pantalla no la lee dos veces. **Aprobado tal cual:** el color de la banda relaciona la ventana con el marcador y con la leyenda.
