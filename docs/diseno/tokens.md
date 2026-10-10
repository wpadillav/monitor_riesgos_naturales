# Tokens de diseño — Terremotos en vivo v2 · Entrega 1

**Tarea:** T3.3 · **Autor:** disenador-ux-ui · **Fecha:** 2026-10-10 · **Estado:** borrador, pendiente de aprobación del Director 🔒

Se acompaña de [wireframes.html](wireframes.html), que usa exactamente estos valores, y de [textos.md](textos.md).

---

## 1. Cómo se aplican

- Los tokens son **variables CSS** (custom properties). El tema activo se fija con el atributo `data-tema="oscuro" | "dia"` en `<html>`.
- **Primera visita, sin preferencia guardada:** el tema sale de `prefers-color-scheme`. Si el usuario pulsa el botón de tema, se guarda en `localStorage` con la clave `tema` (`"oscuro"` o `"dia"`) y desde entonces manda la elección guardada.
- **Sin parpadeo del tema contrario (HU-09):** la CSP prohíbe scripts en línea (RNF-08), así que el tema se aplica con un **script externo pequeño y bloqueante** en `<head>` (`/tema.js`, sin `defer` ni `type="module"`) que se ejecuta antes del primer pintado y fija `data-tema`. El CSS incluye además un bloque `@media (prefers-color-scheme: light)` como respaldo si el script falla.
- Cada tema declara `color-scheme: dark` o `color-scheme: light`, para que los controles nativos (casillas, `select`, barras de desplazamiento) usen la variante correcta.
- Con `forced-colors: active` (modo de alto contraste del sistema) no se fuerza ningún color: se dejan los colores del sistema. Las insignias de magnitud conservan el borde (`1px solid CanvasText`) para que sigan viéndose.

## 2. Color

### 2.1 Tema oscuro (`data-tema="oscuro"`)

| Token | Valor | Uso |
|---|---|---|
| `--color-fondo` | `#0f1115` | Fondo de la página y del contenedor del mapa mientras cargan las teselas. Es el fondo actual de `index.html`. |
| `--color-superficie` | `#161920` | Panel lateral, cabecera, pie, leyenda del mapa. |
| `--color-superficie-elevada` | `#1e222b` | Ventana emergente, campos (`select`), elemento de lista con el puntero encima, skeleton. |
| `--color-seleccion` | `#23324d` | Elemento de lista seleccionado (su ventana emergente está abierta). |
| `--color-texto` | `#e8eaed` | Texto principal. |
| `--color-texto-secundario` | `#a7adb8` | Metadatos (hora, profundidad, país), ayudas, pie. |
| `--color-borde` | `#2c313c` | Separadores decorativos. **No** se usa como único límite de un control. |
| `--color-borde-control` | `#7d8594` | Borde de `select`, casillas y botones secundarios (límite que identifica el control). |
| `--color-primario` | `#8ab4f8` | Fondo del botón primario, barra del elemento seleccionado, casillas marcadas (`accent-color`). |
| `--color-primario-hover` | `#a8c7fa` | Fondo del botón primario con el puntero encima. |
| `--color-sobre-primario` | `#0f1115` | Texto sobre `--color-primario`. |
| `--color-enlace` | `#8ab4f8` | Enlaces y etiqueta «Nuevo». |
| `--color-foco` | `#ffd166` | Contorno de foco (`outline`). |
| `--color-exito` | `#6dd58c` | «En vivo», «Avisos activados». |
| `--color-aviso` | `#f6c35b` | «Reconectando…», «USGS no disponible». |
| `--color-error` | `#ff9b8f` | «Sin conexión…», errores de carga, «Avisos bloqueados…». |
| `--marcador-borde` | `#f5f5f5` | Borde de los marcadores del mapa y del halo de «última hora». |
| `--sombra` | `0 2px 8px rgb(0 0 0 / .5)` | Ventana emergente, leyenda, controles del mapa. |

### 2.2 Tema día (`data-tema="dia"`)

| Token | Valor | Uso |
|---|---|---|
| `--color-fondo` | `#f4f5f7` | Fondo de la página. |
| `--color-superficie` | `#ffffff` | Panel lateral, cabecera, pie, leyenda. |
| `--color-superficie-elevada` | `#ffffff` | Ventana emergente y campos. Se distinguen por borde y sombra. |
| `--color-hover` | `#eef1f5` | Elemento de lista con el puntero encima, skeleton. (En oscuro este papel lo hace `--color-superficie-elevada`; los dos temas exponen `--color-hover`.) |
| `--color-seleccion` | `#e3ecfb` | Elemento de lista seleccionado. |
| `--color-texto` | `#16191f` | Texto principal. |
| `--color-texto-secundario` | `#4d5563` | Metadatos, ayudas, pie. |
| `--color-borde` | `#d5d9e0` | Separadores decorativos. |
| `--color-borde-control` | `#6f7787` | Borde de controles. |
| `--color-primario` | `#0b57d0` | Botón primario, barra de selección, casillas marcadas. |
| `--color-primario-hover` | `#0842a0` | Botón primario con el puntero encima. |
| `--color-sobre-primario` | `#ffffff` | Texto sobre el primario. |
| `--color-enlace` | `#0b57d0` | Enlaces y etiqueta «Nuevo». |
| `--color-foco` | `#0b57d0` | Contorno de foco. |
| `--color-exito` | `#146c2e` | «En vivo», «Avisos activados». |
| `--color-aviso` | `#8a5300` | «Reconectando…», fuente caída. |
| `--color-error` | `#b3261e` | «Sin conexión…», errores, avisos bloqueados. |
| `--marcador-borde` | `#1a1a1a` | Borde de los marcadores y del halo. |
| `--sombra` | `0 2px 8px rgb(16 24 40 / .14)` | Ventana emergente, leyenda, controles del mapa. |

Para que el tema oscuro también exponga `--color-hover`, se define allí como `--color-hover: #1e222b` (igual que `--color-superficie-elevada`).

### 2.3 Contraste verificado (WCAG 2.2 AA)

**Método:** fórmula de luminancia relativa de WCAG 2.x, calculada a mano y contrastada uno por uno con la API del comprobador de WebAIM (`https://webaim.org/resources/contrastchecker/?fcolor=…&bcolor=…&api`) el 2026-10-10. Los ratios son los que devolvió WebAIM, que trunca a dos decimales o a tres cifras significativas.

Requisitos: **4,5:1** para texto normal (1.4.3), **3:1** para texto grande y para límites de controles, foco y objetos gráficos (1.4.11, 2.4.13 orientativo).

#### Tema oscuro

| Texto / elemento | Fondo | Ratio | Mínimo | Resultado |
|---|---|---|---|---|
| `--color-texto` `#e8eaed` | `--color-fondo` `#0f1115` | 15,6:1 | 4,5 | Cumple AA (y AAA) |
| `--color-texto` `#e8eaed` | `--color-superficie` `#161920` | 14,5:1 | 4,5 | Cumple |
| `--color-texto` `#e8eaed` | `--color-superficie-elevada` `#1e222b` | 13,2:1 | 4,5 | Cumple |
| `--color-texto` `#e8eaed` | `--color-seleccion` `#23324d` | 10,6:1 | 4,5 | Cumple |
| `--color-texto-secundario` `#a7adb8` | `#0f1115` | 8,37:1 | 4,5 | Cumple |
| `--color-texto-secundario` `#a7adb8` | `#161920` | 7,79:1 | 4,5 | Cumple |
| `--color-texto-secundario` `#a7adb8` | `#1e222b` | 7,06:1 | 4,5 | Cumple |
| `--color-texto-secundario` `#a7adb8` | `#23324d` | 5,69:1 | 4,5 | Cumple |
| `--color-enlace` `#8ab4f8` | `#0f1115` | 8,96:1 | 4,5 | Cumple |
| `--color-enlace` `#8ab4f8` | `#161920` | 8,34:1 | 4,5 | Cumple |
| `--color-enlace` `#8ab4f8` | `#1e222b` | 7,55:1 | 4,5 | Cumple |
| `--color-enlace` `#8ab4f8` | `#23324d` | 6,09:1 | 4,5 | Cumple |
| `--color-sobre-primario` `#0f1115` | `--color-primario` `#8ab4f8` | 8,96:1 | 4,5 | Cumple |
| `--color-sobre-primario` `#0f1115` | `--color-primario-hover` `#a8c7fa` | 10,9:1 | 4,5 | Cumple |
| `--color-exito` `#6dd58c` | `#0f1115` | 10,3:1 | 4,5 | Cumple |
| `--color-exito` `#6dd58c` | `#161920` | 9,67:1 | 4,5 | Cumple |
| `--color-aviso` `#f6c35b` | `#0f1115` | 11,5:1 | 4,5 | Cumple |
| `--color-aviso` `#f6c35b` | `#161920` | 10,7:1 | 4,5 | Cumple |
| `--color-error` `#ff9b8f` | `#0f1115` | 9,30:1 | 4,5 | Cumple |
| `--color-error` `#ff9b8f` | `#161920` | 8,65:1 | 4,5 | Cumple |
| `--color-error` `#ff9b8f` | `#1e222b` | 7,83:1 | 4,5 | Cumple |
| `--color-borde-control` `#7d8594` (límite de control) | `#161920` | 4,73:1 | 3 | Cumple |
| `--color-borde-control` `#7d8594` (límite de control) | `#1e222b` | 4,28:1 | 3 | Cumple |
| `--color-foco` `#ffd166` (contorno) | `#161920` | 12,1:1 | 3 | Cumple |
| `--color-foco` `#ffd166` (contorno sobre el mapa) | tesela oscura aprox. `#3a3a3a` | 7,88:1 | 3 | Cumple (\*) |
| `--marcador-borde` `#f5f5f5` (objeto gráfico) | tesela oscura aprox. `#3a3a3a` | 10,4:1 | 3 | Cumple (\*) |

#### Tema día

| Texto / elemento | Fondo | Ratio | Mínimo | Resultado |
|---|---|---|---|---|
| `--color-texto` `#16191f` | `--color-superficie` `#ffffff` | 17,6:1 | 4,5 | Cumple AA (y AAA) |
| `--color-texto` `#16191f` | `--color-fondo` `#f4f5f7` | 16,1:1 | 4,5 | Cumple |
| `--color-texto` `#16191f` | `--color-seleccion` `#e3ecfb` | 14,8:1 | 4,5 | Cumple |
| `--color-texto-secundario` `#4d5563` | `#ffffff` | 7,51:1 | 4,5 | Cumple |
| `--color-texto-secundario` `#4d5563` | `#f4f5f7` | 6,88:1 | 4,5 | Cumple |
| `--color-texto-secundario` `#4d5563` | `--color-hover` `#eef1f5` | 6,63:1 | 4,5 | Cumple |
| `--color-texto-secundario` `#4d5563` | `#e3ecfb` | 6,31:1 | 4,5 | Cumple |
| `--color-enlace` `#0b57d0` | `#ffffff` | 6,38:1 | 4,5 | Cumple |
| `--color-enlace` `#0b57d0` | `#f4f5f7` | 5,85:1 | 4,5 | Cumple |
| `--color-enlace` `#0b57d0` | `#eef1f5` | 5,63:1 | 4,5 | Cumple |
| `--color-enlace` `#0b57d0` | `#e3ecfb` | 5,36:1 | 4,5 | Cumple |
| `--color-sobre-primario` `#ffffff` | `--color-primario` `#0b57d0` | 6,38:1 | 4,5 | Cumple |
| `--color-sobre-primario` `#ffffff` | `--color-primario-hover` `#0842a0` | 9,14:1 | 4,5 | Cumple |
| `--color-exito` `#146c2e` | `#ffffff` | 6,53:1 | 4,5 | Cumple |
| `--color-exito` `#146c2e` | `#f4f5f7` | 5,98:1 | 4,5 | Cumple |
| `--color-exito` `#146c2e` | `#eef1f5` | 5,76:1 | 4,5 | Cumple |
| `--color-aviso` `#8a5300` | `#ffffff` | 6,32:1 | 4,5 | Cumple |
| `--color-aviso` `#8a5300` | `#f4f5f7` | 5,80:1 | 4,5 | Cumple |
| `--color-aviso` `#8a5300` | `#eef1f5` | 5,58:1 | 4,5 | Cumple |
| `--color-error` `#b3261e` | `#ffffff` | 6,53:1 | 4,5 | Cumple |
| `--color-error` `#b3261e` | `#f4f5f7` | 5,99:1 | 4,5 | Cumple |
| `--color-error` `#b3261e` | `#eef1f5` | 5,76:1 | 4,5 | Cumple |
| `--color-borde-control` `#6f7787` (límite) | `#ffffff` | 4,50:1 | 3 | Cumple |
| `--color-borde-control` `#6f7787` (límite) | `#f4f5f7` | 4,12:1 | 3 | Cumple |
| `--color-borde-control` `#6f7787` (límite) | `#eef1f5` | 3,97:1 | 3 | Cumple |
| `--color-foco` `#0b57d0` (contorno) | `#ffffff` | 6,38:1 | 3 | Cumple |
| `--color-foco` `#0b57d0` (contorno sobre el mapa) | tesela clara aprox. `#d4d4d4` | 4,30:1 | 3 | Cumple (\*) |
| `--marcador-borde` `#1a1a1a` (objeto gráfico) | tesela clara aprox. `#d4d4d4` | 11,7:1 | 3 | Cumple (\*) |

(\*) Los colores de las teselas Esri son **aproximados** (el tono más desfavorable que se espera: tierra del gris oscuro y agua del gris claro). Hay que confirmarlos con una captura real en T4.5 y con axe/revisión manual en T5.1. Como el borde del marcador es casi blanco en oscuro y casi negro en día, el margen es amplio.

**Prohibido:** usar `--color-texto-secundario` con opacidad, poner texto sobre las teselas sin una caja de `--color-superficie` debajo, o atenuar la lista con `opacity` mientras se actualiza (rompería los ratios de arriba).

## 3. Escala de magnitud

Cinco bandas. El mismo color se usa en la **insignia de la lista**, en el **relleno del marcador** y en la **leyenda**, y es igual en los dos temas: el texto de la insignia ya tiene contraste por sí mismo y el marcador lleva su propio borde.

| Banda | Rango (magnitud redondeada a 1 decimal) | Token | Fondo | Texto de la insignia | Ratio | Radio del marcador | Borde del marcador |
|---|---|---|---|---|---|---|---|
| B1 | < 3.0 | `--mag-1` | `#4a5568` | `#ffffff` | 7,52:1 | `max(4, M × 2.6)` px | 1 px `--marcador-borde` |
| B2 | 3.0 – 3.9 | `--mag-2` | `#f2c94c` | `#16191f` | 11,0:1 | `M × 2.6` px | 1 px |
| B3 | 4.0 – 4.4 | `--mag-3` | `#f08a3c` | `#16191f` | 7,04:1 | `M × 2.6` px | 1 px |
| B4 | 4.5 – 5.9 | `--mag-4` | `#c62828` | `#ffffff` | 5,62:1 | `M × 2.6` px | **2 px** |
| B5 | ≥ 6.0 | `--mag-5` | `#6a1b9a` | `#ffffff` | 9,39:1 | `M × 2.6` px | **3 px** |

El corte B3/B4 en 4.5 coincide con el umbral de aviso por defecto (PRD P1, M ≥ 4.5). Si el usuario cambia el umbral, **la escala no cambia**: es una escala fija para que la leyenda no dependa de una preferencia.

**Cómo se distingue sin depender solo del color** (1.4.1):
1. **Texto:** la insignia de la lista, la ventana emergente y la notificación muestran siempre el número («4.2»). En la lista lleva un prefijo oculto visualmente, «Magnitud», para los lectores de pantalla.
2. **Tamaño:** el radio del marcador es proporcional a la magnitud (se conserva la regla actual `M × 2.6`, con mínimo de 4 px en lugar de 3 px para que el objetivo sea visible).
3. **Grosor del borde:** B4 tiene borde de 2 px y B5 de 3 px; B1–B3, de 1 px.
4. **Leyenda** en el mapa, con los cinco tamaños dibujados y su rango en texto.
5. **La lista es la alternativa accesible al mapa** (RNF-11): todo lo que se ve en el mapa está en la lista.

Relleno de los marcadores: color de la banda con `fill-opacity: .75`. El borde (`--marcador-borde`) garantiza el 3:1 contra la tesela; el relleno no se usa como único límite.

### Marcadores de «última hora»

- **Halo estático:** anillo discontinuo (`stroke-dasharray: 3 3`, 1,5 px, `--marcador-borde`) a radio + 5 px. Se ve mientras el sismo tenga menos de 60 min. Es la señal que no depende del movimiento.
- **Pulso:** la animación actual (`scale 1 → 2.2`, 1,6 s) se reproduce **3 veces** (≈ 4,8 s) cuando el sismo aparece y luego se detiene. Así cumple 2.2.2 (nada se mueve solo más de 5 s). Con `prefers-reduced-motion: reduce` no hay pulso, solo halo.
- En la lista, «hace X min» comunica lo mismo en texto.

## 4. Tipografía

| Token | Valor | Uso |
|---|---|---|
| `--fuente-base` | `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Liberation Sans", sans-serif` | Toda la interfaz. Sin fuentes web (sin dependencias externas, CSP). |
| `--fuente-numeros` | `font-variant-numeric: tabular-nums` | Magnitudes, horas, contador y coordenadas (cifras alineadas). |
| `--texto-xs` | `0.75rem` (12 px) | Pie (aviso y atribución), leyenda del mapa. Mínimo absoluto. |
| `--texto-sm` | `0.875rem` (14 px) | Metadatos de la lista, ayudas, estado, etiquetas de filtros. |
| `--texto-md` | `1rem` (16 px) | Lugar en la lista, controles, botones, ventana emergente. **En móvil los `select` deben tener al menos 16 px** para que el navegador no haga zoom al enfocarlos. |
| `--texto-lg` | `1.125rem` (18 px) | Título de la ventana emergente («M 4.2 · Golfo de Urabá»), número de la insignia. |
| `--texto-xl` | `1.25rem` (20 px) | `h1` «Terremotos en vivo». |
| `--peso-normal` / `--peso-medio` / `--peso-fuerte` | `400` / `600` / `700` | `700` solo en magnitudes y `h1`. |
| `--interlineado` | `1.45` | Texto general. |
| `--interlineado-ajustado` | `1.25` | Filas de la lista. |

Todo en `rem`, para que el zoom del navegador al 200 % funcione (1.4.4). Con 400 % de zoom en 1280 px (equivale a 320 px de ancho) se aplica el diseño móvil (1.4.10).

## 5. Espaciado, radios y tamaños

| Token | Valor | Uso |
|---|---|---|
| `--espacio-1` | `0.25rem` (4 px) | Separación icono-texto. |
| `--espacio-2` | `0.5rem` (8 px) | Separación entre controles relacionados. |
| `--espacio-3` | `0.75rem` (12 px) | Relleno vertical de filas de la lista. |
| `--espacio-4` | `1rem` (16 px) | Relleno horizontal del panel. |
| `--espacio-6` | `1.5rem` (24 px) | Separación entre bloques (filtros / avisos / lista). |
| `--espacio-8` | `2rem` (32 px) | Estados vacíos y de error. |
| `--radio-sm` | `4px` | Etiquetas «Nuevo» / «Revisado». |
| `--radio` | `6px` | Controles, insignias, botones (como hoy). |
| `--radio-lg` | `10px` | Ventana emergente, leyenda, cajas de estado. |
| `--ancho-panel` | `360px` (máx. 40 % en escritorio) | Panel lateral. Sube de 340 px para que quepan los tres países en una fila. |
| `--alto-control` | `2.25rem` (36 px) escritorio · `2.75rem` (44 px) móvil | Botones, `select`, filas de casillas. |
| `--alto-fila-lista` | mínimo `3.5rem` (56 px) | Elemento de la lista (objetivo táctil holgado). |
| `--ancho-insignia` | `3rem` (48 px) | Insignia de magnitud. |
| `--foco` | `outline: 2px solid var(--color-foco); outline-offset: 2px` | Todos los elementos enfocables. En el contenedor del mapa: `outline-offset: -3px` (dentro del mapa). |
| `--punto-corte` | `700px` | Por debajo: diseño móvil (se conserva el corte actual). |

**Objetivos táctiles:** en escritorio todos ≥ 24 × 24 px (2.5.8); en móvil ≥ 44 × 44 px (casillas: toda la fila con su etiqueta es pulsable).

## 6. Movimiento

| Token | Valor | Uso |
|---|---|---|
| `--duracion-corta` | `150ms` | Hover, cambio de fondo. |
| `--duracion-media` | `250ms` | Despliegue de filtros en móvil. |
| `--resalte-nuevo` | `2s` | Fondo `--color-seleccion` que se desvanece en un elemento que acaba de llegar. |
| `--pulso` | `1.6s × 3` | Pulso de marcadores nuevos (sección 3). |

Con `@media (prefers-reduced-motion: reduce)`: sin pulso, sin resalte animado (el elemento nuevo lleva solo la etiqueta «Nuevo»), sin `flyTo` animado (se usa `setView` sin animación) y sin brillo en el skeleton.

## 7. Bloque CSS de referencia

```css
:root, [data-tema="oscuro"] {
  color-scheme: dark;
  --color-fondo:#0f1115; --color-superficie:#161920; --color-superficie-elevada:#1e222b;
  --color-hover:#1e222b; --color-seleccion:#23324d;
  --color-texto:#e8eaed; --color-texto-secundario:#a7adb8;
  --color-borde:#2c313c; --color-borde-control:#7d8594;
  --color-primario:#8ab4f8; --color-primario-hover:#a8c7fa; --color-sobre-primario:#0f1115;
  --color-enlace:#8ab4f8; --color-foco:#ffd166;
  --color-exito:#6dd58c; --color-aviso:#f6c35b; --color-error:#ff9b8f;
  --marcador-borde:#f5f5f5; --sombra:0 2px 8px rgb(0 0 0 / .5);
}
[data-tema="dia"] {
  color-scheme: light;
  --color-fondo:#f4f5f7; --color-superficie:#ffffff; --color-superficie-elevada:#ffffff;
  --color-hover:#eef1f5; --color-seleccion:#e3ecfb;
  --color-texto:#16191f; --color-texto-secundario:#4d5563;
  --color-borde:#d5d9e0; --color-borde-control:#6f7787;
  --color-primario:#0b57d0; --color-primario-hover:#0842a0; --color-sobre-primario:#ffffff;
  --color-enlace:#0b57d0; --color-foco:#0b57d0;
  --color-exito:#146c2e; --color-aviso:#8a5300; --color-error:#b3261e;
  --marcador-borde:#1a1a1a; --sombra:0 2px 8px rgb(16 24 40 / .14);
}
:root {
  --mag-1:#4a5568; --mag-2:#f2c94c; --mag-3:#f08a3c; --mag-4:#c62828; --mag-5:#6a1b9a;
  --mag-1-texto:#ffffff; --mag-2-texto:#16191f; --mag-3-texto:#16191f; --mag-4-texto:#ffffff; --mag-5-texto:#ffffff;
  --fuente-base:system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Liberation Sans", sans-serif;
  --texto-xs:.75rem; --texto-sm:.875rem; --texto-md:1rem; --texto-lg:1.125rem; --texto-xl:1.25rem;
  --interlineado:1.45; --interlineado-ajustado:1.25;
  --espacio-1:.25rem; --espacio-2:.5rem; --espacio-3:.75rem; --espacio-4:1rem; --espacio-6:1.5rem; --espacio-8:2rem;
  --radio-sm:4px; --radio:6px; --radio-lg:10px;
  --ancho-panel:360px; --alto-control:2.25rem; --alto-fila-lista:3.5rem; --ancho-insignia:3rem;
}
@media (max-width: 699.98px) { :root { --alto-control:2.75rem; } }
```

## 8. Teselas del mapa por tema

| Tema | Capa base | Capa de etiquetas |
|---|---|---|
| Oscuro | `Canvas/World_Dark_Gray_Base` | `Canvas/World_Dark_Gray_Reference` |
| Día | `Canvas/World_Light_Gray_Base` | `Canvas/World_Light_Gray_Reference` |

Al cambiar de tema se sustituyen las dos capas sin recrear el mapa ni perder la vista, los marcadores ni la ventana emergente abierta.
