---
name: seo-tecnico
description: "SEO técnico: rastreo, indexación, robots.txt, sitemaps, canónicas, redirecciones, renderizado JS, hreflang, datos estructurados JSON-LD, Open Graph, Core Web Vitals, imágenes y auditoría técnica. Úsala al construir o auditar un sitio web para buscadores."
---

# SEO técnico

## Lista de auditoría (prioridad: crítico → alto → medio)
**Rastreo e indexación**
- [ ] `robots.txt` no bloquea recursos ni secciones importantes y declara el `Sitemap:`.
- [ ] Sitemap XML solo con URLs canónicas, indexables y con código 200 (`lastmod` real). Enviado a Google Search Console y Bing Webmaster Tools. IndexNow opcional para Bing y Yandex.
- [ ] Cada página tiene una `<link rel="canonical">` absoluta y autorreferente, salvo los duplicados intencionales.
- [ ] Sin cadenas de redirección. Los cambios permanentes usan 301/308. Sin 404 internos y con una página 404 útil.
- [ ] `noindex` solo donde corresponde (resultados de búsqueda internos, carrito, staging). **Staging protegido con contraseña**, no solo con `noindex`.
- [ ] El contenido indexable se sirve **renderizado en el servidor (SSR/SSG)**. Una SPA pura depende del renderizado diferido del buscador.

**Arquitectura**
- [ ] URLs cortas, legibles, en minúsculas, con guiones y sin parámetros innecesarios.
- [ ] Cualquier página importante queda a ≤ 3 clics desde el inicio. Breadcrumbs y enlazado interno con anclas descriptivas.
- [ ] Paginación con enlaces rastreables (`<a href>`), no solo botones JS.

**Etiquetas por página**
```html
<title>Desarrollo de software a la medida en Bogotá | Marca</title>   <!-- ≈50-60 caracteres -->
<meta name="description" content="…">                                <!-- ≈140-160, persuasiva -->
<link rel="canonical" href="https://www.ejemplo.com/servicios/desarrollo-a-la-medida">
<meta property="og:title" content="…"><meta property="og:description" content="…">
<meta property="og:image" content="https://…/og-1200x630.png"><meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```
Un `h1` por página, coherente con el `title`. `lang="es"` (o `es-CO`, etc.) en `<html>`. `hreflang` recíproco si hay varios idiomas o países.

**Datos estructurados (JSON-LD)**
- **Siempre:** `Organization` (con `logo` y `sameAs` a los perfiles oficiales) y `WebSite`. `BreadcrumbList` en las páginas internas.
- **Según el contenido:** `Article`/`BlogPosting` (autor y fechas), `Product` + `Offer`, `LocalBusiness`, `Event`, `JobPosting`, `VideoObject`, `SoftwareApplication`.
- El marcado debe **coincidir con el contenido visible**. Valídalo con la prueba de resultados enriquecidos y el validador de schema.org.
- Google retira o restringe resultados enriquecidos con el tiempo (los de **FAQ dejaron de mostrarse en 2026**, y HowTo antes). Consulta la galería vigente de Search Central antes de prometer un resultado enriquecido. El marcado sigue ayudando a la comprensión, pero no garantiza visibilidad.

**Rendimiento y experiencia** (skill `rendimiento`)
- [ ] Core Web Vitals en verde con datos de campo (CrUX/Search Console): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
- [ ] Imágenes AVIF/WebP con `width`/`height`, `srcset` y carga diferida fuera del primer pantallazo. `alt` descriptivo.
- [ ] HTTPS en todo el sitio, sin contenido mixto, y diseño apto para móvil.

**Buscadores con IA (AI Overviews, AI Mode, asistentes)**
- No existe un marcado especial obligatorio: lo que cuenta es el contenido claro, rastreable y citable, y una entidad de marca consistente.
- Decide con el Director qué rastreadores de IA permitir en `robots.txt` (búsqueda frente a entrenamiento) y documenta la decisión.
- `llms.txt` es una propuesta comunitaria, no un estándar de los buscadores: es opcional y de bajo costo.

## Herramientas
Google Search Console, Bing Webmaster Tools, Lighthouse/PageSpeed Insights, prueba de resultados enriquecidos, rastreadores (Screaming Frog o alternativas libres) y `curl -I` para encabezados y redirecciones.

## Formato del informe
| # | Prioridad | Hallazgo | URL o ejemplos | Impacto | Corrección | Responsable |
|---|---|---|---|---|---|---|
