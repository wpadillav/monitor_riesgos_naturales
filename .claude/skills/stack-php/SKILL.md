---
name: stack-php
description: "PHP moderno (8.x) con Composer, Laravel y Symfony: estructura, librerías recomendadas, estándares PSR, calidad (PHPStan, Pint/PHP-CS-Fixer, Rector), pruebas (PHPUnit/Pest) y seguridad. Úsala para cualquier código PHP nuevo o existente."
---

# Stack PHP

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py php`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- Todo archivo empieza con `<?php declare(strict_types=1);`. Usa tipos en parámetros, retornos y propiedades. Clases `final` y `readonly` por defecto, y enums nativos.
- **Novedades por versión:**
  - 8.1: enums, `readonly`, fibers;
  - 8.2: clases `readonly`;
  - 8.3: constantes tipadas, `#[\Override]`;
  - 8.4: *property hooks*, visibilidad asimétrica, `new` sin paréntesis encadenado;
  - 8.5: operador pipe `|>`, extensión URI, `#[\NoDiscard]`.
  - Úsalas solo si el lock lo permite.
- **Estándares:** autoload PSR-4, estilo PER Coding Style/PSR-12, PSR-3 (logs), PSR-7/15/17 (HTTP), PSR-11 (contenedor).

## Frameworks (elección con ADR)
| Opción | Cuándo |
|---|---|
| **Laravel** | Productividad, SaaS, paneles (Filament), colas (Horizon), tiempo real (Reverb) |
| **Symfony (LTS)** | Empresas, proyectos largos, componentes desacoplados, APIs con API Platform |
| Slim / Mezzio | Microservicios o APIs pequeñas |
| Sin framework | Solo scripts o legacy en transición, usando componentes Symfony sueltos |

## Librerías recomendadas
HTTP cliente: `guzzlehttp/guzzle` o `symfony/http-client` · Logs: `monolog/monolog` · Fechas: `nesbot/carbon` o `DateTimeImmutable` · UUID: `ramsey/uuid` o `symfony/uid` · Validación: la del framework, o `symfony/validator` · Archivos: `league/flysystem` · Dinero: `brick/money` · Env: `vlucas/phpdotenv` · Colas: Laravel Queue o Symfony Messenger · ORM: Eloquent o Doctrine ORM · PDF: `dompdf/dompdf` o un headless Chrome externo.

## Estructura (sin framework o en el dominio)
```
src/{Dominio,Aplicacion,Infraestructura,Http}/
tests/{Unit,Integration}/
public/index.php   # único punto de entrada web
config/  bin/  var/ (no versionado)
composer.json composer.lock phpstan.neon .php-cs-fixer.dist.php rector.php
```

## Calidad (todo debe pasar)
```bash
composer validate --strict
vendor/bin/pint --test                 # Laravel; o: vendor/bin/php-cs-fixer fix --dry-run --diff
vendor/bin/phpstan analyse --memory-limit=1G   # nivel ≥ 8 en código nuevo (Larastan en Laravel)
vendor/bin/rector process --dry-run
vendor/bin/phpunit                      # o: vendor/bin/pest
composer audit
```
En `composer.json`: `"require": {"php": "^<versión del lock>"}`, `"config": {"platform": {"php": "<parche del lock>"}, "sort-packages": true}`.

## Producción
- PHP-FPM detrás de Nginx, o FrankenPHP o Octane si el ADR lo indica.
- OPcache activo (`opcache.validate_timestamps=0` + reload en cada deploy) y JIT solo si se mide una ganancia.
- `composer install --no-dev --optimize-autoloader --classmap-authoritative`.
- `display_errors=Off`, `expose_php=Off`, logs a stderr.

## Seguridad
- PDO con consultas preparadas y `PDO::ATTR_EMULATE_PREPARES=false`.
- Escapado en plantillas: Blade `{{ }}` y Twig autoescape.
- Contraseñas con `password_hash(PASSWORD_ARGON2ID)` o `PASSWORD_DEFAULT`.
- Nunca `unserialize()` con datos externos (usa JSON).
- Nunca `extract()`, `eval`, ni `include` con rutas dinámicas.
- CSRF del framework. Uploads validados con `finfo`.

## Errores comunes que debe atrapar el revisor
- Comparación débil `==` con strings numéricos (usa `===`).
- `array_merge` dentro de bucles.
- N+1 en Eloquent: `with()`, y `Model::preventLazyLoading()` en desarrollo.
- Fechas sin zona horaria (`date_default_timezone_set('UTC')` en la app).
- Float para dinero.
- `@` para silenciar errores.
- Lógica de negocio en controladores o en Blade.
- Mass assignment sin `$fillable`.
