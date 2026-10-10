---
name: stack-java
description: "Java LTS con Spring Boot: Maven/Gradle wrapper, estructura por capas o hexagonal, JPA/Flyway, JUnit 5, Testcontainers, calidad (Spotless, Error Prone, SpotBugs) y despliegue. Úsala para backend Java."
---

# Stack Java

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py eclipse-temurin`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **Solo JDK LTS** (distribución Eclipse Temurin u otra que exija el cliente). `.sdkmanrc` o `.tool-versions`. Toolchain de Gradle/Maven fijado a la versión del lock.
- **Wrapper obligatorio:** `./mvnw` o `./gradlew`, con su versión fijada.
- **Java moderno:** `record` para DTOs y valores, `sealed` + *pattern matching* en `switch`, `var` local con criterio, `Optional` solo como retorno y **hilos virtuales** (JDK 21+) para E/S concurrente.

## Framework
**Spring Boot** con versión del lock (verifica la compatibilidad Boot ↔ JDK). Alternativas: Quarkus o Micronaut (arranque rápido y nativo con GraalVM) mediante ADR. Jakarta EE para clientes con servidor de aplicaciones.

## Librerías recomendadas
Web: Spring Web MVC (o WebFlux solo si hace falta reactividad) · Datos: Spring Data JPA (Hibernate) o **jOOQ** para SQL complejo · Migraciones: **Flyway** o Liquibase · Validación: Jakarta Bean Validation · Mapeo: **MapStruct** · Seguridad: Spring Security + OAuth2 Resource Server · Docs: springdoc-openapi · Logs: SLF4J + Logback (JSON con logstash-encoder) · Resiliencia: Resilience4j · Métricas: Micrometer + OpenTelemetry.

## Estructura (por funcionalidad)
```
src/main/java/com/cliente/app/<modulo>/{api,aplicacion,dominio,infraestructura}/
src/main/resources/{application.yml, db/migration/V1__init.sql}
src/test/java/...  (unit + integration con Testcontainers)
```

## Calidad
```bash
./mvnw -B verify          # o ./gradlew check
# incluye: Spotless (google-java-format o palantir), Error Prone o SpotBugs, Checkstyle/PMD opcional,
# JUnit 5 + AssertJ + Mockito, Testcontainers, JaCoCo (umbral), OWASP dependency-check
```

## Producción
- Fat JAR o imagen con capas (Buildpacks o Jib). JVM con `-XX:MaxRAMPercentage=75`.
- Actuator con `/health` y `/prometheus`, expuestos solo en un puerto interno.

## Seguridad
- Consultas parametrizadas (JPQL con parámetros o Criteria). Nunca concatenar.
- Sin deserialización Java nativa de datos externos.
- Jackson sin *default typing*.
- Spring Security con CSRF para sesiones y CORS explícito.
- Secretos fuera de `application.yml`.

## Errores comunes que debe atrapar el revisor
- N+1 por `FetchType.EAGER` o *lazy loading* en bucles (usa `@EntityGraph` o fetch joins).
- `@Transactional` en métodos privados o en llamadas internas (no aplica el proxy).
- `equals`/`hashCode` en entidades JPA mal definidos.
- `LocalDateTime` donde se necesita `Instant` u `OffsetDateTime`.
- `double` para dinero (usa `BigDecimal` con escala).
- Excepciones capturadas y silenciadas.
- Pools de hilos sin límite.
