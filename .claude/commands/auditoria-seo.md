---
description: "Auditoría SEO técnica y de contenidos de un sitio (código local o URL pública) con plan de acción priorizado"
argument-hint: "<URL del sitio o ruta del proyecto web>"
---

Carga las skills `seo-tecnico` y `seo-contenidos`.

Sitio a auditar: $ARGUMENTS

1. Delega **en paralelo**:
   - a `especialista-seo`: auditoría técnica (rastreo, indexación, metadatos, datos estructurados, arquitectura, enlazado interno, hreflang) y de contenidos (intención, canibalización, contenido escaso, oportunidades de palabras clave);
   - a `ingeniero-rendimiento`: Core Web Vitals y Lighthouse de las plantillas principales (inicio, servicio o producto, artículo, contacto);
   - a `frontend-senior`, **solo si hay acceso al código**: verificación de SSR/SSG, etiquetas `head`, sitemap y robots en el código fuente.
2. Consolida `docs/marketing/seo/auditoria-AAAA-MM.md` con una tabla única de hallazgos (prioridad, impacto, corrección y responsable) y un **plan de 30/60/90 días**.
3. Convierte los hallazgos técnicos en tareas para `docs/02-plan.md` (las ejecutan `frontend-senior`/`devops-sre` con `/sprint`) y los de contenido en briefs para `redactor-contenidos`.
4. Informa al Director con los 5 hallazgos más importantes y el plan.
