---
name: stack-javascript
description: "JavaScript moderno (ES2022+) sin framework o con jQuery legacy: módulos ES, DOM, fetch, eventos, Web Components, herramientas (Vite, ESLint, Prettier) y migración progresiva a TypeScript. Úsala para JS de navegador o scripts sin TypeScript."
---

# Stack JavaScript

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py nodejs`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Módulos ES** (`<script type="module">`, `import`/`export`). `const` por defecto, `let` si hay reasignación y nunca `var`.
- **Asincronía** con `async`/`await` y `try`/`catch`. `fetch` con `AbortController` para los timeouts.
- **DOM:** `querySelector`, delegación de eventos y `textContent` (no `innerHTML` con datos externos).
- **Componentes reutilizables sin framework:** **Web Components** (Custom Elements + Shadow DOM opcional) o librerías ligeras como Alpine.js o htmx, si el ADR lo indica.
- **Tipado sin migrar:** JSDoc + `// @ts-check` + `tsc --noEmit` con `checkJs`. Paso intermedio hacia TypeScript.

## Herramientas
Bundler y servidor de desarrollo: **Vite** · Lint: **ESLint** (flat config) · Formato: **Prettier** (o Biome para ambas) · Pruebas: **Vitest** + jsdom/happy-dom y **Playwright** para E2E.

## jQuery legacy
- No agregar jQuery a proyectos nuevos.
- En legacy:
  - fija la última versión de la rama mantenida y quita `jquery-migrate` cuando todo pase;
  - reemplaza los plugins abandonados;
  - aísla por módulo y migra pantalla por pantalla al framework del lock.

## Seguridad
- Nada de `innerHTML`, `outerHTML`, `insertAdjacentHTML` ni `document.write` con datos no saneados (si es imprescindible, usa DOMPurify).
- Sin `eval`, `new Function` ni `setTimeout` con strings.
- Compatible con una CSP estricta (sin scripts *inline*).
- Tokens fuera de `localStorage` si el ADR exige cookies `HttpOnly`.

## Errores comunes que debe atrapar el revisor
- Promesas sin `catch`.
- Comparaciones con `==`.
- Listeners que no se eliminan (fugas de memoria).
- Manipulación del DOM dentro de bucles (usa `DocumentFragment`).
- Números con decimales para dinero.
- Fechas con `new Date(string)` ambiguo (usa ISO 8601 o una librería).
