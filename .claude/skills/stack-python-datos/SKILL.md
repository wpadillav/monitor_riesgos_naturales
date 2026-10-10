---
name: stack-python-datos
description: "Python para ciencia de datos y ML: entorno reproducible, pandas/polars, NumPy, DuckDB, scikit-learn, gradient boosting, PyTorch, visualización, notebooks y MLflow. Úsala para análisis, modelos y prototipos de datos en Python."
---

# Stack Python para datos

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py python`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Entorno
- **uv** (o conda/mamba si se necesitan binarios científicos difíciles), con un lockfile.
- Versión de Python del lock. Verifica que las librerías críticas (PyTorch, CUDA, etc.) publiquen *wheels* para esa versión; si no, usa la versión anterior soportada y regístralo en el lock.
- Proyecto con `src/` + `notebooks/` (solo para explorar) + `data/` (no versionado: usa DVC o rutas a almacenamiento) + `reports/`.

## Librerías recomendadas
- **Tablas:** **polars** (rápido, *lazy*) o **pandas** (ecosistema). **DuckDB** para SQL analítico sobre Parquet o CSV locales.
- **Cálculo:** NumPy, SciPy, statsmodels (inferencia).
- **ML clásico:** **scikit-learn** (pipelines + `ColumnTransformer`), **LightGBM**, XGBoost, CatBoost. Optimización de hiperparámetros con **Optuna**.
- **Deep learning:** **PyTorch** (+ Lightning si el proyecto es grande) y Hugging Face Transformers.
- **Series de tiempo:** statsforecast, sktime, Prophet (con validación honesta).
- **Visualización:** matplotlib/seaborn (estática), **plotly** (interactiva), Altair. Dashboards con Streamlit o Dash.
- **Seguimiento de experimentos:** **MLflow**. Datos versionados con **DVC**.
- **Validación de datos:** pandera o Great Expectations.

## Buenas prácticas
- Todo el preprocesamiento va **dentro de un `Pipeline`**, para evitar fugas de información entre entrenamiento y prueba.
- Semillas fijas (`random_state`). Registra versiones de datos y de código en cada experimento.
- Los notebooks se limpian de salidas antes del commit (`nbstripout`). La lógica reutilizable se mueve a `src/`.
- Usa Parquet, no CSV, para datos intermedios.

## Calidad
```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest
uv run nbqa ruff notebooks/
```
