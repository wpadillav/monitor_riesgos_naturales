---
name: stack-react-native
description: "React Native con Expo y TypeScript: nueva arquitectura, Expo Router, EAS Build/Update, almacenamiento seguro, notificaciones, offline, pruebas (Jest, Maestro/Detox) y publicación en tiendas. Úsala para apps móviles multiplataforma en React Native."
---

# Stack React Native

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py react-native`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Expo** (recomendado por el propio equipo de React Native) con el SDK del lock, que fija la versión de RN compatible. *Prebuild* / *development builds* cuando hagan falta módulos nativos.
- **TypeScript estricto.** Nueva arquitectura (Fabric/TurboModules) activa.
- **Navegación:** **Expo Router** (basado en archivos) o React Navigation.
- **Datos:**
  - TanStack Query para el servidor;
  - Zustand para el estado global;
  - **MMKV** o SQLite (`expo-sqlite`) para persistencia y modo offline;
  - **`expo-secure-store`** para tokens (nunca AsyncStorage para secretos).
- **UI:** componentes accesibles (`accessibilityLabel`, `accessibilityRole`), estilos con StyleSheet o la librería del ADR, y listas grandes con **FlashList**.
- **Notificaciones:** `expo-notifications` (FCM/APNs).
- **Builds:** **EAS Build** y actualizaciones OTA con **EAS Update** (solo cambios de JS, respetando las políticas de las tiendas).

## Calidad
```bash
npx expo-doctor
npx eslint . && npx tsc --noEmit
npx jest                       # @testing-library/react-native
maestro test .maestro/         # o Detox para E2E
```

## Publicación
- Versiones semánticas + `buildNumber`/`versionCode` automáticos.
- Canal interno → TestFlight / Prueba interna → producción.
- *Privacy manifest* (iOS) y *data safety* (Google Play) completos.

## Errores comunes que debe atrapar el revisor
- Re-renderizados en listas (sin `keyExtractor` estable ni memoización).
- Trabajo pesado en el hilo de JS durante las animaciones (usa Reanimated).
- Secretos en `app.config` o `.env` públicos.
- Permisos solicitados sin contexto.
- Imágenes sin optimizar.
