---
name: datos-ml
description: "Ciencia de datos y MLOps: formulación del problema, EDA, validación, métricas, experimentación A/B, reproducibilidad, despliegue y monitoreo de modelos. Úsala para análisis, modelos predictivos o productos basados en datos."
---

# Ciencia de datos y MLOps

## Flujo
1. **Problema → decisión → métrica.** ¿Qué acción cambia con la predicción? Métrica de negocio y métrica técnica.
2. **Línea base:** regla simple, promedio o modelo lineal. Todo modelo nuevo debe superarla.
3. **Datos:** origen, ventana temporal, granularidad, *leakage* (variables que no existirán al momento de predecir) y sesgos de muestreo.
4. **EDA:** distribuciones, nulos, outliers, correlaciones y desbalance.
5. **Validación:**
   - k-fold estratificado si los datos son i.i.d.;
   - **split temporal** si hay tiempo (nunca mezclar futuro con pasado);
   - conjunto de prueba intocable hasta el final.
6. **Modelos:** lineales o logísticos → gradient boosting (LightGBM, XGBoost, CatBoost) → redes neuronales solo con datos no estructurados o con una ganancia demostrada.
7. **Métricas:**
   - clasificación: AUC-PR si hay desbalance, F1, calibración;
   - regresión: MAE o RMSE en unidades del negocio;
   - pronóstico: MAPE o sMAPE, siempre comparado con el modelo ingenuo;
   - siempre con intervalos de confianza (bootstrap).
8. **Interpretabilidad:** importancia por permutación y SHAP. Análisis de errores por segmento y de equidad.

## Experimentos A/B
Hipótesis y métrica primaria definidas **antes** de empezar. Tamaño de muestra por análisis de potencia (α = 0.05, potencia 0.8). Sin mirar los resultados a mitad de camino, salvo con métodos secuenciales. Verificar SRM (*sample ratio mismatch*).

## Reproducibilidad
- Código en paquete (`src/`), los notebooks solo para explorar.
- Dependencias fijadas con uv/poetry o renv (R).
- Semillas fijas.
- Datos versionados (DVC o snapshots con hash).
- Experimentos registrados (MLflow).

## Producción (MLOps)
- Modelo versionado y registrado. Firma de entrada y salida validada.
- Servido en batch (job programado) o en línea (API con FastAPI o del stack, con timeout y fallback).
- **Monitoreo:** deriva de datos (PSI o KS), deriva de predicciones y métrica real cuando llega la etiqueta.
- Reentrenamiento programado o por alerta.
- Ficha del modelo (*model card*): propósito, datos, métricas, limitaciones y uso no permitido.
