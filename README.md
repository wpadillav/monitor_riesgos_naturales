# Monitor de Riesgos Naturales

Sismos en tiempo real para **España** (incluye Canarias, Baleares, Ceuta y Melilla), **Colombia** y **Panamá**. Incluye un mapa en vivo, filtros por país, magnitud y periodo, y notificaciones del navegador.

> ⚠️ **Solo informativo.** No es un sistema de alerta temprana. Sigue siempre los canales oficiales de tu país: IGN y 112 en España, SGC y UNGRD en Colombia, SINAPROC en Panamá.

## Estado

🚧 **En desarrollo.** Los documentos de diseño están en [`docs/`](docs/):

- [Requerimientos (PRD)](docs/00-prd.md)
- [Arquitectura](docs/01-arquitectura.md) y [decisiones (ADR)](docs/adr/)
- [Plan](docs/02-plan.md)
- [Contrato de la API (OpenAPI)](docs/api/openapi.yaml)
- [Modelo de amenazas](docs/seguridad/amenazas.md)
- [Diseño de pantallas](docs/diseno/)

| Entrega | Contenido |
|---|---|
| 1 | Sismos en vivo, filtros, mapa y lista, hora local, modo oscuro/día y notificaciones |
| 2 | Avisos de tsunami y filtro por cercanía a una ciudad |

## Cómo funciona

Un servidor local con **Node.js** y **Hono**:

1. recibe los sismos en tiempo real por el WebSocket de **EMSC**;
2. consulta periódicamente **EMSC** y **USGS**;
3. elimina los sismos repetidos entre fuentes;
4. envía cada novedad al navegador por *Server-Sent Events*.

La página usa **Leaflet** para el mapa. Las versiones están fijadas en [`STACK.lock.md`](STACK.lock.md).

Pensado para uso local: el servidor solo acepta conexiones desde el propio equipo, en `http://localhost:3000`.

## Uso local

### Requisitos

- Linux o macOS con [nvm](https://github.com/nvm-sh/nvm).
- Node.js en la versión exacta de [`.nvmrc`](.nvmrc) (hoy **24.21.0**). npm viene con Node.
- Conexión a Internet para recibir los sismos de EMSC y USGS y las teselas del mapa.

No hace falta `sudo`, Apache ni ningún servicio del sistema. **No ejecutes la aplicación como root:** se niega a arrancar.

### Instalar y arrancar

Desde la carpeta del repositorio:

```bash
nvm install    # solo la primera vez: instala la versión de .nvmrc
nvm use        # en cada terminal nueva
npm ci         # instala las dependencias exactas de package-lock.json
npm start
```

La consola muestra:

```
Monitor de Riesgos Naturales en http://localhost:3000
```

Abre **<http://localhost:3000>** en el navegador. La primera carga de 30 días tarda unos segundos; después los sismos llegan en vivo.

Si no hay archivo `.env`, Node escribe antes `.env not found. Continuing without it.`: es normal.

`npm start` ejecuta Node con su **modelo de permisos** (`--permission`): el proceso solo puede leer `package.json`, `src/`, `public/` y `node_modules/` del proyecto, y no puede escribir archivos, lanzar otros programas ni crear *workers*. Así, una dependencia comprometida no puede tocar el resto del equipo. La red sí está permitida: el servidor la necesita para escuchar en `127.0.0.1` y consultar las fuentes.

### Configuración (opcional)

Todo funciona sin configurar nada. Para cambiar algún valor, copia la plantilla y quita el `#` de la línea que quieras cambiar:

```bash
cp .env.example .env
```

`npm start` carga `.env` si existe. `.env` no se sube al repositorio y no contiene secretos. Una variable definida en la terminal tiene prioridad sobre `.env`, por ejemplo `PORT=3100 npm start`.

| Variable | Por defecto | Valores admitidos | Para qué sirve |
|---|---|---|---|
| `PORT` | `3000` | Entero de 1024 a 65535 | Puerto local |
| `HOST` | `127.0.0.1` | `127.0.0.1` o `::1` | Interfaz de escucha. Con otro valor no arranca: solo atiende al propio equipo |
| `LOG_FORMATO` | `texto` | `texto` o `json` | Formato de los mensajes de la consola |
| `LOG_NIVEL` | `info` | `error`, `warn`, `info` o `debug` | Cantidad de mensajes de la consola |
| `DEDUP_DT_S` | `30` | Mayor que 0, hasta 600 | Segundos de diferencia para considerar duplicados dos sismos de fuentes distintas |
| `DEDUP_DD_KM` | `100` | Mayor que 0, hasta 1000 | Kilómetros de distancia para considerarlos duplicados |
| `DEDUP_DM` | `1.0` | Mayor que 0, hasta 5 | Diferencia de magnitud para considerarlos duplicados |
| `INGESTA_MAG_MIN` | `2.0` | `todas`, `1.0`, `2.0`, `2.5`, `3.0`, `4.0`, `4.5` o `5.0` | Magnitud mínima de la carga inicial y de las consultas periódicas |
| `EMSC_FDSN_INTERVALO_S` | `30` | Entero de 30 a 3600 | Cada cuántos segundos se consulta EMSC |
| `USGS_INTERVALO_S` | `60` | Entero de 60 a 3600 | Cada cuántos segundos se consulta USGS |
| `FUENTE_TIMEOUT_MS` | `10000` | Entero de 1000 a 15000 | Tiempo máximo de espera de cada petición a una fuente, en ms |
| `RETENCION_DIAS` | `30` | Entero de 1 a 30 | Días de sismos que se guardan en memoria |
| `FUENTES_ACTIVAS` | `si` | `si` o `no` | Con `no` arranca sin consultar ninguna fuente (pruebas o trabajo sin red) |
| `AVISO_VENTANA_MIN` | `60` | Entero de 5 a 1440 | Minutos desde la hora de origen en los que un sismo nuevo puede generar un aviso |
| `SSE_MAX_CLIENTES` | `8` | Entero de 1 a 16 | Pestañas conectadas en vivo a la vez; la siguiente recibe 503 y reintenta |

Si un valor no es válido, la aplicación no arranca y la consola explica qué variable corregir.

### Parar el servidor

Pulsa **Ctrl+C** en la terminal donde se ejecuta `npm start`. El servidor cierra las conexiones y termina en un máximo de 5 segundos.

### Si el puerto está ocupado

Si la consola muestra `El puerto 3000 está ocupado…`, hay otro programa en ese puerto (o una copia anterior de la aplicación que sigue abierta en otra terminal). Tienes dos opciones:

- Arrancar en otro puerto: `PORT=3100 npm start` (o `PORT=3100` en `.env`) y abrir `http://localhost:3100`.
- Ver qué programa lo usa con `ss -tlnp | grep :3000` y cerrarlo.

### Pruebas y verificaciones

```bash
npm test             # pruebas unitarias y de integración (Vitest), sin red
npm run lint         # ESLint y Prettier
npm run check        # lint + pruebas + contrato de la API + auditoría de dependencias de producción
```

Las pruebas E2E usan Playwright con Chromium. La primera vez hay que descargar el navegador (se guarda en tu carpeta de usuario, sin `sudo`):

```bash
npx playwright install chromium
npm run test:e2e
```

Las E2E arrancan el servidor en el puerto 3013 sin consultar las fuentes y simulan la red.

## Fuentes de datos y atribución

- Sismos: [EMSC / seismicportal.eu](https://www.seismicportal.eu/) (CC BY 4.0) y [U.S. Geological Survey](https://earthquake.usgs.gov/).
- Mapa base: teselas de Esri.

## Licencia

[GNU Affero General Public License v3.0 o posterior](LICENSE) (AGPL-3.0-or-later).

Es software libre: puedes usarlo, estudiarlo, modificarlo y compartirlo. Si distribuyes una versión modificada, o la ofreces como servicio a través de una red, debes publicar su código fuente con la misma licencia.
