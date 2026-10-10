# Referencia estática de versiones (respaldo)

> **Fecha de corte: 2026-10-01**, a partir de endoflife.date. Úsala **solo si no hay red** y marca en el STACK.lock que la fuente es esta referencia. Después de esa fecha, puede estar desactualizada.

| Producto | Recomendada | Último parche observado | LTS | EOL | Comentario |
|---|---|---|---|---|---|
| PHP | 8.5 | 8.5.x | no (no existe) | 2029-12-31 | 8.4 es una alternativa válida (EOL 2028-12-31) |
| Perl | 5.42 o 5.44 | 5.42.3 / 5.44.0 | no | 2028-07 / 2029-07 | 5.44 cumple la madurez de 60 días; preferir 5.42.x si los módulos CPAN no lo soportan aún |
| Python | 3.14 | 3.14.x | no | 2030-10-31 | 3.13 si alguna librería científica no tiene wheels para 3.14 |
| Node.js | 24 LTS | 24.x | sí | 2028-04-30 | Node 26 pasa a LTS a finales de oct-2026: reevaluar entonces |
| Java (Temurin) | 25 LTS | 25.0.x | sí | 2031-09-30 | 21 LTS para librerías que aún no soportan 25 |
| .NET | 10 LTS | 10.0.x | sí | 2028-11-14 | .NET 8 y 9 llegan a EOL en nov-2026 |
| Go | 1.26 | 1.26.x | no | sin fecha (se soportan las 2 últimas) | 1.27 cuando cumpla 60 días |
| Ruby | 4.0 | 4.0.x | no | 2029-03-31 | |
| Rails | 8.1 | 8.1.x | no | 2027-10-10 | |
| Laravel | 13 | 13.x | no | 2028-03-17 | requiere PHP ≥ 8.3 |
| Symfony | 7.4 LTS | 7.4.x | sí | 2029-11-30 | 8.x no es LTS |
| Django | 5.2 LTS | 5.2.x | sí | 2028-04-30 | 6.x no es LTS |
| Spring Boot | 4.0/4.1 | 4.1.x | no (OSS) | 2027-07-31 (4.1) | ciclos cortos: planificar actualizaciones semestrales |
| Angular | 22 | 22.x | no | 2028-06-30 | |
| React | 19 | 19.x | no | sin fecha | |
| Next.js | 16 | 16.x | sí | sin fecha | 15 llega a EOL el 2026-10-21 |
| Vue | 3.5 | 3.5.x | no | sin fecha | |
| PostgreSQL | 18 | 18.x | no | 2030-11-14 | 17 si una extensión requerida aún no soporta 18 |
| MySQL | 8.4 LTS o 9.7 LTS | 8.4.x / 9.7.x | sí | 2032 / 2034 | 9.7 es reciente: validar drivers |
| MariaDB | 11.8 LTS o 12.3 LTS | 11.8.x / 12.3.x | sí | 2028-06 / 2029-06 | 11.4 LTS vive hasta 2029-05 |
| MongoDB | 8.0 | 8.0.x | no | 2029-10-31 | |
| Redis | 8.2 | 8.2.x | no | 2030-09-01 | considerar Valkey por licencia |
| Ubuntu Server | 24.04 LTS o 26.04 LTS | — | sí | 2029-05 / 2031-05 | |
| Debian | 13 (Trixie) | — | no | 2030-06-30 | |
| Kubernetes | 1.36 | 1.36.x | no | 2027-06-28 | 1.37 cuando cumpla madurez |

Productos **sin ficha** en endoflife.date que también se deben verificar en vivo: Kotlin, Swift/Xcode, Flutter/Dart, Rust, TypeScript, Elixir/Erlang, Scala, R, Tailwind, Svelte, Terraform/OpenTofu y los paquetes de cada ecosistema.
