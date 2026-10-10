---
name: stack-react
description: "React con TypeScript y Next.js o Vite: componentes, hooks, Server Components, estado de servidor (TanStack Query), formularios (React Hook Form + Zod), rutas, pruebas y rendimiento. Úsala para cualquier UI en React."
---

# Stack React

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py react`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Elección
| Opción | Cuándo |
|---|---|
| **Next.js (App Router)** | SEO, SSR/SSG, apps completas con backend ligero (BFF), Server Components |
| **Vite + React Router** (o TanStack Router) | SPA detrás de login, paneles, apps embebidas |
| React Router en *framework mode* (antes Remix) | SSR con enfoque en web estándar |

## Base
- **TypeScript estricto.** Componentes de función. Props tipadas. Sin `React.FC` obligatorio.
- **Reglas de hooks:** `eslint-plugin-react-hooks` en modo error. Activa React Compiler si el lock y el proyecto lo soportan; si no, usa memoización solo donde se mida.
- **Estado:**
  - local con `useState`/`useReducer`;
  - **del servidor con TanStack Query** (o *fetching* en Server Components);
  - global mínimo con **Zustand** o Context. Redux Toolkit solo en apps grandes existentes.
- **Formularios:** **React Hook Form** + **Zod** (o Server Actions + Zod en Next).
- **Estilos:** CSS Modules, Tailwind o la librería de componentes del ADR (shadcn/ui + Radix, MUI, Mantine). Accesibilidad incluida.
- **Next.js:**
  - Server Components por defecto y `"use client"` solo donde haya interactividad;
  - datos sensibles solo en el servidor;
  - `next/image` y `next/font`;
  - *route handlers* para la API interna.

## Estructura (por funcionalidad)
```
src/app/ (Next) o src/routes/
src/features/<dominio>/{components,hooks,api,schemas}.ts(x)
src/components/ui/   src/lib/   src/test/
```

## Calidad
```bash
npm run lint && npx tsc --noEmit
npx vitest run --coverage          # Testing Library: probar como el usuario (roles, textos)
npx playwright test                # E2E + @axe-core/playwright
npm run build
```

## Errores comunes que debe atrapar el revisor
- `useEffect` para derivar estado o para *fetching* que debería ir en Query o en el servidor.
- Dependencias de efectos incorrectas.
- `key={index}` en listas que cambian.
- Estado duplicado.
- `dangerouslySetInnerHTML`.
- Secretos en variables `NEXT_PUBLIC_*` o `VITE_*`.
- Bundles enormes por importaciones completas.
- Componentes de más de unas 200 líneas.
