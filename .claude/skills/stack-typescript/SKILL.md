---
name: stack-typescript
description: "TypeScript estricto para frontend y backend: tsconfig recomendado, patrones de tipos, validación en fronteras, monorepos y herramientas. Úsala en cualquier proyecto TypeScript."
---

# Stack TypeScript

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py typescript`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## tsconfig base (ajustar el `target` a la LTS de Node o a los navegadores objetivo)
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "module": "NodeNext", "moduleResolution": "NodeNext",
    "target": "ES2022", "verbatimModuleSyntax": true,
    "isolatedModules": true, "skipLibCheck": true, "sourceMap": true
  }
}
```
Para frontend con bundler: `"module": "ESNext"`, `"moduleResolution": "Bundler"`.

## Patrones
- **Tipos en las fronteras:** los datos externos llegan como `unknown` y se validan con Zod o Valibot, de donde se infiere el tipo (`z.infer`).
- **Uniones discriminadas** para los estados (`{estado:'ok',datos}` | `{estado:'error',error}`) con un `switch` exhaustivo (`never`).
- **Tipos de marca** (*branded types*) para IDs y dinero: `type ClienteId = string & {__brand:'ClienteId'}`.
- `readonly` y `as const` para datos inmutables. `satisfies` para verificar sin perder la inferencia.
- **Prohibido** `any` (usa `unknown`) y `@ts-ignore` (usa `@ts-expect-error` con un comentario que explique por qué).
- **Monorepos:** workspaces (npm/pnpm) + project references o Turborepo/Nx si el ADR lo justifica.

## Herramientas
- `tsc --noEmit` en el CI.
- ESLint con `typescript-eslint` (configuración *strict-type-checked*) o Biome.
- Ejecución en desarrollo con `tsx`. Build de librerías con `tsup`.
- Generación de tipos desde OpenAPI (`openapi-typescript`) para el cliente frontend.

## Errores comunes que debe atrapar el revisor
- Aserciones `as X` que ocultan errores.
- Opcionales sin manejar.
- `enum` numéricos: prefiere uniones de literales.
- Tipos duplicados que divergen del contrato.
- Lógica en tipos complejos que nadie entiende: simplificar.
