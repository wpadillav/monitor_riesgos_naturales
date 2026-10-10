---
name: cicd-contenedores
description: "Integración y despliegue continuo con contenedores: pipelines (GitHub Actions, GitLab CI), Dockerfiles seguros, promoción de artefactos, estrategias de despliegue y rollback. Úsala al crear o revisar pipelines, imágenes o procesos de despliegue."
---

# CI/CD y contenedores

## Pipeline estándar (cada PR)
1. Checkout → configurar el runtime **con la versión exacta del STACK.lock** (`.nvmrc`, `.tool-versions`, `php-version`, `global.json`, etc.).
2. Instalar dependencias desde el lockfile, con caché (`npm ci`, `composer install --no-interaction --prefer-dist`, `uv sync --frozen`, `cpanm --installdeps .` o `carton install --deployment`, `go mod download`, `dotnet restore --locked-mode`).
3. Formateador (modo verificación) → linter → typecheck o análisis estático.
4. Pruebas unitarias y de integración (servicios en contenedores) + cobertura.
5. Seguridad: auditoría de dependencias, gitleaks y Semgrep.
6. Build del artefacto o imagen → escaneo (Trivy) → SBOM.
7. Rama principal: publicar el artefacto inmutable (tag = SHA del commit) → desplegar en staging → pruebas *smoke* y E2E → aprobación manual → producción.

## Ejemplo de GitHub Actions (esqueleto)
```yaml
name: ci
on: [pull_request, push]
permissions: { contents: read }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  test:
    runs-on: ubuntu-24.04
    services:
      db: { image: "postgres:<version-del-lock>", env: { POSTGRES_PASSWORD: test }, ports: ["5432:5432"] }
    steps:
      - uses: actions/checkout@<sha-fijado>
      - uses: actions/setup-node@<sha-fijado>
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run lint && npm run typecheck
      - run: npm test -- --coverage
```
Las *actions* de terceros se fijan por SHA. Los permisos del token son mínimos. Para la nube se usa OIDC en lugar de llaves estáticas.

## Dockerfile seguro (patrón)
```dockerfile
# syntax=docker/dockerfile:1
FROM <imagen-oficial>:<version-exacta-del-lock> AS build
WORKDIR /app
COPY <manifiestos y lockfiles> ./
RUN <instalar dependencias de producción desde el lockfile>
COPY . .
RUN <build>

FROM <imagen-runtime-mínima>:<version-exacta> AS runtime
RUN addgroup --system app && adduser --system --ingroup app app
WORKDIR /app
COPY --from=build --chown=app:app /app/<artefactos> ./
USER app
EXPOSE 8080
HEALTHCHECK CMD <comando de health>
CMD ["<proceso>"]
```
Reglas:
- nunca `latest`;
- `.dockerignore` (`.git`, `node_modules`, `.env*`, `tests`);
- un proceso por contenedor;
- configuración por variables de entorno;
- sistema de archivos de solo lectura si es posible.

## Estrategias de despliegue
| Estrategia | Riesgo | Requisito |
|---|---|---|
| Rolling | medio | health checks y compatibilidad entre versiones N y N-1 |
| Blue-green | bajo | doble infraestructura y migraciones compatibles |
| Canary | muy bajo | métricas por versión y enrutamiento por porcentaje |
| Feature flags | muy bajo | sistema de flags (separa el despliegue del lanzamiento) |

**Rollback:** volver a desplegar el artefacto anterior en un solo paso. Las migraciones de BD deben ser compatibles hacia atrás (patrón expandir → contraer) para que el rollback sea posible.
