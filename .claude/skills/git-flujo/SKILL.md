---
name: git-flujo
description: "Flujo de trabajo Git de la Fábrica: estrategia de ramas, commits convencionales, PRs, hooks, SemVer, CHANGELOG, tags y recuperación ante desastres. Úsala en cualquier operación de control de versiones, integración o release."
---

# Flujo Git

## Ramas
- **Trunk-based** (por defecto): `main` siempre desplegable. Ramas cortas (de 1 a 3 días): `feat/T-012-login-sso`, `fix/T-031-redondeo-iva`, `chore/`, `docs/`, `refactor/`, `test/`.
- **Soporte de varias versiones** (si el cliente lo exige): `release/1.4` para los parches. Las correcciones se hacen primero en `main` y luego se pasan con `cherry-pick -x`.
- **Protección de `main`:** PR obligatorio, CI en verde, al menos 1 revisión aprobada, sin push directo y sin force push.

## Commits convencionales
```
<tipo>(<ámbito opcional>): <resumen en imperativo, ≤72 caracteres>

<cuerpo: qué y por qué>

Refs: T-012
BREAKING CHANGE: <descripción si rompe compatibilidad>
```
Tipos: `feat` (→ minor), `fix` (→ patch), `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`. Un `BREAKING CHANGE` o `!` → major.

## Pull requests
- Pequeños (< 400 líneas de diff si es posible), con una descripción que diga qué, por qué, cómo probarlo, capturas si hay UI y riesgos.
- `CODEOWNERS` por área.
- Merge por **squash** (historial lineal) salvo que el ADR diga otra cosa.

## Hooks (pre-commit framework, lefthook o husky)
- `pre-commit`: formateador, linter de los archivos cambiados, gitleaks, verificación de archivos grandes.
- `commit-msg`: commitlint.

## Versionado y release
- **SemVer** `MAYOR.MENOR.PARCHE`, calculado a partir de los commits (release-please, semantic-release, git-cliff o a mano).
- `CHANGELOG.md` en formato Keep a Changelog: secciones *Added*, *Changed*, *Deprecated*, *Removed*, *Fixed* y *Security* (los títulos pueden ir en español).
- Tag anotado `vX.Y.Z` (firmado con GPG o SSH si aplica): `git tag -a v1.4.0 -m "v1.4.0"`.

## Recetas útiles
- **Actualizar tu rama:** `git fetch && git rebase origin/main` (solo en ramas propias). Luego `git push --force-with-lease`.
- **Deshacer un commit publicado:** `git revert <sha>` (nunca reescribir `main`).
- **Encontrar una regresión:** `git bisect start; git bisect bad; git bisect good <tag>; git bisect run <comando de prueba>`.
- **Recuperar trabajo perdido:** `git reflog` → `git branch rescate <sha>`.
- **Secreto filtrado:**
  1. **rotarlo**;
  2. `git filter-repo --replace-text secretos.txt`;
  3. force push coordinado;
  4. avisar a los clones.
- **Conflictos:** `git log --merge -p <archivo>` para entender ambos lados. Probar después de resolver.
- **Archivos grandes:** Git LFS. Un monorepo grande: `sparse-checkout`.

## .gitignore mínimo
Dependencias (`vendor/`, `node_modules/`, `local/`), builds, `.env` (excepto `.env.example`), IDEs, logs y archivos del sistema operativo. **Los lockfiles SÍ se versionan.**
