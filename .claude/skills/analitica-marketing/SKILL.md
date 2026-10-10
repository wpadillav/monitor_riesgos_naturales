---
name: analitica-marketing
description: "Analítica de marketing: plan de medición, GA4 y Google Tag Manager, dataLayer, eventos y conversiones, consentimiento, UTMs, Search Console, dashboards (Looker Studio), atribución, pruebas A/B e informes mensuales. Úsala para instrumentar, medir o reportar marketing."
---

# Analítica de marketing

## Plan de medición
| Objetivo de negocio | KPI | Evento/conversión | Parámetros | Herramienta | Dashboard |
|---|---|---|---|---|---|
| Captar leads | Leads calificados/mes | `generate_lead` | `form_id`, `servicio`, `origen` | GA4 + CRM | Marketing |
| Reuniones | Reuniones agendadas | `schedule_meeting` | `canal` | GA4 + calendario | Director |

## Implementación (especificación para el frontend-senior)
- **Herramienta:** GA4 vía **Google Tag Manager**, o Matomo/Plausible si el cliente prioriza la privacidad. Una sola fuente de verdad por métrica.
- **`dataLayer` documentado:**
  ```js
  window.dataLayer = window.dataLayer || [];
  dataLayer.push({ event: 'generate_lead', form_id: 'contacto-home', servicio: 'desarrollo-a-la-medida' });
  ```
  Eventos en snake_case. Usa los eventos recomendados de GA4 cuando existan (`generate_lead`, `sign_up`, `purchase`).
- **Consentimiento:** CMP con categorías, sin etiquetas de marketing antes del consentimiento donde la ley lo exige, y Consent Mode si se usan productos de Google.
- **Sin datos personales** (correo, teléfono, nombre) en eventos, URLs ni dimensiones.
- **Filtros** de tráfico interno y de desarrolladores, dominios de referencia excluidos (pasarelas de pago) y conversiones marcadas como clave.
- **Verificación:** vista previa de GTM + DebugView de GA4 + prueba real de cada conversión, documentada con capturas.

## Convención de UTMs
`utm_source` = plataforma (linkedin, google, newsletter) · `utm_medium` = tipo (social, cpc, email, referral) · `utm_campaign` = `AAAA-MM_nombre-campana` · `utm_content` = variante o pieza. Siempre en minúsculas y con guiones. Nunca se usan UTMs en enlaces internos del propio sitio.

## Dashboards
- **Director (1 página):** leads, costo por lead, reuniones, clientes ganados, tráfico orgánico y tendencia frente a la meta.
- **Marketing:** por canal y campaña, embudo (visita → lead → reunión → cliente) y piezas destacadas.
- **SEO:** Search Console (clics, impresiones, CTR, posición por consulta y página) e indexación.

## Informe mensual (estructura)
1. **Resumen en 5 líneas:** ¿vamos hacia la meta?
2. **KPIs** frente a la meta y frente al mes anterior (y al mismo mes del año anterior si hay estacionalidad).
3. **Qué funcionó y qué no**, con una hipótesis respaldada por datos.
4. **Decisiones y próximos pasos** (con su responsable).
5. **Anexos** con el detalle por canal.

## Atribución y experimentos
- Modelo basado en datos (GA4) como referencia, contrastado con la fuente declarada en el CRM ("¿cómo nos conociste?"), sobre todo en B2B con ciclos largos.
- **Pruebas A/B:** hipótesis, métrica primaria, tamaño de muestra calculado y duración mínima de 1 a 2 ciclos semanales completos. Sin detener la prueba antes de tiempo por un resultado "prometedor" (skill `datos-ml`).
