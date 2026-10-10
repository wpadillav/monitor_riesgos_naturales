---
name: stack-docker-kubernetes
description: "Contenedores y orquestación: Dockerfile, Docker Compose para desarrollo, Kubernetes (Deployments, Services, Ingress, probes, recursos, seguridad), Helm/Kustomize, linting y escaneo. Úsala al contenerizar o desplegar en Kubernetes."
---

# Stack Docker y Kubernetes

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py kubernetes docker-engine`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Docker
- El patrón de Dockerfile está en la skill `cicd-contenedores`. Lint con **hadolint** y escaneo con **Trivy**.
- **Docker Compose para desarrollo:** servicios de la app + BD + caché con versiones **iguales al lock**, `healthcheck` y `depends_on: condition: service_healthy`, volúmenes con nombre y un `.env` local (fuera de git).

## ¿Hace falta Kubernetes?
**No por defecto.** Para 1 a 3 servicios, suele bastar con una VM con systemd y Docker Compose, o un PaaS/contenedores administrados (Cloud Run, ECS, App Service). Kubernetes se justifica en un ADR por escala, por número de servicios o porque el cliente ya lo opera.

## Kubernetes: mínimos por Deployment
```yaml
spec:
  replicas: 2
  template:
    spec:
      securityContext: { runAsNonRoot: true, seccompProfile: { type: RuntimeDefault } }
      containers:
        - name: app
          image: registro/app:<sha>          # nunca latest
          ports: [{ containerPort: 8080 }]
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits:   { memory: 512Mi }
          readinessProbe: { httpGet: { path: /health/ready, port: 8080 } }
          livenessProbe:  { httpGet: { path: /health/live,  port: 8080 } }
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: [ALL] } }
          envFrom: [{ secretRef: { name: app-secrets } }]   # provistos por External Secrets/SOPS
```
Además:
- `PodDisruptionBudget` y `HorizontalPodAutoscaler`;
- `NetworkPolicy` de denegación por defecto;
- Ingress o Gateway API con TLS (cert-manager);
- un namespace por entorno;
- Pod Security Admission en `restricted`.

## Empaquetado y GitOps
**Helm** (charts propios con `values` por entorno) o **Kustomize** (bases + overlays). Despliegue GitOps con **Argo CD** o Flux si el cliente lo adopta.

## Calidad
```bash
hadolint Dockerfile
kubeconform -strict -summary manifests/
kube-linter lint manifests/      # o: helm lint charts/app
trivy config . && trivy image registro/app:<sha>
```

## Versión de Kubernetes
Kubernetes mantiene ~3 versiones menores. Usa la del lock y planifica una actualización por trimestre.
