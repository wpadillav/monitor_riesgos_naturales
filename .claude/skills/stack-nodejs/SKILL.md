---
name: stack-nodejs
description: "Node.js en backend con TypeScript: versión LTS, gestor de paquetes, ESM, Fastify/NestJS/Express, Zod, Prisma/Drizzle, pino, Vitest, ESLint/Prettier o Biome. Úsala para APIs, workers, CLIs o BFFs en Node."
---

# Stack Node.js (backend)

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py nodejs`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Solo versiones LTS** del lock. Archivo `.nvmrc` o `.node-version` y `"engines": {"node": ">=<LTS>"}` en `package.json`.
- **TypeScript estricto** (skill `stack-typescript`) y **ESM** (`"type": "module"`).
- **Gestor de paquetes:** npm, o pnpm vía Corepack. Uno solo por repositorio, con el lockfile versionado. En el CI, `npm ci` o `pnpm install --frozen-lockfile`.

## Frameworks
| Opción | Cuándo |
|---|---|
| **Fastify** | APIs rápidas, esquemas JSON nativos, por defecto |
| **NestJS** | Equipos grandes, arquitectura opinada, DI, módulos |
| **Express 5** | Legacy o ecosistema de middlewares específico |
| Hono | Edge / runtimes múltiples |

## Librerías recomendadas
Validación: **Zod** o TypeBox · ORM y SQL: **Prisma**, **Drizzle** o **Kysely** · Logs: **pino** · HTTP: `fetch` nativo o **undici** · Colas: **BullMQ** (Redis) · Config: `process.env` validado con Zod al arrancar (`node --env-file` en desarrollo) · Fechas: **date-fns** o Temporal si el lock lo soporta · Auth: **jose** (JWT), **openid-client**.

## Estructura
```
src/{modulos/<dominio>/{rutas,servicio,repositorio,esquemas}.ts, infra/, app.ts, server.ts}
test/  package.json  tsconfig.json  eslint.config.js
```

## Calidad
```bash
npm ci
npx eslint .            # o: npx biome check .
npx prettier --check .  # si no se usa Biome
npx tsc --noEmit
npx vitest run --coverage
npm audit --omit=dev
```

## Producción
- `node dist/server.js` (código compilado). Sin `ts-node` ni `nodemon` en producción.
- Apagado ordenado con `SIGTERM` (cerrar el servidor y las conexiones).
- `NODE_ENV=production`. Un proceso por contenedor (sin PM2 dentro del contenedor).

## Seguridad
- Validar todo `body`, `query` y `params` con un esquema.
- Cabeceras con `@fastify/helmet` o `helmet`.
- Rate limit.
- Evitar *prototype pollution* (no usar *merge* profundo con datos externos).
- `child_process.execFile` con argumentos en lista.
- No usar `eval` ni `new Function`.
- Revisar los scripts `postinstall` de las dependencias nuevas.

## Errores comunes que debe atrapar el revisor
- Promesas sin `await` o sin manejo de errores (`no-floating-promises`).
- Bloquear el event loop: CPU pesada o `fs.*Sync` en rutas.
- Fugas de listeners.
- `any` implícito.
- Secretos en el bundle.
- Usar `Number` para dinero.
- Dependencias abandonadas.
