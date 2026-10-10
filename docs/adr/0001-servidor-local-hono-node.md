# 0001. Un único servidor local Node.js + Hono, monolito modular sin paso de build

- Estado: propuesto
- Fecha: 2026-10-10 · Decisores: arquitecto-software, Director

## Contexto

- El Director decidió el 2026-10-10 que la aplicación sea **solo de uso local**: se arranca a mano con `npm start` en su equipo (Linux Mint 22.3), en el puerto 3000 configurable. No hay publicación en internet, ni Cloudflare, ni Vercel, ni Apache.
- Ya están decididos el lenguaje (Node.js, con JavaScript en el servidor y en la página) y el framework (Hono permanente, plan §3.2).
- Los requisitos no funcionales que pesan:
  - RNF-01: p95 ≤ 2 s de servidor a pantalla;
  - RNF-05: ≤ 300 MB de memoria;
  - RNF-09: solo loopback;
  - RNF-16: 24 h seguidas sin reinicio;
  - O5: `npm ci && npm start` funciona al primer intento.
- Hay un usuario y una o pocas pestañas. El volumen real es de cientos de sismos en 30 días; el techo de diseño es 10 000.
- La página y el servidor comparten reglas de dominio: filtros, redondeo de magnitud, regla de notificación y hora local.

## Opciones consideradas

1. **Un proceso Node.js + Hono que sirve la página, la API y el SSE, y consume las fuentes. JavaScript ESM sin build. Estado en memoria.**
   - Pros:
     - un solo proceso y un solo comando;
     - mismo origen para la página y la API, así que no hace falta CORS;
     - `src/shared` se carga tal cual en Node y en el navegador;
     - sin transpilar ni empaquetar, y con pocas dependencias.
   - Contras:
     - sin tipos estáticos (se compensa con JSDoc, pruebas y lint);
     - el estado se pierde al reiniciar (aceptado: PRD §8).
2. **Igual, pero con TypeScript y un empaquetador (Vite o esbuild) para la página.**
   - Pros: tipos estáticos.
   - Contras:
     - añade un paso de build, mapas de fuente y más dependencias para unos pocos miles de líneas;
     - `npm start` dependería de un build previo, y el código servido dejaría de ser el que se lee.
3. **Express 5 o Fastify en lugar de Hono.**
   - Pros: ecosistema mayor (Fastify trae validación con JSON Schema).
   - Contras: contradice la decisión del Director (plan §3.2). Hono ya trae SSE (`hono/streaming`), validador, cabeceras de seguridad y `serveStatic`, y sin Workers la portabilidad no aporta ni resta.
4. **Separar en dos procesos: un ingestor y una API.**
   - Contras: no hay escalas ni equipos independientes que lo justifiquen. Habría que añadir una IPC o una base de datos.

## Decisión

Opción 1: **monolito modular en un solo proceso**, JavaScript ESM (`"type": "module"`), **sin paso de build**:
- `src/server`: arranque, HTTP, fuentes, dominio del servidor e infraestructura;
- `src/shared`: reglas puras, servidas tal cual a la página;
- `public`: HTML, CSS y JS de la página.

Las capas siguen puertos y adaptadores donde aporta, es decir, en las fuentes: cada fuente implementa una interfaz común y el dominio no conoce HTTP ni WebSocket. Los tipos se documentan con JSDoc. No se añade TypeScript en la entrega 1.

Esto se aparta de la skill `stack-nodejs` («TypeScript estricto»). El motivo es la decisión del Director de usar JavaScript y la regla de no tener build. Si en la entrega 2 el código crece, se puede añadir `// @ts-check` y `tsc --noEmit --checkJs` sin cambiar el código servido. Eso requeriría actualizar el lock, no un ADR nuevo.

## Consecuencias

- **Positivas:**
  - `npm start` es `node src/server/index.js`, sin nada intermedio;
  - lo que se depura es lo que se ejecuta;
  - el navegador importa `/shared/*.js` como módulos ES nativos;
  - hay 7 dependencias de producción en total: `hono`, `@hono/node-server`, `ws`, `leaflet` y 3 módulos de Turf (ver STACK.lock).
- **Negativas:**
  - sin comprobación de tipos en compilación;
  - `src/shared` no puede importar paquetes npm, porque el navegador no los resolvería sin un mapa de importaciones; ESLint lo impide con una regla;
  - cualquier lógica que necesite Turf vive solo en el servidor.
- **Más difícil:**
  - escalar a varios procesos, porque el estado vive en memoria. No es un objetivo: el uso es local.
- **Cómo se revierte:** añadir un build no exige reescribir nada. Bastaría con generar `public/` a partir de `src/` y cambiar `npm start`.
