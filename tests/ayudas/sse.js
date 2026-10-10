// Ayudas para leer flujos SSE en las pruebas sin depender de temporizadores simulados.

/**
 * Lector incremental de un `ReadableStream<Uint8Array>`. `leer()` devuelve lo que ya está en
 * cola (sin esperar a datos futuros) y conserva la lectura pendiente para la siguiente llamada.
 * Necesita `setImmediate` real (las pruebas no lo simulan).
 * @param {ReadableStream<Uint8Array>} cuerpo
 */
export function crearLector(cuerpo) {
  const reader = cuerpo.getReader();
  const decoder = new TextDecoder();
  /** @type {Promise<ReadableStreamReadResult<Uint8Array>> | null} */
  let pendiente = null;
  const estado = { fin: false, error: /** @type {unknown} */ (null) };
  return {
    estado,
    async leer() {
      let texto = '';
      while (!estado.fin) {
        pendiente ??= reader.read();
        let r;
        try {
          r = await Promise.race([pendiente, new Promise((ok) => setImmediate(() => ok(null)))]);
        } catch (err) {
          estado.fin = true;
          estado.error = err;
          pendiente = null;
          break;
        }
        if (r === null) break;
        pendiente = null;
        if (r.done) {
          estado.fin = true;
          break;
        }
        texto += decoder.decode(r.value, { stream: true });
      }
      return texto;
    },
    cancelar() {
      return reader.cancel();
    },
  };
}

/**
 * Separa un texto SSE en mensajes. Cada mensaje: `{ id, event, data, retry, comentarios }`;
 * `datos` es el JSON de `data` ya parseado (si lo hay).
 * @param {string} texto
 */
export function parsearSse(texto) {
  const mensajes = [];
  for (const bloque of texto.split('\n\n')) {
    if (bloque === '') continue;
    /** @type {Record<string, any>} */
    const m = { comentarios: [] };
    for (const linea of bloque.split('\n')) {
      if (linea.startsWith(':')) {
        m.comentarios.push(linea.slice(1).trim());
        continue;
      }
      const i = linea.indexOf(':');
      const campo = i === -1 ? linea : linea.slice(0, i);
      const valor = i === -1 ? '' : linea.slice(i + 1).replace(/^ /, '');
      m[campo] = m[campo] === undefined ? valor : `${m[campo]}\n${valor}`;
    }
    if (m.data !== undefined) m.datos = JSON.parse(m.data);
    mensajes.push(m);
  }
  return mensajes;
}

/** Solo los mensajes con `event`. @param {string} texto */
export function eventos(texto) {
  return parsearSse(texto).filter((m) => m.event !== undefined);
}
