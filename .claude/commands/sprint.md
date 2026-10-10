---
description: "Ejecuta la siguiente oleada de tareas del plan con los especialistas, en paralelo, hasta pasar calidad"
argument-hint: "[IDs de tareas opcionales, ej. T-003 T-004]"
---

Carga la skill `coordinacion-agentica`. Lee `.fabrica/estado.md`, `docs/02-plan.md` y `STACK.lock.md`.

Tareas a ejecutar: $ARGUMENTS (si está vacío, toma la siguiente oleada sin dependencias pendientes).

1. Para cada tarea, redacta un ENCARGO con la plantilla `encargo.md` y delega al agente dueño. **Lanza en paralelo** las tareas independientes, con varias llamadas a Agent en un solo mensaje.
2. Valida cada ENTREGA: debe traer evidencia (pruebas, linter, build). Si falta, devuélvela.
3. Envía lo entregado a `revisor-codigo` y `qa-automatizacion` en paralelo. Si la tarea toca auth, datos personales, pagos o entradas externas, envíala también a `arquitecto-seguridad`.
4. Aplica el bucle de corrección: máximo 3 ciclos, después escala al Director.
5. Pide a `especialista-git` integrar las ramas aprobadas a la rama de integración.
6. Actualiza el plan y el estado, y entrega al Director un informe breve con la plantilla `informe.md`.
