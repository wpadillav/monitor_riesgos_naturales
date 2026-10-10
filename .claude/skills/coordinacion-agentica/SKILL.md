---
name: coordinacion-agentica
description: "Manual operativo del coordinador agéntico. Úsala para arrancar o retomar un proyecto, descomponer trabajo en tareas, redactar encargos a subagentes, integrar sus entregas, aplicar las puertas de calidad o reportar el estado al Director."
---

# Coordinación agéntica

## 1. Estructura estándar de un proyecto

```
<repo>/
├── STACK.lock.md            # versiones (skill politica-versiones)
├── CHANGELOG.md             # Keep a Changelog + SemVer
├── README.md
├── .fabrica/estado.md       # bitácora del coordinador (fase, decisiones, pendientes)
└── docs/
    ├── 00-prd.md            # requerimientos (analista-requerimientos)
    ├── 01-arquitectura.md   # C4 + decisiones (arquitecto-software)
    ├── 02-plan.md           # tareas, dependencias, asignación (coordinador)
    ├── adr/NNNN-titulo.md   # decisiones de arquitectura
    ├── seguridad/amenazas.md
    ├── pruebas/plan-pruebas.md
    ├── runbooks/            # operación (devops-sre, sysadmin-linux)
    ├── usuario/             # manuales (documentador-tecnico)
    └── marketing/           # plan, marca, seo/, redes/, campanas/, informes/ (skill estrategia-marketing)
```

Las plantillas están en `plantillas/` de esta skill: `estado.md`, `prd.md`, `plan.md`, `encargo.md`, `entrega.md` e `informe.md`.

## 2. Fases y puertas de calidad

| Fase | Responsables | Sale con | Puerta |
|---|---|---|---|
| 1 Requerimientos | analista-requerimientos (+ disenador-ux-ui) | PRD con historias y criterios de aceptación medibles | 🔒 Director |
| 2 Arquitectura | investigador-stack → arquitecto-software ∥ arquitecto-seguridad (+ dba, + especialista-legacy si aplica) | STACK.lock, arquitectura, ADRs, amenazas | 🔒 Director |
| 3 Plan | coordinador | `docs/02-plan.md` con tareas de ≤ 1 día-agente | interna: cada tarea tiene agente, entradas y criterio |
| 4 Construcción | backend/frontend/mobile/dba/datos/ia | código + pruebas en rama propia | interna: compila, pruebas y linter en verde |
| 5 Calidad | revisor-codigo ∥ qa-automatizacion (∥ seguridad ∥ rendimiento) | informe de revisión + informe de pruebas | interna: 0 hallazgos bloqueantes |
| 6 Docs | documentador-tecnico | README, API, runbooks, manual | interna: docs coinciden con el código |
| 7 Release | especialista-git → devops-sre | tag SemVer, CHANGELOG, despliegue | 🔒 Director |

**Línea de marketing** (paralela y con sus propias puertas):

| Fase | Responsables | Sale con | Puerta |
|---|---|---|---|
| M1 Plan | estratega-marketing ∥ especialista-seo ∥ analista-marketing | `docs/marketing/plan.md`, guía de marca y plan de medición | 🔒 Director |
| M2 Producción | redactor-contenidos, community-manager, disenador-grafico, especialista-seo | piezas listas para publicar | interna: límites de plataforma, datos con fuente, marca |
| M3 Publicación / pauta | Director (o conector autorizado) | publicado, enviado o activado | 🔒 Director, **por cada lote** |
| M4 Medición | analista-marketing | informe mensual y decisiones | — |

**Hallazgo bloqueante:** vulnerabilidad alta o crítica, prueba fallida, incumplimiento del STACK.lock, criterio de aceptación sin cumplir o pérdida de datos posible.

## 3. Cómo descomponer el trabajo

- Corta el trabajo **por resultado verificable**, no por capa: "endpoint POST /pedidos con validación y pruebas", no "hacer el backend".
- Cada tarea debe tener **un solo agente dueño**, **entradas** (archivos o ADR), **salida** y **criterio de aceptación**.
- Marca las dependencias. Lo que no depende de nada **se lanza en paralelo**, con varias llamadas a Agent en el mismo mensaje.
- Orden típico: esquema de BD → contrato de API (OpenAPI) → backend ∥ frontend contra el contrato → integración → pruebas E2E.
- Si una tarea toca más de unos 10 archivos o mezcla disciplinas, divídela.

## 4. Encargo a un subagente (plantilla `encargo.md`)

Escribe siempre:
1. **Objetivo:** una frase.
2. **Contexto:** rutas a leer (PRD, ADR, STACK.lock, archivos relevantes). No pegues el contenido.
3. **Restricciones:** versiones del lock, convenciones, qué NO tocar.
4. **Entregable:** archivos esperados y la rama `tipo/ID-descripcion`.
5. **Criterio de aceptación:** comandos que deben pasar (pruebas, linter) y comportamiento esperado.
6. **Formato de respuesta:** ENTREGA (sección 5).

## 5. Formato de ENTREGA (lo que devuelve todo agente)

```
## ENTREGA — <agente> — <tarea>
Estado: COMPLETO | PARCIAL | BLOQUEADO
Resumen: <2-4 líneas>
Archivos: <lista de rutas creadas/modificadas>
Evidencia: <comandos ejecutados y resultado: pruebas, linter, build>
Decisiones tomadas: <y si requieren ADR>
Riesgos / deuda: <...>
Necesito de: <agente o Director> — <qué y por qué>   (opcional)
Siguiente paso sugerido: <...>
```

## 6. Integración y bucle de corrección

1. Lee la ENTREGA. Si no hay evidencia, devuélvela pidiendo la evidencia.
2. Pasa el resultado a calidad (revisor-codigo y qa-automatizacion en paralelo).
3. Si hay hallazgos, haz un encargo de corrección al autor con la lista exacta.
4. Máximo **3 ciclos** por tarea. Después escala al Director con opciones.
5. Actualiza `.fabrica/estado.md` y `docs/02-plan.md`.

## 7. Cuándo detenerse y preguntar al Director

- En las puertas 🔒.
- Ante ambigüedad de negocio que cambia el alcance, el costo o un dato legal.
- Antes de cualquier acción irreversible: borrar datos, desplegar a producción, forzar push, cambiar licencias.
- Ante un conflicto entre un requerimiento y la seguridad.
- Si el presupuesto o la estimación se desvía más de un 20 %.

Todo lo demás lo decides tú, y dejas constancia en `.fabrica/estado.md`.

## 8. Informe al Director (plantilla `informe.md`)

Máximo unas 15 líneas: fase actual, hecho, en curso, bloqueos, decisiones que necesitas (con opciones y tu recomendación) y próximo hito.

## 9. Elección del agente correcto

| Necesidad | Agente |
|---|---|
| Entender qué quiere el cliente | analista-requerimientos |
| Elegir versiones y librerías | investigador-stack |
| Diseño del sistema, ADR, contratos | arquitecto-software |
| Amenazas, auth, cumplimiento, auditoría | arquitecto-seguridad |
| APIs, lógica de negocio, integraciones, scripts | backend-senior |
| Interfaces web, SPA, SSR, accesibilidad | frontend-senior |
| Apps iOS, Android o multiplataforma | mobile-senior |
| Modelo de datos, migraciones, tuning, respaldos | dba |
| Código heredado, Perl/PHP viejo, migraciones de plataforma | especialista-legacy |
| Análisis, modelos ML, experimentos | cientifico-datos |
| Pipelines ETL/ELT, data warehouse, calidad de datos | ingeniero-datos |
| LLMs, RAG, agentes, embeddings, evaluaciones | ingeniero-ia |
| Servidores Linux, hardening, red, servicios | sysadmin-linux |
| CI/CD, contenedores, IaC, observabilidad, despliegue | devops-sre |
| Ramas, merges, conflictos, versionado, releases | especialista-git |
| Plan y automatización de pruebas | qa-automatizacion |
| Revisión de código | revisor-codigo |
| Carga, perfiles, optimización | ingeniero-rendimiento |
| Documentación técnica y de usuario | documentador-tecnico |
| Flujos, wireframes, design system, UX | disenador-ux-ui |
| Plan de marketing, posicionamiento, campañas, go-to-market | estratega-marketing |
| SEO técnico, palabras clave, posicionamiento en buscadores e IA | especialista-seo |
| Textos web, blog, correos, anuncios, casos de éxito, guiones | redactor-contenidos |
| Calendario y posts de redes sociales, comunidad | community-manager |
| Google Ads, Meta, LinkedIn y TikTok Ads | especialista-publicidad |
| GA4, GTM, UTMs, dashboards, informes de marketing | analista-marketing |
| Piezas gráficas, kit de marca, imágenes OG, carruseles | disenador-grafico |
