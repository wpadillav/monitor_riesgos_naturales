---
name: email-marketing
description: "Email marketing: captación con consentimiento, segmentación, secuencias (bienvenida, nutrición, reactivación), newsletters, asuntos, diseño responsive, entregabilidad (SPF, DKIM, DMARC, baja en un clic) y métricas. Úsala para campañas o automatizaciones de correo."
---

# Email marketing

## Base legal y de consentimiento
- **Solo con autorización previa, expresa y demostrable** (Ley 1581 de 2012 y su régimen de habeas data en Colombia, GDPR u otra ley local). Doble opt-in recomendado.
- Registro de cuándo, dónde y cómo se obtuvo el consentimiento. Enlace de baja visible en cada correo e identificación del remitente.
- **Prohibido** comprar o alquilar bases de datos y extraer correos de sitios web.

## Entregabilidad (requisitos de Gmail, Yahoo y Microsoft para remitentes masivos)
- **SPF y DKIM** configurados y alineados con el dominio del `From`, y **DMARC** publicado (mínimo `p=none`, avanzando a `quarantine`/`reject`). Usa un subdominio dedicado para marketing (ej. `news.marca.com`).
- **Baja en un clic** (cabeceras `List-Unsubscribe` + `List-Unsubscribe-Post`, RFC 8058), procesada en ≤ 2 días.
- **Tasa de spam** reportada < 0.1 % y nunca ≥ 0.3 % (Postmaster Tools). DNS inverso válido y TLS.
- **Calentamiento** gradual de dominios o IPs nuevos. Limpieza de rebotes e inactivos (más de 6-12 meses sin abrir: campaña de reactivación y luego baja).

## Secuencias recomendadas
| Secuencia | Correos | Objetivo |
|---|---|---|
| Bienvenida | 3-4 en 10 días | Presentar la marca, entregar lo prometido, primer caso, invitación a hablar |
| Nutrición B2B | 5-8 en 4-8 semanas | Educar sobre el problema, el método y los casos. CTA a diagnóstico |
| Posreunión / propuesta | 2-3 | Resumen, respuestas a objeciones, recordatorio |
| Reactivación | 2 | "¿Sigues interesado?", y baja si no responde |
| Newsletter | mensual o quincenal | 1 tema principal + 2-3 enlaces útiles + novedad de la empresa |

## Anatomía del correo
- **Asunto:** ≤ 50 caracteres, específico y sin trucos ("RE:" falso, MAYÚSCULAS, exceso de emojis). Prepara 2 variantes para pruebas A/B.
- **Preencabezado:** complementa el asunto (≈ 40-90 caracteres).
- **Cuerpo:** una idea, párrafos cortos y un CTA principal (botón *bulletproof*, no imagen).
- **Diseño:** responsive, ancho ~600 px, modo oscuro probado, texto real (no todo en imágenes), `alt` en las imágenes y versión de texto plano.

## Métricas
Las aperturas son poco fiables (por la protección de privacidad de Apple Mail): prioriza **clics, CTR, conversiones, bajas, quejas de spam y rebotes**. Compara contra el promedio propio, no contra promedios genéricos de la industria.
