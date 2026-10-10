---
name: requerimientos-prd
description: "Cómo levantar requerimientos y redactar un PRD verificable: historias INVEST, criterios Gherkin, requisitos no funcionales medibles, alcance y MoSCoW. Úsala al convertir un brief o una reunión con el cliente en especificación."
---

# Requerimientos y PRD

## Entrevista inicial (si hay acceso al cliente)
Cubre estos 10 temas:
1. el problema actual y cómo se resuelve hoy;
2. quiénes lo usan (roles y cantidad);
3. el proceso paso a paso, con sus excepciones;
4. los datos que entran y salen;
5. las integraciones (ERP, pasarela de pagos, facturación electrónica, correo, SSO);
6. los reportes;
7. los volúmenes y picos;
8. las restricciones (presupuesto, fecha, hosting, tecnología impuesta);
9. el marco legal (datos personales, facturación electrónica DIAN u otra autoridad, sector regulado);
10. cómo se mide el éxito.

## Historias INVEST
- **I**ndependiente, **N**egociable, **V**aliosa, **E**stimable, **S**mall (pequeña: cabe en 1-3 días-agente), **T**esteable.
- Formato: *Como <rol> quiero <acción> para <beneficio>*.
- Divide por flujo o regla de negocio, no por capa técnica.

## Criterios de aceptación (Gherkin)
```gherkin
Escenario: Cliente con saldo insuficiente
  Dado un cliente con saldo de 10.000 COP
  Cuando intenta pagar un pedido de 15.000 COP
  Entonces el pago se rechaza con el mensaje "Saldo insuficiente"
  Y el pedido queda en estado "pendiente de pago"
```
Cada criterio tiene datos concretos y un resultado observable. Prohibido: "rápido", "fácil", "intuitivo", "seguro", salvo que vayan con una métrica.

## Requisitos no funcionales: lista mínima
Rendimiento (p95), disponibilidad, concurrencia, volumen de datos, retención, respaldo (RPO/RTO), seguridad (ASVS), accesibilidad (WCAG 2.2 AA), navegadores y dispositivos, idiomas y zonas horarias, cumplimiento legal, observabilidad y soporte.

## Control de calidad del PRD
- [ ] Cada objetivo de negocio tiene historias que lo cubren.
- [ ] Cada historia tiene al menos un escenario feliz y uno de error.
- [ ] Hay un "No incluye" explícito.
- [ ] Los datos personales están identificados.
- [ ] Hay máximo 5 preguntas abiertas, cada una con una opción por defecto.

La plantilla está en `coordinacion-agentica/plantillas/prd.md`.
