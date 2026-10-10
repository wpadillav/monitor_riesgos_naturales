# Estado del proyecto — Terremotos en vivo v2

**Fase actual:** Fase 3 (arquitectura, seguridad y diseño) de la entrega 1, en curso.
**Última actualización:** 2026-10-10

## Decisiones del Director

- Lenguaje: Node.js. PHP queda descartado y no se instala PHP 8.5.
- **Solo uso local** (Linux Mint 22.3, basado en Ubuntu 24.04), totalmente funcional. Cloudflare y Vercel descartados (2026-10-10).
- Arquitectura: servidor Node.js + Hono permanente, con WebSocket a EMSC, consulta periódica a las fuentes y SSE hacia el navegador.
- Países: España (incluye Canarias, Baleares, Ceuta y Melilla), Colombia y Panamá. Los tres vienen marcados por defecto y se puede desmarcar cualquiera.
- Filtro de radio opcional, alrededor de Madrid, Benidorm o la ubicación del usuario.
- Notificaciones del navegador con umbral por defecto M > 4.5. Avisos de tsunami: solo oficiales.
- Modo oscuro y modo día. Solo español.
- **Por entregas** (2026-10-10). Entrega 1, versión mínima: sismos en vivo, filtros de magnitud, país y tiempo, mapa, lista, hora local, modo oscuro/día y notificaciones de sismos. Entrega 2: tsunamis y filtro de radio.
- **Prohibido publicar en internet** (2026-10-10).
- El Director arranca la aplicación a mano con `npm start`: sin systemd ni proxy de Apache.
- Git con identidad local `wpadillav <william.padilla@uniminuto.edu.co>`.

## Aprobaciones

- 2026-10-10: Plan [docs/02-plan.md](../docs/02-plan.md) aprobado.
- 2026-10-10: PRD de la entrega 1 aprobado con las opciones por defecto: M ≥ 4.5, franja marina de 100 km, puerto 3000, notificaciones solo de los países marcados, filtros iniciales M 2.0 y 24 h.

## Hecho

- T0.1: repositorio git en `main`, primer commit `fde3f27`.
- T1.1: borrador de [STACK.lock.md](../STACK.lock.md) con Node 24.21.0, pendiente de revisión por el arquitecto.
- T1.2: [docs/investigacion-fuentes.md](../docs/investigacion-fuentes.md) y 16 fixtures. EMSC es la fuente principal. España no tiene feed oficial de tsunamis.
- T1.3: sustituida por métricas de latencia en los logs del servidor.
- T2.1: borrador del PRD [docs/00-prd.md](../docs/00-prd.md), pendiente de aprobación 🔒 y de la revisión 0.2 con los datos de T1.2.
- T1.4: cancelada por el cambio a solo uso local.
- Node 24.21.0 instalado por el Director con nvm (npm 11.19.0), como pide el lock.

## En curso

- T2.2 PRD v0.2 con los datos de T1.2 (analista-requerimientos)
- T3.1 arquitectura, ADRs y cierre del STACK.lock (arquitecto-software)
- T3.2 modelo de amenazas (arquitecto-seguridad)
- T3.3 wireframes y tokens de color oscuro/día (disenador-ux-ui)

## Pendientes

- Fase 3: aprobar la arquitectura y el diseño 🔒
- 2026-10-28: Node 26 pasa a LTS. Decidir entre 24 y 26 (ADR-003); sin Vercel, la política favorece la 26.
