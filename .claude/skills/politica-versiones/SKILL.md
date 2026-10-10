---
name: politica-versiones
description: "Política obligatoria de versiones de la Fábrica (LTS o estable con ≥18 meses de soporte). Úsala al iniciar un proyecto, al elegir o actualizar un lenguaje, framework, base de datos o sistema operativo, al agregar una dependencia, o cuando haya que crear o validar el archivo STACK.lock.md."
---

# Política de versiones de la Fábrica

**Regla de oro:** nunca se elige una versión de memoria. Las versiones se consultan en vivo y se registran en `STACK.lock.md`. Ningún agente puede usar una versión distinta a la registrada sin un ADR aprobado.

## Criterio de selección (en orden)

1. **El producto tiene LTS** (Node.js, Java, .NET, Ubuntu, Symfony, Django, MySQL, MariaDB…):
   se usa la **LTS más nueva con al menos 18 meses de soporte restante**.
2. **El producto no tiene LTS formal** (PHP, Python, Perl, Go, Ruby, PostgreSQL, Laravel…):
   se usa la **estable más nueva que tenga al menos 60 días publicada y al menos 18 meses de vida restante**.
3. **Nada cumple:** se usa la mantenida más nueva y queda una advertencia en el STACK.lock que revisa el arquitecto.
4. **Siempre el último parche** de la rama elegida (ej. 8.5.x más reciente, no 8.5.0).
5. **Proyecto legacy:** se documenta la versión actual, el riesgo (EOL, CVE) y la versión destino según esta misma política. Ver la skill `modernizacion-legacy`.
6. **Coherencia:** las versiones deben ser compatibles entre sí (ej. Laravel N exige PHP ≥ X; Angular N exige Node ≥ Y). Se verifica la matriz de compatibilidad oficial de cada framework antes de cerrar el lock.

El umbral se puede subir para contratos largos (`--umbral 36`), pero **nunca bajar sin ADR**.

## Cómo consultar

```bash
python3 "<ruta-de-esta-skill>/scripts/versiones.py" --perfil web-php
python3 "<ruta-de-esta-skill>/scripts/versiones.py" php laravel mariadb nodejs ubuntu
python3 "<ruta-de-esta-skill>/scripts/versiones.py" --json python django postgresql
python3 "<ruta-de-esta-skill>/scripts/versiones.py" --listar-perfiles
```

Los nombres son los *slugs* de https://endoflife.date (ej. `eclipse-temurin` para Java, `ruby-on-rails`, `spring-boot`, `mssqlserver`). El script acepta alias como `java`, `node`, `rails`, `pg` o `k8s`.

**Sin red o con el sitio caído:** usa WebFetch sobre `https://endoflife.date/api/v1/products/<slug>/` o sobre la página oficial de releases del proyecto. Como último recurso, usa `referencia.md`, marcando en el lock que la fuente es la referencia estática y su fecha.

**Productos sin ficha en endoflife.date** (librerías, paquetes npm/composer/pip/cpan, crates): consulta el registro oficial (`npm view <pkg> version`, `composer show -a <pkg>`, `pip index versions <pkg>`, `cpanm --info <mod>`, `go list -m -versions <mod>`, `cargo search <crate>`) y aplica tres reglas:
- última versión **estable** (sin alpha, beta, rc ni dev);
- con mantenimiento activo (commit o release en los últimos 12 meses);
- compatible con el runtime registrado en el lock.

## STACK.lock.md

La plantilla está en `plantillas/STACK.lock.md` de esta skill. Se crea en la raíz del proyecto durante la fase de arquitectura y contiene:
- runtime, frameworks, base de datos, sistema operativo y herramientas, cada uno con versión, último parche, EOL y fuente;
- las librerías principales con su versión fijada;
- la fecha de la próxima revisión (trimestral) y quién la hace.

**Lo que se hace cumplir:**
- los archivos de dependencias fijan rangos compatibles con el lock (`composer.json` `"php": "^8.5"`, `package.json` `engines`, `.nvmrc`, `.tool-versions`, `pyproject.toml` `requires-python`, `global.json`, imagen Docker con tag exacto y nunca `latest`);
- los lockfiles (`composer.lock`, `package-lock.json`/`pnpm-lock.yaml`, `poetry.lock`/`uv.lock`, `Gemfile.lock`, `go.sum`, `Cargo.lock`, `cpanfile.snapshot`) **siempre** se versionan en git;
- el CI ejecuta el proyecto en exactamente la versión del lock.

## Revisión periódica

Cada trimestre, o ante un CVE crítico, el agente `investigador-stack` vuelve a correr el script. Propone actualizaciones de parche (automáticas) y de rama menor o mayor (con ADR), y alerta si alguna versión del lock tiene menos de 6 meses para su EOL.
