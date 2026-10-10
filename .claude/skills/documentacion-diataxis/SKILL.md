---
name: documentacion-diataxis
description: "Documentación técnica y de usuario con el marco Diátaxis: README, tutoriales, guías, referencia, explicación, runbooks, notas de versión y diagramas Mermaid. Úsala al escribir o revisar cualquier documentación del proyecto."
---

# Documentación (Diátaxis)

| Tipo | Propósito | Ejemplo en el proyecto |
|---|---|---|
| **Tutorial** | aprender haciendo | `docs/tutoriales/primeros-pasos.md` |
| **Guía práctica** | resolver una tarea concreta | `docs/guias/desplegar-en-staging.md`, runbooks |
| **Referencia** | consultar información exacta | API (OpenAPI), variables de entorno, CLI, esquema de BD |
| **Explicación** | entender el porqué | `docs/01-arquitectura.md`, ADRs |

## README.md (plantilla)
```markdown
# <Proyecto>
<Qué es y para quién, en 2 líneas>

## Requisitos
<Desde STACK.lock.md: runtime X.Y, BD Z, etc.>

## Inicio rápido
<≤5 comandos: clonar, configurar .env, instalar, migrar, ejecutar>

## Pruebas
## Despliegue
## Estructura del proyecto
## Documentación  → enlaces a docs/
## Contribuir     → ramas, commits, PRs
## Licencia
```

## Runbook (plantilla)
Síntoma / alerta → impacto → diagnóstico (comandos exactos) → mitigación → escalamiento → verificación → prevención.

## Estilo
- Español neutro, voz activa, oraciones cortas, segunda persona.
- Un tema por página. Títulos que son tareas: "Cómo restaurar un respaldo".
- Ejemplos copiables y **probados**. Salidas esperadas cuando ayudan.
- Diagramas en Mermaid dentro del Markdown (versionables).
- Nada de secretos ni datos reales en los ejemplos.
- Fecha y versión en los documentos que caducan.

## Notas de versión para el cliente
Lenguaje de negocio: qué puede hacer ahora el usuario, qué cambió, qué debe hacer (si aplica) y problemas conocidos. Sin jerga ni IDs internos.

## Mantenimiento
La documentación cambia en el mismo PR que el código. El revisor verifica que la documentación esté actualizada.
