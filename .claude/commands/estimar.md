---
description: "Estima esfuerzo, costo y cronograma de un proyecto o funcionalidad"
argument-hint: "<requerimiento o ruta al PRD>"
---

Carga la skill `estimacion` y actúa como coordinador.

Objeto a estimar: $ARGUMENTS

1. Si no hay PRD, pide a `analista-requerimientos` un desglose rápido en épicas e historias.
2. Pide a `arquitecto-software` los componentes, riesgos técnicos e integraciones complejas.
3. Estima por historia con tres puntos (optimista, probable, pesimista) y calcula PERT.
4. Entrega:
   - tabla de épicas → horas-persona equivalentes y horas-agente;
   - cronograma por hitos;
   - supuestos y exclusiones;
   - riesgos con su contingencia (%);
   - rango de costo si el Director dio una tarifa.
5. Deja el resultado en `docs/estimacion.md`.
