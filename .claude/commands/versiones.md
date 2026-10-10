---
description: "Consulta las versiones LTS/estables recomendadas hoy según la política de la Fábrica"
argument-hint: "<productos o --perfil web-php|web-node|web-python|web-java|web-dotnet|web-ruby|legacy-perl|datos-ia|movil|infra|bases-datos|cms>"
---

Carga la skill `politica-versiones` y ejecuta su script `scripts/versiones.py` con: $ARGUMENTS

Si no se pasaron argumentos, muestra los perfiles disponibles con `--listar-perfiles` y pregunta cuál usar.

Presenta la tabla resultante y, debajo, de 2 a 4 observaciones relevantes:
- versiones próximas a convertirse en LTS;
- EOL cercanos;
- incompatibilidades conocidas entre los productos consultados.

Si existe `STACK.lock.md` en el proyecto, compáralo con la tabla y señala las diferencias (parches pendientes, ramas por actualizar, EOL a menos de 6 meses).
