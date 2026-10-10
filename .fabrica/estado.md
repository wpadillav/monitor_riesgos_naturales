# Estado del proyecto — Terremotos en vivo v2

**Fase actual:** Fase 0 (git) y Fase 1 (investigación técnica), en curso.
**Última actualización:** 2026-10-10

## Decisiones del Director

- Lenguaje: Node.js. PHP queda descartado y no se instala PHP 8.5.
- Ejecución en local (Linux Mint 22.3, basado en Ubuntu 24.04). Publicación opcional y gratuita en Cloudflare o Vercel.
- Países: España (incluye Canarias, Baleares, Ceuta y Melilla), Colombia y Panamá. Los tres vienen marcados por defecto y se puede desmarcar cualquiera.
- Filtro de radio opcional, alrededor de Madrid, Benidorm o la ubicación del usuario.
- Notificaciones del navegador con umbral por defecto M > 4.5. Avisos de tsunami: solo oficiales.
- Modo oscuro y modo día. Solo español.

## Aprobaciones

- 2026-10-10: Plan [docs/02-plan.md](../docs/02-plan.md) aprobado.

## En curso

- T0.1 git (especialista-git)
- T1.1 STACK.lock (investigador-stack)
- T1.2 fuentes (ingeniero-datos)
- T1.4 límites de los planes gratuitos (devops-sre)

## Pendientes

- T1.3 latencias, depende de T1.2.
- Fase 2: PRD 🔒
