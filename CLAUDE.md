# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

"Terremotos en vivo": una página estática de un solo archivo ([index.html](index.html)) que muestra en un mapa y en una lista los sismos recientes publicados por el USGS. La interfaz y todo el texto visible están en español.

- No hay paso de build, gestor de paquetes, linter ni pruebas. HTML, CSS y JS van inline en `index.html`.
- La sirve Apache directamente desde `/var/www/html/terremotos`. Para probar, abre `http://localhost/terremotos/` o usa `python3 -m http.server` en este directorio. Hace falta servirla por HTTP porque hace `fetch` a un origen externo.
- Dependencias externas, todas por CDN o URL remota:
  - Leaflet 1.9.4 desde cdnjs;
  - teselas oscuras de Esri ArcGIS: una capa base y una de etiquetas superpuestas;
  - feeds GeoJSON del USGS: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson`. El valor de `{feed}` sale del `<select id="feed">`: `all_hour`, `all_day`, `2.5_week` o `4.5_week`.

## Funcionamiento de `index.html`

- `load()` descarga el feed seleccionado y descarta los eventos con `mag === null`. Los ordena por tiempo descendente y **reconstruye todo** en cada ciclo: limpia la `layerGroup` y vacía `#list`.
- Se refresca con `setInterval(load, 60000)`. Al cambiar de feed se reinician `first` y `seen` y se recarga.
- Detección de sismos nuevos: el `Set` `seen` guarda los ids ya vistos. Después de la primera carga (`first === false`), un id nuevo con M ≥ 4.5 abre su popup automáticamente.
- Los sismos de la última hora llevan la clase `pulse` en su `circleMarker`, que activa una animación CSS sobre `path.pulse`. El radio del marcador es `max(3, mag * 2.6)`.
- Por debajo de 700px el layout responsive pasa a columna invertida: el mapa queda arriba y la lista abajo.
- Las cadenas del USGS (`place`, `url`) se insertan con `innerHTML` y en el popup de Leaflet sin escapar. Tenlo en cuenta si se añaden campos o fuentes de datos.
- Hay que mantener el aviso "Solo informativo. No es un sistema de alerta temprana…" y la atribución de datos (USGS y Esri).

## Entorno de Claude (`.claude/`)

El directorio `.claude/` contiene el marco "Fábrica de Software": subagentes, comandos, skills y hooks. Su configuración está en [.claude/settings.json](.claude/settings.json).

- **Hook SessionStart:** inyecta [.claude/hooks/contexto-coordinador.md](.claude/hooks/contexto-coordinador.md) en cada sesión. Ese archivo define el rol de coordinador, el flujo por fases con aprobaciones 🔒 del Director y las reglas, y obliga a comunicarse en español. No se duplica aquí: ese archivo es la fuente de verdad.
- **Hook PreToolUse (Bash):** [.claude/hooks/guardian-comandos.sh](.claude/hooks/guardian-comandos.sh) bloquea con salida 2 estos comandos:
  - `rm -rf` sobre `/` o el home;
  - push forzado o borrado de `main`/`master`/`develop`/`release`;
  - `DROP`/`TRUNCATE` sobre bases de producción;
  - `mkfs`/`dd` a discos;
  - leer `.env` de producción.

  Si te bloquea, pide al usuario que ejecute el comando él mismo; no intentes rodear el bloqueo.
- Hay una versión 2 en planeación: servidor Node.js + Hono **solo para uso local**, sin publicación en internet. El plan está en [docs/02-plan.md](docs/02-plan.md), el estado en [.fabrica/estado.md](.fabrica/estado.md) y las versiones en [STACK.lock.md](STACK.lock.md) (borrador).
