---
name: stack-elixir
description: "Elixir/Erlang OTP con Phoenix y LiveView: mix, Ecto, OTP (supervisores, GenServer), Oban, Credo, Dialyzer, ExUnit y releases. Úsala para sistemas concurrentes, tiempo real o de alta disponibilidad en la BEAM."
---

# Stack Elixir / Phoenix

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py elixir`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Versiones** de Elixir y Erlang/OTP **compatibles entre sí** (consulta la tabla oficial), fijadas en `.tool-versions` (asdf o mise).
- **OTP:**
  - árbol de supervisión pensado desde el diseño;
  - `GenServer` solo cuando hay estado o serialización necesaria (no como *namespace*);
  - procesos baratos, pero con dueño.
- **Phoenix:**
  - contextos (`Cuentas`, `Pedidos`) como frontera del dominio;
  - controladores y LiveViews delgados.

## Librerías recomendadas
BD: **Ecto** + `postgrex` · Jobs: **Oban** · Tiempo real: **Phoenix LiveView**, PubSub, Presence · HTTP cliente: **Req** · Auth: `phx.gen.auth` · JSON: **Jason** (o el módulo JSON nativo en versiones recientes) · Telemetría: `:telemetry` + OpenTelemetry · Pruebas: **ExUnit**, **Mox**, ExMachina.

## Calidad
```bash
mix format --check-formatted
mix credo --strict
mix dialyzer
mix test --cover
mix deps.audit && mix hex.audit
mix sobelow           # seguridad Phoenix
```

## Producción
- `mix release` en una imagen mínima. Configuración en `config/runtime.exs` desde el entorno.
- Clustering con libcluster si aplica.

## Errores comunes que debe atrapar el revisor
- `GenServer` como cuello de botella (todas las llamadas serializadas).
- Mensajes sin manejar que llenan el buzón.
- Átomos creados desde la entrada del usuario (`String.to_atom`).
- Consultas Ecto en bucles (usa `preload`).
- `try/rescue` usado para el flujo normal: prefiere `{:ok, _}` / `{:error, _}` y `with`.
