---
name: stack-go
description: "Go idiomático: módulos, estructura de proyecto, net/http y chi, pgx/sqlc, slog, manejo de errores, concurrencia segura, golangci-lint, pruebas y govulncheck. Úsala para servicios, CLIs y herramientas en Go."
---

# Stack Go

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py go`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Versión** en `go.mod` (`go 1.xx` + `toolchain`). Go soporta las 2 últimas versiones menores: actualiza al menos cada 6 meses.
- **Idioms:**
  - errores como valores, envueltos con contexto (`fmt.Errorf("crear pedido: %w", err)`) y comprobados con `errors.Is`/`errors.As`;
  - `context.Context` como primer parámetro en todo lo que haga E/S;
  - interfaces pequeñas definidas por el consumidor;
  - sin `panic` en el flujo normal.

## Librerías recomendadas
HTTP: `net/http` con el *router* mejorado (métodos y comodines en los patrones) o **chi** · PG: **pgx** v5 + **sqlc** (SQL tipado) · Migraciones: **golang-migrate** o goose · Logs: **log/slog** (stdlib) · Config: `env` + `caarlos0/env` · Validación: `go-playground/validator` · Pruebas: `testing` + **testify** + Testcontainers-go · CLI: **cobra** o `flag` · gRPC: `google.golang.org/grpc` + buf.

## Estructura
```
cmd/<app>/main.go     # cableado mínimo
internal/<dominio>/   # lógica no importable desde fuera
internal/platform/{db,http,config}/
migrations/  go.mod  go.sum  .golangci.yml
```
Evita `pkg/` salvo que sea una librería pública. No crees un paquete por capa vacía.

## Calidad
```bash
gofmt -l . && go vet ./...
golangci-lint run          # habilitar: errcheck, staticcheck, gosec, revive, bodyclose, sqlclosecheck
go test -race -cover ./...
govulncheck ./...
```

## Concurrencia
- Cada goroutine tiene un dueño y una forma de terminar (contexto o cierre de canal). Usa `errgroup` para trabajo paralelo con errores.
- Protege el estado compartido con `sync.Mutex` o con canales. Pruebas siempre con `-race`.

## Errores comunes que debe atrapar el revisor
- Errores ignorados (`_ =`).
- `defer` en bucles.
- Variable del bucle capturada (corregido desde Go 1.22, pero revisar el código legacy).
- `http.Client` sin timeout.
- No cerrar `resp.Body` o `rows`.
- Goroutines filtradas.
- `map` concurrente sin bloqueo.
