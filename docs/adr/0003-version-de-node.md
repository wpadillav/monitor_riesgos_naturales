# 0003. Node.js 24.21.0 ahora y migración planificada a Node 26 LTS

- Estado: aceptado (Fase 3, 2026-10-10). Plan actualizado en T6.1 (2026-10-12) con la nota del final
- Fecha: 2026-10-10 · Decisores: arquitecto-software, Director

## Contexto

Datos consultados en vivo el 2026-10-10 con `versiones.py`, la API de endoflife.date y `nodejs.org/dist/index.json`:

| Rama | Estado hoy | LTS desde | Fin de soporte activo | EOL | Último parche |
|---|---|---|---|---|---|
| 24 «Krypton» | LTS | 2025-10-28 | 2026-10-20 | **2028-04-30** (18,7 meses) | 24.21.0 (2026-09-08), npm 11.19.0 |
| 26 | *Current* | **2026-10-28** | 2027-10-27 | **2029-04-30** (≈ 30 meses) | 26.11.1 (2026-10-07), npm 11.20.0 |

- **Política de versiones (regla 1):** la LTS más nueva con al menos 18 meses de soporte restante.
  - Hoy la cumple la 24.
  - Desde el **2026-10-28**, la LTS más nueva es la 26.
  - Hacia el **2026-10-30**, la 24 baja de 18 meses: desde entonces quedarse en la 24 sería una excepción.
- **Lo que limitaba antes:**
  - Vercel no ofrecía Node 26 (advertencia A1);
  - Cloudflare obligaba a Vitest 4 (A2).
  - Las dos plataformas se descartaron el 2026-10-10, así que **ya no hay ninguna restricción externa**.
- **Compatibilidad con la 26** (`engines` en npm, consultado el 2026-10-10):
  - Vitest 5.0.3: `^22.12 || ^24 || >=26`;
  - ESLint 10.12.0: `>=24`;
  - Playwright 1.64.0: `>=20`; su documentación oficial admite 22, 24 y 26;
  - Hono 4.13.13: `>=16.9`;
  - `@hono/node-server` 2.1.4: `>=20`;
  - `ws` 8.22.0: `>=10`;
  - Vite 8.3.4: `>=22.12`;
  - `@redocly/cli` 2.62.1: `>=22.12`.
- **El Director ya tiene instalada la 24.21.0 con nvm.**
- **Situación del proyecto:** la Fase 4 aún no ha empezado, así que hoy no hay código de aplicación que migrar.

## Opciones consideradas

1. **Quedarse en la 24 durante toda la vida del proyecto.**
   - Pros: no hay que hacer nada.
   - Contras:
     - incumple la política desde el 2026-10-30 y exigiría mantener una excepción;
     - EOL en 2028-04: habría que migrar igualmente hacia 2027-10;
     - la 24 ya solo recibe mantenimiento desde el 2026-10-20.
2. **Empezar ya en la 26.11.1, aunque sea *Current*.**
   - Pros: no habría que migrar después.
   - Contras: durante 18 días se usaría una rama no LTS, contra la regla 1.
3. **Construir en la 24.21.0 y pasar a la 26 LTS (último parche) en cuanto sea LTS, con una ventana y unos criterios fijados.**
   - Pros:
     - se cumple la política en todo momento;
     - la migración ocurre cuando casi no hay código;
     - no bloquea el arranque de la Fase 4.
   - Contras: un cambio de `.nvmrc` y una ronda de pruebas.

## Decisión

**Opción 3.**

**Plan:**
1. **Hasta el 2026-10-28:** Node **24.21.0**, como fija el STACK.lock. T4.1 fija en `package.json` `"engines": { "node": ">=24.21.0 <27" }`, para que el mismo código sirva en las dos ramas durante la transición, y `.nvmrc` con la versión exacta del lock.
2. **Si T4.1 empieza el 2026-10-28 o después,** se arranca directamente en la 26 LTS (último parche). Se salta el paso 3.
3. **Del 2026-10-28 al 2026-11-15** (punto de control 🔒 del lock):
   1. investigador-stack ejecuta `versiones.py nodejs` y propone el último parche 26.x LTS;
   2. el responsable de la tarea en curso ejecuta `npm ci && npm run check && npm test` y la E2E con ese parche;
   3. si todo pasa, se actualizan el lock y `.nvmrc`. Esto es una actualización ya aprobada por este ADR, sin ADR nuevo;
   4. el Director ejecuta `nvm install 26 && nvm use`.
4. **Fecha límite:** la migración se completa **antes de que empiece la Fase 5 (calidad) de la entrega 1**, para que las pruebas de aceptación y la sesión de 24 h (RNF-16) se hagan ya en la 26.
5. **Si la 26 rompe algo** (una dependencia o el modelo de permisos de AM-31), se queda la 24 con una excepción registrada en el lock (advertencia A1, revisión mensual) y se abre una tarea para corregirlo antes del **2027-04-30**, cuando a la 24 le queden 12 meses.

**Punto que hay que verificar en la migración:** el modelo de permisos de Node (`--permission`, AM-31). Hay que comprobar que en la 26 las conexiones de red salientes y el puerto de escucha siguen permitidos con los mismos indicadores. Si la 26 exige un permiso de red explícito, se añade a `npm start`.

## Consecuencias

- **Positivas:**
  - se cumple la política sin excepciones;
  - EOL en 2029-04-30, unos 12 meses más de soporte;
  - la migración se hace cuando cuesta menos.
- **Negativas:** una ronda de verificación adicional entre el 28 de octubre y el 15 de noviembre.
- **Más difícil:** nada relevante. Mientras dura la transición, `engines` admite las dos ramas y la CI local usa la del lock.
- **Cómo se revierte:** se vuelve a poner `24.21.0` en `.nvmrc` y en el lock. El código es compatible con las dos ramas por construcción (`engines`).

## Nota de actualización (T6.1, 2026-10-12)

**1. El punto 4 del plan no se pudo cumplir y se sustituye.** La Fase 5 (calidad) se cerró el 2026-10-12, antes de que la 26 fuera LTS (2026-10-28). Por eso las pruebas de aceptación se hicieron en **Node 24.21.0**, y **el release de la entrega 1 sale en 24.21.0**, que sigue cumpliendo la regla 1 hasta el 2026-10-30. La migración se mantiene en la ventana del 2026-10-28 al 2026-11-15, con estas condiciones nuevas:
- repetir en la 26 la E2E completa y la medición de memoria del tope (arquitectura §5.5);
- la sesión de 24 h (RNF-16), si aún no se ha hecho, se hace ya en la 26.

**2. El punto que había que verificar ya tiene respuesta: la 26 exige `--allow-net`.**
- **Qué cambia:** desde Node 25.0.0, `--permission` también restringe la red, y `--allow-net` es **booleano** (sin lista de destinos) y está en estabilidad 1.1 (*Active development*; emite un `ExperimentalWarning`). Fuentes: nodejs.org/api/cli.html#--allow-net y nodejs.org/api/permissions.html (v26.11.1, consultadas el 2026-10-12).
- **Prueba con el binario oficial 26.11.1** (*Current*; SHA-256 comprobado):
  - con el `npm start` actual, el `listen` en `127.0.0.1` lanza `ERR_ACCESS_DENIED`; el proceso registra `proceso.excepcion` y sale con código 1;
  - `vitest run` da 1334 de 1335: solo falla `tests/integracion/permisos.test.js`;
  - con `--allow-net`, el servidor arranca, carga EMSC y USGS y `/api/salud` da las tres fuentes en `ok`.
- **Consecuencia:** el punto 5 («si la 26 exige un permiso de red explícito, se añade a `npm start`») se aplica.
- **Plan detallado:** está en `STACK.lock.md`, «Plan de migración a Node 26 LTS»: `--allow-net` en `start` y en los scripts de rendimiento, cambio de `permisos.test.js`, E2E, medición de memoria y actualización de AM-31 y S-04.

**3. Lo que no cambia:** la ventana, la fecha límite (2026-11-15) y el plan B (quedarse en la 24 con excepción y revisión mensual hasta el 2027-04-30).
