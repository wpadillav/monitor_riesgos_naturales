---
name: stack-html-css
description: "HTML5 semántico y CSS moderno (grid, flexbox, custom properties, container queries, :has, nesting, capas), Tailwind, responsive, accesibilidad y rendimiento. Úsala para maquetación, landing pages, plantillas de correo o cualquier capa de presentación web."
---

# Stack HTML y CSS

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py nodejs`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## HTML
- Documento base: `<!doctype html>`, `<html lang="es">`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- **Semántica:** `header`, `nav`, `main` (uno por página), `article`, `section` con encabezado, `aside`, `footer`. Encabezados `h1`-`h6` en orden.
- **Formularios:**
  - `<label for>` en todos los campos;
  - `type` correcto (`email`, `tel`, `number`, `date`);
  - `autocomplete`;
  - `required`, `aria-describedby` para la ayuda y los errores;
  - `<button type="submit">` (y no un `div` con click).
- **Imágenes:** `alt`, `width`/`height` (evitan CLS), `loading="lazy"` fuera del primer pantallazo, `srcset`/`sizes`, `<picture>` con AVIF/WebP.
- Usa los elementos nativos antes que JS: `<details>`, `<dialog>`, `popover`, `<input type="date">`.

## CSS moderno
- **Tokens** en `:root` con custom properties (ver la skill `ux-accesibilidad`).
- **Layout:** **Grid** para estructura en 2D y **Flexbox** en 1D. **Container queries** para componentes y media queries para la página.
- **Organización:** `@layer reset, base, componentes, utilidades;` para controlar la cascada. *Nesting* nativo si los navegadores objetivo lo soportan.
- **Selectores:** `:has()`, `:is()`/`:where()` (especificidad 0), `:focus-visible`.
- **Unidades:** `clamp()` para tipografía fluida, `rem` para tamaños, `dvh` en móviles y propiedades lógicas (`margin-inline`, `padding-block`).
- **Preferencias del usuario:** `prefers-color-scheme`, `prefers-reduced-motion`, `forced-colors`.
- **Metodología:** BEM o CSS Modules en proyectos sin framework de utilidades.

## Tailwind CSS (si el ADR lo elige)
Versión del lock. Configuración de tema con los tokens del design system. Componentes repetidos extraídos a componentes del framework (no `@apply` masivo). Plugin de orden de clases en Prettier.

## Calidad
```bash
npx stylelint "**/*.css"
npx html-validate "**/*.html"    # o el validador del W3C
npx @axe-core/cli <url>          # accesibilidad
npx lighthouse <url> --only-categories=performance,accessibility
```

## Correo HTML
Tablas para el layout, CSS en línea, ancho de 600 px, sin JS y sin fuentes web críticas. Probar en los principales clientes de correo.

## Errores comunes que debe atrapar el revisor
- `div` clicables.
- `outline: none` sin una alternativa visible.
- Texto en imágenes.
- `!important` en cascada.
- Tamaños fijos en px que rompen el zoom.
- Contraste insuficiente.
- `z-index` arbitrarios.
