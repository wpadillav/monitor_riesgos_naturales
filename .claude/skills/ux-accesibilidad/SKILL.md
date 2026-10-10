---
name: ux-accesibilidad
description: "UX, UI y accesibilidad: flujos, wireframes, design system con tokens, microcopy en español, WCAG 2.2 AA y heurísticas de Nielsen. Úsala al diseñar o revisar interfaces web o móviles."
---

# UX y accesibilidad

## Proceso
1. **Usuarios y tareas:** ¿quién?, ¿qué necesita lograr?, ¿con qué frecuencia?, ¿desde qué dispositivo?
2. **Flujos** (Mermaid) con el camino feliz y las excepciones.
3. **Arquitectura de información:** navegación con 7 ± 2 elementos de primer nivel, etiquetas en el lenguaje del usuario.
4. **Wireframes por pantalla** con todos sus estados: vacío, cargando (skeleton), error, éxito, sin permisos, offline.
5. **Especificación para el frontend:** componentes, tokens, comportamiento responsive e interacciones.

## Design system mínimo (variables CSS)
```css
:root{
  --color-primario:#1d4ed8; --color-texto:#111827; --color-fondo:#ffffff;
  --color-error:#b91c1c; --color-exito:#15803d;
  --fuente-base:system-ui, sans-serif; --texto-base:1rem; --interlineado:1.5;
  --espacio-1:.25rem; --espacio-2:.5rem; --espacio-4:1rem; --espacio-8:2rem;
  --radio:.5rem; --sombra:0 1px 3px rgb(0 0 0 / .12);
}
```
Componentes base: botón (primario, secundario, peligro y deshabilitado), campo de texto con etiqueta, ayuda y error, select, checkbox/radio, tabla con orden y paginación, modal accesible, toast, navegación y breadcrumbs.

## WCAG 2.2 AA: lo que más se incumple
- **Contraste:** 4.5:1 en texto normal; 3:1 en texto grande y componentes.
- **Teclado:** todo operable, foco **visible** y orden lógico. Sin trampas de foco, salvo en los modales.
- **Formularios:** `<label>` asociado. Errores en texto (no solo color) y enlazados con `aria-describedby`.
- **Imágenes:** `alt` descriptivo, o `alt=""` si son decorativas.
- **Objetivos táctiles:** ≥ 24×24 px (criterio 2.5.8). En móvil se recomiendan 44 px.
- **Sin dependencia solo del color o del movimiento.** Respetar `prefers-reduced-motion`.
- **Idioma de la página:** `<html lang="es">`.
- **Estructura semántica:** encabezados en orden, landmarks (`header`, `nav`, `main`, `footer`).

## Microcopy en español
- Botones con verbo en infinitivo: "Guardar cambios", "Crear factura".
- Errores con el patrón qué pasó + cómo resolverlo: "La fecha de fin debe ser posterior al 12/03/2026".
- Formatos locales: fechas `dd/mm/aaaa` y monedas según el país del cliente (ej. COP con punto de miles).
- Tuteo o usted según la marca, de forma consistente.

## Heurísticas de Nielsen (para revisiones)
Estado visible · lenguaje del usuario · control y libertad (deshacer) · consistencia · prevención de errores · reconocer antes que recordar · flexibilidad · diseño minimalista · ayuda para recuperarse de errores · ayuda y documentación.
