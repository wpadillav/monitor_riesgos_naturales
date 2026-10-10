---
name: stack-scala
description: "Scala 3 (preferir la rama LTS 3.3.x) con sbt, scalafmt/scalafix, efectos (Cats Effect/ZIO), http4s/Tapir, Pekko y Spark. Úsala para servicios Scala o trabajos de datos en Spark."
---

# Stack Scala

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py scala`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Versión
Scala 3 publica una **rama LTS (3.3.x)**: úsala en proyectos de larga vida, salvo que una librería exija la *Next*. Para **Spark**, la versión de Scala la impone la versión de Spark del lock (puede ser 2.13). JDK LTS compatible.

## Base
- **sbt** con `project/build.properties` fijado. Configuración del compilador con advertencias como errores.
- **Inmutabilidad**, `case class`, `enum` (Scala 3), ADTs, `Option`/`Either` en lugar de `null` y excepciones.

## Ecosistemas (elegir uno por proyecto con un ADR; no mezclar)
- **Typelevel:** Cats Effect + http4s + Doobie o Skunk + Circe.
- **ZIO:** ZIO + zio-http + Quill + zio-json.
- **Tapir** para definir endpoints con OpenAPI.
- **Actores:** **Apache Pekko** (fork con licencia Apache de Akka) en lugar de Akka, cuya licencia es comercial desde la 2.7.

## Calidad
```bash
sbt scalafmtCheckAll "scalafixAll --check" test
```
Pruebas con **MUnit** o ScalaTest + ScalaCheck. Cobertura con scoverage.

## Errores comunes que debe atrapar el revisor
- Mezclar Futures y efectos.
- Bloquear en el *thread pool* de cómputo.
- *Implicits*/*givens* mágicos difíciles de rastrear.
- `.get` en `Option`.
- Colecciones mutables compartidas.
