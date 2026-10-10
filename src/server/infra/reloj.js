/**
 * Reloj inyectable: las pruebas usan uno simulado (arquitectura §1.5).
 * @typedef {{ ahora: () => number }} Reloj
 */

/** @type {Reloj} */
export const systemClock = Object.freeze({ ahora: () => Date.now() });
