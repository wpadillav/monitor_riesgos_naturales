---
description: "Genera el calendario editorial y los posts listos para aprobar en redes sociales (texto por plataforma + briefs visuales)"
argument-hint: "<periodo (ej. noviembre 2026), redes y tema o campaña opcional>"
---

Carga las skills `redes-sociales`, `copywriting` y `marca-identidad`.

Encargo: $ARGUMENTS

1. Lee `docs/marketing/plan.md` y `docs/marketing/marca.md`. Si no existen, avisa y sugiere ejecutar `/plan-marketing` primero; con la aprobación del Director, se puede seguir con supuestos explícitos.
2. Delega a `community-manager`:
   - el calendario del periodo (plantilla `redes-sociales/plantillas/calendario.md`);
   - pilares y frecuencia por red;
   - los **posts completos** adaptados a cada plataforma (texto dentro de los límites, gancho, CTA con UTM, hashtags dentro del límite vigente, texto alternativo).
3. En paralelo, delega a `disenador-grafico` las piezas o los briefs visuales con las medidas exactas por formato. Para gráficos, carruseles o plantillas, entrega SVG/HTML exportado a PNG.
4. Si hay piezas basadas en artículos o casos, pide a `redactor-contenidos` el texto base y a `especialista-seo` las palabras clave de apoyo.
5. Verifica: límites de caracteres, número de hashtags, enlaces con UTM, datos con fuente y ningún testimonio, cifra o logo inventado.
6. Guarda en `docs/marketing/redes/AAAA-MM/`. 🔒 Presenta al Director el calendario y los posts para aprobar. **Nada se publica ni se programa sin su aprobación.**
