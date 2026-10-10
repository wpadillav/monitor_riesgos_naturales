# PRD — Terremotos en vivo v2 · Entrega 1 (versión mínima)

**Versión:** 0.1 · **Estado:** borrador, pendiente de aprobación del Director 🔒 · **Autor:** analista-requerimientos (T2.1) · **Fecha:** 2026-10-10

**Base:** [02-plan.md](02-plan.md), aprobado el 2026-10-10, y [.fabrica/estado.md](../.fabrica/estado.md). Los valores marcados **PENDIENTE T1.2** dependen de `docs/investigacion-fuentes.md`, que aún no existe. Los marcados **PENDIENTE T1.3** dependen de la medición de latencias. Las decisiones del Director se citan, no se reabren.

---

## 1. Contexto y problema

Hoy [index.html](../index.html) muestra los sismos de **todo el mundo** de un único feed del USGS. Refresca cada 60 s, no filtra por país y no avisa si la pestaña no está a la vista. El Director quiere enterarse **cuanto antes** de los sismos de **España, Colombia y Panamá**, ver solo los que le interesan y recibir un aviso del navegador cuando uno supere un umbral. Todo debe funcionar en su equipo, sin publicar nada en internet.

## 2. Objetivos de negocio

| # | Objetivo | Métrica | Meta | Historias |
|---|---|---|---|---|
| O1 | Ver los sismos lo antes posible | Retardo entre la recepción del sismo en el servidor local y su aparición en pantalla (p95) | ≤ 2 s (ver RNF-01) | HU-01, HU-02 |
| O2 | Ver solo lo relevante | % de sismos mostrados que cumplen los filtros activos | 100 % | HU-03, HU-04, HU-05, HU-06 |
| O3 | Enterarse sin mirar la pantalla | Sismos nuevos que superan el umbral y se notifican, con la pestaña en segundo plano | 100 %, sin duplicados | HU-10, HU-11 |
| O4 | Comprender el sismo de un vistazo | Cada sismo muestra magnitud, lugar, profundidad, hora local del país y «hace X min» | 100 % de los sismos | HU-07, HU-08, HU-09 |
| O5 | Operarlo en local sin coste | Arranque con `npm ci && npm start` desde un repositorio limpio; coste de las fuentes | Funciona al primer intento; 0 € | HU-12 |
| O6 | No inducir a error | Aviso «Solo informativo…» y atribución visibles | Siempre visibles, en ambos temas y en móvil | HU-07 |

## 3. Usuarios y roles

| Rol | Necesidad principal | Permisos |
|---|---|---|
| Usuario local (el Director) | Consultar sismos de ES, CO y PA y recibir avisos | Todo lo que ofrece la interfaz. No hay inicio de sesión ni cuentas. |
| Operador local (la misma persona) | Arrancar y parar la aplicación | Ejecuta `npm start` en su máquina. |

No hay más roles. La aplicación solo atiende peticiones del propio equipo (RNF-09).

## 4. Alcance

**Incluye (entrega 1):** A1 datos en vivo · A2 filtro de magnitud · A3/A3b filtro de país con los tres marcados por defecto · A5 filtro de tiempo · mapa y lista · A8 hora local · A10 modo oscuro/día · A7 notificaciones de sismos · A11 solo español · A9 uso local con `npm start`.

**Comportamiento actual que debe preservarse** (de `index.html`):
1. Aviso «Solo informativo. No es un sistema de alerta temprana: sigue siempre los canales oficiales de tu país.» y la atribución de los datos y de Esri. La atribución se amplía a cada fuente que se use.
2. Lista ordenada por hora del sismo, de más reciente a más antiguo. Al pulsar un elemento, el mapa vuela al sismo y abre su ventana emergente.
3. Ventana emergente con magnitud (1 decimal), lugar, profundidad (km), fecha y hora, coordenadas (2 decimales) y enlace «Más info» a la fuente.
4. Radio del marcador proporcional a la magnitud, con mínimo visible; animación de pulso en los sismos de la última hora.
5. Línea de estado con el número de sismos y la hora de la última actualización; mensaje de error con reintento automático.
6. Se descartan los eventos sin magnitud.
7. Por debajo de 700 px de ancho, el mapa va arriba y la lista abajo.
8. Apertura automática de la ventana emergente de un sismo nuevo que supere el umbral de notificación (hoy: M ≥ 4.5; ver P1).

**Se corrige:** los textos de las fuentes que hoy se insertan sin escapar (RNF-07).

### Fuera de alcance / entrega 2

| Tema | Dónde queda |
|---|---|
| Avisos de tsunami (A6) y su notificación | Entrega 2 |
| Filtro de radio alrededor de Madrid, Benidorm o la ubicación del usuario (A4); por eso la entrega 1 **no pide la ubicación** | Entrega 2 |
| Publicación en internet, dominio, HTTPS público | Prohibido por el Director |
| Notificaciones con el navegador cerrado (push) | Versión posterior |
| Arranque automático (systemd), proxy de Apache | Descartado: arranque manual |
| Cuentas de usuario, app móvil, PWA | No incluido |
| Histórico de más de 30 días | No incluido |
| Otros idiomas | No incluido |
| Alerta temprana de cualquier tipo | Imposible por diseño; se mantiene el aviso |

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
  Dado un sismo ya mostrado que procede de EMSC
  Cuando la agencia nacional publica el mismo evento
  Entonces sigue habiendo un solo elemento en la lista y en el mapa
  Y sus datos son los de la agencia nacional, con enlace a todas las fuentes

Escenario: Una fuente revisa la magnitud
  Dado un sismo mostrado como M 3.8
  Cuando la fuente lo revisa a M 4.1
  Entonces el mismo elemento muestra M 4.1, sin crear un elemento nuevo
```
Los umbrales de tiempo, distancia y magnitud para considerar duplicados se fijan con datos reales: **PENDIENTE T1.2**.

#### HU-02 — Seguir funcionando si falla una fuente o la conexión
Como U quiero que la página se recupere sola para no tener que vigilarla.
```gherkin
Escenario: Cae una fuente
  Dado la aplicación recibiendo de EMSC, USGS y la agencia nacional
  Cuando la fuente USGS deja de responder
  Entonces siguen apareciendo los sismos de las demás fuentes
  Y en ≤ 60 s la línea de estado indica «USGS no disponible»
  Y al volver USGS el indicador desaparece sin intervención

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

Regla común: los filtros viajan al servidor en la carga inicial y en la suscripción a los datos en vivo. El servidor solo envía lo que los cumple y traslada a cada fuente la magnitud mínima y el rectángulo de cada país.

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
  Dado solo España marcada y una franja marina de <ancho P2>
  Cuando hay un sismo a menos de esa distancia de la costa de Almería
  Entonces se muestra
  Y un sismo a mayor distancia de cualquier costa española no se muestra

Escenario: Ningún país marcado
  Cuando desmarco los tres
  Entonces no se hace ninguna consulta
  Y la lista muestra «Selecciona al menos un país»
```
Si un sismo cae en la franja de dos países (frontera Colombia-Panamá), se muestra si cualquiera de los dos está marcado, y se le asigna el país con la costa o frontera más cercana.

#### HU-04 — Filtrar por magnitud mínima
Como U quiero fijar una magnitud mínima para no ver microsismos.
```gherkin
Escenario: Subir la magnitud mínima
  Dado la magnitud mínima en <valor por defecto P5>
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
Escenario: Opciones disponibles
  Entonces el selector ofrece «Última hora», «Últimas 24 h», «7 días» y «30 días»

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
  Entonces se usan los valores por defecto, sin error visible
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

Escenario: Aviso y atribución
  Dado cualquier tema y cualquier ancho de pantalla desde 360 px
  Entonces se ven el aviso «Solo informativo…» y la atribución de las fuentes y de Esri

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
Zonas: península, Baleares, Ceuta y Melilla → `Europe/Madrid`/`Africa/Ceuta` (misma hora); Canarias → `Atlantic/Canary`; Colombia → `America/Bogota`; Panamá → `America/Panama`. Se respeta el horario de verano.

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

#### HU-10 — Activar las notificaciones
Como U quiero activar los avisos cuando yo decida para que el navegador no me los pida al entrar.
```gherkin
Escenario: No se pide permiso al cargar
  Cuando abro la aplicación
  Entonces el navegador no muestra ninguna solicitud de permiso

Escenario: Conceder el permiso
  Cuando pulso «Activar avisos» y concedo el permiso
  Entonces el botón pasa a «Avisos activados» y muestra el umbral vigente

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
  Dado avisos activados, umbral por defecto y Colombia marcada
  Y la pestaña de la aplicación en segundo plano
  Cuando llega un sismo nuevo M 5.2 en Colombia
  Entonces se muestra una notificación «M 5.2 · <lugar> · <hora local>»
  Y al pulsarla se enfoca la pestaña y se abre la ventana emergente del sismo

Escenario: Magnitud exactamente en el umbral
  Dado el umbral por defecto
  Cuando llega un sismo nuevo M 4.5
  Entonces se notifica o no según la respuesta del Director a P1

Escenario: Sin duplicados
  Dado un sismo ya notificado
  Cuando llega de otra fuente o se revisa su magnitud
  Entonces no se envía una segunda notificación

Escenario: La carga inicial no notifica
  Cuando abro la aplicación con «30 días» y hay sismos M 6 en ese periodo
  Entonces no se envía ninguna notificación por ellos

Escenario: Revisión que cruza el umbral
  Dado un sismo mostrado como M 4.3 y no notificado
  Cuando la fuente lo revisa a M 4.8
  Entonces se notifica una sola vez
```
El ámbito geográfico de los avisos depende de P4.

### Épica E5 — Ejecución local

#### HU-12 — Arrancar la aplicación en mi equipo
Como operador quiero arrancarla con un solo comando para usarla sin conocimientos técnicos.
```gherkin
Escenario: Arranque limpio
  Dado el repositorio recién clonado y Node 24 de STACK.lock
  Cuando ejecuto «npm ci» y «npm start»
  Entonces la consola muestra «Terremotos en vivo en http://localhost:<puerto P3>»
  Y al abrir esa dirección se ve la aplicación con datos

Escenario: Puerto ocupado
  Dado que el puerto configurado está en uso
  Cuando ejecuto «npm start»
  Entonces la consola indica que el puerto está ocupado y cómo cambiarlo con una variable de entorno
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
| RNF-02 | Latencia extremo a extremo | De la publicación en la fuente a la pantalla. Tiempo real (EMSC WebSocket): ≤ 10 s; consulta periódica: ≤ 90 s (objetivos del plan §6) | Valores definitivos **PENDIENTE T1.3** | T1.3: registro ≥ 24 h comparando hora de publicación y hora de pintado, por fuente y país |
| RNF-03 | Rendimiento con 30 días | Carga de «30 días» con los tres países y magnitud mínima por defecto | ≤ 3 s hasta lista y mapa utilizables con 10 000 sismos; ninguna tarea del hilo principal > 200 ms al desplazar la lista o el mapa | T5.4 con un fixture sintético de 10 000 sismos y el panel Rendimiento de Chrome. Volumen real esperado: **PENDIENTE T1.2** |
| RNF-04 | Rendimiento API | Respuesta de la carga inicial | p95 ≤ 300 ms desde memoria (≤ 24 h); ≤ 10 s si hay que consultar las fuentes (7 y 30 días), con tiempo límite por fuente | Prueba de carga local de 100 peticiones |
| RNF-05 | Consumo | Memoria del servidor con 30 días cargados | ≤ 300 MB de memoria residente | `ps` tras 24 h en marcha |
| RNF-06 | Resiliencia | Reconexión a una fuente caída con espera creciente; reconexión de la página sin perder eventos | Primer reintento ≤ 5 s, espera máxima 60 s; 0 eventos perdidos tras un corte de 30 s | E2E cortando la red y simulando fuentes caídas con fixtures |
| RNF-07 | Seguridad (XSS) | Ningún texto de las fuentes se inserta como HTML; los enlaces solo aceptan `http`/`https` | 0 avisos de `eslint-plugin-no-unsanitized`; 0 ejecuciones con un fixture de cargas XSS (lugar, URL, autor) | Linter en CI + E2E con fixture malicioso |
| RNF-08 | Seguridad (CSP) | Política de seguridad de contenido restrictiva | Sin `unsafe-inline` ni `unsafe-eval` en scripts; solo los orígenes necesarios (teselas, fuentes) | Revisión de cabeceras en T5.3 |
| RNF-09 | Seguridad (exposición) | La aplicación solo atiende al propio equipo | 0 conexiones aceptadas desde otra IP | Intento de conexión desde otro equipo de la red |
| RNF-10 | Fuentes | Uso de fuentes gratuitas, sin clave y conforme a sus términos; frecuencia de consulta | Coste 0 €; consulta periódica ≈ 30 s salvo límite menor de la fuente (**PENDIENTE T1.2**) | Revisión de `investigacion-fuentes.md` y del registro de peticiones |
| RNF-11 | Accesibilidad | WCAG 2.2 AA en ambos temas | 0 violaciones graves o críticas de axe; contraste ≥ 4,5:1 en texto; todo operable con teclado y foco visible; la lista es la alternativa accesible al mapa; animaciones de pulso desactivadas con `prefers-reduced-motion`; avisos de estado anunciados a lectores de pantalla | axe en E2E + revisión manual con teclado y Orca en T5.1 |
| RNF-12 | Compatibilidad | Navegadores y tamaños | Chrome y Firefox estables actuales en Linux; anchos de 360 a 2560 px | E2E con Playwright en ambos navegadores |
| RNF-13 | Idioma y zonas horarias | Toda la interfaz en español; horas según HU-08 | 100 % de textos en español; 5 zonas horarias correctas con cambio de horario | Pruebas unitarias con fechas de verano e invierno |
| RNF-14 | Datos personales | No se tratan datos personales en la entrega 1: no hay cuentas ni ubicación. Solo se guardan preferencias en el navegador | 0 datos personales enviados al servidor o a terceros | Revisión del tráfico de red en T5.3. Con el radio de la entrega 2 habrá que revisar RGPD y Ley 1581 |
| RNF-15 | Observabilidad | El servidor registra arranque, estado de cada fuente y reconexiones, sin datos sensibles | Una línea por cambio de estado de fuente | Revisión de la consola en E2E |
| RNF-16 | Disponibilidad | Uso local arrancado a mano: no hay compromiso de disponibilidad. Debe aguantar sesiones largas | 24 h seguidas sin reinicio ni crecimiento de memoria por encima de RNF-05 | Prueba de 24 h (puede coincidir con T1.3) |

## 7. Integraciones externas

Todas son de terceros, sin acuerdo de servicio. Los detalles (URL, formato, términos, límites) son **PENDIENTE T1.2**.

| Integración | Dueño | Uso en la entrega 1 |
|---|---|---|
| EMSC WebSocket | EMSC | Tiempo real |
| EMSC FDSN | EMSC | Consulta periódica y rangos largos |
| USGS FDSN | USGS | Consulta periódica y respaldo |
| Sismos IGN | Instituto Geográfico Nacional (España) | Fuente nacional de España |
| SGC | Servicio Geológico Colombiano | Fuente nacional de Colombia |
| IGC-UP | Instituto de Geociencias, Universidad de Panamá | Fuente nacional de Panamá, si existe feed; si no, EMSC/USGS |
| Teselas Esri gris oscuro y gris claro | Esri | Mapa base |
| Notificaciones del navegador | Navegador del usuario | Avisos (HU-10, HU-11) |

## 8. Datos

- **Sismo** (modelo común): identificador, fuentes y enlaces, hora de origen (UTC), latitud, longitud, profundidad, magnitud y tipo, lugar, país asignado, fecha de última actualización.
- **Contornos de país**: polígonos simplificados con franja marina (P2), incluidos en el proyecto.
- **Preferencias** (en el navegador): países, magnitud mínima, periodo, tema, umbral y estado de los avisos.
- **Retención:** solo en memoria y como máximo 30 días; al reiniciar el servidor se recargan desde las fuentes. Sin base de datos ni copias de seguridad (RPO/RTO no aplican).
- **Volumen:** objetivo de diseño de 10 000 sismos en 30 días (RNF-03); volumen real **PENDIENTE T1.2**.

## 9. Restricciones

- Impuestas por el Director: Node.js (versión según STACK.lock), servidor Hono permanente, solo uso local, arranque manual con `npm start`, sin PHP, sin publicación, solo español.
- Coste de operación: 0 €.
- Tecnología del mapa: Leaflet y teselas de Esri, como hoy.

## 10. Riesgos y supuestos

| Tipo | Descripción | Mitigación |
|---|---|---|
| Riesgo | IGC-UP o SGC no tienen un feed legible por programa | Respaldo con EMSC/USGS (plan §7) |
| Riesgo | El WebSocket de EMSC es inestable | La consulta periódica cubre la falta; RNF-06 |
| Riesgo | Natural Earth simplificado puede omitir islas pequeñas (San Andrés, Providencia, islotes de Alborán) | Prueba unitaria por territorio (T4.2) |
| Riesgo | Los navegadores frenan las pestañas en segundo plano | E2E con la pestaña en segundo plano (HU-11) |
| Riesgo | Se toma la aplicación por un sistema de alerta oficial | Aviso permanente y enlaces a IGN/112, UNGRD/SGC y SINAPROC |
| Supuesto | Un solo usuario, una o pocas pestañas abiertas | — |
| Supuesto | Las fuentes son gratuitas y sin clave | A confirmar en T1.2 |

## 11. Preguntas abiertas para el Director

Cada una incluye una opción por defecto: si el Director aprueba el PRD sin responder, se aplica esa opción.

1. **Umbral de notificación: ¿M > 4.5 o M ≥ 4.5? ¿Notifica una M 4.5 exacta?** Las fuentes publican la magnitud con un decimal. Con «> 4.5» el primer valor que notifica es 4.6. El `index.html` actual y el feed «4.5+» del USGS incluyen el 4.5.
   *Por defecto:* **M ≥ 4.5**, comparando la magnitud redondeada a un decimal, tal como se muestra. Así nunca se notifica un valor que en pantalla aparezca como 4.5 si la regla dice lo contrario.
2. **Ancho de la franja marina por país.** Opciones: 12 millas náuticas (≈ 22 km, mar territorial), 50 km o 100 km.
   *Por defecto:* **100 km, igual para los tres países**, guardado como valor configurable. Así entran sismos del mar de Alborán, del golfo de Cádiz cercano y de la costa pacífica de Colombia y Panamá. A cambio entrarán algunos sismos de países vecinos cerca de la frontera.
3. **Puerto local por defecto.** Apache ya usa el 80.
   *Por defecto:* **3000**, que se puede cambiar con la variable de entorno `PORT`.
4. **¿Las notificaciones respetan los países marcados?**
   *Por defecto:* **sí.** Se notifica un sismo nuevo si su país está marcado y su magnitud cumple el umbral, aunque esté por debajo de la magnitud mínima del filtro de la lista. El filtro de tiempo no afecta a los avisos.
5. **Valores por defecto de los filtros de magnitud y tiempo.**
   *Por defecto:* magnitud mínima **2.0**, elegida en una lista (Todas, 1.0, 2.0, 2.5, 3.0, 4.0, 4.5, 5.0), y periodo **«Últimas 24 h»**, como hoy. El valor 2.0 se ajustará si T1.2 muestra volúmenes que incumplan RNF-03.

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
