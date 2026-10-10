---
name: stack-nosql
description: "Bases NoSQL y de búsqueda: MongoDB, Redis/Valkey, Elasticsearch/OpenSearch, Cassandra/ScyllaDB y DynamoDB; cuándo usarlas, modelado por patrones de acceso, índices, consistencia y licencias. Úsala al elegir o trabajar con un almacén no relacional."
---

# Stack NoSQL y búsqueda

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py mongodb redis elasticsearch`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Cuándo (con un ADR; lo relacional es la opción por defecto)
| Almacén | Úsalo para | No lo uses para |
|---|---|---|
| **MongoDB** | Documentos con esquema variable, catálogos, contenido, eventos | Datos muy relacionales con transacciones complejas |
| **Redis / Valkey** | Caché, sesiones, rate limiting, colas ligeras, *pub/sub*, rankings | Fuente de verdad sin persistencia configurada |
| **Elasticsearch / OpenSearch** | Búsqueda de texto completo, facetas, logs, búsqueda híbrida con vectores | Base de datos principal |
| **Cassandra / ScyllaDB** | Escrituras masivas, series de tiempo, multi-región | Consultas *ad hoc*, joins |
| **DynamoDB** | Serverless en AWS con patrones de acceso conocidos | Analítica, consultas flexibles |

## Licencias (verificar siempre la vigente)
Redis cambió de licencia (RSAL/SSPL y luego también AGPL en versiones recientes): **Valkey** (BSD, Linux Foundation) es la alternativa abierta compatible. Elasticsearch: licencias Elastic/SSPL/AGPL según la versión, frente a **OpenSearch** (Apache 2.0). MongoDB Community es SSPL. Revisa el impacto si el cliente revende el software como servicio.

## MongoDB
- **Modelar por patrones de acceso:** embeber lo que se lee junto, referenciar lo que crece sin límite.
- **Validación con `$jsonSchema`** en la colección. Índices compuestos siguiendo la regla ESR (igualdad, orden, rango).
- Transacciones multi-documento solo cuando haga falta. *Write concern* `majority` para datos críticos.
- **ODM:** Mongoose (Node), Motor/PyMongo + Beanie (Python), Spring Data MongoDB, driver oficial en Go o .NET.

## Redis / Valkey
- Claves con *namespace* (`app:tenant:entidad:id`) y **TTL en todo lo que sea caché**.
- Estructuras adecuadas: hash para objetos, sorted set para rankings, streams para colas con grupos de consumidores.
- Persistencia (AOF/RDB) si guarda algo no regenerable.
- Evita `KEYS *` (usa `SCAN`), las claves gigantes y los comandos O(n) en producción.

## Elasticsearch / OpenSearch
- *Mappings* explícitos (no dinámicos en producción) y analizador `spanish` o uno personalizado con `asciifolding` para manejar las tildes.
- Alias para reindexar sin downtime.
- La fuente de verdad sigue siendo la BD relacional: sincronizar con eventos, CDC o un job.
