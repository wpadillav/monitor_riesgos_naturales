# Estado del proyecto — Terremotos en vivo v2

**Fase actual:** Fase 3 terminada; falta la aprobación del Director 🔒.
**Última actualización:** 2026-10-10

## Decisiones del Director

- Lenguaje: Node.js. PHP queda descartado y no se instala PHP 8.5.
- **Solo uso local** (Linux Mint 22.3, basado en Ubuntu 24.04), totalmente funcional. Cloudflare y Vercel descartados (2026-10-10).
- Arquitectura: servidor Node.js + Hono permanente, con WebSocket a EMSC, consulta periódica a las fuentes y SSE hacia el navegador.
- Países: España (incluye Canarias, Baleares, Ceuta y Melilla), Colombia y Panamá. Los tres vienen marcados por defecto y se puede desmarcar cualquiera.
- Filtro de radio opcional, alrededor de Madrid, Benidorm o la ubicación del usuario.
- Notificaciones del navegador con umbral por defecto M ≥ 4.5 (D1). Avisos de tsunami: solo oficiales.
- Modo oscuro y modo día. Solo español.
- **Por entregas** (2026-10-10). Entrega 1, versión mínima: sismos en vivo, filtros de magnitud, país y tiempo, mapa, lista, hora local, modo oscuro/día y notificaciones de sismos. Entrega 2: tsunamis y filtro de radio.
- **Prohibido publicar en internet** (2026-10-10).
- El Director arranca la aplicación a mano con `npm start`: sin systemd ni proxy de Apache.
- **Apache queda fuera del proyecto** (2026-10-10). El Director moverá el proyecto fuera de `/var/www/html` al terminar. No hay que proponer cambios de Apache.
- Git con identidad local `wpadillav <william.padilla@uniminuto.edu.co>`.

## Aprobaciones

- 2026-10-10: Plan [docs/02-plan.md](../docs/02-plan.md) aprobado.
- 2026-10-10: PRD de la entrega 1 aprobado con las opciones por defecto: M ≥ 4.5, franja marina de 100 km, puerto 3000, notificaciones solo de los países marcados, filtros iniciales M 2.0 y 24 h.

## Hecho

- T0.1: repositorio git en `main`, primer commit `fde3f27`.
- T1.1: borrador de [STACK.lock.md](../STACK.lock.md) con Node 24.21.0, pendiente de revisión por el arquitecto.
- T1.2: [docs/investigacion-fuentes.md](../docs/investigacion-fuentes.md) y 16 fixtures. EMSC es la fuente principal. España no tiene feed oficial de tsunamis.
- T1.3: sustituida por métricas de latencia en los logs del servidor.
- T2.1/T2.2: PRD v0.2 [docs/00-prd.md](../docs/00-prd.md), aprobado, sin pendientes.
- T3.2: [docs/seguridad/amenazas.md](../docs/seguridad/amenazas.md) con 34 amenazas y la CSP. Pendiente de aprobación con la Fase 3.
- Decisión del coordinador (I1): el WebSocket de EMSC y el SSE son del servidor (T4.6, backend-senior); el `EventSource` de la página es T4.6b (frontend-senior).
- T3.3: [docs/diseno/](../docs/diseno/) con wireframes.html, tokens.md y textos.md. Contraste AA verificado en 58 pares. html-validate da 107 errores, sin bloqueantes: 84 de estilos inline y 17 de landmarks repetidos, propios de un documento que muestra varias pantallas. En T4.5 la página real no puede usar estilos inline por la CSP.
- T3.1: [docs/01-arquitectura.md](../docs/01-arquitectura.md), [docs/api/openapi.yaml](../docs/api/openapi.yaml) (validado con redocly), ADR 0001–0005 y STACK.lock cerrado (Vitest 5.0.3, `ws` 8.22.0, JS + JSDoc sin build, Node 24.21.0 → 26 LTS entre el 2026-10-28 y el 2026-11-15).
- Ajustes internos del coordinador, que se aplican al arrancar la Fase 4: opciones de `avisoMin` de 4.0 a 6.0 en pasos de 0.5, como en el diseño; textos de HU-04 (6.0) y HU-05 (`periodo`) del PRD; diferencias de la arquitectura §14 frente al modelo de amenazas, que no rebajan ninguna mitigación (las revisa T5.3).
- T1.4: cancelada por el cambio a solo uso local.
- Node 24.21.0 instalado por el Director con nvm (npm 11.19.0), como pide el lock.

## En curso

- Nada. Se espera la aprobación de la Fase 3.


## Pendientes

- Director: aceptar los riesgos residuales AM-07, AM-17 y AM-25 (§8 del modelo de amenazas). AM-32 (Apache sirve la carpeta) lo resuelve el traslado que hará el Director.
- Copiar las mitigaciones de §6.1 del modelo de amenazas en cada encargo T4.x.

- T4.2: ampliar los rectángulos para que cubran la franja de 100 km y calibrar los umbrales de duplicados (iniciales: 30 s, 100 km, ΔM 1.0).

- Fase 3: aprobar la arquitectura y el diseño 🔒
- 2026-10-28: Node 26 pasa a LTS. Decidir entre 24 y 26 (ADR-003); sin Vercel, la política favorece la 26.
