---
name: stack-kotlin
description: "Kotlin para backend (Spring Boot, Ktor) y Android (Jetpack Compose, Hilt, Room, coroutines): Gradle Kotlin DSL, ktlint/detekt, pruebas y buenas prácticas. Úsala para cualquier código Kotlin."
---

# Stack Kotlin

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py kotlin`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Versión de Kotlin** compatible con el JDK LTS del lock y, en Android, con el Android Gradle Plugin (AGP) y el compilador de Compose (consulta sus tablas de compatibilidad oficiales).
- **Gradle Kotlin DSL** + *version catalog* (`gradle/libs.versions.toml`) + wrapper.
- **Idioms:**
  - `data class` y `sealed interface` para los estados;
  - `val` por defecto;
  - *null safety* real (nada de `!!` salvo justificación);
  - funciones de extensión con moderación;
  - coroutines estructuradas (`coroutineScope` y nunca `GlobalScope`).

## Backend
**Spring Boot** (con el plugin `kotlin-spring`/`kotlin-jpa`) o **Ktor**. Serialización con kotlinx.serialization o Jackson Kotlin module. SQL con **Exposed** o jOOQ. Pruebas con **Kotest** o JUnit 5 + **MockK**.

## Android
- UI con **Jetpack Compose** + Material 3. Arquitectura: **MVVM** + UDF, con `ViewModel` y `StateFlow`.
- **Librerías:**
  - DI: Hilt (o Koin);
  - persistencia: Room;
  - red: Retrofit + OkHttp (o Ktor client);
  - serialización: kotlinx.serialization;
  - imágenes: Coil;
  - navegación: Navigation Compose;
  - trabajos en segundo plano: WorkManager.
- **`minSdk`/`targetSdk`:** el `targetSdk` cumple el mínimo exigido por Google Play vigente (verificarlo). El `minSdk` se acuerda con el cliente según su audiencia.
- **Pruebas:** JUnit + Turbine (flows), Compose UI tests, Espresso, Robolectric si aplica.
- **Release:** R8 con reglas de *keep* revisadas, firma con *upload key*, AAB y canal interno antes de producción.

## Calidad
```bash
./gradlew ktlintCheck detekt test     # + lint (Android) + koverReport
```

## Errores comunes que debe atrapar el revisor
- `!!` sin justificación.
- `lateinit` en lugar de un diseño correcto.
- Coroutines sin cancelar o lanzadas en el scope equivocado.
- Trabajo pesado en `Dispatchers.Main`.
- Fugas de `Context`.
- Recomposiciones excesivas (estado inestable en Compose).
- Secretos en `BuildConfig`.
