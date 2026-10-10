---
name: stack-sql
description: "SQL y motores relacionales (PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, SQLite): diferencias clave, tipos, funciones, procedimientos, estilo, linting (sqlfluff) y herramientas de migración. Úsala al escribir SQL o trabajar con un motor relacional específico."
---

# Stack SQL (motores relacionales)

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py postgresql mysql mariadb mssqlserver`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Elección del motor (por defecto: PostgreSQL)
| Motor | Cuándo |
|---|---|
| **PostgreSQL** | Por defecto: estándar, JSONB, extensiones (PostGIS, pgvector, pg_trgm), RLS |
| **MySQL / MariaDB** (LTS) | Hosting existente, apps PHP o CMS, equipos con experiencia. Usar InnoDB y utf8mb4 |
| **SQL Server** | Ecosistema Microsoft del cliente, licencias existentes, integración con BI de Microsoft |
| **Oracle** | Impuesto por el cliente (legacy corporativo) |
| **SQLite** | Embebida, apps móviles o de escritorio, pruebas, herramientas locales |

## Diferencias que causan errores
| Tema | PostgreSQL | MySQL/MariaDB | SQL Server |
|---|---|---|---|
| Autoincremento | `GENERATED ALWAYS AS IDENTITY` | `AUTO_INCREMENT` | `IDENTITY(1,1)` |
| Upsert | `INSERT … ON CONFLICT DO UPDATE` | `INSERT … ON DUPLICATE KEY UPDATE` | `MERGE` (con cuidado) |
| Límite | `LIMIT n OFFSET m` | `LIMIT m, n` | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| Texto/collation | `text` + ICU | `utf8mb4_0900_ai_ci` (MySQL) / `utf8mb4_uca1400_ai_ci` (MariaDB) | `nvarchar` + collation |
| Fecha y hora con zona | `timestamptz` | `DATETIME` en UTC por convención | `datetimeoffset` |
| DDL transaccional | sí | no (cada DDL hace commit implícito) | sí |
| Booleano | `boolean` | `TINYINT(1)` | `bit` |

## Estilo
- Palabras clave en MAYÚSCULAS e identificadores en snake_case. Una cláusula por línea y CTEs (`WITH`) para la legibilidad.
- Columnas explícitas (nunca `SELECT *` en código de aplicación). Alias significativos.
- Funciones de ventana (`ROW_NUMBER`, `LAG`, `SUM() OVER`) antes que subconsultas correlacionadas.
- Linter: **sqlfluff** con el dialecto correcto (`sqlfluff lint --dialect postgres`).

## Procedimientos almacenados y triggers
Úsalos solo para integridad o rendimiento justificado: la lógica de negocio va en la aplicación. Si existen (legacy), van versionados en las migraciones y con pruebas (pgTAP o tSQLt).

## Herramientas de migración por stack
Laravel Migrations / Doctrine Migrations (PHP) · Sqitch (Perl, multi-motor) · Alembic / Django migrations (Python) · Flyway / Liquibase (JVM) · EF Core Migrations (.NET) · golang-migrate / goose (Go) · sqlx-cli (Rust) · Active Record (Rails) · Ecto (Elixir) · Prisma / Drizzle / Knex (Node) · dbmate (universal).
