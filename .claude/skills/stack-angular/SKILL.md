---
name: stack-angular
description: "Angular moderno: componentes standalone, signals, control flow nativo, inyección con inject(), rutas lazy, formularios tipados, RxJS con criterio, pruebas y actualización con ng update. Úsala para cualquier UI en Angular (incluida migración desde AngularJS)."
---

# Stack Angular

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py angular`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Versión
Angular publica una versión mayor cada ~6 meses, con soporte de 18 meses en total (activo + LTS). Usa la versión del lock y **actualiza con `ng update` mayor a mayor**, nunca saltando versiones.

## Base moderna
- **Componentes `standalone`** (sin NgModules en código nuevo).
- **Signals** para el estado (`signal`, `computed`, `effect` con moderación) y `input()`/`output()`/`model()`.
- **Control de flujo nativo:** `@if`, `@for` (con `track` obligatorio), `@switch`, `@defer` para carga diferida.
- **Inyección** con `inject()`. Detección de cambios `OnPush` o *zoneless* según la versión y el ADR.
- **Rutas** con `loadComponent`/`loadChildren` (lazy) y *guards* funcionales.
- **Formularios reactivos tipados** (o *signal forms* si el lock los marca como estables).
- **HTTP:** `HttpClient` con interceptores funcionales. RxJS para flujos asíncronos complejos, con `takeUntilDestroyed()` y `toSignal()` para conectarlo con signals.
- **Estado global:** servicios con signals, o NgRx Signal Store si la app es grande.
- **UI:** Angular Material/CDK o la librería del ADR.

## Calidad
```bash
npx ng lint                 # angular-eslint
npx ng test                 # runner del lock (Vitest en versiones recientes; Karma/Jest en legacy)
npx playwright test
npx ng build --configuration production
```

## AngularJS (1.x, sin soporte desde 2022)
Migración por rutas con un esquema híbrido o, preferiblemente, reemplazo por pantallas detrás de un proxy (patrón *strangler fig*). No se invierte en nuevas funcionalidades en AngularJS.

## Errores comunes que debe atrapar el revisor
- Suscripciones sin cancelar.
- `subscribe` anidados (usa `switchMap`).
- Lógica pesada en las plantillas.
- `@for` sin un `track` estable.
- `bypassSecurityTrust*` con datos externos.
- Módulos gigantes sin *lazy loading*.
