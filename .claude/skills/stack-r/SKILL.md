---
name: stack-r
description: "R para estadística y analítica: renv, tidyverse/data.table, tidymodels, Quarto, Shiny, testthat, lintr/styler y paquetes. Úsala para análisis estadístico, reportes reproducibles o apps Shiny."
---

# Stack R

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py r`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Versión de R** del lock y **renv** para aislar y fijar los paquetes (`renv.lock` versionado). Proyecto RStudio o Positron (`.Rproj`).
- **Estructura:** `R/` (funciones), `analysis/` o `reports/` (documentos Quarto), `data-raw/`, `tests/testthat/`. Si se reutiliza, se convierte en paquete (`usethis::create_package`).

## Librerías recomendadas
Manipulación: **dplyr/tidyr** (tidyverse) o **data.table** (volumen) · Importación: readr, readxl, arrow (Parquet), DBI + odbc/RPostgres · Modelado: **tidymodels**, lme4 / glmmTMB (mixtos), survival · Visualización: **ggplot2** · Reportes: **Quarto** · Apps: **Shiny** (+ bslib) · Fechas: lubridate.

## Calidad
```r
renv::restore()
lintr::lint_dir("R")
styler::style_dir("R", dry = "fail")
testthat::test_dir("tests/testthat")
```

## Buenas prácticas
- Nada de `setwd()` ni de rutas absolutas: usa `here::here()`. Semillas fijas.
- Funciones puras en `R/` y documentos que solo orquestan.
- Shiny: módulos, `reactive` en lugar de variables globales y validación con `req()`/`validate()`.
