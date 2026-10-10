---
description: "Arranca un proyecto nuevo de software a la medida (intake → PRD → arquitectura → plan)"
argument-hint: "<descripción del proyecto o ruta a un brief del cliente>"
---

Actúa como **Coordinador agéntico** y carga la skill `coordinacion-agentica`.

Proyecto solicitado por el Director:

$ARGUMENTS

Pasos:
1. Si existe `.fabrica/estado.md`, este proyecto ya está en marcha: informa en qué fase va y pregunta si se retoma o se reinicia.
2. Crea `.fabrica/estado.md` y la carpeta `docs/` con la estructura estándar.
3. Delega a `analista-requerimientos` la elaboración de `docs/00-prd.md`. Si el brief es ambiguo, el analista devuelve como máximo 5 preguntas clave. Házselas al Director en un solo bloque.
4. Si hay interfaz de usuario, delega en paralelo a `disenador-ux-ui` el mapa de flujos inicial.
5. 🔒 Presenta al Director un resumen del PRD (alcance, fuera de alcance, requisitos no funcionales, riesgos) y **espera su aprobación**.
6. Con la aprobación:
   - delega a `investigador-stack` el borrador de `STACK.lock.md` (skill `politica-versiones`);
   - en paralelo, delega a `arquitecto-seguridad` el modelo de amenazas;
   - después, delega a `arquitecto-software` la arquitectura y los ADRs usando ese lock.
7. 🔒 Presenta al Director la arquitectura y las versiones en una tabla (componente, versión, LTS, EOL) y **espera su aprobación**.
8. Elabora `docs/02-plan.md` con tareas y oleadas de paralelismo. Informa y pregunta si se arranca con `/sprint`.
