---
name: stack-python
description: "Python moderno para backend y automatización: uv/pyproject, ruff, mypy/pyright, pytest, FastAPI, Django, SQLAlchemy 2, Pydantic 2, estructura src y despliegue. Úsala para cualquier código Python que no sea principalmente ciencia de datos."
---

# Stack Python (backend y automatización)

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py python`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **`pyproject.toml`** como única fuente de configuración, con `requires-python = ">=<versión del lock>"`.
- **Gestor:** **uv** (preferido: rápido, lockfile `uv.lock`) o Poetry. `.python-version` con la versión del lock.
- **Layout `src/`.** Tipado completo (PEP 484/604): `list[int]`, `X | None`. `dataclasses` o Pydantic para los datos.

## Frameworks
| Opción | Cuándo |
|---|---|
| **FastAPI** + Pydantic v2 + Uvicorn | APIs, microservicios, servir modelos de ML |
| **Django (LTS)** + Django REST Framework o Django Ninja | Apps con administración, CRUD rico, monolitos |
| Flask | Apps pequeñas o legacy |
| Typer / Click | CLIs |

## Librerías recomendadas
ORM: **SQLAlchemy 2.x** (estilo 2.0) + **Alembic** (o el ORM de Django) · Driver PG: **psycopg 3** o asyncpg · HTTP: **httpx** · Config: **pydantic-settings** · Logs: **structlog** o `logging` con JSON · Tareas: **Celery**, **Dramatiq** o **RQ** · Fechas: `datetime` con `zoneinfo` · Dinero: `decimal.Decimal` · Reintentos: **tenacity**.

## Estructura
```
src/miapp/{dominio,servicios,api,infra}/  src/miapp/__init__.py
tests/{unit,integration}/  pyproject.toml  uv.lock  alembic/
```

## Calidad
```bash
uv sync --frozen
uv run ruff format --check . && uv run ruff check .
uv run mypy src            # o: uv run pyright
uv run pytest -q --cov=src --cov-report=term-missing
uv run pip-audit
```
Reglas de ruff recomendadas: `E,F,W,I,B,UP,S,SIM,RUF,DTZ,PL`. La familia `S` (bandit) cubre seguridad y `DTZ`, fechas sin zona horaria.

## Producción
- **ASGI:** Uvicorn (o Gunicorn con workers Uvicorn).
- **WSGI (Django sync):** Gunicorn.
- Imagen basada en `python:<versión del lock>-slim`, ejecutada como usuario no root.
- Variables `PYTHONDONTWRITEBYTECODE=1` y `PYTHONUNBUFFERED=1`.

## Seguridad
- Consultas parametrizadas: nunca f-strings en SQL.
- `subprocess.run([...], shell=False)`.
- Nunca `pickle` ni `yaml.load` con datos externos (usa `yaml.safe_load`).
- `secrets` para generar tokens.
- Django: `DEBUG=False`, `ALLOWED_HOSTS` y `SECURE_*` en producción.

## Errores comunes que debe atrapar el revisor
- Argumentos por defecto mutables (`def f(x=[])`).
- `except Exception: pass`.
- `datetime.now()` sin zona horaria.
- Float para dinero.
- Mezclar sync y async (llamadas bloqueantes dentro de `async def`).
- Importaciones circulares.
- N+1 en el ORM (`select_related`/`prefetch_related`, `selectinload`).
- Dependencias sin fijar.
