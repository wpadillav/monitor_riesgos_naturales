---
name: stack-flutter
description: "Flutter y Dart: versión fijada (FVM), arquitectura por capas, gestión de estado (Riverpod/Bloc), go_router, dio, freezed, persistencia, pruebas (unit, widget, integration) y publicación. Úsala para apps multiplataforma en Flutter."
---

# Stack Flutter / Dart

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py flutter`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Canal estable de Flutter** fijado con **FVM** (`.fvmrc`) en la versión del lock. Dart *null-safe* y `analysis_options.yaml` con `flutter_lints` o `very_good_analysis`.
- **Arquitectura:** presentación (widgets + estado) → dominio → datos (repositorios con fuentes remota y local).
- **Estado:** **Riverpod** o **Bloc/Cubit**. Uno solo por proyecto, elegido con un ADR.
- **Librerías:** **go_router** (navegación), **dio** (HTTP con interceptores), **freezed** + **json_serializable** (modelos inmutables), **drift** o Isar/Hive (persistencia local), **flutter_secure_storage** (tokens), `intl` (localización con ARB en español).
- **UI:** Material 3 o Cupertino, con un tema centralizado. Accesibilidad con `Semantics` y escalado de texto.

## Calidad
```bash
fvm flutter analyze
dart format --set-exit-if-changed .
fvm flutter test --coverage
fvm flutter test integration_test
```

## Publicación
Firma (*keystore* y certificados) fuera del repositorio. Flavors para dev, staging y producción. Ofuscación (`--obfuscate --split-debug-info`) con los símbolos guardados para la telemetría de errores.

## Errores comunes que debe atrapar el revisor
- `setState` en widgets grandes (reconstrucciones masivas).
- Lógica de negocio en los widgets.
- Usar `BuildContext` después de un `await` sin comprobar `mounted`.
- Controladores sin `dispose`.
- Llamadas de red en `build()`.
- Imágenes sin caché.
