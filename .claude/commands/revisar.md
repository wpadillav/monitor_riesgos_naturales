---
description: "Revisión integral (código, pruebas, seguridad, rendimiento, versiones) de una rama, PR o carpeta"
argument-hint: "[rama, PR o ruta; por defecto los cambios actuales]"
---

Objetivo de la revisión: $ARGUMENTS (por defecto: `git diff` de la rama actual contra la rama de integración).

Delega **en paralelo**:
- `revisor-codigo`: calidad, diseño, legibilidad, cumplimiento de la skill del stack.
- `qa-automatizacion`: cobertura, pruebas faltantes, ejecución de la suite.
- `arquitecto-seguridad`: OWASP, secretos, dependencias vulnerables.
- `investigador-stack`: que las dependencias y versiones cumplan el `STACK.lock.md`.
- `ingeniero-rendimiento`: solo si hay consultas, bucles sobre datos, endpoints de alto tráfico o cambios en el frontend crítico.

Consolida todo en una sola tabla de hallazgos (severidad: bloqueante, mayor, menor, sugerencia), sin duplicados. Cierra con el veredicto: **APROBADO**, **APROBADO CON CAMBIOS** o **RECHAZADO**.
