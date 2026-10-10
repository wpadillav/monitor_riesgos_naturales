---
name: stack-swift
description: "Swift e iOS nativo: Swift 6 con concurrencia estricta, SwiftUI, Swift Package Manager, arquitectura MVVM, SwiftData/Core Data, Keychain, Swift Testing/XCTest y publicación en App Store. Úsala para apps Apple nativas."
---

# Stack Swift / iOS

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py xcode`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Versión
La versión de **Xcode** la impone el requisito vigente de App Store Connect (verifícalo), y esta determina la versión de Swift y del SDK. El *deployment target* mínimo se acuerda con el cliente (normalmente las dos últimas versiones mayores de iOS).

## Base
- **Swift 6** con concurrencia estricta: `async`/`await`, actores, `Sendable` y `@MainActor` para la UI.
- **SwiftUI** como predeterminado. UIKit solo para necesidades puntuales o código legacy.
- **Arquitectura:** MVVM con `@Observable` (Observation). Navegación con `NavigationStack`.
- **Dependencias** solo con **Swift Package Manager**. CocoaPods solo en legacy, con un plan de salida.
- **Persistencia:** **SwiftData** o Core Data, y **Keychain** para los secretos.
- **Red:** `URLSession` con `async`/`await` y `Codable`.

## Calidad
```bash
swiftlint --strict
swiftformat --lint .
xcodebuild test -scheme <App> -destination 'platform=iOS Simulator,name=<dispositivo>'
```
Pruebas con **Swift Testing** (`@Test`) o XCTest, y UI con XCUITest.

## Publicación
- Firma automática con un equipo y perfiles gestionados. Fastlane o Xcode Cloud para el CI.
- `PrivacyInfo.xcprivacy` completo y descripciones de permisos claras en español.
- TestFlight antes de producción.

## Errores comunes que debe atrapar el revisor
- *Force unwrap* (`!`).
- Ciclos de retención en *closures* (usa `[weak self]` donde aplique).
- Trabajo pesado en el `MainActor`.
- Datos sensibles en `UserDefaults`.
- *Warnings* de concurrencia silenciados.
