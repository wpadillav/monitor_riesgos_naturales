---
name: stack-rust
description: "Rust para servicios, CLIs y componentes de alto rendimiento: toolchain fijado, cargo, clippy, tokio, axum, serde, sqlx, manejo de errores, cargo-deny y pruebas. Úsala para cualquier código Rust."
---

# Stack Rust

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py rust`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Toolchain estable fijado** en `rust-toolchain.toml` (`channel = "1.xx"`, componentes `clippy` y `rustfmt`). Edición (`edition`) según el lock (2024 en proyectos nuevos si el toolchain la soporta).
- **Errores:** `thiserror` en librerías y `anyhow` en binarios. Evita `unwrap()`/`expect()` fuera de pruebas o invariantes documentados.
- **`unsafe`:** solo con un comentario `// SAFETY:` que lo justifique y con revisión obligatoria.

## Librerías recomendadas
Async: **tokio** · Web: **axum** (+ tower, tower-http) · Serialización: **serde** + serde_json · BD: **sqlx** (consultas verificadas en compilación) o SeaORM / Diesel · HTTP cliente: **reqwest** · Logs/trazas: **tracing** + tracing-subscriber · Config: **figment** o config · CLI: **clap** (derive) · Validación: validator · Pruebas: `cargo test`, **proptest**, **insta** (snapshots), mockall.

## Calidad
```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
cargo deny check        # licencias, duplicados, advisories
cargo audit
```

## Producción
- Perfil de release con `lto = "thin"` y `codegen-units = 1` si se mide una mejora.
- Imagen distroless o `debian-slim`, o musl estático si aplica.
- Apagado ordenado con `tokio::signal`.

## Errores comunes que debe atrapar el revisor
- Bloquear el runtime async (E/S síncrona o CPU pesada sin `spawn_blocking`).
- `clone()` excesivo para callar al *borrow checker*.
- `Arc<Mutex<>>` donde bastaría un canal.
- Panics en rutas de servidor.
- Features de dependencias innecesarias.
