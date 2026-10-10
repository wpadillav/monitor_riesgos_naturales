---
name: saas-multitenant
description: "Patrones para SaaS empresarial multi-inquilino: aislamiento de datos, identidad por tenant, planes y facturación, configuración por cliente, límites y operación. Úsala al diseñar o revisar un producto SaaS o una plataforma B2B."
---

# SaaS multi-tenant

## Modelo de aislamiento (decidir con un ADR)
| Modelo | Aislamiento | Costo | Cuándo |
|---|---|---|---|
| BD compartida + `tenant_id` | bajo | bajo | muchos clientes pequeños (por defecto) |
| Esquema por tenant | medio | medio | decenas o cientos de clientes, personalización |
| BD por tenant | alto | alto | clientes regulados, grandes, con residencia de datos |

Con la opción de BD compartida, son **obligatorios**:
- `tenant_id` en todas las tablas de negocio;
- índices compuestos que empiezan por `tenant_id`;
- en PostgreSQL, **Row Level Security** como segunda barrera;
- un scope global en el ORM (Eloquent global scopes, filtros de Hibernate, EF Core query filters);
- pruebas automatizadas de fuga entre tenants.

## Identidad
- Resolución del tenant por subdominio, cabecera o claim del token. Nunca por un parámetro que controle el usuario sin verificarlo.
- Usuarios que pertenecen a varios tenants, con roles por tenant.
- SSO empresarial (SAML/OIDC) por tenant y aprovisionamiento SCIM si lo piden.

## Producto
- Planes y *feature flags* por tenant, con límites (usuarios, almacenamiento, llamadas a la API) aplicados en el backend.
- Facturación con un proveedor externo vía webhooks idempotentes.
- Facturación electrónica local si aplica.
- Onboarding automatizado: creación del tenant, datos semilla y usuario administrador.
- Exportación y borrado de datos por tenant (portabilidad y derecho al olvido).

## Operación
- Métricas y logs etiquetados con `tenant_id`.
- Rate limiting por tenant para evitar vecinos ruidosos.
- Migraciones que funcionan para todos los tenants. Con el modelo de esquema o BD por tenant, orquestarlas por lotes.
- Respaldos que permitan restaurar un solo tenant.
