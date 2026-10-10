---
name: observabilidad
description: "Logs estructurados, métricas, trazas (OpenTelemetry), SLOs, alertas y health checks. Úsala al instrumentar una aplicación, definir monitoreo o investigar un incidente."
---

# Observabilidad

## Los tres pilares
- **Logs:**
  - JSON a stdout;
  - campos `timestamp` (UTC ISO 8601), `level`, `message`, `service`, `version`, `trace_id`, `request_id`, `tenant_id`, `user_id` (seudónimo);
  - **nunca** contraseñas, tokens, tarjetas ni datos personales en claro;
  - niveles: ERROR (requiere acción), WARN, INFO (eventos de negocio), DEBUG (desactivado en producción).
- **Métricas:**
  - RED para servicios: *rate*, *errors*, *duration*;
  - USE para recursos: *utilization*, *saturation*, *errors*;
  - de negocio: pedidos por minuto, pagos fallidos.
- **Trazas:** OpenTelemetry SDK del lenguaje con propagación W3C `traceparent` hacia la BD, la caché y las APIs externas.

## Health checks
- `/health/live`: el proceso responde.
- `/health/ready`: las dependencias críticas están disponibles. No incluir servicios opcionales.

## SLOs y alertas
- **SLI → SLO:** ej. el 99.5 % de las peticiones con éxito y p95 < 300 ms en 28 días. Presupuesto de error = 0.5 %.
- **Alerta sobre síntomas** (consumo acelerado del presupuesto de error), no sobre causas (CPU al 80 %).
- Cada alerta tiene un runbook enlazado: qué significa, cómo diagnosticar y cómo mitigar.

## Stack de referencia
OpenTelemetry Collector → Prometheus/Mimir (métricas), Loki o OpenSearch (logs), Tempo o Jaeger (trazas), Grafana (dashboards). Alternativa: el servicio administrado del proveedor de nube del cliente.

## Postmortem (sin culpables)
Resumen, impacto, línea de tiempo, causa raíz (5 porqués), qué salió bien, acciones con dueño y fecha.
