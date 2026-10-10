---
name: estimacion
description: "Método de estimación de proyectos de software a la medida (descomposición, tres puntos/PERT, contingencia por riesgo, cronograma). Úsala para cotizar, planificar hitos o reestimar."
---

# Estimación

1. **Descompón** en épicas → historias → tareas técnicas. Incluye siempre el trabajo "invisible":
   - setup del repositorio y CI;
   - entornos;
   - migración de datos;
   - pruebas E2E;
   - documentación;
   - despliegue;
   - capacitación;
   - garantía.
2. **Tres puntos por historia:** O (optimista), P (probable), M (pesimista). PERT = (O + 4P + M) / 6 y σ = (M − O) / 6.
3. **Total:** suma de los PERT. Para un 85 % de confianza, usa ≈ suma + 1 × √(Σσ²).
4. **Contingencia por riesgo** (súmala explícitamente):
   - integraciones con terceros sin sandbox: +20-40 %;
   - legacy sin pruebas: +30-60 %;
   - requisitos difusos: +25 %;
   - tecnología nueva para el equipo: +15 %.
5. **Factor agéntico:** los agentes aceleran la codificación, pero no las decisiones del cliente, las integraciones externas ni las aprobaciones. Estima por separado el **esfuerzo de construcción** y el **tiempo calendario**, que depende de las respuestas del cliente.
6. **Cronograma** por hitos entregables, cada uno con valor demostrable.

## Salida (`docs/estimacion.md`)
| Épica | Historias | O | P | M | PERT (h) | Riesgo | Contingencia |
|---|---|---|---|---|---|---|---|

Termina con:
- supuestos;
- exclusiones;
- dependencias del cliente;
- rango final (mínimo, esperado y con contingencia);
- vigencia de la estimación.
