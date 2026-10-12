/**
 * Línea de estado de la cabecera (textos.md §3). Solo el texto del estado está en la región
 * `role="status"`; el contador y la hora van fuera para no anunciarse cada vez. El icono tiene
 * una forma por estado y no parpadea.
 *
 * Estados: `cargando`, `cargado` («Datos cargados»: navegador sin `EventSource`),
 * `actualizando`, `sin-paises`, `sin-conexion`, `error-servidor`, `en-vivo`, `reconectando` y
 * `sin-plazas` (el stream da 503 por falta de plazas, pero el servidor responde y los datos
 * cargados siguen visibles). Textos validados en textos.md §3.
 */

import { cambiarIcono } from './dom.js';
import { textoFuentes } from './fuentes.js';
import { horaEquipo, textoContador } from './formato.js';

/**
 * @typedef {'cargando' | 'cargado' | 'actualizando' | 'sin-paises' | 'sin-conexion' |
 *   'error-servidor' | 'en-vivo' | 'reconectando' | 'sin-plazas'} EstadoVista
 */

/** @type {Record<EstadoVista, { texto: string, icono: string, clase: string }>} */
const ESTADOS = {
  cargando: { texto: 'Cargando sismos…', icono: 'cargando', clase: 'e-neutro' },
  cargado: { texto: 'Datos cargados', icono: 'ok', clase: 'e-neutro' },
  actualizando: { texto: 'Actualizando…', icono: 'ok', clase: 'e-neutro' },
  'sin-paises': {
    texto: 'Sin consulta: no hay países marcados',
    icono: 'vacio',
    clase: 'e-neutro',
  },
  'sin-conexion': {
    texto: 'Sin conexión con el servidor local. Reintentando…',
    icono: 'sin-conexion',
    clase: 'e-error',
  },
  'error-servidor': {
    texto: 'El servidor local ha devuelto un error. Reintentando…',
    // El servidor responde, pero con un error: triángulo, no «sin conexión» (C2, T5.5).
    icono: 'triangulo',
    clase: 'e-error',
  },
  'en-vivo': { texto: 'En vivo', icono: 'ok', clase: 'e-ok' },
  reconectando: { texto: 'Reconectando…', icono: 'reconectando', clase: 'e-aviso' },
  'sin-plazas': {
    texto:
      'Sin actualizaciones en vivo: hay demasiadas pestañas abiertas. Cierra alguna. Reintentando…',
    icono: 'reconectando',
    clase: 'e-aviso',
  },
};

export function crearBarraEstado() {
  const ind = /** @type {HTMLElement} */ (document.getElementById('estado-ind'));
  const texto = /** @type {HTMLElement} */ (document.getElementById('estado-texto'));
  const complemento = /** @type {HTMLElement} */ (document.getElementById('estado-complemento'));
  const linea = /** @type {HTMLElement} */ (document.getElementById('linea-fuente'));
  const lineaTexto = /** @type {HTMLElement} */ (document.getElementById('linea-fuente-texto'));

  /** @type {EstadoVista} */
  let actual = 'cargando';

  return Object.freeze({
    /**
     * @param {EstadoVista} estado
     * @param {{ n?: number, hora?: number | null }} [datos] `hora`: último dato (hora del equipo)
     */
    poner(estado, { n, hora = null } = {}) {
      const def = ESTADOS[estado];
      actual = estado;
      ind.className = `ind ${def.clase}`;
      cambiarIcono(ind.querySelector('svg'), def.icono);
      if (texto.textContent !== def.texto) texto.textContent = def.texto;

      const partes = [];
      if (estado === 'cargado' || estado === 'en-vivo') {
        if (n !== undefined) partes.push(textoContador(n));
        if (hora !== null) partes.push(`actualizado a las ${horaEquipo(hora)}`);
      } else if (estado === 'actualizando') {
        if (n !== undefined) partes.push(textoContador(n));
      } else if (estado === 'sin-plazas') {
        // Los sismos cargados siguen visibles; la hora es la del último dato recibido.
        if (n !== undefined) partes.push(textoContador(n));
        if (hora !== null) partes.push(`último dato a las ${horaEquipo(hora)}`);
      } else if (
        estado === 'sin-conexion' ||
        estado === 'error-servidor' ||
        estado === 'reconectando'
      ) {
        if (hora !== null) partes.push(`último dato a las ${horaEquipo(hora)}`);
      }
      complemento.textContent = partes.length > 0 ? `· ${partes.join(' · ')}` : '';
    },

    /** @returns {EstadoVista} */
    get estado() {
      return actual;
    },

    /**
     * Segunda línea con las fuentes caídas (HU-02).
     * @param {unknown} fuentes
     * @param {number} ahora
     */
    ponerFuentes(fuentes, ahora) {
      const t = textoFuentes(fuentes, ahora);
      linea.hidden = t === null;
      if (t !== null && lineaTexto.textContent !== t) lineaTexto.textContent = t;
    },
  });
}
