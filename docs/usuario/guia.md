# Guía de usuario — Monitor de Riesgos Naturales

**Versión:** 2.0.0, entrega 1 (sismos en vivo) · **Fecha:** 2026-10-12

Esta guía explica cómo se usa la aplicación: elegir qué sismos ver, leer la lista y el mapa, entender el indicador «en vivo» y recibir avisos. Para instalarla y arrancarla, sigue el [README](../../README.md#uso-local).

> [!WARNING]
> **Solo informativo. No es un sistema de alerta temprana: sigue siempre los canales oficiales de tu país.** IGN y 112 en España, SGC y UNGRD en Colombia, SINAPROC en Panamá. Los enlaces están en el pie de la página.

## Antes de empezar

1. Arranca la aplicación con `npm start` y deja abierta esa terminal.
2. Abre <http://localhost:3000> en Chrome o Firefox.
3. Espera a que el indicador de la cabecera pase de «Cargando sismos…» a «En vivo».

La pantalla tiene cuatro zonas:

- **Cabecera:** el título, el selector de tema y el indicador «en vivo».
- **Panel izquierdo:** los filtros, los avisos y la lista de sismos. En el móvil y en ventanas de 900 px de alto o menos, los filtros y los avisos se pliegan en el botón «Filtros y avisos».
- **Mapa:** a la derecha en el escritorio y arriba en el móvil.
- **Pie:** el aviso «Solo informativo», las fuentes de datos y los canales oficiales. En el móvil, los enlaces están en «Fuentes y canales oficiales».

![Vista de escritorio en tema oscuro con el indicador «En vivo», la lista de sismos a la izquierda y el mapa con la leyenda de magnitudes a la derecha.](../diseno/capturas/escritorio-oscuro.png)

## Cómo elegir qué sismos ver

Los filtros se aplican al momento: no hay botón de «Buscar».

| Filtro | Opciones | Por defecto |
|---|---|---|
| **Países** | «España», «Colombia» y «Panamá» | Los tres |
| **Magnitud mínima** | «Todas», «1.0 o más», «2.0 o más», «2.5 o más», «3.0 o más», «4.0 o más», «4.5 o más» y «5.0 o más» | «2.0 o más» |
| **Periodo** | «Última hora», «Últimas 24 h», «7 días» y «30 días» | «Últimas 24 h» |

- **España** incluye Canarias, Baleares, Ceuta y Melilla. **Colombia** incluye San Andrés. Cada país cubre también hasta 100 km de mar desde la costa.
- Si desmarcas todos los países, la lista muestra «Selecciona al menos un país» y no se consulta nada.
- Si ningún sismo cumple los filtros, verás «No hay sismos con estos filtros». Prueba a bajar la magnitud mínima o a elegir un periodo más largo.
- Con «7 días» o «30 días» la consulta puede tardar unos segundos. Mientras tanto, la lista anterior sigue visible y el indicador dice «Actualizando…».
- El navegador **recuerda tus filtros** para la próxima vez.
- Para volver a los valores por defecto, pulsa **«Restablecer filtros»**. El botón solo aparece si has cambiado algo.

**En el móvil:** pulsa «Filtros y avisos» para desplegar el panel. Debajo del botón ves un resumen, por ejemplo «3 países · 2.0 o más · Últimas 24 h». Cuando termines, pulsa «Ver {n} sismos» para plegar el panel e ir a la lista.

## Cómo leer la lista

La lista muestra primero los sismos más recientes. Cada fila tiene:

```
[4.2]  Golfo de Urabá
       Colombia · 12 km de profundidad
       hace 8 min · 07:42 (hora de Colombia)
```

- **El número de color** es la magnitud, con un decimal. Los colores se explican más abajo.
- **La primera línea** es el lugar, tal como lo publica la fuente. Puede venir en inglés (por ejemplo, «Panama-Costa Rica Border Region»).
- **La segunda línea** es el país y la profundidad.
- **La tercera línea** dice hace cuánto fue y a qué hora **del lugar del sismo**: «hora peninsular», «hora de Canarias», «hora de Colombia» o «hora de Panamá». Si tiene más de 24 h, también muestra el día: «hace 3 días · 07/10 22:15 (hora peninsular)».
- **«Nuevo»** marca los sismos que han llegado mientras tenías la página abierta (durante 10 min).
- **«Revisado»** indica que la fuente cambió la magnitud después de publicarla.

Pulsa un sismo para verlo en el mapa: el mapa se desplaza hasta él y abre su ventana con los detalles.

Con el teclado, usa las flechas arriba y abajo para recorrer la lista y pulsa Intro para ver el sismo en el mapa.

## Cómo leer el mapa

- **Cada círculo es un sismo.** El color indica la magnitud y el tamaño crece con ella.
- **El anillo discontinuo** alrededor de un círculo indica que el sismo es de la última hora.
- **La leyenda** («Magnitud») está en una esquina del mapa. En el móvil se abre con el botón «Leyenda».
- Usa los botones «Acercar» (+) y «Alejar» (−), la rueda del ratón o los gestos de pellizco.

Al pulsar un círculo se abre la ventana del sismo:

```
M 4.2 · Golfo de Urabá
Colombia
Fuente: EMSC · autor: IGN
Hora local   10/10/2026 07:42:15 (hora de Colombia)
             hace 8 min
Profundidad  12 km
Coordenadas  8.31, -76.95
Magnitud revisada: antes 3.8
Más info en EMSC ↗
```

- **«Fuente»** es el servicio del que llega el dato (EMSC o USGS) y **«autor»**, la agencia que calculó el sismo.
- **«Magnitud revisada»** solo aparece si la fuente cambió la magnitud.
- **«Más info en EMSC»** o **«Más info en USGS»** abre la ficha del sismo en la web de la fuente, en otra pestaña.

Si el mapa de fondo no carga, verás «No se puede cargar el mapa de fondo. Los sismos siguen en la lista y en el mapa.» Los círculos y la lista siguen funcionando.

## Qué significa cada color de magnitud

Los colores son los mismos en los dos temas. Además del color, la magnitud se distingue por el número, por el tamaño del círculo y por el grosor del borde, que es más grueso desde 4.5.

| Color | Magnitud (texto de la leyenda) |
|---|---|
| Gris | «Menos de 3.0» |
| Amarillo | «3.0 a 3.9» |
| Naranja | «4.0 a 4.4» |
| Rojo | «4.5 a 5.9» |
| Morado | «6.0 o más» |

La magnitud se redondea a un decimal antes de colorearla, filtrarla o compararla con el umbral de avisos. Un sismo de 4.46 se muestra como «4.5» y se trata como 4.5.

## Qué indica el indicador «en vivo»

El indicador está bajo el título. Además del color, cada estado tiene un icono con una forma distinta.

| Texto | Qué pasa | Qué hacer |
|---|---|---|
| «Cargando sismos…» | Primera carga al abrir la página | Esperar unos segundos |
| «En vivo» · 107 sismos · actualizado a las 05:31:19 | Todo funciona. Los sismos nuevos aparecen solos | Nada |
| «Actualizando…» | Se están aplicando los filtros que acabas de cambiar | Esperar. Con «7 días» o «30 días» puede tardar unos segundos |
| «Reconectando…» | Se cortó la conexión en vivo y se está recuperando | Esperar. Si dura más de unos minutos, recarga la página |
| «Sin conexión con el servidor local. Reintentando…» | El navegador no llega al servidor | Comprueba que la terminal de `npm start` sigue abierta y sin errores. Si la cerraste, vuelve a arrancarlo |
| «El servidor local ha devuelto un error. Reintentando…» | El servidor responde, pero con un error | Esperar al reintento. Si se repite, revisa los mensajes de la terminal |
| «Sin actualizaciones en vivo: hay demasiadas pestañas abiertas. Cierra alguna. Reintentando…» | Hay más pestañas de la aplicación conectadas de las que admite el servidor | Cierra las pestañas de la aplicación que no uses |
| «Sin consulta: no hay países marcados» | No hay ningún país marcado | Marca al menos un país |
| «Datos cargados» | El navegador no admite la conexión en vivo: ves los datos, pero no se actualizan solos | Usa Chrome o Firefox actualizados |

La hora del indicador es la de **tu equipo**, no la del sismo.

Debajo del indicador puede aparecer una segunda línea con un triángulo cuando falla una fuente:

| Texto | Qué significa |
|---|---|
| «USGS no disponible» o «EMSC no disponible» | Esa fuente no responde. Los sismos siguen llegando por la otra |
| «EMSC y USGS no disponibles» | Las dos fuentes de consulta no responden |
| «Tiempo real no disponible: los sismos nuevos pueden tardar hasta 1 min.» | Falla la conexión en tiempo real con EMSC. Los sismos llegan por la consulta periódica, con más retraso |
| «Las fuentes de datos no responden. Se muestran los últimos sismos recibidos.» | Ninguna fuente responde desde hace 2 min o más. La lista se conserva |

La línea desaparece sola cuando la fuente vuelve.

## Cómo activar los avisos

Los avisos son notificaciones del navegador. Te llegan aunque la pestaña esté en segundo plano o estés en otra ventana.

1. Abre el bloque **«Avisos»**, debajo de los filtros (en el móvil, dentro de «Filtros y avisos»).
2. Pulsa **«Activar avisos»**. La aplicación nunca pide el permiso al cargar: solo cuando pulsas este botón.
3. El navegador te pregunta si permites las notificaciones. Elige **«Permitir»**.
4. El bloque pasa a **«Avisos activados»**.
5. Pulsa **«Probar aviso»**. Debe aparecer una notificación «Aviso de prueba» con el texto «Así verás los avisos de sismos de magnitud 4.5 o más.»
6. **Deja la pestaña abierta.** Si la cierras, no llegan avisos.

Con los avisos activados también puedes:

- **Cambiar el umbral** en «Avisar desde»: «4.0 o más», «4.5 o más» (por defecto), «5.0 o más», «5.5 o más» o «6.0 o más».
- **Desactivarlos** con «Desactivar avisos». Para volver a activarlos, pulsa «Activar avisos»: no se vuelve a pedir el permiso.

### Qué sismos generan un aviso

- Solo los sismos **nuevos**, que llegan después de abrir la página. Los de la carga inicial nunca avisan.
- Solo los de los **países marcados**.
- Solo los de magnitud igual o mayor que el umbral, **aunque estén por debajo de la magnitud mínima de la lista**. El periodo no influye.
- Solo si ocurrieron hace **1 h o menos**. A veces una agencia publica tarde un sismo antiguo: ese sismo aparece en la lista, pero no avisa.
- **Un solo aviso por sismo**, aunque llegue de dos fuentes o cambie su magnitud. Si una revisión hace que un sismo pase a superar el umbral, avisa una vez.
- Si llegan **más de 3 avisos en un minuto** (por ejemplo, en una serie de réplicas), los siguientes se agrupan en uno: «7 sismos de magnitud 4.5 o más».

Un aviso tiene este aspecto:

```
M 5.2 · Golfo de Urabá · 07:42 (hora de Colombia)
Colombia · 12 km de profundidad. Pulsa para verlo en el mapa.
Fuente: EMSC · autor: IGC. Solo informativo.
```

Al pulsarlo, el navegador vuelve a la pestaña, centra el mapa en el sismo y abre su ventana.

Si tienes la pestaña a la vista cuando llega un sismo nuevo que alcanza el umbral y cumple tus filtros, su ventana del mapa se abre sola. Esto pasa aunque no hayas activado los avisos.

### Qué hacer si los avisos no llegan

Pulsa primero «Probar aviso».

**Si el aviso de prueba no aparece:**

1. **Mira el estado del bloque «Avisos».**
   - «Avisos bloqueados en el navegador»: pulsa el icono que hay a la izquierda de la dirección (candado o ajustes), busca «Notificaciones», elige «Permitir» y pulsa «Comprobar de nuevo».
   - «Avisos no disponibles»: este navegador no admite avisos. Usa Chrome o Firefox de escritorio actualizados.
   - «Avisos desactivados»: pulsa «Activar avisos».
2. **Revisa las notificaciones del sistema operativo.** El modo «No molestar» o «Concentración» oculta las notificaciones. Comprueba también que tu navegador tenga permiso para mostrar notificaciones en la configuración del sistema.
3. **Abre la aplicación siempre en la misma dirección.** El permiso se da a cada dirección por separado: `http://localhost:3000` y `http://localhost:3100` son distintas.

**Si el aviso de prueba aparece, pero no los de los sismos:**

1. ¿La pestaña sigue abierta? Si la cerraste, no hay avisos.
2. ¿El indicador dice «En vivo»? Si dice «Sin conexión…» o «Reconectando…», no llegan sismos nuevos.
3. ¿Está marcado el país del sismo?
4. ¿La magnitud alcanza el umbral de «Avisar desde»? Compara con la magnitud redondeada que ves en la lista.
5. ¿Es un sismo nuevo y reciente? Los de la carga inicial y los que tienen más de 1 h al publicarse no avisan.
6. ¿Ya avisó de ese sismo? Solo hay un aviso por sismo.

## Cómo cambiar el tema

En la cabecera hay tres opciones:

- **«Sistema»** (por defecto): sigue el tema claro u oscuro de tu equipo y cambia solo si cambias el del equipo.
- **«Oscuro»:** fondo oscuro siempre.
- **«Día»:** fondo claro siempre.

El mapa cambia de estilo con el tema. El navegador recuerda tu elección.

## Qué guarda la aplicación

La aplicación no tiene cuentas ni pide tu ubicación. El navegador solo guarda tres preferencias: los filtros, el tema y los avisos (activados o no, y el umbral). No guarda sismos ni datos personales.

## Más información

- [README](../../README.md): qué es, cómo se instala y sus limitaciones conocidas.
- [Textos de la interfaz](../diseno/textos.md): todos los mensajes de la aplicación.
- [CHANGELOG](../../CHANGELOG.md): qué cambió en cada versión.
