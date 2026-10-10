---
name: stack-vue
description: "Vue 3 con Composition API, <script setup>, TypeScript, Pinia, Vue Router, Vite y Nuxt; pruebas con Vitest y Vue Test Utils. Úsala para cualquier UI en Vue (incluida migración desde Vue 2)."
---

# Stack Vue

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py vue`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Vue 3** con **Composition API** y `<script setup lang="ts">`. Tipado de props y emits con `defineProps<T>()` y `defineEmits<T>()`.
- **Estado:** `ref`/`reactive` local, **composables** (`useX`) para la lógica reutilizable y **Pinia** para el estado global. Nada de Vuex en proyectos nuevos.
- **Rutas:** **Vue Router** con *lazy loading* por ruta.
- **Elección de framework:** **Nuxt** si hay SSR/SEO; **Vite** para SPA.
- **UI:** la librería del ADR (PrimeVue, Vuetify, Naive UI, Quasar) o Tailwind.
- **Formularios:** VeeValidate + Zod, o validación propia con esquemas.
- **Datos del servidor:** TanStack Query para Vue, o `useFetch`/`useAsyncData` en Nuxt.

## Calidad
```bash
npx eslint . && npx vue-tsc --noEmit
npx vitest run --coverage     # @vue/test-utils + Testing Library
npx playwright test
```

## Migración desde Vue 2 (fin de vida: 2023-12-31)
1. Actualiza a 2.7 (trae la Composition API).
2. Reemplaza las dependencias incompatibles.
3. Usa el *migration build* (`@vue/compat`) temporalmente.
4. Migra los componentes por lotes.
5. Vuex → Pinia.
6. Quita el *compat build*.

## Errores comunes que debe atrapar el revisor
- Desestructurar objetos reactivos y perder la reactividad (usa `toRefs`/`storeToRefs`).
- Mutar las props.
- `v-if` con `v-for` en el mismo elemento.
- `v-html` con datos de usuario.
- Watchers donde bastaría un `computed`.
