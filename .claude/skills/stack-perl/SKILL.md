---
name: stack-perl
description: "Perl 5 moderno: perlbrew/plenv, cpanm/Carton/cpm, Moo/Moose, Mojolicious/Dancer2/Plack, DBI/DBIx::Class, Perl::Critic, Perl::Tidy, Test2 y despliegue PSGI. Úsala para escribir o mantener cualquier código Perl, incluidos scripts de sistema y CGI legacy."
---

# Stack Perl (moderno)

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py perl`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Instala Perl por proyecto** con `plenv` o `perlbrew` en la versión del lock. Evita usar el Perl del sistema para aplicaciones.
- **Cabecera estándar:**
  ```perl
  use v5.36;          # activa strict, warnings, say y firmas (signatures)
  use utf8;
  use open qw(:std :encoding(UTF-8));
  ```
  Con un lock ≥ 5.40, puedes usar `use v5.40;`, que agrega `try/catch` estable y `true`/`false` de `builtin`.
- **Firmas:** `sub total($self, $items) { ... }`. Nada de `@_` manual en el código nuevo.
- **Dependencias** en `cpanfile`, instaladas en `local/` con **Carton** (`carton install --deployment`) o **cpm** (`cpm install`). Versiona `cpanfile.snapshot`.

## Librerías recomendadas
OO: **Moo** (ligero) o **Moose** (completo) + **Type::Tiny** · Web: **Mojolicious** (todo en uno, async) o **Dancer2** · Servidor PSGI: **Plack** + **Starman** o **Gazelle** · BD: **DBI** + DBD::Pg / DBD::mysql / DBD::MariaDB, **DBIx::Class** como ORM, **SQL::Abstract** · Migraciones: **Sqitch** · JSON: **JSON::MaybeXS** (Cpanel::JSON::XS) · HTTP cliente: **HTTP::Tiny** (core), **Mojo::UserAgent** o **LWP::UserAgent** · Fechas: **DateTime** o **Time::Moment** · Archivos: **Path::Tiny** · Logs: **Log::Any** + Log::Any::Adapter, o **Log::Log4perl** · CLI: **Getopt::Long::Descriptive** o **App::Cmd** · Excepciones: `try/catch` nativo (≥ 5.40), **Try::Tiny** en versiones anteriores o **Throwable** · Plantillas: **Template::Toolkit** o Mojo::Template · Config: **Config::General**, YAML::XS o JSON.

## Estructura
```
lib/MiApp.pm  lib/MiApp/{Dominio,Servicio,Web}/...
script/miapp          # CLI o arranque
t/  xt/               # pruebas unitarias / de autor
cpanfile cpanfile.snapshot .perlcriticrc .perltidyrc app.psgi
```

## Calidad
```bash
perltidy -b -bext='/' lib/**/*.pm t/*.t     # o tidyall -a
perlcritic --severity 3 lib script          # subir a 2 en código nuevo
prove -lr t                                 # Test2::V0 o Test::More
cover -test                                 # Devel::Cover
perl -c script/miapp
```

## Despliegue
- PSGI (`app.psgi`) con Starman detrás de Nginx, o Hypnotoad para Mojolicious, como servicio systemd.
- **CGI legacy:** encapsular con `Plack::App::WrapCGI` mientras se migra.

## Seguridad
- **Modo taint** (`-T`) en scripts que reciben datos externos.
- DBI **siempre con placeholders**: `$dbh->prepare('SELECT * FROM t WHERE id = ?')`.
- **`open` de 3 argumentos:** `open(my $fh, '<', $ruta)`. Nunca `open(FH, $var)`.
- `system`/`exec` en forma de lista (`system('cmd', @args)`) y no interpolando strings.
- Nunca `eval` de strings con datos externos.
- `Storable` solo con datos confiables.
- Escapado HTML en las plantillas.

## Errores comunes que debe atrapar el revisor
- Falta de `use strict`/`warnings`.
- Variables globales y `local $_` fuera de control.
- Contexto escalar frente a lista (`my $n = @lista` frente a `my ($primero) = @lista`).
- `each` dentro de bucles anidados.
- Regex sin anclar en validaciones.
- Problemas de codificación: falta `decode`/`encode` en las fronteras E/S y doble codificación UTF-8.
- `die` sin manejar en procesos largos.
- `$@` sobrescrito: usa `try` o Try::Tiny.
