/**
 * Construcción segura del DOM (AM-01, RNF-07): los textos van siempre con `textContent` y los
 * atributos con `setAttribute`. Nunca `innerHTML` ni atributos `style` (CSP, AM-36).
 */

const SVG = 'http://www.w3.org/2000/svg';

/**
 * @typedef {object} OpcionesNodo
 * @property {string} [clase]
 * @property {string} [texto] se asigna con `textContent`
 * @property {Record<string, string>} [atributos] nunca `style` ni manejadores `on*`
 */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} etiqueta
 * @param {OpcionesNodo} [opciones]
 * @param {(Node | string | null | undefined | false)[]} [hijos] las cadenas van como texto
 * @returns {HTMLElementTagNameMap[K]}
 */
export function crear(etiqueta, opciones = {}, hijos = []) {
  const nodo = document.createElement(etiqueta);
  if (opciones.clase) nodo.className = opciones.clase;
  if (opciones.atributos) {
    for (const [nombre, valor] of Object.entries(opciones.atributos)) {
      if (nombre === 'style' || nombre.startsWith('on')) continue;
      nodo.setAttribute(nombre, valor);
    }
  }
  if (opciones.texto !== undefined) nodo.textContent = opciones.texto;
  for (const hijo of hijos) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo);
  }
  return nodo;
}

/**
 * Texto solo para lectores de pantalla.
 * @param {string} texto
 */
export function textoOculto(texto) {
  return crear('span', { clase: 'vh', texto });
}

/**
 * Icono del sprite de `index.html` (`<symbol id="i-…">`), decorativo.
 * @param {string} nombre sin el prefijo `i-` (constante del código, nunca un dato externo)
 * @param {string} [clase]
 * @returns {SVGSVGElement}
 */
export function icono(nombre, clase = 'ico') {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', clase);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const uso = document.createElementNS(SVG, 'use');
  uso.setAttribute('href', `#i-${nombre}`);
  svg.append(uso);
  return svg;
}

/**
 * Cambia el icono de un `<svg><use>` ya existente.
 * @param {Element | null} svg
 * @param {string} nombre
 */
export function cambiarIcono(svg, nombre) {
  svg?.querySelector('use')?.setAttribute('href', `#i-${nombre}`);
}

/**
 * Elemento SVG suelto (para la leyenda del mapa).
 * @param {string} etiqueta
 * @param {Record<string, string>} atributos atributos de presentación SVG, no `style`
 * @returns {SVGElement}
 */
export function crearSvg(etiqueta, atributos = {}) {
  const nodo = document.createElementNS(SVG, etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) nodo.setAttribute(nombre, valor);
  return /** @type {SVGElement} */ (nodo);
}

/**
 * ¿Pide el usuario menos movimiento?
 * @returns {boolean}
 */
export function movimientoReducido() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * ¿Diseño móvil (por debajo de 700 px)?
 * @returns {boolean}
 */
export function esMovil() {
  return globalThis.matchMedia?.('(max-width: 699.98px)').matches ?? false;
}
