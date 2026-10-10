---
name: stack-ruby
description: "Ruby y Ruby on Rails: versión fijada, Bundler, estructura Rails, Active Record, Hotwire, Sidekiq/Solid Queue, RuboCop, RSpec, Brakeman y despliegue. Úsala para aplicaciones Ruby."
---

# Stack Ruby / Rails

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py ruby`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **`.ruby-version`** con la versión del lock. Bundler con `Gemfile.lock` versionado. Rails en la versión del lock (verifica la compatibilidad Rails ↔ Ruby).
- **Convenciones Rails:**
  - modelos delgados con lógica en *service objects* o POROs en `app/services`;
  - *concerns* con moderación;
  - *strong parameters*;
  - validaciones en el modelo + restricciones en la BD.

## Librerías recomendadas
Front: **Hotwire** (Turbo + Stimulus) + Importmap o jsbundling · Tareas: **Solid Queue** (por defecto en Rails reciente) o **Sidekiq** · Caché: Solid Cache o Redis · Auth: generador de autenticación de Rails, **Devise** u OmniAuth (OIDC) · Autorización: **Pundit** o Action Policy · API: Jbuilder o Alba · Paginación: **Pagy** · Pruebas: **RSpec** + FactoryBot + Capybara (o Minitest, el estándar de Rails) · Calidad: **RuboCop** (rubocop-rails-omakase o rubocop-rails + rubocop-rspec), **Brakeman**, bundler-audit.

## Calidad
```bash
bundle install --deployment   # o: bundle config set deployment true
bundle exec rubocop
bundle exec brakeman -q -w2
bundle exec bundler-audit check --update
bundle exec rspec             # o: bin/rails test
```

## Producción
- Puma detrás de Nginx, Thruster o Kamal según el ADR.
- `RAILS_ENV=production`. `config.force_ssl = true`.
- Credenciales cifradas (`credentials.yml.enc`) o variables de entorno.

## Errores comunes que debe atrapar el revisor
- N+1 (`includes`; detectarlos con Bullet o `strict_loading`).
- Callbacks con efectos secundarios ocultos.
- `update_attribute` (omite las validaciones).
- SQL interpolado en `where("... #{x}")`.
- `html_safe` o `raw` con datos de usuario.
- Migraciones que bloquean tablas grandes (revisar con `strong_migrations`).
