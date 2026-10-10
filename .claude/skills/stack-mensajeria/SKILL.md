---
name: stack-mensajeria
description: "Mensajería y colas: RabbitMQ, Kafka/Redpanda, Redis Streams, NATS y colas administradas (SQS, Pub/Sub); patrones outbox, idempotencia, reintentos, DLQ y orden. Úsala para comunicación asíncrona, jobs o arquitecturas por eventos."
---

# Stack de mensajería y colas

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py rabbitmq kafka`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Elección
| Necesidad | Opción |
|---|---|
| Jobs en segundo plano de una app | Cola del framework: Laravel Queue/Horizon, Symfony Messenger, Sidekiq/Solid Queue, Celery/Dramatiq, BullMQ, Oban, Hangfire, Minion (Perl/Mojolicious) |
| Enrutamiento flexible entre servicios, RPC asíncrono | **RabbitMQ** (colas *quorum*) |
| Flujo de eventos alto, reprocesamiento, múltiples consumidores, CDC | **Kafka** / Redpanda |
| Ligero, baja latencia, *request-reply* | NATS (JetStream para persistencia) |
| Nube administrada | SQS/SNS, Google Pub/Sub, Azure Service Bus |

## Patrones obligatorios
- **Outbox transaccional:** el evento se guarda en la misma transacción que el cambio de negocio, y un *relay* lo publica después. Nunca "guardar en la BD y luego publicar" sin outbox.
- **Consumidores idempotentes:** tabla de mensajes procesados (por `id` del mensaje) o operaciones naturalmente idempotentes. La entrega es *at-least-once*.
- **Reintentos** con *backoff* exponencial y *jitter*, y un límite. Después, **DLQ** (*dead-letter queue*) con alerta y una herramienta para re-encolar.
- **Orden:** solo garantizado por partición (Kafka) o por cola. Particiona por la clave de la entidad.
- **Esquemas versionados** (JSON Schema, Avro o Protobuf + *schema registry* en Kafka). Cambios compatibles hacia atrás.
- **Mensajes pequeños** con IDs y datos esenciales. Los adjuntos grandes van a almacenamiento de objetos.

## Observabilidad
Profundidad de las colas, *lag* de los consumidores, tasa de errores, tamaño de la DLQ y trazas propagadas en las cabeceras del mensaje (`traceparent`).
