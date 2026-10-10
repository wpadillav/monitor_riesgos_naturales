---
name: stack-bash
description: "Shell scripting robusto en Bash/POSIX sh: modo estricto, quoting, funciones, manejo de errores y señales, argumentos, logging, shellcheck, shfmt y pruebas con bats. Úsala para scripts de automatización, instalación, despliegue o administración Linux."
---

# Stack Bash / Shell

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py bash`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Cuándo
Usa shell para pegamento: orquestar comandos, instalar o desplegar. Si el script pasa de unas 150 líneas, maneja estructuras de datos complejas o JSON intensivo, cambia a Python o Perl.

## Plantilla
```bash
#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

log()  { printf '%s [%s] %s\n' "$(date -u +%FT%TZ)" "${2:-INFO}" "$1" >&2; }
die()  { log "$1" ERROR; exit "${2:-1}"; }
cleanup() { [[ -n "${TMP:-}" ]] && rm -rf -- "$TMP"; }
trap cleanup EXIT
trap 'die "Fallo en línea $LINENO"' ERR

usage() { echo "Uso: $(basename "$0") [-n] <entorno>"; }

main() {
  local dry_run=false
  while getopts ":nh" opt; do
    case $opt in n) dry_run=true ;; h) usage; exit 0 ;; *) usage; exit 2 ;; esac
  done
  shift $((OPTIND - 1))
  [[ $# -eq 1 ]] || { usage; exit 2; }
  TMP="$(mktemp -d)"
  log "Iniciando en entorno $1 (dry_run=$dry_run)"
}
main "$@"
```

## Reglas
- **Entrecomilla siempre** las variables (`"$var"`, `"${arr[@]}"`). Usa `[[ ]]` en Bash y `$(...)` en lugar de backticks.
- **`--`** antes de rutas que vienen de variables (`rm -rf -- "$dir"`) y valida que no estén vacías (`${dir:?}`).
- **Scripts idempotentes:** comprueba antes de crear (`mkdir -p`, `id -u usuario &>/dev/null || useradd ...`).
- **No analices la salida de `ls`:** usa *globs* o `find -print0 | xargs -0`.
- Usa `local` en las funciones y `readonly` para las constantes.
- **POSIX `sh`** (`#!/bin/sh`) si debe correr en Alpine o BusyBox, sin bashismos (verifícalo con `shellcheck -s sh`).

## Calidad
```bash
shellcheck -x scripts/*.sh
shfmt -d -i 2 -ci scripts/
bats tests/          # bats-core
```
