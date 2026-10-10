---
name: stack-svelte
description: "Svelte 5 (runes) y SvelteKit: componentes, estado con $state/$derived, rutas basadas en archivos, load functions, form actions, adaptadores de despliegue y pruebas. Úsala para UIs en Svelte."
---

# Stack Svelte / SvelteKit

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py svelte`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Svelte 5 con runes:** `$state`, `$derived`, `$effect` (solo para efectos secundarios reales) y `$props`. Los *stores* quedan para compatibilidad.
- **SvelteKit:**
  - rutas en `src/routes`;
  - `+page.server.ts` para cargar datos en el servidor (con los secretos allí);
  - **form actions** con mejora progresiva (`use:enhance`);
  - *hooks* para autenticación;
  - adaptador según el despliegue (`adapter-node`, `adapter-static` o de la plataforma).
- **TypeScript** con `lang="ts"` y `svelte-check`.

## Calidad
```bash
npx svelte-check && npx eslint .
npx vitest run           # @testing-library/svelte
npx playwright test
npm run build
```

## Errores comunes que debe atrapar el revisor
- Usar `$effect` para derivar estado (usa `$derived`).
- Secretos importados en módulos del cliente (usa `$env/static/private` solo en el servidor).
- `{@html}` con datos de usuario.
- Formularios que no funcionan sin JS cuando se esperaba mejora progresiva.
