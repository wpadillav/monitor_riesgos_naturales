# Investigación de fuentes de sismos y tsunamis (T1.2)

**Fecha de las pruebas:** 2026-10-10, entre las 05:50Z y las 07:30Z
**Autor:** ingeniero-datos
**Alcance:** se ajusta al cambio del 2026-10-10. El proyecto es **solo local**, con un servidor Node.js permanente (ver [02-plan.md §3.1](02-plan.md)). El servidor consume todas las fuentes, por eso CORS se anota pero no bloquea nada.

**Capas** (columna «Capa» de las tablas):
- **TR**: tiempo real por WebSocket.
- **CP**: consulta periódica del servidor.
- **TS**: tsunamis.

**Contexto de las pruebas.** Desde el 2026-10-09 hay una secuencia sísmica activa en Panamá:
- M7.7 a las 17:56Z;
- M6.6 a las 20:25Z;
- M6.0 a las 04:14Z del día 10;
- más de cien réplicas.

Esto aportó avisos de tsunami **reales y recientes** para los fixtures.

---

## 1. Resumen de veredictos

| # | Fuente | Formato | CORS | Clave | Cobertura ES / CO / PA | Veredicto | Capa |
|---|---|---|---|---|---|---|---|
| 1 | EMSC WebSocket | JSON (GeoJSON Feature + `action`) | no aplica (WS); acepta cualquier Origin | no | sí / parcial / sí | **usar** | TR |
| 2 | EMSC FDSN | JSON, texto, QuakeML | sí (`*`) | no | **sí (vía IGN)** / parcial / **sí (vía IGC)** | **usar** (principal) | CP |
| 3 | USGS FDSN + `summary` | GeoJSON | sí (`*`) | no | casi nula / M≥4 / M≥4 | **usar** (complementaria) | CP |
| 4 | IGN España, GeoRSS | RSS 2.0 + GeoRSS | no comprobable (504) | no | sí / – / – | **respaldo** (caído durante las pruebas) | CP |
| 5 | SGC Colombia | sin API pública encontrada | – | – | – / sí / – | **descartar** de momento | – |
| 6 | IGC-UP Panamá | **no existe feed**; sus datos llegan a EMSC | – | – | – / – / sí | **descartar** directo; usar vía EMSC | – |
| 7 | NOAA tsunami.gov (PTWC/NTWC) | Atom + CAP 1.2 + TXT + JSON | **no** | no | no / **sí** / **sí** | **usar** | TS |
| 8 | España/Mediterráneo (IGN, CENALT, INGV…) | **no hay feed público** | – | – | ver §3 | **riesgo confirmado** | TS |
| 9 | DIMAR Colombia | HTML + PDF (sin feed) | no aplica | no | – / sí / – | **respaldo** (scraping frágil) | TS |
| 10 | GDACS | JSON (API), RSS, CAP | API sí (`*`), RSS no | no | sí / sí / sí | **respaldo** (no es aviso oficial) | TS |

---

## 2. Detalle por fuente

### 2.1 EMSC WebSocket

| Campo | Valor |
|---|---|
| URL | `wss://www.seismicportal.eu/standing_order/websocket` |
| Formato | Texto JSON: `{"action": "create"\|"update", "data": <GeoJSON Feature>}`. Ver el ejemplo más abajo. |
| Filtrado en origen | **No.** Emite todo el mundo, sin parámetros, y el servidor debe filtrar por bbox y magnitud. |
| Protocolo | WS directo, sin subprotocolo; negocia `permessage-deflate`. La documentación oficial también ofrece SockJS en `https://www.seismicportal.eu/standing_order`. |
| TLS | Let's Encrypt, `CN=seismicportal.eu`, SAN `www.seismicportal.eu`, válido del 2026-10-01 al 2026-12-30. Sin errores. |
| `ws://` sin TLS | Responde `302` a `https://`. **Hay que usar `wss://`.** |
| Origin | Acepta `https://example.org`, `http://localhost:8787` y `null` (handshake 101). Ya no es relevante en el modo local. |
| Clave | No. |
| Licencia | **CC BY 4.0**, según la página [realtime.html](https://www.seismicportal.eu/realtime.html): «Data received via the websocket protocol is distributed under the CC BY 4.0 license». |
| Atribución | «EMSC / seismicportal.eu (CC BY 4.0)». |
| Keepalive | El ejemplo oficial usa ping cada 15 s; con ese valor la conexión se mantuvo estable. |

**Evidencia:**

- `python3 websockets 10.4`:
  - handshake con 3 valores de Origin: los tres OK;
  - captura 1: 200 s y 1 mensaje;
  - captura 2: 540 s (06:07–06:16Z) y 2 mensajes;
  - sin cortes.
- `node 24.15.0` con el `WebSocket` nativo (el mismo cliente que usará el servidor): `open`, `extensions=permessage-deflate`, recibió 1 mensaje en 20 s y cerró sin error.

| Recibido (UTC) | Acción | Agencia | M | Región | Origen → recepción | `lastupdate` → recepción |
|---|---|---|---|---|---|---|
| 06:02:44 | update | SCSN | 1.9 | Southern California | 212 s | 2 s |
| 06:08:23 | create | AK | 3.2 | Andreanof Is. | 106 797 s (alta tardía) | 2 s |
| 06:08:33 | create | **IGC** | 4.4 | **PANAMA** | **253 s** | 2 s |

**Conclusiones:**

- El WS retransmite en ~2 s lo que EMSC publica. La latencia real la marca EMSC: unos 4 min tras el origen para un M4.4 en Panamá.
- Volumen bajo: ~3 mensajes en 12,5 min, en horario nocturno europeo.
- Llegan `create` de eventos antiguos (altas tardías). El servidor no debe tratarlos como «nuevos» para notificar sin mirar `time`.
- `geometry.coordinates[2]` es **negativo** (−profundidad), mientras que `properties.depth` es positivo. Hay que normalizar.
- La medición de 24 h queda para T1.3.

Fixture: `tests/fixtures/emsc-ws/mensajes.jsonl`. Cada línea lleva `received_at` y `raw`, el texto exacto del frame.

### 2.2 EMSC FDSN `fdsnws/event/1/query`

| Campo | Valor |
|---|---|
| URL | `https://www.seismicportal.eu/fdsnws/event/1/query` |
| Parámetros verificados | `format=json`, `starttime`, `minmag`, `minlat`, `maxlat`, `minlon`, `maxlon`, `orderby=time`, `limit`, `updatedafter` (devuelve 200 y funciona). También acepta los nombres largos `minmagnitude`, `minlatitude`, etc. |
| Otros parámetros (documentación) | `lat`, `lon`, `maxradius`, `mindepth`, `maxdepth`, `magtype`, `contributor`, `catalog` (`EMSC-RTS`/`EMSC-EMB`), `offset`, `nodata=204\|404`, `format=text\|xml`. Longitudes de −360 a 360, con salto en ±180. |
| Límites | 20 000 eventos por petición. No se documenta límite de frecuencia. |
| Formato | GeoJSON FeatureCollection. `properties`: `unid`, `time` (ISO), `lastupdate`, `mag`, `magtype`, `auth`, `flynn_region`, `lat`, `lon`, `depth`, `evtype`, `source_id` y `source_catalog`. El valor de profundidad en `coordinates[2]` es negativo. |
| CORS | `Access-Control-Allow-Origin: *` |
| Caché | `cache-control: max-age=15`, `etag` |
| Clave | No |
| Licencia | **CC BY 4.0**, según [fdsn-wsevent.html](https://www.seismicportal.eu/fdsn-wsevent.html) |
| Cadencia | Es tiempo casi real, igual que el WS. `max-age=15` permite consultar cada 30 s sin problema. |

**Evidencia:**

- `curl -sI -H "Origin: https://example.org" "…query?format=json&starttime=2026-10-03&minmag=2&minlat=26&maxlat=44.5&minlon=-19.5&maxlon=5&limit=30"` devolvió `200`, `Access-Control-Allow-Origin: *` y 30 eventos.
- **España, 30 días, M≥1.5, bbox peninsular:** 364 eventos, de ellos **307 con `auth=IGN`**, 49 EMSC y 8 ReNaSS. **EMSC ya trae el catálogo del IGN.**
- **Panamá y Colombia, M≥2.5:** de 50 eventos, **23 con `auth=IGC`** (Instituto de Geociencias, Universidad de Panamá), 15 NEIC, 9 UNA (Costa Rica) y 3 QUI (Ecuador).
- **Colombia continental, 30 días, M≥2.5:** 47 eventos (28 EMSC, 18 NEIC y 1 CSLC). **No aparece una agencia del SGC** y la cobertura de magnitudes bajas es pobre.

Fixtures: `tests/fixtures/emsc/fdsn-query-espana.json` y `tests/fixtures/emsc/fdsn-query-panama-colombia.json` (un evento por agencia).

### 2.3 USGS FDSN y feeds `summary`

| Campo | Valor |
|---|---|
| URL FDSN | `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&…` |
| URL summary | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson`, el mismo que usa hoy `index.html` |
| Parámetros verificados | `format=geojson`, `starttime`, `minmagnitude`, `minlatitude`, `maxlatitude`, `minlongitude`, `maxlongitude`, `orderby=time`, `limit`, `eventid`. La documentación incluye `updatedafter`. |
| Límites | 20 000 eventos; si se superan, devuelve `400`. |
| Formato | GeoJSON con `properties`: `mag`, `place`, `time` (epoch ms), `updated`, `url`, `detail`, `tsunami` (0/1), `alert`, `net`, `ids`, `sources`, `types`, `magType`, `status` y `sig`. |
| CORS | `access-control-allow-origin: *` en los dos endpoints |
| Caché | `cache-control: public, max-age=60` |
| Clave | No |
| Cadencia documentada | Feeds de la última hora y del último día: **«Updated every minute»**, según [geojson.php](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php). |
| Términos | Dominio público (Gobierno de EE. UU.). Atribución recomendada: «U.S. Geological Survey». |

**Evidencia y cobertura:**

- **España, 30 días, M≥1.5:** solo **1 evento** (M2.9). USGS no sirve como fuente para España.
- **Colombia continental, 30 días:** 46 eventos, todos `net=us`, con M mínima **4.1**.
- **Panamá:** M7.7 `us6000u18k` (`tsunami=0`, `alert=red`), M6.6 `us6000u19w` (`tsunami=1`) y M6.0 `us6000u1cf`.
- `tsunami=1` coincide con la existencia de un producto de tsunami. En el detalle del evento, `products.impact-link` enlaza al boletín de la NTWC. Sirve como **señal cruzada** para detectar boletines que no estén en el feed Atom (ver §2.7).

Fixtures:
- `tests/fixtures/usgs/fdsn-query-panama.geojson` (M7.7, M6.6 `tsunami=1` y uno normal);
- `tests/fixtures/usgs/fdsn-query-espana-30d.geojson` (respuesta completa);
- `tests/fixtures/usgs/summary-4.5_day.geojson`.

### 2.4 IGN España (sismos)

| Campo | Valor |
|---|---|
| URL | `https://www.ign.es/ign/RssTools/sismologia.xml` (la misma que usa la librería `georss-ign-sismologia-client` 2026.6.0 de Home Assistant, en `feed.py`: `URL = "http://www.ign.es/ign/RssTools/sismologia.xml"`) |
| Formato | RSS 2.0 + GeoRSS, últimos 10 días (canal «GeoRSS Sismología IGN»). Cada `item` trae `title` «-Info.terremoto: dd/mm/aaaa h:mm:ss», `description` en texto libre con la magnitud y la región, `link` con `evid=es2019…` y `geo:lat`/`geo:long`. **No incluye profundidad ni tipo de magnitud en campos propios: hay que extraerlos del texto con regex.** Formato tomado del fixture de esa librería, **no de una respuesta en vivo**. |
| Estado durante las pruebas | **Caído.** Hubo **504 Gateway Timeout de CloudFront** en 6 intentos entre las 05:54Z y las 07:25Z. Afectó también a `/web/ign/portal/ultimos-terremotos`, `/web/sis-tsunamis`, `/web/sis-area-sismicidad`, el WMS INSPIRE `wms-inspire/geofisica` y el PDF de la licencia. La portada `https://www.ign.es/` respondía 200. |
| FDSN | `https://fdsnws.sismologia.ign.es/fdsnws/` (SeisComP fdsnws 1.2.5) solo ofrece **station** (versión 1.1.6) y **dataselect**. `event/1/query` devuelve **404**; no hay servicio de eventos. |
| CORS | No se pudo comprobar (504). En modo local no importa. |
| Clave | No |
| Cadencia | La documentación de Home Assistant indica una actualización cada 5 minutos. No verificado en vivo. |
| Términos | En datos.gob.es figura la licencia `https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf`, que no se pudo descargar (504). **A confirmar.** Atribución: «Instituto Geográfico Nacional». |
| Cobertura | España y su entorno (incluye Portugal, norte de Marruecos y Argelia). |

**Veredicto:** respaldo. EMSC ya trae los eventos con `auth=IGN` (307 en 30 días), así que el IGN directo solo aporta redundancia. Además, el feed es frágil:
- ha estado caído durante las pruebas;
- se parsea con regex sobre texto libre.

Fixture: `tests/fixtures/ign/georss-504-cloudfront.html`, la respuesta real de error, útil para probar que una caída no rompe `/api/sismos`. **No hay fixture de contenido real:** pendiente de capturar cuando el servicio vuelva.

### 2.5 SGC Colombia

| Comprobación | Resultado |
|---|---|
| Registro FDSN (`fdsn.org/ws/datacenters`) | El SGC no figura como centro de datos. La red `CM` solo enlaza a `https://www.sgc.gov.co/sismos`. |
| `http://sismo.sgc.gov.co:8080/fdsnws/event/1/query` | Servidor SeisComP3-FDSNWS 1.2.1 activo, pero `event` devuelve **404**: no hay servicio de eventos. Responde `Access-Control-Allow-Origin: *`. |
| `https://www.sgc.gov.co/sismos` | **Cadena TLS incompleta:** `SSL certificate problem: unable to get local issuer certificate`. Node la rechazaría sin configuración adicional. Con `-k` devuelve **403 «Request blocked»** de CloudFront (WAF). La portada es una SPA de React; su bundle JS también da 403. No se intentó rodear el bloqueo. |
| `www2.sgc.gov.co/…/Tensor-prueba.aspx` | Página SharePoint de pruebas (200, CORS `*`). No es una API. |
| datos.gov.co (API de catálogo de Socrata) | Búsquedas «sismicidad»: 0 resultados; «sismos»: 6 resultados, ninguno del SGC con sismicidad reciente. |

**Veredicto:** **no encontrado** un servicio web público de sismos recientes del SGC. Se descarta para la capa CP. Cobertura alternativa para Colombia: EMSC + USGS, que es pobre por debajo de M4. Ver los riesgos.

### 2.6 IGC Universidad de Panamá

- **No existe un feed público encontrado.**
- `igc.up.ac.pa` (201.226.239.116) resuelve en DNS pero **no acepta conexiones**: timeout de 40 s en el puerto 80 y fallo en el 443. Puede deberse a la carga de la secuencia sísmica.
- La búsqueda web solo encontró difusión por X/Twitter (@igcpanamaup) y prensa.
- **Hallazgo positivo:** el IGC publica en EMSC con `auth=IGC`: 23 de 50 eventos de la zona, y llegó un `create` por el WebSocket.

**Veredicto:** descartar la conexión directa y **usar el IGC a través de EMSC** (WS + FDSN, filtro `auth=IGC`).

### 2.7 NOAA tsunami.gov (PTWC y NTWC)

| Campo | Valor |
|---|---|
| Atom PTWC (Honolulu) | `https://www.tsunami.gov/events/xml/PHEBAtom.xml` |
| Atom NTWC (Palmer) | `https://www.tsunami.gov/events/xml/PAAQAtom.xml` |
| CAP 1.2 por producto | Enlazado desde cada `entry` (`rel="related" type="application/cap+xml"`). Ejemplo: `https://www.tsunami.gov/events/PHEB/2026/10/09/26282001/1/WEGM42/PHEBCAP.xml` |
| Otros por producto | Boletín `…/{WMOID}.txt`, JSON `…/PHEB.json` y mapas de energía y de tiempos de llegada |
| Formato | Atom con `geo:lat`/`geo:long` y `summary` en XHTML (categoría, magnitud, región). CAP 1.2 con `event`, `severity`, `certainty`, `parameter` (`EventOriginTime`, `EventLatLon`…), `area` y firma XML DSig. |
| CORS | **No** hay `Access-Control-Allow-Origin` (ni en Atom ni en CAP). Irrelevante en el modo local. |
| Caché | `last-modified`; **admite `If-Modified-Since` → `304`** (verificado). Se puede consultar cada 60 s sin descargar nada si no hay cambios. |
| Clave | No |
| Términos | Dominio público (NOAA/NWS). Atribución: «NOAA/NWS – Pacific/National Tsunami Warning Center». |
| Cadencia | Por evento: el feed se reescribe cuando se emite un producto. |

**Avisos reales del 2026-10-09 (M6.6/6.9 Mwp en Panamá, 20:25Z):**

- 20:31Z: PTWC `WEPA42 PHEB` «TSUNAMI INFORMATION STATEMENT» para el Pacífico, en apoyo del sistema UNESCO/IOC (PTWS): «NO TSUNAMI THREAT».
- 20:34Z: PTWC `WEGM42` (Guam).
- 20:37Z: NTWC `WEAK53` «Tsunami Information Statement».
- **Limitación crítica:** el Atom de PTWC **solo conserva el último producto**. A las 20:34 `WEGM42` ya había sustituido a `WEPA42`. Para el M7.7 de las 17:56Z ya no queda nada en el feed.
  - Mitigación: consultar cada 30–60 s con `If-Modified-Since` y guardar cada `entry` en el servidor.
  - Señal cruzada: USGS `tsunami=1` y `products.impact-link`.

**Cobertura del Caribe:** **sí.**
- PTWC es el proveedor de servicio de tsunamis de **CARIBE-EWS** (UNESCO/IOC). Emite mensajes `WECA41 PHEB` para el Caribe y regiones adyacentes, que incluyen las costas caribeñas de **Colombia** y **Panamá**. Fuente: material oficial de los ejercicios CaribeWave de ITIC/NWS ([CW19](https://www.weather.gov/media/itic-car/CW19_Web2_Eng_final.pdf), [CW20](https://weather.gov/media/itic-car/CW20_Web2_Eng_FINAL.pdf)).
- La costa pacífica de los dos países queda cubierta por los productos `WEPA4x` de PTWC (PTWS). En este evento se emitió `WEPA42`.
- **No pude ver un `WECA4x` real.** No hubo ninguno en este evento: las rutas `WECA42` y `WEPA43` devuelven 403, que es como responde el servidor cuando el recurso no existe.

Fixtures (`tests/fixtures/noaa/`):
- `PHEBAtom.xml` y `PAAQAtom.xml`, los feeds reales completos;
- `PHEBCAP.xml`, el CAP real;
- `WEPA42.txt` y `WEGM42.txt`, los boletines;
- `PHEB.json`.

### 2.8 Tsunamis en España y el Mediterráneo (riesgo principal)

| Candidato | Qué se comprobó | Resultado |
|---|---|---|
| **IGN** (Red Nacional de Alerta de Tsunamis, España) | Web `/web/sis-tsunamis` (504 durante toda la sesión); búsqueda web «IGN maremotos mensajes feed» | **No se encontró ningún feed público** (RSS, Atom, CAP ni JSON). Según la prensa y Protección Civil, los avisos van a Protección Civil y se difunden por la web y las redes sociales del IGN y por el 112 / ES-Alert. |
| **CENALT** (Francia, proveedor NEAMTWS para el Mediterráneo occidental y el Atlántico NE) | `https://www.info-tsunami.fr/` (200), revisión de todos sus enlaces | Solo hay una página HTML «Historique des alertes», sin RSS ni CAP. Su mandato es alertar a la COGIC (protección civil francesa). |
| **INGV CAT** (Italia) | `https://www.ingv.it/cat/` (404), portada `ingv.it` (sin enlaces a feed), `terremoti.ingv.it` (sin respuesta) | **No encontrado.** |
| **IPMA** (Portugal) | `https://www.ipma.pt/pt/geofisica/tsunamis/` (200) | Sin enlaces a RSS, CAP ni JSON. |
| **HL-NTWC** (NOA, Grecia) | `hl-ntwc.gein.noa.gr/en/services.html` | Mensajes a suscriptores institucionales; sin feed público. |
| **Servicio público de la IOC** (ITIC) | Página «Subscribe to Warnings» | La lista pública cubre **PTWC, NTWC y el océano Índico**, pero **no NEAMTWS**. |
| **NOAA NTWC/PTWC** | – | No son autoridad para las costas españolas. NTWC publica «Information Statements» de grandes sismos del Atlántico. Útil solo como indicio. |
| **GDACS** | §2.10 | Modelo de tsunami del JRC (JETS), con cobertura global, incluido el Mediterráneo. **No es un aviso oficial.** |

**Conclusión:** **confirmado el riesgo.** No hay ninguna fuente oficial legible por máquina para avisos de tsunami en España (ni Mediterráneo, ni golfo de Cádiz, ni Canarias). Se aplica el plan B del plan (§7):
1. GDACS (indicio, marcado como «no oficial»);
2. un enlace visible al IGN, al 112 y a ES-Alert;
3. un aviso en la página de que la cobertura para España es limitada.

Cuando el IGN vuelva a estar disponible, conviene revisar a mano `/web/sis-tsunamis` por si publica un listado HTML con estructura estable.

### 2.9 DIMAR Colombia (CNAT)

| Campo | Valor |
|---|---|
| URL | `https://www.dimar.mil.co/node/6429/printable/print` («Boletines información de Tsunami») |
| Formato | Tabla HTML con columnas *fecha y hora local* (UTC−5), *referencia geográfica*, *estado* (INFORMATIVO / VIGILANCIA / ADVERTENCIA / ALERTA) y enlaces a **boletines en PDF** |
| Feed | **No existe** (ni RSS, ni CAP, ni JSON). |
| CORS | No aplica (scraping desde el servidor). |
| Clave | No |
| Cadencia | Manual. La página mostraba «09/10/2026 - 03:33 pm». Los boletines se publican después de que la UNGRD los difunde, según la propia página. |
| Términos | No publicados en la página. Atribución: «DIMAR – Centro Nacional de Alerta por Tsunami». |

**Evidencia:** la tabla recoge 4 eventos de Panamá el 2026-10-09. El de las **12:56 locales (17:56Z, M7.7)** tiene estado **«VIGILANCIA»** y boletines 1 y 2. Es el único aviso oficial de nivel superior a «informativo» observado para un país del proyecto.

**Veredicto:** respaldo en la capa TS, con un parser de HTML tolerante a fallos. Es la **única fuente oficial colombiana**, pero llega con retraso. Fixture: `tests/fixtures/dimar/boletines-tsunami-tabla.html`, con la cabecera y 6 filas reales.

### 2.10 GDACS

| Campo | Valor |
|---|---|
| API | `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ&fromDate=AAAA-MM-DD&toDate=AAAA-MM-DD` (GeoJSON) |
| Detalle | `https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=EQ&eventid={id}` |
| RSS | `https://www.gdacs.org/xml/rss.xml`: 656 KB y 213 items de todos los peligros, con extensiones `gdacs:*` (`alertlevel`, `severity`, `cap`, `iso`, `bbox`…) |
| CORS | API: `Access-Control-Allow-Origin: *`. RSS: no. |
| Clave | No |
| Tsunamis | **No hay tipo de evento propio.** El evento EQ incluye el resultado del modelo JRC «JETS» (`impacts[].resource.tsunami` e imagen `…/tsunami/JETS_System/…`). El recurso `getlocations?id=808145` devolvió 404. |
| Términos | `<gdacs:acknowledgements>`: «European Union (CC BY 4.0), reuse is allowed, provided appropriate credit to GDACS is given». El `<copyright>` del canal dice «public domain». **Se aplica CC BY 4.0** por ser la más restrictiva. |
| Cadencia | La documentación no la indica. El evento de Panamá tenía `datemodified` unas 6 h después del origen. |

**Evidencia:** `geteventlist` devolvió 2 eventos EQ del 1 al 10 de octubre: Panamá M7.7 (**Orange**, fuente NEIC) y Vanuatu M6.3.

**Veredicto:** respaldo para el nivel de impacto e indicio de tsunami en España. **Siempre se etiqueta como «no oficial».**

Fixtures: `tests/fixtures/gdacs/geteventlist-eq.json` y `tests/fixtures/gdacs/rss-recortado.xml` (canal + 1 EQ de Panamá + 1 no EQ).

---

## 3. Respuestas finales

### 3.1 ¿Es viable la capa de tiempo real (WebSocket de EMSC)?

**Sí, desde el servidor Node.**
- El `WebSocket` nativo de Node 24 conecta con `wss://www.seismicportal.eu/standing_order/websocket` sin errores de TLS ni de protocolo.
- Retransmite cada publicación de EMSC en ~2 s.
- Se mantuvo estable en dos sesiones (200 s y 540 s, unos 12 min en total) con ping cada 15 s.

Condiciones:
1. **Filtrar en el servidor:** el WS no admite filtros.
2. **Deduplicar** por `unid` y tratar `update` como modificación.
3. Ignorar como «nuevo» un `create` con `time` antiguo.
4. **Reconectar** con espera creciente.
5. Cubrir los huecos con la consulta FDSN `updatedafter=<última lastupdate>`, que está verificada.

**Latencia observada:** 4 min desde el origen para un M4.4 de IGC en Panamá. Es la latencia de la agencia, no del WS. La medición de 24 h queda para T1.3.

### 3.2 Cobertura oficial de tsunamis por país

| País | Costa | Fuente oficial legible por máquina | Estado |
|---|---|---|---|
| **Panamá** | Pacífico | PTWC (PTWS) `PHEBAtom.xml` + CAP | ✅ Verificado con avisos reales del 2026-10-09 |
| **Panamá** | Caribe | PTWC (CARIBE-EWS) `WECA41`, mismo Atom | ✅ Documentado; sin ejemplo real visto |
| **Colombia** | Pacífico y Caribe, incluidas San Andrés y Providencia | PTWC (como Panamá) | ✅ |
| **Colombia** | Nacional | DIMAR, en HTML + PDF y sin feed | ⚠️ Solo por scraping, con retraso |
| **España** | Mediterráneo, Atlántico y Canarias | **Ninguna** (IGN, CENALT, INGV, IPMA y la IOC sin feed público) | ❌ Plan B: GDACS (no oficial) + enlaces a IGN, 112 y ES-Alert + aviso de cobertura limitada |

Panamá no tiene un centro nacional con feed: SINAPROC y el IGC-UP difunden por redes sociales.

### 3.3 Rectángulos recomendados (con franja marina)

Hay una consulta por rectángulo a cada fuente. Después se aplica el filtro fino por polígono (§3.4 del plan). Los rectángulos se solapan (Panamá y Colombia) y cubren países vecinos; eso es intencionado.

| ID | Zona | minlat | maxlat | minlon | maxlon | Motivo |
|---|---|---|---|---|---|---|
| `ES-PEN` | Península, Baleares, Ceuta, Melilla, Alborán y Chafarinas | 34.8 | 44.3 | −10.0 | 4.9 | ~0,5–0,7° de mar alrededor de Galicia (−9,3), Menorca (4,3), Cantábrico (43,8) y Melilla (35,3) |
| `ES-CAN` | Canarias | 26.6 | 30.0 | −18.8 | −12.5 | El Hierro (27,6 / −18,2) y Alegranza (29,4) más ~0,6–1° |
| `CO-CONT` | Colombia continental, ambas costas y Malpelo | −4.5 | 12.9 | −82.2 | −66.5 | Leticia (−4,2), La Guajira (12,5) y Malpelo (−81,6) |
| `CO-SAI` | San Andrés, Providencia y cayos cercanos | 11.8 | 14.0 | −82.3 | −80.9 | San Andrés (12,5 / −81,7) y Providencia (13,4 / −81,4). Si el PRD quiere los cayos Serrana y Serranilla, hay que ampliarlo a 16.3 / −79.3. |
| `PA` | Panamá | 5.0 | 10.2 | −83.3 | −77.0 | Costa caribeña (9,6) más 0,5°; Pacífico hasta ~5°N, donde se sitúa la zona de fractura de Panamá (eventos M5 «South of Panama») |

Hay 5 rectángulos y 2 fuentes FDSN, así que son 10 peticiones por ciclo de 30 s. Es asumible. Para reducirlas se pueden unir `CO-CONT`, `CO-SAI` y `PA` en un único rectángulo de −4.5 a 14.0 y de −83.3 a −66.5.

---

## 4. Riesgos y deuda detectados

| Riesgo | Impacto | Mitigación propuesta |
|---|---|---|
| Sin aviso oficial de tsunami legible por máquina para España | Alto | Plan B (§3.2); decidir en el PRD el texto exacto del aviso de cobertura |
| El Atom de PTWC solo guarda el último producto | Alto (se pueden perder boletines) | Consultar cada 30–60 s con `If-Modified-Since`, guardar cada `entry` y usar la señal cruzada de USGS `tsunami=1` / `impact-link` |
| IGN caído durante ≥ 1,5 h | Medio | EMSC ya trae `auth=IGN`; el IGN directo queda como respaldo |
| Colombia: sin API del SGC y cobertura M<4 pobre | Medio | Documentarlo en el PRD; volver a buscar con el SGC (contacto) |
| `www.sgc.gov.co` con cadena TLS incompleta y WAF | Bajo | No se usa |
| DIMAR: scraping de HTML y PDF | Medio | Parser tolerante; si falla, la página sigue funcionando |
| Términos del IGN no verificados (PDF caído) | Bajo | Confirmar antes de publicar cualquier dato del IGN directo |

## 5. Fixtures generados

Todos son respuestas reales del 2026-10-10, recortadas.

```
tests/fixtures/
├── emsc/fdsn-query-espana.json            # 3 eventos (IGN, EMSC, ReNaSS)
├── emsc/fdsn-query-panama-colombia.json   # 4 eventos (IGC, NEIC, UNA, QUI)
├── emsc-ws/mensajes.jsonl                 # 3 frames reales (1 update, 2 create)
├── usgs/fdsn-query-panama.geojson         # M7.7, M6.6 tsunami=1 y otro
├── usgs/fdsn-query-espana-30d.geojson     # respuesta completa (1 evento)
├── usgs/summary-4.5_day.geojson           # 3 de 55
├── noaa/PHEBAtom.xml, PAAQAtom.xml        # feeds Atom reales (Panamá, 2026-10-09)
├── noaa/PHEBCAP.xml                       # CAP 1.2 real
├── noaa/WEPA42.txt, WEGM42.txt, PHEB.json # boletines y JSON del producto
├── gdacs/geteventlist-eq.json             # API (2 eventos)
├── gdacs/rss-recortado.xml                # canal + 2 items
├── dimar/boletines-tsunami-tabla.html     # tabla real con «VIGILANCIA»
└── ign/georss-504-cloudfront.html         # respuesta de caída real
```
