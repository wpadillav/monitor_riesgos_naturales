---
name: stack-data-engineering
description: "Ingeniería de datos: dbt, Airflow/Dagster/Prefect, Spark/PySpark, DuckDB, Kafka, formatos (Parquet, Iceberg, Delta), calidad de datos y CDC. Úsala para pipelines ETL/ELT, data warehouse o lakehouse."
---

# Stack de ingeniería de datos

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py apache-spark apache-airflow`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Arquitectura de referencia
Fuentes (BD, APIs, archivos) → **ingesta** (CDC con Debezium, Airbyte o scripts incrementales) → **almacenamiento crudo** (bronze: Parquet o Iceberg en almacenamiento de objetos, o esquema `raw` en el warehouse) → **transformación** (dbt: staging → intermedio → marts) → **consumo** (BI, APIs, ML).

## Herramientas recomendadas
| Necesidad | Opción por defecto | Alternativas |
|---|---|---|
| Transformación SQL | **dbt Core** | SQLMesh |
| Orquestación | **Airflow** (estándar) o **Dagster** (centrado en activos) | Prefect |
| Procesamiento distribuido | **Spark / PySpark** (solo si el volumen lo exige) | Polars o DuckDB (de un solo nodo, suficiente hasta cientos de GB) |
| Formato tabular | **Parquet** + **Apache Iceberg** | Delta Lake |
| Streaming | **Kafka** (o Redpanda) + Kafka Connect | Flink para procesamiento con estado |
| Warehouse | PostgreSQL (pequeño), BigQuery, Snowflake, Redshift, ClickHouse | DuckDB/MotherDuck |
| Calidad | **dbt tests** + dbt-expectations | Great Expectations, Soda |

## Reglas
- **Idempotencia:** cada tarea procesa una partición (fecha u otra clave) y se puede volver a ejecutar sin duplicar (`MERGE` o sobrescritura de la partición).
- **Incrementalidad:** marcas de agua o CDC. Evita cargas completas diarias de tablas grandes.
- **Esquemas versionados** y contratos de datos con los productores.
- **Datos personales:** clasificados, enmascarados en los entornos no productivos y con la retención aplicada.
- **Observabilidad:** frescura, volumen, nulos y duplicados por tabla, con alertas.

## dbt (convenciones)
```
models/staging/<fuente>/stg_<fuente>__<tabla>.sql     # limpieza 1:1
models/intermediate/int_<concepto>.sql
models/marts/<dominio>/{fct_,dim_}<nombre>.sql
```
Cada modelo con `unique` y `not_null` en la clave, documentación en YAML y `dbt build` en el CI.
