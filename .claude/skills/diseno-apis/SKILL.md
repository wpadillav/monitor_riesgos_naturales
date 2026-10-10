---
name: diseno-apis
description: "Diseño de APIs REST/HTTP, GraphQL, gRPC y eventos: OpenAPI 3.1, convenciones de recursos, errores RFC 9457, paginación, versionado, idempotencia y seguridad. Úsala al definir o revisar un contrato de API."
---

# Diseño de APIs

## Contrato primero
El contrato se escribe en `api/openapi.yaml` (OpenAPI 3.1) **antes** de implementar. Backend y frontend trabajan en paralelo contra él (mocks con Prism u otro similar).

## Convenciones REST
- **Recursos** en plural y kebab-case: `/v1/ordenes-compra/{id}/items`. JSON en camelCase o snake_case según el ADR, de forma consistente.
- **Métodos:**
  - `GET` (seguro);
  - `POST` (crear, devuelve `201` + `Location`);
  - `PUT` (reemplazar);
  - `PATCH` (parcial);
  - `DELETE` (`204`).
- **Códigos:**
  - `400` validación de forma y `422` regla de negocio;
  - `401` sin autenticación y `403` sin permiso;
  - `404`;
  - `409` conflicto;
  - `429` límite de tasa.
- **Errores** con RFC 9457 (`application/problem+json`):
  ```json
  {"type":"https://api.ejemplo.com/errores/saldo-insuficiente","title":"Saldo insuficiente","status":422,"detail":"El saldo (10000) es menor al total (15000).","instance":"/v1/pagos/123","errors":[{"campo":"monto","mensaje":"excede el saldo"}]}
  ```
- **Paginación** por cursor para listas grandes (`?limit=50&cursor=...`) y por offset solo en listas pequeñas. Siempre con un límite máximo.
- **Filtros y orden:** `?estado=activo&orden=-creadoEn`.
- **Fechas** ISO 8601 en UTC. **Dinero** como string decimal o entero en centavos, más la moneda ISO 4217.
- **Idempotencia:** cabecera `Idempotency-Key` en los `POST` de pagos u órdenes.
- **Concurrencia optimista:** `ETag` + `If-Match`.
- **Versionado** en la ruta (`/v1`). Los cambios que rompen la compatibilidad van a una nueva versión, con una deprecación anunciada (cabeceras `Deprecation` y `Sunset`).

## Seguridad
- OAuth 2.1/OIDC o tokens de sesión según el ADR.
- Autorización por recurso: verificar en cada petición que el usuario es dueño o tiene permiso (evita BOLA/IDOR).
- Validación estricta del esquema y límites de tamaño.
- Rate limiting.
- CORS explícito (nunca `*` con credenciales).
- Sin datos sensibles en URLs.

## Otros estilos
- **GraphQL:** límites de profundidad y costo, DataLoader contra N+1, persisted queries.
- **gRPC:** proto versionado y compatibilidad hacia atrás (no reutilizar números de campo).
- **Eventos:** sobre con `id`, `tipo`, `version`, `ocurridoEn` y `datos`. Consumidores idempotentes y patrón outbox.

## Lista de revisión
- [ ] Todo endpoint tiene esquemas de request y response, y ejemplos.
- [ ] Los errores están documentados.
- [ ] La autorización está definida.
- [ ] Las listas están paginadas.
- [ ] No hay cambios incompatibles sin una nueva versión.
