---
name: revision-codigo
description: "Lista de verificación y método para revisar código en cualquier lenguaje: corrección, diseño, seguridad, pruebas, rendimiento, legibilidad y cumplimiento del STACK.lock. Úsala al revisar un PR, un diff o un módulo."
---

# Revisión de código

## Orden de revisión (de lo más caro a lo más barato de arreglar)
1. **¿Resuelve lo pedido?** Compara contra el criterio de aceptación.
2. **Corrección:** casos límite (null o vacío, cero, negativos, Unicode, zonas horarias, concurrencia), manejo de errores, transacciones, idempotencia.
3. **Seguridad:** entradas validadas, autorización por recurso, inyección, secretos, datos personales en logs.
4. **Diseño:** responsabilidades claras, acoplamiento, duplicación relevante, consistencia con el ADR y la arquitectura.
5. **Datos:** migraciones seguras y reversibles, índices para las nuevas consultas, N+1.
6. **Pruebas:** ¿prueban comportamiento (no implementación)? ¿cubren errores? ¿son deterministas?
7. **Rendimiento:** operaciones costosas en bucles, consultas sin límite, carga de colecciones enteras en memoria.
8. **Legibilidad:** nombres, funciones cortas, comentarios que explican el *porqué*.
9. **Dependencias:** ¿están en el STACK.lock? ¿licencia compatible? ¿hacía falta agregarlas?
10. **Operación:** logs útiles, configuración por entorno, migraciones y feature flags.

## Automatizable (ya debe estar en verde antes de la revisión humana)
Formateador, linter, typecheck/análisis estático, pruebas, cobertura, auditoría de dependencias y gitleaks. Si no están en verde → **RECHAZADO** sin más revisión.

## Señales de alarma frecuentes
- `catch` vacío o que oculta el error.
- SQL concatenado.
- `eval`.
- Fechas sin zona horaria.
- Floats para dinero.
- Lógica de negocio en controladores o vistas.
- Configuración quemada en el código.
- Pruebas que llaman servicios reales.
- `sleep` en pruebas.
- TODO sin ticket.
- Código comentado.
- Funciones de más de unas 50 líneas.
- Más de 3 niveles de anidación.

## Tono del informe
Concreto y accionable: "en `X:42`, si `items` está vacío, la división falla; sugerencia: validar al inicio y devolver 0". Reconoce también lo bien hecho. Distingue entre obligatorio y opcional.
