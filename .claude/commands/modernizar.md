---
description: "Diagnóstico y plan de modernización de un sistema legacy (Perl, PHP antiguo, monolitos, BD heredadas)"
argument-hint: "<ruta del código legacy o descripción>"
---

Carga las skills `modernizacion-legacy` y `politica-versiones`.

Sistema a modernizar: $ARGUMENTS

1. Delega en paralelo:
   - a `especialista-legacy`: inventario (lenguajes, versiones actuales, dependencias, puntos de entrada, código muerto) y mapa de riesgos;
   - a `dba`: inventario del esquema, calidad de datos, procedimientos almacenados, codificación de caracteres;
   - a `arquitecto-seguridad`: CVEs de las versiones actuales y exposición.
2. Con los resultados, pide a `investigador-stack` el stack destino según la política de versiones.
3. Pide a `arquitecto-software` la estrategia (patrón de reemplazo gradual, reescritura por módulos o *lift-and-shift*) con un ADR y fases incrementales que mantengan el sistema operando.
4. Antes de tocar el código, pide a `qa-automatizacion` pruebas de caracterización (*golden master*) del comportamiento actual.
5. 🔒 Presenta al Director: diagnóstico, riesgos, estrategia, fases, estimación y versión origen → versión destino.
