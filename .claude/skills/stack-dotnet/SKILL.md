---
name: stack-dotnet
description: "C# y .NET LTS: ASP.NET Core (minimal APIs/controllers), EF Core, xUnit, Serilog, nullable, análisis, Central Package Management y despliegue. Úsala para backend, workers o escritorio en .NET."
---

# Stack .NET / C#

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py dotnet`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Solo .NET LTS** del lock, fijado en `global.json` (`"rollForward": "latestPatch"`).
- **`Directory.Build.props`** con `<Nullable>enable</Nullable>`, `<ImplicitUsings>enable</ImplicitUsings>`, `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>`, `<AnalysisLevel>latest-recommended</AnalysisLevel>`.
- **Central Package Management** (`Directory.Packages.props`) y `packages.lock.json` con `RestorePackagesWithLockFile`.
- **C# moderno:** `record`, *primary constructors*, *pattern matching*, `required`, colecciones con expresiones `[...]`.

## Frameworks
**ASP.NET Core**: minimal APIs para servicios pequeños y controllers para APIs grandes. Blazor si el cliente quiere UI en .NET. Worker Service para procesos en segundo plano.

## Librerías recomendadas
ORM: **EF Core** (o Dapper para SQL a mano) · Validación: **FluentValidation** · Logs: **Serilog** (JSON) o `ILogger` + OpenTelemetry · Resiliencia: `Microsoft.Extensions.Http.Resilience` (Polly) · Docs: OpenAPI integrado + Scalar o Swagger UI · Tareas: Hangfire o Quartz.NET · Mensajería: MassTransit (revisar su licencia vigente) · Pruebas: **xUnit** + FluentAssertions (revisar licencia; alternativa Shouldly) + NSubstitute + **Testcontainers** + `WebApplicationFactory`.

## Estructura
```
src/Cliente.App.Api/  src/Cliente.App.Aplicacion/  src/Cliente.App.Dominio/  src/Cliente.App.Infraestructura/
tests/Cliente.App.Tests.Unit/  tests/Cliente.App.Tests.Integration/
Cliente.App.sln  global.json  Directory.Build.props  Directory.Packages.props  .editorconfig
```

## Calidad
```bash
dotnet restore --locked-mode
dotnet format --verify-no-changes
dotnet build -c Release
dotnet test --collect:"XPlat Code Coverage"
dotnet list package --vulnerable --include-transitive
```

## Seguridad
- EF Core parametriza automáticamente. Con `FromSqlRaw` usa siempre parámetros (o `FromSql` interpolado, que es seguro).
- ASP.NET Core Identity u OIDC. Data Protection configurado en clúster.
- Antiforgery en formularios.
- Secretos con User Secrets (desarrollo) o Key Vault/gestor (producción).

## Errores comunes que debe atrapar el revisor
- `async void`.
- `.Result`/`.Wait()` (*deadlocks*).
- `DbContext` como singleton.
- Falta de `CancellationToken`.
- N+1 (usa `Include` o proyecciones).
- `DateTime.Now` (usa `DateTimeOffset.UtcNow` o `TimeProvider`).
- `double` para dinero (usa `decimal`).
- `HttpClient` creado en cada uso (usa `IHttpClientFactory`).
