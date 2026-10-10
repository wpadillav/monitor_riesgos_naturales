---
name: stack-c-cpp
description: "C y C++ modernos: estándares C17/C23 y C++20/23, CMake, gestores vcpkg/Conan, clang-format, clang-tidy, sanitizers, GoogleTest/Catch2 y seguridad de memoria. Úsala para código nativo, embebido, extensiones o alto rendimiento."
---

# Stack C / C++

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py gcc`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Versión
Estándar del lenguaje y compilador (GCC, Clang o MSVC) definidos en el lock. Proyectos nuevos: **C++20** (o C++23 si los compiladores objetivo lo soportan por completo) y **C17** (C23 si el toolchain lo soporta). Verifica el soporte real de cada compilador antes de usar una característica.

## Construcción
- **CMake** moderno (orientado a *targets*) con `CMakePresets.json`.
- Dependencias con **vcpkg** (modo manifiesto) o **Conan 2**, nunca copiadas a mano.
- Flags de desarrollo: `-Wall -Wextra -Wpedantic -Werror -Wconversion -Wshadow`.
- Builds de prueba con `-fsanitize=address,undefined` (y `thread` en código concurrente).

## C++
- RAII y punteros inteligentes (`std::unique_ptr` por defecto). Nada de `new`/`delete` manual.
- `std::span`, `std::string_view` (cuidando la vida útil), `std::optional`, `std::expected` (C++23), *ranges*.
- Regla del cero. `const` y `constexpr` en todo lo posible.
- Concurrencia con `std::jthread`, `std::mutex`, `std::atomic`. Evitar datos compartidos mutables.

## C
- Tamaños explícitos (`size_t`, `stdint.h`). Validar todas las longitudes.
- `snprintf` en lugar de `sprintf`. Nada de `gets`. Cuidado con `strcpy`/`strcat` (usar variantes con límite).
- Cada `malloc` tiene un dueño y un `free` claros. Valgrind en las pruebas.

## Calidad
```bash
cmake --preset debug && cmake --build --preset debug
ctest --preset debug --output-on-failure      # GoogleTest o Catch2 (C++), Unity o cmocka (C)
clang-format --dry-run -Werror $(git ls-files '*.c' '*.h' '*.cpp' '*.hpp')
clang-tidy -p build <archivos>                # cppcoreguidelines-*, bugprone-*, cert-*
```
Fuzzing (libFuzzer o AFL++) para *parsers* y entradas externas.

## Errores comunes que debe atrapar el revisor
- *Undefined behavior* (desbordamiento con signo, aliasing, lecturas fuera de rango).
- *Use-after-free*.
- Vistas (`string_view`/`span`) que sobreviven al dato.
- Conversiones implícitas con pérdida.
- Condiciones de carrera.
- Excepciones que cruzan fronteras de C.
