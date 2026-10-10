---
description: "Diagnóstico completo de un proyecto existente (de otro agente o equipo; web, móvil, API, datos, legacy…) con informe priorizado y plan de mejora. Solo análisis, no modifica nada."
argument-hint: "[enfoque opcional, ej. 'seguridad', 'preparar para producción', 'publicar en tiendas']"
---

Actúa como **Coordinador agéntico** y carga las skills `coordinacion-agentica` y `politica-versiones`.

Enfoque adicional pedido por el Director (puede estar vacío): $ARGUMENTS

**REGLA DE ESTE COMANDO: SOLO ANÁLISIS.**
- No modifiques archivos del proyecto. Solo se crean `docs/auditoria-inicial.md` y `.fabrica/estado.md`.
- No hagas commits.
- No instales dependencias ni ejecutes nada que cambie el entorno: nada de migraciones, despliegues o `npm install`.
- Sí puedes usar comandos de solo lectura (`git log`, `ls`, `cat`, listados de dependencias y auditorías que no modifiquen nada).
- Incluye esta regla en cada encargo a los agentes.

## Fase 1 — Reconocimiento (lo haces tú, sin delegar)
1. Lee las instrucciones de otros agentes si existen (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`), el `README`, `docs/` y `git log --oneline -30`. Respeta sus convenciones salvo que sean un riesgo.
2. Identifica:
   - el tipo de proyecto (web, API/backend, móvil nativo o multiplataforma, escritorio, datos/ML, IA/LLM, CLI o librería, CMS, legacy, monorepo o mezcla);
   - lenguajes, frameworks y versiones, según manifiestos y lockfiles;
   - base de datos;
   - infraestructura (Docker, CI, IaC);
   - si es público (sitio o app publicada);
   - archivos sueltos sospechosos en la raíz: documentos, credenciales, entornos virtuales, binarios.
3. Muestra al Director el **perfil del proyecto** en una tabla y sigue, salvo que algo sea ambiguo y cambie el diagnóstico.

## Fase 2 — Diagnóstico en paralelo
Lanza en un mismo mensaje **solo los agentes que apliquen al perfil**. Cada encargo lleva la regla de solo análisis y pide hallazgos con archivo:línea, severidad, impacto y corrección sugerida.

- **Siempre:**
  - `investigador-stack`: versiones frente a la política LTS (con `versiones.py`), dependencias obsoletas, abandonadas o con licencias problemáticas, y borrador de `STACK.lock.md` en la ENTREGA (no en el repo).
  - `arquitecto-seguridad`: secretos expuestos (también en el historial de git), datos personales versionados, OWASP/MASVS y CVEs.
  - `revisor-codigo`, `qa-automatizacion` (pruebas, cobertura y huecos), `arquitecto-software` (estructura y deuda técnica) y `documentador-tecnico`.
- **Si hay backend o API:** `backend-senior`.
- **Si hay frontend web:** `frontend-senior` y `disenador-ux-ui` (accesibilidad WCAG 2.2 AA).
- **Si es móvil:** `mobile-senior`. Revisa el SDK mínimo y objetivo frente a los requisitos vigentes de Google Play y App Store, la versión de Xcode y AGP, permisos, almacenamiento seguro, firma y builds, modo offline y rendimiento.
- **Si hay base de datos:** `dba`.
- **Si hay datos o ML:** `cientifico-datos` o `ingeniero-datos`. **Si usa LLMs:** `ingeniero-ia`.
- **Si hay CI, contenedores, servidores o despliegue:** `devops-sre` o `sysadmin-linux`.
- **Si hay código antiguo o versiones sin soporte:** `especialista-legacy`.
- **Si es un sitio o app pública:**
  - `especialista-seo` (en web);
  - `ingeniero-rendimiento` (Lighthouse y Core Web Vitals en web; arranque y fluidez en móvil);
  - `analista-marketing`, si hay analítica o etiquetas.
- **Si el Director pidió un enfoque:** profundiza en él con los agentes pertinentes.

## Fase 3 — Informe `docs/auditoria-inicial.md`
Usa la plantilla `coordinacion-agentica/plantillas/auditoria.md`:
1. perfil del proyecto;
2. resumen ejecutivo con semáforo por área;
3. hallazgos consolidados y sin duplicados, ordenados por severidad;
4. tabla de versiones actuales frente a las recomendadas, con EOL;
5. plan de mejora por fases (urgente, corto y mediano plazo) con una estimación aproximada;
6. lo que está bien hecho y conviene conservar.

Si un agente no pudo verificar algo (por ejemplo, sin red o sin build), indícalo como "no verificado" en lugar de suponerlo.

## Fase 4 — Incorporación
Crea `.fabrica/estado.md` (plantilla `estado.md`) con la fase "Diagnóstico completado" y los pendientes de decisión.

## Cierre
Presenta al Director:
- el semáforo;
- los 5 hallazgos más importantes;
- el plan por fases.

Termina preguntando qué fase quiere ejecutar. Esa fase se convierte en tareas de `docs/02-plan.md` y se ejecuta con `/sprint` después de su aprobación.
