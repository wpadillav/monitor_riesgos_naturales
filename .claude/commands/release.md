---
description: "Prepara y ejecuta un release (versión SemVer, CHANGELOG, tag, despliegue) con aprobación del Director"
argument-hint: "[major|minor|patch o versión explícita]"
---

Tipo de release: $ARGUMENTS

1. Verifica que no queden hallazgos bloqueantes y que la suite completa pase en el CI con las versiones del `STACK.lock.md`.
2. Pide a `especialista-git` que:
   - calcule la versión SemVer a partir de los commits convencionales;
   - genere la sección del `CHANGELOG.md`;
   - prepare la rama o PR de release.
3. Pide a `documentador-tecnico` las notas de versión para el cliente, en lenguaje no técnico.
4. Pide a `devops-sre` el plan de despliegue con rollback y verificación posterior (smoke tests y métricas).
5. 🔒 Presenta al Director: versión, cambios, riesgos, plan de despliegue y rollback. **Espera su aprobación explícita.**
6. Si el release tiene novedades visibles para usuarios o clientes, ofrece al Director ejecutar `/lanzamiento` para la comunicación de marketing.
7. Con la aprobación: tag firmado, despliegue y verificación. Informa del resultado y actualiza `.fabrica/estado.md`.
