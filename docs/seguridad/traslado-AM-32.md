# Lista de verificación del traslado del proyecto (AM-32)

**Autor:** arquitecto-seguridad (T6.3) · **Fecha:** 2026-10-12 · **Amenaza:** [AM-32](amenazas.md) · **Revisión:** [revision-T5.3.md §6](revision-T5.3.md#6-actualización-t63)

**Para qué sirve:** AM-32 es la **única condición pendiente del release** de la entrega 1. El proyecto está en `/var/www/html/terremotos` y Apache lo publica en `*:80`. El Director moverá la carpeta a otra ubicación. Esta lista dice qué comprobar **antes** y **después** del traslado para dar AM-32 por cerrada. **No propone ningún cambio en Apache** (supuesto S6 del modelo).

**Quién la ejecuta:** el Director, o el coordinador con su autorización. Cada paso tiene un resultado esperado que se puede comprobar. Si un paso falla, AM-32 sigue abierta.

## Estado medido antes del traslado (2026-10-12, T6.3)

| Petición | Código HTTP |
|---|---|
| `http://localhost/terremotos/.git/HEAD` | **200** |
| `http://localhost/terremotos/.git/config` (incluye `name = wpadillav` y el correo del Director) | **200** |
| `http://localhost/terremotos/.git/logs/HEAD` | **200** |
| `http://localhost/terremotos/package.json` | **200** |
| `http://localhost/terremotos/node_modules/hono/package.json` | **200** |
| `http://localhost/terremotos/.claude/worktrees/<agente>/package.json` (los *worktrees* de los agentes) | **200** |
| `http://localhost/terremotos/index.html` (el `index.html` antiguo, ya borrado) | 404 |
| `http://localhost/terremotos/` | 403 (sin listado del directorio) |
| `https://localhost/terremotos/.git/HEAD` | 404 |

## Variables que se usan abajo

```bash
ORIGEN=/var/www/html/terremotos
DESTINO=/ruta/elegida/por/el/Director/terremotos   # p. ej. ~/proyectos/terremotos; fuera de /var/www/html
```

---

## A. Antes de mover

| # | Paso | Comando | Resultado esperado |
|---|---|---|---|
| A1 | No hay agentes trabajando | `git -C "$ORIGEN" worktree list` | Ningún *worktree* marcado `locked`. Si hay alguno, el coordinador cierra esas tareas antes. |
| A2 | Las ramas de los *worktrees* están integradas o se pueden descartar | `git -C "$ORIGEN" branch --no-merged main` | Solo ramas que el coordinador sabe que siguen vivas. Recomendado: eliminar los *worktrees* ya integrados con `git -C "$ORIGEN" worktree remove <ruta>` (sin `--force`). Así hay menos que reparar en C6. |
| A3 | El repositorio principal está limpio | `git -C "$ORIGEN" status --porcelain` | Salida vacía |
| A4 | Anotar el *commit* actual | `git -C "$ORIGEN" rev-parse HEAD` | Se apunta el valor: se compara en C5 |
| A5 | No hay servidores del proyecto en marcha | `ss -tlnp \| grep -E ':(3000\|30[0-9][0-9])\b'` | Ninguno del proyecto (`npm start`, `npm run dev` ni Playwright) |
| A6 | El destino está fuera de lo que publica Apache | `case "$(realpath -m "$DESTINO")" in /var/www/*) echo FALLA ;; *) echo OK ;; esac` | `OK` |
| A7 | El destino no existe todavía | `test ! -e "$DESTINO" && echo OK` | `OK` |

## B. Traslado

| # | Paso | Comando | Resultado esperado |
|---|---|---|---|
| B1 | **Mover** (no copiar) la carpeta completa, `.git` y `.claude/` incluidos, **sin `sudo`** | `mv "$ORIGEN" "$DESTINO"` | Exit 0. Si hizo falta `sudo` porque `/var/www/html` es de root, se corrige el propietario en C4 |

Si se copia en lugar de mover, la copia de `/var/www/html` hay que borrarla después: si no, AM-32 no se cierra (C1).

## C. Después de mover: verificación

| # | Paso | Comando | Resultado esperado |
|---|---|---|---|
| C1 | No queda nada en la ruta antigua | `test ! -e /var/www/html/terremotos && echo OK` | `OK` |
| C2 | No hay enlaces simbólicos ni copias bajo el *webroot* | `find /var/www/html -maxdepth 3 \( -name 'terremotos*' -o -lname "*terremotos*" \)` | Salida vacía |
| C3 | Apache ya no sirve el repositorio | `for p in .git/HEAD .git/config .git/logs/HEAD package.json node_modules/hono/package.json .claude/settings.json; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost/terremotos/$p")" "$p"; done` | **Ninguna línea con 200** (lo esperado es 404 en todas). Repetir con la IP LAN del equipo en lugar de `localhost`: mismo resultado |
| C4 | El proyecto es del usuario, no de root | `cd "$DESTINO" && stat -c '%U' . .git && find . -user root -print -quit` | El usuario del Director en las dos líneas de `stat`, y `find` sin salida. Si no: `sudo chown -R "$USER": "$DESTINO"` (AM-31: el servidor nunca corre como root) |
| C5 | El directorio de trabajo está fuera de `/var/www/html` y el repositorio sigue intacto | `cd "$DESTINO" && pwd -P && git rev-parse HEAD && git status --porcelain && git fsck --no-dangling` | `pwd -P` no empieza por `/var/www/html`; el *commit* es el de A4; `status` vacío; `fsck` sin errores |
| C6 | Los *worktrees* que queden apuntan a la ruta nueva | `cd "$DESTINO" && git worktree repair .claude/worktrees/*/ && git worktree list` | Todas las rutas empiezan por `$DESTINO`. Si se eliminaron todos en A2, `list` muestra solo el principal. `git worktree prune --dry-run` no propone borrar ninguno que siga en uso |
| C7 | Las dependencias se reinstalan limpias en la ruta nueva | `cd "$DESTINO" && npm ci && npm ls --depth=0` | Exit 0 en los dos; «found 0 vulnerabilities» |
| C8 | Las comprobaciones automáticas siguen en verde | `cd "$DESTINO" && npm run lint && npm test && npm audit --omit=dev --audit-level=high` | Exit 0 en los tres |
| C9 | `npm start` funciona en la ruta nueva, con `--permission` | `cd "$DESTINO" && (npm start > /tmp/terremotos-arranque.log 2>&1 & echo $! > /tmp/terremotos.pid)`; esperar a que aparezca `http://localhost:3000` en el log; `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/salud` | **200**. `grep -c ERR_ACCESS_DENIED /tmp/terremotos-arranque.log` → 0 (las rutas de `--allow-fs-read` son relativas y se resuelven desde `$DESTINO`) |
| C10 | Sigue escuchando solo en loopback | `ss -tlnp \| grep ':3000\b'` | Una sola línea, con `127.0.0.1:3000` |
| C11 | La página carga en el navegador | Abrir `http://localhost:3000/` | Mapa, lista y aviso «Solo informativo…» visibles; sin errores en la consola |
| C12 | Parar el servidor | `kill "$(cat /tmp/terremotos.pid)"` (no `pkill -f`) | El puerto 3000 queda libre: `ss -tlnp \| grep ':3000\b'` vacío |
| C13 | Prueba RNF-09 desde otro equipo de la LAN (pendiente desde T5.3) | Con el servidor en marcha, desde otro equipo: `curl -m 5 http://<IP-LAN>:3000/` | «Connection refused» (o tiempo agotado) |

## D. Exposición pasada (informativo, no bloquea)

- El historial de git estuvo accesible por `*:80` desde la LAN. Contiene el nombre y el correo del Director y **ningún secreto** (revisión T5.3, `git grep` de patrones de claves). No hay nada que rotar.
- Para saber si alguien lo descargó, se puede consultar el log de Apache (solo lectura): `sudo grep -h '/terremotos/\.git/' /var/log/apache2/access.log* | awk '{print $1}' | sort | uniq -c`. Si aparece alguna IP distinta de `127.0.0.1` y `::1`, el Director decide si le importa (dato personal, Ley 1581 de 2012).

## E. Después de la verificación

1. Anotar al pie de esta lista la fecha, quién la ejecutó y el resultado de C1 a C13.
2. Si todo está en verde, AM-32 pasa a **Cumple** y el veredicto de [revision-T5.3.md §6.5](revision-T5.3.md#65-veredicto-t63) pasa a **APROBADO** sin condiciones.
3. Hay documentos que describen la ruta antigua y hay que actualizar (no son de seguridad; los gestiona el coordinador): `CLAUDE.md` («La sirve Apache directamente desde `/var/www/html/terremotos`…») y `docs/01-arquitectura.md` (riesgo R8 y la nota de ubicación).

| Fecha | Ejecutó | C1–C13 | AM-32 |
|---|---|---|---|
| | | | Abierta |
