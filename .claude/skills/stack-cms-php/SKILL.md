---
name: stack-cms-php
description: "WordPress y Drupal a la medida: instalación con Composer, temas hijos/bloques, plugins/módulos propios, WP-CLI/Drush, estándares de código, seguridad, rendimiento y actualizaciones. Úsala para sitios o portales sobre CMS PHP."
---

# Stack CMS PHP (WordPress / Drupal)

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py wordpress`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## WordPress
- **Instalación gestionada con Composer** (estructura tipo Bedrock): núcleo, plugins (vía WPackagist) y temas como dependencias. Configuración por `.env`.
- **Desarrollo:**
  - **tema hijo** o tema de bloques (`theme.json`) para la presentación;
  - **plugin propio** para la lógica (CPT, taxonomías, REST endpoints), nunca en `functions.php`;
  - bloques con `@wordpress/scripts`.
- **Estándares:**
  - WordPress Coding Standards (PHPCS + WPCS);
  - prefijos únicos;
  - *nonces* + `current_user_can()` en cada acción;
  - entrada saneada (`sanitize_*`) y salida escapada (`esc_html`, `esc_attr`, `esc_url`, `wp_kses`);
  - `$wpdb->prepare()` siempre.
- **Operación:**
  - **WP-CLI** para todo;
  - actualizaciones semanales de plugins, con una lista blanca de plugins mantenidos y con pocas vulnerabilidades;
  - caché de objetos (Redis) y de página;
  - `DISALLOW_FILE_EDIT` y `DISALLOW_FILE_MODS` en producción.
- **Pruebas:** PHPUnit con el framework de pruebas de WordPress y Playwright para E2E.

## Drupal
- **Composer** (`drupal/recommended-project`) y **Drush**. Configuración exportada (`config/sync`) y versionada.
- Módulos propios en `web/modules/custom` con servicios y DI. Temas con Twig y sin lógica en las plantillas.
- **Estándares:** PHPCS con Drupal/DrupalPractice y PHPStan con `mglaman/phpstan-drupal`. Rector para las deprecaciones (`drupal-rector`).
- **Actualizaciones:** `composer update drupal/core-* --with-all-dependencies` + `drush updb` + `drush cim`, siempre probando antes en staging.

## Comunes
- Versión de PHP del lock compatible con la versión del CMS.
- Los respaldos de la BD **y** de `uploads`/`files` se hacen juntos.
- WAF o reglas de rate limit para `wp-login.php`/`xmlrpc.php` o `/user/login`.
