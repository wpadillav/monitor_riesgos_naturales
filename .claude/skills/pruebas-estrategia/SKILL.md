---
name: pruebas-estrategia
description: "Estrategia de pruebas para cualquier stack: pirámide, unitarias, integración, contrato, E2E, caracterización en legacy, datos de prueba, cobertura y pruebas inestables. Úsala al planificar, escribir o evaluar pruebas."
---

# Estrategia de pruebas

## Pirámide (proporción orientativa)
- **~70 % unitarias:** lógica de dominio, rápidas y sin E/S.
- **~20 % integración:** BD real en contenedor (Testcontainers), colas, adaptadores HTTP con servidor simulado.
- **~10 % E2E:** flujos críticos de negocio con Playwright (web) o Maestro/Detox (móvil).
- **Contrato:** validar la API contra OpenAPI (Schemathesis, Dredd) o con contratos de consumidor (Pact) si hay varios equipos.

## Herramientas por stack (respetar el STACK.lock)
| Stack | Unitarias / integración | Mocks | Cobertura |
|---|---|---|---|
| PHP | PHPUnit o Pest | Mockery / prophecy | Xdebug o PCOV |
| Perl | Test2::V0 o Test::More + `prove` | Test::MockModule | Devel::Cover |
| Python | pytest | pytest-mock / unittest.mock | coverage.py |
| JS/TS | Vitest o Jest + Testing Library | MSW para HTTP | v8/istanbul |
| Java/Kotlin | JUnit 5 + AssertJ | Mockito / MockK | JaCoCo |
| .NET | xUnit o NUnit + FluentAssertions | NSubstitute / Moq | coverlet |
| Go | `testing` + testify | interfaces + fakes | `go test -cover` |
| Rust | `cargo test` | mockall | cargo-llvm-cov |
| Ruby | RSpec o Minitest | rspec-mocks | SimpleCov |
| Elixir | ExUnit | Mox | `mix test --cover` |

## Reglas
- Patrón AAA (Arrange, Act, Assert). Un comportamiento por prueba. Nombres que describen el comportamiento: `rechaza_pago_con_saldo_insuficiente`.
- **Deterministas:** reloj inyectado, semillas fijas, sin red real y sin depender del orden de ejecución.
- **Datos:** fábricas o builders. Nunca copias de producción con datos personales.
- **Cobertura:** ≥ 80 % en el dominio. No perseguir el 100 % en código de pegamento. La cobertura nunca debe bajar respecto a la rama base.
- **Pruebas inestables:** se ponen en cuarentena con un ticket en 24 h. No se reintentan para siempre.
- **Mutación** (Infection, Stryker, mutmut, PIT) para módulos críticos: dinero, permisos.

## Legacy: pruebas de caracterización
1. Captura entradas y salidas reales del sistema actual (HTTP, archivos generados, filas de BD).
2. Congélalas como *golden master* (*snapshot*/*approval testing*).
3. Refactoriza o migra y compara. Toda diferencia se explica o se corrige.

## Accesibilidad y visual
axe-core en las pruebas E2E. Regresión visual opcional (capturas de Playwright) para el design system.
