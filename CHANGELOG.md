# Changelog

Todos los cambios relevantes del proyecto se anotan en este archivo.

El formato sigue [Keep a Changelog 1.1.0](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [2.0.0] — Unreleased

Primera entrega del **Monitor de Riesgos Naturales**: sismos en vivo para España, Colombia y Panamá. Sustituye a la página estática «Terremotos en vivo» (1.x).

Al publicar, cambia «Unreleased» por la fecha del release en formato `AAAA-MM-DD`.

### Añadido

- Sismos en tiempo real desde el WebSocket de EMSC, con consultas periódicas a EMSC (cada 30 s) y USGS (cada 60 s) para cubrir los huecos.
- Eliminación de los sismos repetidos entre fuentes. Cada sismo muestra su fuente y la agencia autora («Fuente: EMSC · autor: IGN»).
- Filtro por país: España (con Canarias, Baleares, Ceuta y Melilla), Colombia (con San Andrés) y Panamá, más 100 km de mar desde la costa.
- Filtros de magnitud mínima (de «Todas» a «5.0 o más»; por defecto, «2.0 o más») y de periodo («Última hora», «Últimas 24 h», «7 días» y «30 días»). El navegador recuerda los filtros y el botón «Restablecer filtros» vuelve a los valores por defecto.
- Hora local del lugar de cada sismo («hora peninsular», «hora de Canarias», «hora de Colombia» y «hora de Panamá») y «hace X min».
- Indicador «en vivo» con los estados de conexión («En vivo», «Reconectando…», «Sin conexión con el servidor local. Reintentando…», etc.) y aviso cuando una fuente no responde.
- Avisos del navegador para los sismos nuevos desde M 4.5 en los países marcados, con la pestaña en segundo plano. Umbral configurable entre 4.0 y 6.0, aviso de prueba, un solo aviso por sismo y agrupación cuando llegan más de 3 en un minuto.
- Selector de tema: «Sistema», «Oscuro» y «Día».
- Etiquetas «Nuevo» y «Revisado» en la lista, y leyenda de magnitudes en el mapa.
- Diseño para móvil con el panel «Filtros y avisos» plegable.
- Accesibilidad: navegación completa con teclado y anuncios para lectores de pantalla. Las pruebas automáticas comprueban WCAG 2.2 AA con axe.
- Nota en el pie sobre la cobertura limitada en Colombia por debajo de M 4.
- Servidor local con Node.js y Hono (`npm start`), configurable con variables de entorno (`.env.example`).
- Pruebas unitarias, de integración y E2E en Chromium y Firefox, y scripts de medición de rendimiento.

### Cambiado

- La aplicación pasa de una página estática servida por Apache a un servidor local que se arranca con `npm start` y se abre en `http://localhost:3000`.
- Ya no se muestran los sismos de todo el mundo: solo los de los tres países, con sus filtros. Desaparece el selector de feeds del USGS («all_hour», «all_day», «2.5_week» y «4.5_week»).
- Los sismos nuevos aparecen al momento, en lugar de esperar a la recarga de cada 60 s.
- La ventana de un sismo nuevo se abre sola si alcanza el umbral de avisos (antes, siempre M 4.5) y cumple los filtros.
- Leaflet se sirve desde el propio servidor, no desde un CDN.
- Licencia AGPL-3.0-or-later.

### Seguridad

- Los textos de las fuentes (lugar y autor) se muestran como texto y ya no se insertan como HTML sin escapar, como pasaba en la 1.x. Los enlaces «Más info» solo admiten las fichas de EMSC y USGS por `https`.
- Política de seguridad de contenido (CSP) sin `unsafe-inline` ni `unsafe-eval`, y una regla de lint que impide insertar datos externos con `innerHTML`.
- El servidor solo escucha en `127.0.0.1` o `::1`, y rechaza las peticiones con una cabecera `Host` ajena o que llegan desde otras webs (`Origin` y `Sec-Fetch-Site`).
- `npm start` ejecuta Node con su modelo de permisos: solo lee las carpetas del proyecto, no escribe archivos ni lanza otros programas.
- La aplicación no arranca como root ni con `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- Límite de conexiones en vivo simultáneas (`SSE_MAX_CLIENTES`) y de tamaño de los mensajes del WebSocket de EMSC.
- El registro de la consola neutraliza los caracteres de control que llegan de las fuentes.
- Versiones exactas de las dependencias, sin rangos. La auditoría de las dependencias de producción no encontró vulnerabilidades en la revisión de seguridad.
- No se tratan datos personales: no hay cuentas ni se pide la ubicación, y el navegador solo guarda las preferencias.

## [1.x]

Página estática «Terremotos en vivo» en un solo archivo, servida por Apache. Mostraba en un mapa Leaflet y en una lista los sismos de todo el mundo de un feed del USGS a elegir (última hora, último día o última semana) y se recargaba cada 60 s. Marcaba con un pulso los sismos de la última hora y abría la ventana de los sismos nuevos de M 4.5 o más.
