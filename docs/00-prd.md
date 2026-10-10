# PRD — Terremotos en vivo v2 · Entrega 1 (versión mínima)

**Versión:** 0.2 · **Estado:** ✅ aprobado por el Director el 2026-10-10 · **Autor:** analista-requerimientos (T2.1, revisión T2.2) · **Fecha:** 2026-10-10

**Base:**
- [02-plan.md](02-plan.md), aprobado el 2026-10-10;
- [investigacion-fuentes.md](investigacion-fuentes.md) (T1.2), con las fuentes verificadas, los volúmenes observados y los rectángulos por zona;
- [.fabrica/estado.md](../.fabrica/estado.md).

Las decisiones del Director se citan, no se reabren.

**Cambios respecto a la 0.1:**
- se incorporan las respuestas del Director a las 5 preguntas (§11);
- los valores que esperaban a T1.2 se sustituyen por datos medidos;
- T1.3 se sustituye por métricas de latencia en los logs del servidor (RNF-02);
- los cayos Serrana y Serranilla quedan fuera de la entrega 1;
- se añade la propuesta del aviso de cobertura de tsunamis para España (entrega 2).

---

## 1. Contexto y problema

Hoy [index.html](../index.html) muestra los sismos de **todo el mundo** de un único feed del USGS. Refresca cada 60 s, no filtra por país y no avisa si la pestaña no está a la vista. El Director quiere enterarse **cuanto antes** de los sismos de **España, Colombia y Panamá**, ver solo los que le interesan y recibir un aviso del navegador cuando uno supere un umbral. Todo debe funcionar en su equipo, sin publicar nada en internet.

## 2. Objetivos de negocio

| # | Objetivo | Métrica | Meta | Historias |
|---|---|---|---|---|
| O1 | Ver los sismos lo antes posible | Retardo entre la recepción del sismo en el servidor local y su aparición en pantalla (p95) | ≤ 2 s (RNF-01); extremo a extremo según RNF-02 | HU-01, HU-02 |
| O2 | Ver solo lo relevante | % de sismos mostrados que cumplen los filtros activos | 100 % | HU-03, HU-04, HU-05, HU-06 |
| O3 | Enterarse sin mirar la pantalla | Sismos nuevos que superan el umbral y se notifican, con la pestaña en segundo plano | 100 %, sin duplicados | HU-10, HU-11 |
| O4 | Comprender el sismo de un vistazo | Cada sismo muestra magnitud, lugar, profundidad, hora local del país y «hace X min» | 100 % de los sismos | HU-07, HU-08, HU-09 |
| O5 | Operarlo en local sin coste | Arranque con `npm ci && npm start` desde un repositorio limpio; coste de las fuentes | Funciona al primer intento; 0 € (fuentes gratuitas y sin clave, verificado en T1.2) | HU-12 |
| O6 | No inducir a error | Aviso «Solo informativo…» y atribución visibles | Siempre visibles, en ambos temas y en móvil | HU-07 |

## 3. Usuarios y roles

| Rol | Necesidad principal | Permisos |
|---|---|---|
| Usuario local (el Director) | Consultar sismos de ES, CO y PA y recibir avisos | Todo lo que ofrece la interfaz. No hay inicio de sesión ni cuentas. |
| Operador local (la misma persona) | Arrancar y parar la aplicación | Ejecuta `npm start` en su máquina. |

No hay más roles. La aplicación solo atiende peticiones del propio equipo (RNF-09).

## 4. Alcance

**Incluye (entrega 1):** A1 datos en vivo · A2 filtro de magnitud · A3/A3b filtro de país con los tres marcados por defecto · A5 filtro de tiempo · mapa y lista · A8 hora local · A10 modo oscuro/día · A7 notificaciones de sismos · A11 solo español · A9 uso local con `npm start`.

**Fuentes de la entrega 1** (verificadas en T1.2; detalle en §7):
- **Tiempo real:** EMSC WebSocket, que retransmite cada publicación de EMSC en unos 2 s.
- **Consulta periódica:** EMSC FDSN como **fuente principal** (ya incluye los catálogos del IGN y del IGC-UP) y USGS como **complemento**.
- IGN, SGC e IGC-UP **no se consumen directamente**.

**Comportamiento actual que debe preservarse** (de `index.html`):
1. Aviso «Solo informativo. No es un sistema de alerta temprana: sigue siempre los canales oficiales de tu país.» y la atribución de los datos y de Esri. La atribución se amplía a cada fuente que se use (§7).
2. Lista ordenada por hora del sismo, de más reciente a más antiguo. Al pulsar un elemento, el mapa vuela al sismo y abre su ventana emergente.
3. Ventana emergente con magnitud (1 decimal), lugar, profundidad (km), fecha y hora, coordenadas (2 decimales) y enlace «Más info» a la fuente.
4. Radio del marcador proporcional a la magnitud, con mínimo visible; animación de pulso en los sismos de la última hora.
5. Línea de estado con el número de sismos y la hora de la última actualización; mensaje de error con reintento automático.
6. Se descartan los eventos sin magnitud.
7. Por debajo de 700 px de ancho, el mapa va arriba y la lista abajo.
8. Apertura automática de la ventana emergente de un sismo nuevo que alcance el umbral de notificación (M ≥ 4.5, decisión D1).

**Se corrige:** los textos de las fuentes que hoy se insertan sin escapar (RNF-07).

**Limitación conocida (T1.2):** para **Colombia** no hay servicio público del SGC. EMSC y USGS cubren poco por debajo de M 4: en 30 días, USGS no dio ningún sismo continental por debajo de M 4.1. Con el filtro por defecto (M 2.0) se verán en Colombia bastantes menos sismos que los que publica el SGC en su web. La interfaz no lo oculta: la nota de fuentes lo indica (HU-07).

### Fuera de alcance / entrega 2

| Tema | Dónde queda |
|---|---|
| Avisos de tsunami (A6) y su notificación | Entrega 2. Ver «Notas para la entrega 2» |
| Filtro de radio alrededor de Madrid, Benidorm o la ubicación del usuario (A4); por eso la entrega 1 **no pide la ubicación** | Entrega 2 |
| **Cayos Serrana y Serranilla** (Colombia). El rectángulo `CO-SAI` de T1.2 cubre San Andrés, Providencia y los cayos cercanos; incluirlos exigiría ampliarlo hasta 16.3° N y −79.3° de longitud | Entrega 2, si el Director lo pide |
| Consumo directo de IGN (GeoRSS), SGC e IGC-UP. El IGN y el IGC llegan a través de EMSC; el SGC y el IGC-UP no tienen un feed público; el GeoRSS del IGN estuvo caído durante las pruebas | Posterior. El GeoRSS del IGN es candidato a respaldo |
| Publicación en internet, dominio, HTTPS público | Prohibido por el Director |
| Notificaciones con el navegador cerrado (push) | Versión posterior |
| Arranque automático (systemd) o proxy inverso | Descartado: arranque manual con `npm start` |
| Cuentas de usuario, app móvil, PWA | No incluido |
| Histórico de más de 30 días | No incluido |
| Otros idiomas | No incluido |
| Alerta temprana de cualquier tipo | Imposible por diseño; se mantiene el aviso |

#### Notas para la entrega 2 (no forman parte de la entrega 1)

**España no tiene un feed oficial de avisos de tsunami.** T1.2 lo confirmó: el IGN, el CENALT, el INGV, el IPMA y el servicio de la IOC no publican avisos legibles por programa. Para Colombia y Panamá sí hay fuente oficial: NOAA PTWC. Para España se aplicará el **plan B** del plan (§7):
1. **GDACS como indicio**, etiquetado siempre como «no oficial».
2. **Enlaces visibles** al IGN (`https://www.ign.es`), al 112 y a ES-Alert.
3. **Aviso de cobertura limitada** en el panel de tsunamis cuando España esté marcada.

**Propuesta de texto del aviso.** La validan el diseñador UX y el Director en la entrega 2:

> **Cobertura limitada para España.** Ningún organismo oficial publica los avisos de tsunami para las costas españolas (Mediterráneo, Atlántico y Canarias) en un formato que esta aplicación pueda leer, así que aquí **no aparecerán avisos oficiales para España**. Lo que se muestre para España procede de GDACS (Comisión Europea) y **no es un aviso oficial**.
> Si estás en la costa y notas un terremoto fuerte o ves que el mar se retira de forma anormal, aléjate de la costa hacia un lugar alto sin esperar ningún aviso. Sigue las indicaciones del **112** y de **ES-Alert** en tu móvil, y consulta el **Instituto Geográfico Nacional** (ign.es).

## 5. Historias de usuario

Rol abreviado: **U** = usuario local. Todas son **Must** salvo que se indique otra prioridad.

### Épica E1 — Datos en vivo

#### HU-01 — Ver los sismos nuevos sin recargar
Como U quiero que los sismos nuevos aparezcan solos para enterarme sin pulsar nada.
```gherkin
Escenario: Llega un sismo que cumple los filtros
  Dado la página abierta con España marcada y magnitud mínima 2.0
  Cuando el servidor recibe un sismo M 3.1 en Granada
  Entonces aparece en la lista y en el mapa en ≤ 2 s sin recargar la página
  Y la línea de estado actualiza el contador y la hora

Escenario: Llega un sismo que no cumple los filtros
  Dado la página con solo Panamá marcada
  Cuando el servidor recibe un sismo M 4.0 en Granada
  Entonces el sismo no llega al navegador ni aparece en pantalla

Escenario: La misma sacudida llega de varias fuentes
  Dado un sismo en Panamá ya mostrado, recibido por el WebSocket de EMSC con autor IGC
  Cuando USGS publica el mismo evento
  Entonces sigue habiendo un solo elemento en la lista y en el mapa
  Y sus datos son los del autor IGC, con enlace a EMSC y a USGS

Escenario: Una fuente revisa la magnitud
  Dado un sismo mostrado como M 3.8
  Cuando la fuente lo revisa a M 4.1
  Entonces el mismo elemento muestra M 4.1, sin crear un elemento nuevo

Escenario: Profundidad con signo negativo en la fuente
  Dado un evento de EMSC con profundidad 10 km y coordenada vertical -10
  Entonces el sismo se muestra con «10 km» de profundidad
```

**Reglas de duplicados** (valores iniciales configurables; T4.2 los calibra con los fixtures de T1.2):
1. Dos eventos de la misma fuente con el mismo identificador (`unid` de EMSC, `ids` de USGS) son el mismo sismo. Una acción `update` modifica el sismo, no crea uno nuevo.
2. Entre fuentes distintas, son el mismo sismo si cumplen las tres condiciones:
   - diferencia de hora de origen ≤ 30 s;
   - distancia entre epicentros ≤ 100 km;
   - diferencia de magnitud ≤ 1.0.
3. **Precedencia de datos:**
   1. el evento cuyo autor es la agencia nacional del país del sismo (`auth=IGN` en España, `auth=IGC` en Panamá);
   2. si no lo hay, EMSC;
   3. si tampoco, USGS.

   Colombia no tiene una agencia nacional en las fuentes.

#### HU-02 — Seguir funcionando si falla una fuente o la conexión
Como U quiero que la página se recupere sola para no tener que vigilarla.
```gherkin
Escenario: Cae una fuente de consulta periódica
  Dado la aplicación recibiendo de EMSC WebSocket, EMSC FDSN y USGS
  Cuando USGS deja de responder
  Entonces siguen apareciendo los sismos de EMSC
  Y en ≤ 60 s la línea de estado indica «USGS no disponible»
  Y al volver USGS el indicador desaparece sin intervención

Escenario: Se corta el WebSocket de EMSC
  Dado la aplicación recibiendo de las tres fuentes
  Cuando el WebSocket de EMSC se corta durante 5 min
  Entonces los sismos publicados en ese intervalo siguen apareciendo, con el retraso de la consulta periódica (RNF-02)
  Y al reconectar no se duplica ningún sismo

Escenario: Se corta la conexión entre la página y el servidor local
  Dado la página abierta
  Cuando la conexión con el servidor se interrumpe 30 s y se restablece
  Entonces la página se reconecta sola
  Y muestra los sismos llegados durante el corte, sin duplicarlos

Escenario: El servidor local está parado
  Dado la página abierta
  Cuando el operador detiene el servidor
  Entonces en ≤ 10 s la página muestra «Sin conexión con el servidor local. Reintentando…»
  Y conserva en pantalla los últimos sismos recibidos

Escenario: Todas las fuentes caen
  Dado la página con sismos ya cargados
  Cuando ninguna fuente responde durante 2 min
  Entonces la página no queda vacía: sigue mostrando esos sismos
  Y la línea de estado avisa de que las fuentes no están disponibles
```

### Épica E2 — Filtros aplicados antes de consultar

**Regla común:**
- Los filtros viajan al servidor en la carga inicial y en la suscripción a los datos en vivo.
- El servidor solo envía lo que cumple los filtros.
- En la consulta periódica, el servidor traslada a EMSC FDSN y a USGS la magnitud mínima y el rectángulo de cada zona marcada.
- El WebSocket de EMSC no admite filtros: emite todo el mundo y el servidor filtra lo que recibe.

**Zonas de consulta.** Rectángulos de T1.2, §3.3. Los contornos de Natural Earth y la franja marina hacen después el filtro fino.

| Zona | País | minlat | maxlat | minlon | maxlon |
|---|---|---|---|---|---|
| `ES-PEN` | España: península, Baleares, Ceuta, Melilla, Alborán y Chafarinas | 34.8 | 44.3 | −10.0 | 4.9 |
| `ES-CAN` | España: Canarias | 26.6 | 30.0 | −18.8 | −12.5 |
| `CO-CONT` | Colombia continental, ambas costas y Malpelo | −4.5 | 12.9 | −82.2 | −66.5 |
| `CO-SAI` | Colombia: San Andrés, Providencia y cayos cercanos (sin Serrana ni Serranilla) | 11.8 | 14.0 | −82.3 | −80.9 |
| `PA` | Panamá | 5.0 | 10.2 | −83.3 | −77.0 |

**Requisito de cobertura.** El rectángulo de cada zona debe contener por completo el contorno del país ampliado con la franja marina de 100 km (D2). Los rectángulos de T1.2 dejan unos 0,5–0,7° de margen en varios lados: en latitudes de España eso son unos 45–67 km, menos de 100 km. Ejemplos:
- `ES-PEN`, al oeste de Galicia y al norte del Cantábrico;
- `ES-CAN`, al oeste de El Hierro y al norte de Alegranza;
- `CO-SAI` y `PA`, por el norte.

T4.2 ajusta los rectángulos al contorno ampliado. Una prueba unitaria verifica, para cada zona, que el contorno ampliado queda dentro de su rectángulo.

#### HU-03 — Filtrar por país
Como U quiero elegir entre España, Colombia y Panamá para ver solo los sismos de esos países.
```gherkin
Escenario: Valores por defecto
  Dado que abro la aplicación por primera vez
  Entonces España, Colombia y Panamá están marcados

Escenario: Desmarcar un país
  Dado los tres países marcados
  Cuando desmarco Colombia
  Entonces la página pide los datos sin Colombia
  Y desaparecen de la lista y del mapa los sismos de Colombia

Escenario: Territorios incluidos
  Dado solo España marcada
  Cuando hay sismos en Tenerife, Mallorca, Ceuta y Melilla
  Entonces los cuatro se muestran
  Y con solo Colombia marcada se muestra un sismo en San Andrés

Escenario: Sismo en el mar cerca de la costa
  Dado solo España marcada y la franja marina de 100 km
  Cuando hay un sismo a 80 km de la costa de Almería
  Entonces se muestra
  Y un sismo a 120 km de cualquier costa española no se muestra

Escenario: Sismo cerca de los cayos Serrana o Serranilla
  Dado solo Colombia marcada
  Cuando hay un sismo a 20 km del cayo Serranilla y a más de 100 km de cualquier otro territorio colombiano
  Entonces no se muestra en la entrega 1

Escenario: Ningún país marcado
  Cuando desmarco los tres
  Entonces no se hace ninguna consulta
  Y la lista muestra «Selecciona al menos un país»
```

**Reglas:**
- El ancho de la franja marina (D2) es un valor configurable, igual para los tres países.
- Si un sismo cae en la franja de dos países (frontera Colombia-Panamá), se muestra si cualquiera de los dos está marcado. Se le asigna el país con la costa o frontera más cercana.

#### HU-04 — Filtrar por magnitud mínima
Como U quiero fijar una magnitud mínima para no ver microsismos.
```gherkin
Escenario: Valor por defecto y opciones
  Dado que abro la aplicación por primera vez
  Entonces la magnitud mínima es 2.0
  Y el selector ofrece Todas, 1.0, 2.0, 2.5, 3.0, 4.0, 4.5 y 5.0

Escenario: Subir la magnitud mínima
  Dado la magnitud mínima en 2.0
  Cuando la cambio a 3.0
  Entonces la petición al servidor incluye la magnitud 3.0
  Y no se muestra ningún sismo con magnitud menor de 3.0

Escenario: Sin resultados
  Dado magnitud mínima 6.0 y filtro de 1 hora
  Cuando no hay sismos que cumplan
  Entonces la lista muestra «No hay sismos con estos filtros»
```

#### HU-05 — Filtrar por tiempo
Como U quiero elegir el periodo para ver la actividad reciente o la del último mes.
```gherkin
Escenario: Opciones disponibles y valor por defecto
  Entonces el selector ofrece «Última hora», «Últimas 24 h», «7 días» y «30 días»
  Y la primera vez está seleccionado «Últimas 24 h»

Escenario: Cambiar a 30 días
  Dado el filtro en «Últimas 24 h»
  Cuando elijo «30 días»
  Entonces la petición incluye la fecha de inicio de hace 30 días
  Y la lista y el mapa se cargan cumpliendo RNF-03

Escenario: Los sismos salen del periodo
  Dado el filtro en «Última hora» y un sismo de hace 59 min
  Cuando pasan 2 min
  Entonces ese sismo desaparece de la lista y del mapa
```

#### HU-06 — Recordar mis filtros (Should)
Como U quiero que la aplicación recuerde mis filtros para no configurarlos cada vez.
```gherkin
Escenario: Reabrir la aplicación
  Dado que dejé solo Panamá, magnitud 3.0 y «7 días»
  Cuando cierro el navegador y vuelvo a abrir la aplicación
  Entonces los filtros son solo Panamá, 3.0 y «7 días»

Escenario: Preferencias dañadas
  Dado que las preferencias guardadas no son válidas
  Cuando abro la aplicación
  Entonces se usan los valores por defecto (tres países, 2.0, «Últimas 24 h»), sin error visible
```

### Épica E3 — Visualización

#### HU-07 — Ver los sismos en mapa y lista
Como U quiero ver cada sismo en el mapa y en una lista para ubicarlo y comparar.
```gherkin
Escenario: Contenido del elemento de la lista
  Dado un sismo M 4.2, «Golfo de Urabá», 12 km de profundidad
  Entonces el elemento muestra «4.2», el lugar, la hora local, «hace X min» y «12 km»

Escenario: De la lista al mapa
  Cuando pulso o activo con el teclado un elemento de la lista
  Entonces el mapa se centra en el sismo y abre su ventana emergente

Escenario: Fuente y autor en la ventana emergente
  Dado un sismo recibido de EMSC con autor IGN
  Entonces la ventana emergente indica «Fuente: EMSC · autor: IGN» y enlaza a la ficha de EMSC

Escenario: Aviso y atribución
  Dado cualquier tema y cualquier ancho de pantalla desde 360 px
  Entonces se ven el aviso «Solo informativo…»
  Y la atribución «EMSC / seismicportal.eu (CC BY 4.0)», «U.S. Geological Survey» y la de Esri

Escenario: Nota de cobertura
  Dado Colombia marcada
  Entonces una nota de fuentes, accesible desde el pie, indica que en Colombia la cobertura por debajo de M 4 es limitada

Escenario: Texto malicioso en una fuente
  Dado un sismo cuyo lugar es «<img src=x onerror=alert(1)>»
  Entonces el texto se muestra literalmente en la lista y en la ventana emergente
  Y no se ejecuta ningún script
```

#### HU-08 — Ver la hora local del país del sismo
Como U quiero ver la hora local del lugar del sismo para relacionarla con lo que cuentan allí.
```gherkin
Escenario: Sismo en Canarias
  Dado un sismo en Tenerife a las 12:00 UTC del 2026-07-15
  Entonces se muestra «13:00 (hora de Canarias)» y «hace X min»

Escenario: Sismo en la península en invierno
  Dado un sismo en Murcia a las 12:00 UTC del 2026-01-15
  Entonces se muestra «13:00 (hora peninsular)»

Escenario: Sismo en Colombia o Panamá
  Dado un sismo en Bucaramanga a las 12:00 UTC
  Entonces se muestra «07:00 (hora de Colombia)»
```

**Zonas horarias** (se respeta el horario de verano):

| Territorio | Zona |
|---|---|
| Península y Baleares | `Europe/Madrid` |
| Ceuta y Melilla | `Africa/Ceuta` (misma hora que la península) |
| Canarias | `Atlantic/Canary` |
| Colombia | `America/Bogota` |
| Panamá | `America/Panama` |

#### HU-09 — Cambiar entre modo oscuro y modo día
Como U quiero elegir el tema para leer bien de día y de noche.
```gherkin
Escenario: Primera visita
  Dado que el sistema operativo está en modo claro
  Cuando abro la aplicación sin preferencia guardada
  Entonces se ve en modo día con las teselas grises claras de Esri

Escenario: Cambiar y recordar
  Cuando pulso el botón de tema
  Entonces cambian la interfaz y las teselas del mapa
  Y al recargar se mantiene el tema elegido, sin mostrar antes el otro
```

### Épica E4 — Avisos

**Reglas de notificación** (decisiones D1 y D4):
- **Umbral por defecto: M ≥ 4.5.** Se compara la magnitud **redondeada a un decimal**, tal como se muestra en pantalla.
- **Ámbito:** solo se notifican los sismos de los **países marcados**. Se notifican aunque estén por debajo de la magnitud mínima del filtro de la lista. El filtro de tiempo no afecta a los avisos.
- **Qué cuenta como sismo nuevo:**
  - solo los sismos que llegan después de la carga inicial;
  - su hora de origen debe ser de **hace 1 h o menos** (valor configurable). EMSC publica altas tardías de sismos antiguos (T1.2).

#### HU-10 — Activar las notificaciones
Como U quiero activar los avisos cuando yo decida para que el navegador no me los pida al entrar.
```gherkin
Escenario: No se pide permiso al cargar
  Cuando abro la aplicación
  Entonces el navegador no muestra ninguna solicitud de permiso

Escenario: Conceder el permiso
  Cuando pulso «Activar avisos» y concedo el permiso
  Entonces el botón pasa a «Avisos activados» y muestra el umbral vigente «M ≥ 4.5»

Escenario: Denegar el permiso
  Cuando pulso «Activar avisos» y lo deniego
  Entonces aparece «Avisos bloqueados en el navegador» con instrucciones para reactivarlos
  Y el resto de la aplicación funciona igual

Escenario: Cambiar el umbral
  Cuando cambio el umbral a 5.0
  Entonces se guarda y se aplica a los sismos que lleguen después
```

#### HU-11 — Recibir una notificación por un sismo que supera el umbral
Como U quiero un aviso del navegador cuando haya un sismo relevante para enterarme aunque esté en otra pestaña.
```gherkin
Escenario: Sismo por encima del umbral, pestaña en segundo plano
  Dado avisos activados, umbral M ≥ 4.5 y Colombia marcada
  Y la pestaña de la aplicación en segundo plano
  Cuando llega un sismo nuevo M 5.2 en Colombia
  Entonces se muestra una notificación «M 5.2 · <lugar> · <hora local>»
  Y al pulsarla se enfoca la pestaña y se abre la ventana emergente del sismo

Esquema del escenario: Magnitud en el límite del umbral
  Dado avisos activados, umbral M ≥ 4.5 y Panamá marcada
  Cuando llega un sismo nuevo en Panamá con magnitud <recibida>, que se muestra como <mostrada>
  Entonces <resultado>
  Ejemplos:
    | recibida | mostrada | resultado            |
    | 4.5      | 4.5      | se notifica          |
    | 4.46     | 4.5      | se notifica          |
    | 4.44     | 4.4      | no se notifica       |

Escenario: Sismo en un país no marcado
  Dado avisos activados y solo Panamá marcada
  Cuando llega un sismo nuevo M 5.0 en España
  Entonces no se envía ninguna notificación

Escenario: Sismo por debajo del filtro de la lista
  Dado avisos activados, magnitud mínima de la lista 5.0 y Colombia marcada
  Cuando llega un sismo nuevo M 4.7 en Colombia
  Entonces se envía la notificación

Escenario: Sin duplicados
  Dado un sismo ya notificado
  Cuando llega de otra fuente o se revisa su magnitud
  Entonces no se envía una segunda notificación

Escenario: La carga inicial no notifica
  Cuando abro la aplicación con «30 días» y hay sismos M 6 en ese periodo
  Entonces no se envía ninguna notificación por ellos

Escenario: Alta tardía de un sismo antiguo
  Dado avisos activados y Panamá marcada
  Cuando EMSC publica por primera vez un sismo M 5.0 en Panamá con hora de origen de hace 3 h
  Entonces aparece en la lista si cumple los filtros
  Y no se envía ninguna notificación

Escenario: Revisión que cruza el umbral
  Dado un sismo mostrado como M 4.3 y no notificado
  Cuando la fuente lo revisa a M 4.8
  Entonces se notifica una sola vez
```

### Épica E5 — Ejecución local

#### HU-12 — Arrancar la aplicación en mi equipo
Como operador quiero arrancarla con un solo comando para usarla sin conocimientos técnicos.
```gherkin
Escenario: Arranque limpio
  Dado el repositorio recién clonado y la versión de Node fijada en STACK.lock
  Cuando ejecuto «npm ci» y «npm start»
  Entonces la consola muestra «Terremotos en vivo en http://localhost:3000»
  Y al abrir esa dirección se ve la aplicación con datos

Escenario: Cambiar el puerto
  Cuando ejecuto «PORT=3100 npm start»
  Entonces la consola muestra «Terremotos en vivo en http://localhost:3100»

Escenario: Puerto ocupado
  Dado que el puerto configurado está en uso
  Cuando ejecuto «npm start»
  Entonces la consola indica que el puerto está ocupado y cómo cambiarlo con la variable de entorno PORT
  Y el proceso termina con código distinto de 0

Escenario: Acceso desde otro equipo
  Cuando otro equipo de la red intenta abrir la aplicación
  Entonces la conexión es rechazada
```

## 6. Requisitos no funcionales

Equipo de referencia para las mediciones: el del Director (Linux Mint 22.3), con Chrome y Firefox estables actuales.

| ID | Categoría | Requisito | Cifra | Método de medición |
|---|---|---|---|---|
| RNF-01 | Latencia interna | Del momento en que el servidor recibe un sismo a su aparición en pantalla | p95 ≤ 2 s | Marca de tiempo al recibir y al pintar; 50 eventos de fixture inyectados en E2E |
| RNF-02 | Latencia extremo a extremo | De la **publicación en la fuente** a la pantalla. «Publicación» es `lastupdate` en EMSC y `updated` en USGS. La latencia de la agencia (de la hora de origen a la publicación) no la controla el proyecto: se registra pero no se exige. Referencia de T1.2: unos 4 min para un M 4.4 del IGC | **Tiempo real** (EMSC WebSocket): p95 ≤ 10 s; T1.2 midió unos 2 s de publicación a recepción. **Consulta periódica** (EMSC FDSN y USGS): p95 ≤ 90 s | **Métricas en los logs del servidor** (sustituyen a T1.3; se construyen en T4.3). Por cada sismo recibido se escribe una línea con la fuente, la zona, `publicación→recepción` y `origen→recepción`. Cada hora se escribe un resumen con p50 y p95 por fuente. Se verifica con la sesión de 24 h de RNF-16: p95 de `publicación→recepción` más el p95 de RNF-01 |
| RNF-03 | Rendimiento con 30 días | Carga de «30 días» con los tres países y magnitud mínima por defecto | ≤ 3 s hasta lista y mapa utilizables con 10 000 sismos; ninguna tarea del hilo principal > 200 ms al desplazar la lista o el mapa | T5.4 con un fixture sintético de 10 000 sismos y el panel Rendimiento de Chrome. El volumen real es de cientos de sismos (§8): 10 000 es el techo de diseño |
| RNF-04 | Rendimiento API | Respuesta de la carga inicial | p95 ≤ 300 ms desde memoria (≤ 24 h); ≤ 10 s si hay que consultar las fuentes (7 y 30 días), con tiempo límite por fuente | Prueba de carga local de 100 peticiones |
| RNF-05 | Consumo | Memoria del servidor con 30 días cargados | ≤ 300 MB de memoria residente | `ps` tras 24 h en marcha |
| RNF-06 | Resiliencia | Reconexión a una fuente caída con espera creciente; reconexión de la página sin perder eventos; tras un corte del WebSocket, la consulta periódica recupera lo publicado durante el corte | Primer reintento ≤ 5 s, espera máxima 60 s; 0 eventos perdidos tras un corte de 30 s | E2E cortando la red y simulando fuentes caídas con fixtures |
| RNF-07 | Seguridad (XSS) | Ningún texto de las fuentes se inserta como HTML; los enlaces solo aceptan `http`/`https` | 0 avisos de `eslint-plugin-no-unsanitized`; 0 ejecuciones con un fixture de cargas XSS (lugar, URL, autor) | Linter en CI + E2E con fixture malicioso |
| RNF-08 | Seguridad (CSP) | Política de seguridad de contenido restrictiva | Sin `unsafe-inline` ni `unsafe-eval` en scripts; solo los orígenes necesarios (teselas de Esri). Las fuentes de datos las consulta el servidor, no la página | Revisión de cabeceras en T5.3 |
| RNF-09 | Seguridad (exposición) | La aplicación solo atiende al propio equipo | 0 conexiones aceptadas desde otra IP | Intento de conexión desde otro equipo de la red |
| RNF-10 | Fuentes | Fuentes gratuitas, sin clave y conforme a sus términos (EMSC: CC BY 4.0; USGS: dominio público). Frecuencia de consulta acorde con la caché de cada fuente | Coste 0 €. **EMSC FDSN:** cada 30 s (su caché es `max-age=15`). **USGS:** cada 60 s (`max-age=60`; sus feeds se actualizan cada minuto). **EMSC WebSocket:** conexión única con ping cada 15 s. Con 5 zonas: ≤ 10 peticiones a EMSC y ≤ 5 a USGS por minuto | Registro de peticiones del servidor durante la sesión de RNF-16 |
| RNF-11 | Accesibilidad | WCAG 2.2 AA en ambos temas | 0 violaciones graves o críticas de axe; contraste ≥ 4,5:1 en texto; todo operable con teclado y foco visible; la lista es la alternativa accesible al mapa; animaciones de pulso desactivadas con `prefers-reduced-motion`; avisos de estado anunciados a lectores de pantalla | axe en E2E + revisión manual con teclado y Orca en T5.1 |
| RNF-12 | Compatibilidad | Navegadores y tamaños | Chrome y Firefox estables actuales en Linux; anchos de 360 a 2560 px | E2E con Playwright en ambos navegadores |
| RNF-13 | Idioma y zonas horarias | Toda la interfaz en español; horas según HU-08 | 100 % de textos en español; 5 zonas horarias correctas con cambio de horario | Pruebas unitarias con fechas de verano e invierno |
| RNF-14 | Datos personales | No se tratan datos personales en la entrega 1: no hay cuentas ni ubicación. Solo se guardan preferencias en el navegador | 0 datos personales enviados al servidor o a terceros | Revisión del tráfico de red en T5.3. Con el radio de la entrega 2 habrá que revisar RGPD y Ley 1581 |
| RNF-15 | Observabilidad | El servidor registra el arranque, el estado de cada fuente, las reconexiones y las métricas de latencia de RNF-02, sin datos sensibles | Una línea por cambio de estado de fuente; una línea por sismo recibido; un resumen por hora | Revisión de la consola en E2E |
| RNF-16 | Disponibilidad | Uso local arrancado a mano: no hay compromiso de disponibilidad. Debe aguantar sesiones largas | 24 h seguidas sin reinicio ni crecimiento de memoria por encima de RNF-05 | Sesión de 24 h con fuentes reales; sirve también para medir RNF-02 y RNF-10 |

## 7. Integraciones externas

Todas son de terceros, sin acuerdo de servicio, gratuitas y sin clave (verificado en T1.2). Las consume solo el servidor local.

| Integración | Dueño | URL | Uso en la entrega 1 | Términos y atribución |
|---|---|---|---|---|
| EMSC WebSocket | EMSC | `wss://www.seismicportal.eu/standing_order/websocket` | Tiempo real. Emite todo el mundo sin filtros; reenvía cada publicación de EMSC en unos 2 s. Incluye eventos del IGN y del IGC | CC BY 4.0 · «EMSC / seismicportal.eu (CC BY 4.0)» |
| EMSC FDSN | EMSC | `https://www.seismicportal.eu/fdsnws/event/1/query` | **Fuente principal de la consulta periódica** y de las cargas de 7 y 30 días. Filtra por magnitud, rectángulo y `updatedafter`; hasta 20 000 eventos por petición. Trae el catálogo del IGN (`auth=IGN`) y del IGC-UP (`auth=IGC`) | CC BY 4.0 · misma atribución |
| USGS FDSN | USGS | `https://earthquake.usgs.gov/fdsnws/event/1/query` | **Complemento.** Aporta sobre todo los M ≥ 4 de Colombia y Panamá; en España casi no tiene datos (1 sismo en 30 días). Hasta 20 000 eventos por petición | Dominio público · «U.S. Geological Survey» |
| IGN, SGC, IGC-UP | Agencias nacionales | — | **No se consumen directamente.** El IGN y el IGC llegan a través de EMSC. El SGC no tiene un servicio público de eventos. El IGC-UP no tiene feed | — |
| Teselas Esri gris oscuro y gris claro | Esri | — | Mapa base | Atribución de Esri, como hoy |
| Notificaciones del navegador | Navegador del usuario | — | Avisos (HU-10, HU-11) | — |

## 8. Datos

- **Sismo** (modelo común):
  - identificador, fuentes y enlaces, autor (`auth` de EMSC o `net` de USGS);
  - hora de origen (UTC) y fecha de última actualización;
  - latitud, longitud y profundidad, en positivo: EMSC la publica en negativo en `coordinates[2]`;
  - magnitud y tipo, lugar y país asignado.
- **Contornos de país:** polígonos simplificados con una franja marina de 100 km (D2), incluidos en el proyecto.
- **Preferencias** (en el navegador): países, magnitud mínima, periodo, tema, umbral y estado de los avisos.
- **Retención:** solo en memoria y como máximo 30 días. Al reiniciar el servidor se recargan desde las fuentes. No hay base de datos ni copias de seguridad, así que RPO y RTO no aplican.

**Volúmenes observados en T1.2** (2026-10-10):

| Zona | Fuente | Periodo y filtro | Eventos |
|---|---|---|---|
| España (rectángulo de la prueba) | EMSC FDSN | 30 días, M ≥ 1.5 | 364 (307 IGN, 49 EMSC, 8 ReNaSS) |
| España | USGS | 30 días, M ≥ 1.5 | 1 |
| Colombia continental | EMSC FDSN | 30 días, M ≥ 2.5 | 47 |
| Colombia continental | USGS | 30 días | 46, todos M ≥ 4.1 |
| Panamá y Colombia | EMSC FDSN | muestra, M ≥ 2.5 | 50 (23 IGC) |
| Panamá | — | secuencia desde el 2026-10-09 (M 7.7, 6.6 y 6.0) | más de 100 réplicas |
| Mundo | EMSC WebSocket | 12,5 min, horario nocturno europeo | 3 mensajes |

**Coherencia con RNF-03.** Con los filtros por defecto (M 2.0, tres países), el volumen real de 30 días es del orden de **cientos de sismos**. Es una estimación a partir de la tabla: incluso con la secuencia de Panamá queda por debajo de 1 000. El techo de 10 000 sismos de RNF-03 se **mantiene** como margen de diseño: unas 10 veces lo observado. Cubre la opción «Todas» las magnitudes, en la que el catálogo del IGN aporta muchos microsismos, y las secuencias sísmicas intensas. También está por debajo del límite de 20 000 eventos por petición de EMSC y USGS. No hace falta subir la magnitud por defecto de 2.0 (D5).

## 9. Restricciones

- Impuestas por el Director:
  - Node.js, en la versión de STACK.lock;
  - servidor Hono permanente;
  - solo uso local;
  - arranque manual con `npm start`;
  - sin PHP;
  - sin publicación;
  - solo español.
- Coste de operación: 0 €.
- Tecnología del mapa: Leaflet y teselas de Esri, como hoy.
- Puerto por defecto 3000, configurable con `PORT` (D3).

## 10. Riesgos y supuestos

| Tipo | Descripción | Mitigación |
|---|---|---|
| Riesgo | **Colombia:** sin API del SGC y con poca cobertura por debajo de M 4 en EMSC y USGS | Limitación documentada (§4) y nota visible (HU-07). Volver a buscar un servicio del SGC en una versión posterior |
| Riesgo | Dependencia fuerte de EMSC: es fuente de tiempo real y fuente principal de la consulta periódica | USGS como complemento para M ≥ 4; indicador de fuente caída (HU-02); el GeoRSS del IGN como posible respaldo posterior |
| Riesgo | El WebSocket de EMSC es inestable; solo se probaron unos 12 min | La consulta periódica con `updatedafter` cubre los huecos (RNF-06); la sesión de 24 h de RNF-16 lo comprueba |
| Riesgo | EMSC envía altas tardías de sismos antiguos como `create` | No se notifican los sismos con hora de origen de hace más de 1 h (E4) |
| Riesgo | Los rectángulos de T1.2 no cubren la franja de 100 km en algunos lados | T4.2 los amplía y una prueba verifica que contienen el contorno ampliado (E2) |
| Riesgo | Natural Earth simplificado puede omitir islas pequeñas (San Andrés, Providencia, islotes de Alborán) | Prueba unitaria por territorio (T4.2) |
| Riesgo | Los navegadores frenan las pestañas en segundo plano | E2E con la pestaña en segundo plano (HU-11) |
| Riesgo | Se toma la aplicación por un sistema de alerta oficial | Aviso permanente y enlaces a IGN/112, UNGRD/SGC y SINAPROC |
| Supuesto | Un solo usuario, una o pocas pestañas abiertas | — |
| Supuesto | Las fuentes siguen siendo gratuitas y sin clave | Confirmado en T1.2 para EMSC y USGS |

## 11. Decisiones del Director

Aprobadas el 2026-10-10 con las opciones por defecto propuestas en la versión 0.1. No quedan preguntas abiertas para la entrega 1.

| # | Tema | Decisión | Dónde se aplica |
|---|---|---|---|
| D1 | Umbral de notificación | **M ≥ 4.5**, comparando la magnitud redondeada a un decimal, tal como se muestra. Una M 4.5 exacta se notifica. Precisa el «M > 4.5» del plan | E4, HU-10, HU-11, §4 punto 8 |
| D2 | Franja marina | **100 km, igual para los tres países**, como valor configurable. Se aceptan algunos sismos de países vecinos cerca de la frontera | HU-03, E2, §8 |
| D3 | Puerto local | **3000**, configurable con la variable de entorno `PORT` | HU-12, §9 |
| D4 | Ámbito de las notificaciones | **Solo los países marcados.** Se notifica aunque el sismo esté por debajo de la magnitud mínima de la lista; el filtro de tiempo no afecta a los avisos | E4, HU-11 |
| D5 | Filtros iniciales | Magnitud mínima **2.0**, elegida en una lista (Todas, 1.0, 2.0, 2.5, 3.0, 4.0, 4.5, 5.0), y periodo **«Últimas 24 h»**. Los volúmenes de T1.2 confirman que 2.0 cumple RNF-03 | HU-04, HU-05, HU-06 |

## Anexo — Trazabilidad capacidad → historia

| Capacidad (plan) | Historias |
|---|---|
| A1 datos en vivo | HU-01, HU-02 |
| A2 magnitud | HU-04 |
| A3, A3b países | HU-03 |
| A5 tiempo | HU-05 |
| Preferencias guardadas (plan §3.5) | HU-06 |
| Mapa y lista, aviso y atribución | HU-07 |
| A8 hora local | HU-08 |
| A10 tema | HU-09 |
| A7 notificaciones (solo sismos) | HU-10, HU-11 |
| A9 ejecución local | HU-12 |
| A11 español | RNF-13 |
