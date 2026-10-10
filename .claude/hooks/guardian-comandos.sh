#!/usr/bin/env bash
# Guardián de comandos peligrosos para la Fábrica de Software.
# Recibe por stdin el JSON del evento PreToolUse. Salida 2 = bloquear (el mensaje de stderr vuelve al agente).
entrada="$(cat)"

bloquear() {
  echo "BLOQUEADO por política de la Fábrica: $1. Si es realmente necesario, pide aprobación explícita al usuario y que lo ejecute él." >&2
  exit 2
}

# Normaliza: solo nos interesa el campo command; si no hay jq, se usa el JSON completo.
if command -v jq >/dev/null 2>&1; then
  cmd="$(printf '%s' "$entrada" | jq -r '.tool_input.command // empty')"
else
  cmd="$entrada"
fi

# 1. Borrados catastróficos
echo "$cmd" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[a-zA-Z]*[[:space:]]+(/|~|\$HOME|/\*)([[:space:]]|$)' \
  && bloquear "borrado recursivo de la raíz o del home"

# 2. Git destructivo sobre ramas protegidas
echo "$cmd" | grep -Eq 'git[[:space:]]+push[^|;&]*(--force([^-]|$)|-f([[:space:]]|$))[^|;&]*(main|master|develop|release)' \
  && bloquear "push forzado sobre una rama protegida (usa --force-with-lease en tu rama de trabajo)"
echo "$cmd" | grep -Eq 'git[[:space:]]+push[^|;&]*[[:space:]]+(origin[[:space:]]+)?:?(main|master)([[:space:]]|$)' \
  && echo "$cmd" | grep -Eq -- '--delete|[[:space:]]:(main|master)' \
  && bloquear "borrado de rama principal remota"

# 3. Bases de datos: destrucción sin respaldo
echo "$cmd" | grep -Eiq '(DROP[[:space:]]+(DATABASE|SCHEMA)|TRUNCATE[[:space:]]+TABLE)' \
  && echo "$cmd" | grep -Eiq '(prod|production|produccion)' \
  && bloquear "operación destructiva sobre una base de datos de producción"

# 4. Sistema
echo "$cmd" | grep -Eq '(mkfs\.|dd[[:space:]]+if=.*of=/dev/(sd|nvme|vd)|chmod[[:space:]]+-R[[:space:]]+777[[:space:]]+/)' \
  && bloquear "operación destructiva sobre discos o permisos del sistema"

# 5. Secretos: evitar volcarlos
echo "$cmd" | grep -Eq '(cat|less|more|head|tail)[[:space:]]+[^|;&]*\.env(\.production|\.prod)?([[:space:]]|$)' \
  && bloquear "lectura directa de archivos .env de producción (usa .env.example)"

exit 0
