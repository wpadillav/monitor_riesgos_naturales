---
name: stack-generico
description: "Procedimiento para trabajar con cualquier lenguaje, framework o herramienta que no tenga skill propia (p. ej. Lua, Zig, Haskell, Clojure, Dart puro, Julia, Fortran, Groovy, Crystal, Nim, OCaml, Lisp, Ada). Úsala cuando el stack del proyecto no esté cubierto por otra skill stack-*."
---

# Stack genérico (cualquier tecnología)

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py <producto>`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

Cuando el lenguaje o la herramienta no tiene skill propia, sigue este procedimiento antes de escribir código:

## 1. Versión
- Busca el producto en https://endoflife.date con `versiones.py <slug>`. Si no está, consulta la página oficial de releases o de descargas.
- Aplica la política: LTS si existe; si no, la última estable con al menos 60 días y soporte vigente.
- Registra la versión, la fuente y la fecha en `STACK.lock.md`.

## 2. Ecosistema (investígalo y registra en el lock)
| Pregunta | Ejemplo de respuesta a buscar |
|---|---|
| Gestor de versiones del runtime | asdf/mise, rustup, ghcup, juliaup |
| Gestor de paquetes y lockfile | luarocks, zig build, cabal/stack, Leiningen/deps.edn, Pkg.jl |
| Formateador oficial o de facto | `zig fmt`, ormolu/fourmolu, cljfmt, JuliaFormatter |
| Linter / análisis estático | luacheck, hlint, clj-kondo |
| Framework de pruebas | busted, `zig test`, hspec, clojure.test, Test (Julia) |
| Framework web o de app (si aplica) | Lapis/OpenResty, Servant/IHP, Ring/Pedestal, Genie |
| Imagen oficial de contenedor | Docker Hub "official images" o la del proyecto |

## 3. Guía de estilo y modismos
Lee la guía oficial o comunitaria del lenguaje y resume en `docs/stack-<lenguaje>.md`:
- de 10 a 15 reglas de estilo;
- el manejo de errores idiomático;
- el modelo de concurrencia;
- los 5 errores más comunes.

Esa nota se convierte en la referencia para `revisor-codigo`.

## 4. Mínimos de la Fábrica (no negociables)
- Dependencias fijadas con un lockfile versionado.
- Formateador + linter + pruebas ejecutables con un solo comando cada uno (Makefile o `justfile` si el ecosistema no tiene un estándar).
- CI con la versión exacta del lock.
- Seguridad: entradas validadas, sin secretos en el código y auditoría de dependencias (o `trivy fs .` si el ecosistema no tiene una herramienta propia).

## 5. Proponer una skill nueva
Si el stack se va a repetir en más proyectos, propón al coordinador crear `skills/stack-<lenguaje>/SKILL.md` con la misma estructura que las demás skills de stack.
