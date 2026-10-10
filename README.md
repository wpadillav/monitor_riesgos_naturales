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

## Fuentes de datos y atribución

- Sismos: [EMSC / seismicportal.eu](https://www.seismicportal.eu/) (CC BY 4.0) y [U.S. Geological Survey](https://earthquake.usgs.gov/).
- Mapa base: teselas de Esri.

## Licencia

[GNU Affero General Public License v3.0 o posterior](LICENSE) (AGPL-3.0-or-later).

Es software libre: puedes usarlo, estudiarlo, modificarlo y compartirlo. Si distribuyes una versión modificada, o la ofreces como servicio a través de una red, debes publicar su código fuente con la misma licencia.
