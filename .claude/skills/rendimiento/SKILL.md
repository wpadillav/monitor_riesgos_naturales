---
name: rendimiento
description: "Pruebas de carga, perfilado y optimización (backend, base de datos, caché, frontend y Core Web Vitals) con herramientas por lenguaje. Úsala cuando haya requisitos de rendimiento, lentitud reportada o planificación de capacidad."
---

# Rendimiento

## Método
1. **Objetivo** medible, tomado del PRD (ej. p95 < 300 ms con 200 RPS).
2. **Línea base** en un entorno parecido a producción y con datos de volumen realista.
3. **Perfilar** para encontrar el cuello de botella real: BD, E/S, CPU, red o bloqueos.
4. **Un cambio a la vez.** Medir de nuevo y conservar el cambio solo si mejora.
5. **Prueba de regresión de rendimiento** en el CI para los endpoints críticos.

## Pruebas de carga (k6)
```javascript
import http from 'k6/http'; import { check } from 'k6';
export const options = { stages: [{duration:'2m',target:100},{duration:'5m',target:100},{duration:'2m',target:0}],
  thresholds: { http_req_duration: ['p(95)<300'], http_req_failed: ['rate<0.01'] } };
export default function () { const r = http.get(`${__ENV.BASE}/v1/productos`); check(r, { '200': x => x.status === 200 }); }
```
Tipos de prueba: carga base, estrés (hasta romper), pico y resistencia (*soak*, de 2 a 8 h, para detectar fugas de memoria).

## Perfiladores por lenguaje
PHP: SPX, Xdebug profiler, Blackfire · Perl: Devel::NYTProf · Python: py-spy, cProfile, Scalene · Node: `--cpu-prof`, clinic.js, 0x · Java/Kotlin: JFR + JMC, async-profiler · .NET: dotnet-trace, dotnet-counters · Go: pprof · Rust: cargo-flamegraph · Ruby: stackprof, rbspy.

## Victorias frecuentes
- **BD:** índices adecuados, eliminar N+1, paginación por keyset, pool de conexiones bien dimensionado.
- **Caché:**
  - HTTP (`Cache-Control`, `ETag`) y CDN;
  - de aplicación en Redis/Valkey con TTL e invalidación explícita;
  - memoización.
- **PHP:** OPcache en producción (`validate_timestamps=0`, invalidado en cada deploy). Composer con `--optimize-autoloader --classmap-authoritative`.
- **Asincronía:** mover a colas el trabajo que el usuario no necesita esperar (correos, PDFs, integraciones).
- **Frontend:**
  - imágenes AVIF/WebP con `srcset` y carga diferida;
  - división de código;
  - fuentes con `font-display: swap`;
  - sin JS que bloquee el render;
  - medir con Lighthouse/CrUX.

## Informe
| Escenario | Antes p95 | Después p95 | RPS | Error % | Cambio aplicado |
|---|---|---|---|---|---|
