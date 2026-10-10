---
name: modernizacion-legacy
description: "Diagnóstico y modernización de sistemas heredados (Perl 5 antiguo, PHP 5/7, ASP clásico, VB6, COBOL, monolitos sin pruebas): inventario, pruebas de caracterización, migración de versión, strangler fig y migración de datos. Úsala ante cualquier código legacy."
---

# Modernización de legacy

## Fase 0: diagnóstico (sin cambiar nada)
- **Inventario:**
  - `cloc .`;
  - lenguajes y versiones reales en el servidor (`php -v`, `perl -v`, `httpd -v`);
  - dependencias (cpanfile, Makefile.PL, `composer.json`, PEAR, includes manuales);
  - cron jobs, colas;
  - integraciones (FTP, correo, servicios web SOAP);
  - variables de configuración.
- **Mapa de entradas:** rutas web, scripts CLI, procesos batch. Herramientas: logs de acceso, `grep -R` sobre includes y requires.
- **Riesgos:** versiones en EOL (CVE), funciones eliminadas en la versión destino, codificación (latin1 frente a UTF-8), *magic quotes* y `register_globals`, SQL concatenado, sesiones propias.
- **Reglas de negocio implícitas** → `docs/legacy/reglas-negocio.md`.

## Fase 1: red de seguridad
- Repositorio Git si no existe (con el código de producción tal como está).
- Entorno reproducible en contenedor con la versión antigua, solo para pruebas.
- **Pruebas de caracterización** (skill `pruebas-estrategia`) de los flujos críticos.
- Monitoreo de errores en producción antes de tocar el código.

## Fase 2: estrategia (ADR)
| Estrategia | Cuándo |
|---|---|
| **Actualización in situ** (misma app, nueva versión del lenguaje) | El código es razonable y el problema principal es la versión EOL |
| **Strangler fig** (proxy delante; se reemplazan rutas una a una) | Sistema grande que no puede detenerse |
| **Reescritura por módulos** detrás de una capa anticorrupción | El dominio es valioso, pero el código es inmantenible |
| **Rehosting** (*lift-and-shift* a contenedor o VM nueva) | Solo urge salir del hardware o SO viejo |
| **Reemplazo por producto** | Existe un SaaS o ERP que cubre más del 80 % |

## Recetas por tecnología
- **PHP 5.x/7.x → versión del lock:**
  - `phpcompatibility/php-compatibility` con PHP_CodeSniffer para detectar problemas;
  - **Rector** con los sets de nivel de PHP, aplicado en pasos;
  - `mysql_*` → PDO con consultas preparadas;
  - `ereg` → `preg`, `each()` y `create_function` → closures;
  - tipos estrictos de forma progresiva;
  - PHPStan subiendo de nivel poco a poco (con baseline).
- **Perl antiguo → Perl del lock:**
  - `use strict; use warnings;` en todos los archivos;
  - Perl::Critic con severidad progresiva y Perl::Tidy;
  - dependencias en `cpanfile` instaladas con Carton o cpm (local::lib);
  - CGI.pm → PSGI/Plack (Mojolicious o Dancer2) detrás de Starman o Gazelle;
  - DBI con placeholders siempre;
  - objetos con `bless` → Moo o Moose.
- **ASP clásico / VB6:** extraer las reglas a servicios .NET (LTS del lock) y mantener las pantallas viejas mientras se reemplazan.
- **COBOL:** primero se exponen las transacciones como APIs y se replican los datos. La reescritura va por dominio, con validación cruzada de cálculos.
- **jQuery spaghetti:** encapsular por widget y migrar las pantallas al framework del lock por islas.

## Migración de datos
Perfilado (nulos, duplicados, codificación) → limpieza con reglas acordadas con el cliente → migración repetible (script idempotente) → conciliación (conteos, sumas, muestras) → ensayo general → corte con plan de rollback.

## Regla de oro
Cada paso se puede desplegar, medir y revertir por separado. Nada de *big bang*.
