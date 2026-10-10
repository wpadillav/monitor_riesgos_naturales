---
name: base-datos
description: "Modelado de datos, migraciones sin downtime, índices, tuning de consultas, transacciones, respaldos y migración entre motores. Úsala al diseñar esquemas, escribir migraciones, optimizar consultas o planificar operación de bases de datos."
---

# Bases de datos

## Modelado
- 3FN por defecto. Desnormalizar solo con una consulta medida que lo justifique.
- **Nombres:** tablas en plural y snake_case, PK `id`, FK `<entidad>_id`, timestamps `created_at`/`updated_at` en UTC (`timestamptz` en PostgreSQL).
- **Tipos:**
  - dinero en `numeric(19,4)` o entero en centavos, nunca float;
  - texto en `text`/`varchar` con UTF-8 (utf8mb4 en MySQL);
  - booleanos reales;
  - enums con tabla de catálogo o `CHECK`.
- **Integridad en la BD:** `NOT NULL`, `UNIQUE`, `FOREIGN KEY` y `CHECK`. La aplicación valida además, no en lugar de la BD.
- **IDs:** bigint identity (interno) + UUIDv7 público si se exponen en URLs.
- **Borrado lógico** solo si el negocio lo requiere (y con índices parciales para lo activo).

## Migraciones sin downtime (expandir → migrar → contraer)
1. Agregar una columna o tabla nueva, *nullable* o con default (no bloqueante).
2. Desplegar código que escribe en ambas versiones.
3. Backfill por lotes (1k-10k filas) con pausas.
4. Cambiar las lecturas a la versión nueva.
5. Eliminar lo viejo en un release posterior.

Índices en PostgreSQL con `CREATE INDEX CONCURRENTLY`. En MySQL, revisar `ALGORITHM=INPLACE/INSTANT` o usar gh-ost/pt-online-schema-change en tablas grandes.

## Consultas e índices
- Lee el plan: `EXPLAIN (ANALYZE, BUFFERS)` en PostgreSQL, `EXPLAIN ANALYZE` en MySQL 8+, plan de ejecución real en SQL Server.
- **Índice compuesto:** igualdad primero, rango después. Índices de cobertura para consultas muy frecuentes. Índices parciales para subconjuntos.
- **Evita:**
  - `SELECT *`;
  - funciones sobre columnas indexadas en el `WHERE`;
  - `OFFSET` grande (usa keyset);
  - N+1 (eager loading o joins).
- **Monitoreo:** `pg_stat_statements` o `performance_schema`, slow query log.

## Transacciones y concurrencia
- Transacciones cortas. Nivel de aislamiento por defecto, y `SERIALIZABLE` o bloqueos explícitos (`SELECT … FOR UPDATE`) solo en operaciones críticas.
- Concurrencia optimista con una columna `version`.
- Reintento ante *deadlock* y *serialization failure*.

## Operación
- **Respaldos:** completos + incrementales/PITR (pgBackRest, WAL-G; Percona XtraBackup o binlogs). RPO y RTO definidos. **Restauración de prueba cada mes.**
- **Pooling:** PgBouncer (modo transacción) o ProxySQL.
- **Usuarios por aplicación** con mínimo privilegio. La migración usa un rol con DDL y la aplicación uno solo con DML.

## Migración entre motores o desde legacy
Inventario (tablas, procedimientos, triggers, vistas, charset/collation) → mapeo de tipos → herramienta (pgloader, AWS DMS, scripts) → validación con conteos por tabla, sumas de control de columnas numéricas y muestreo de filas → corte con ventana o replicación.
