/**
 * Panel de filtros (HU-03 a HU-06; wireframes §1.1). Los cambios se aplican al momento: tras
 * 400 ms sin más cambios se avisa a `alCambiar`, que cancela la consulta anterior. Sin países
 * marcados se avisa enseguida (no hay nada que consultar). En móvil, el panel se pliega tras
 * «Filtros y avisos».
 */

import { crear } from './dom.js';
import {
  OPCIONES_MAGNITUD,
  OPCIONES_PERIODO,
  difiereDeDefecto,
  filtrosPorDefecto,
  ordenarPaises,
  resumenFiltros,
} from './filtros.js';

/** Espera tras el último cambio antes de consultar (wireframes §1.1). */
export const ESPERA_MS = 400;

/**
 * @typedef {import('./filtros.js').Filtros} Filtros
 */

/**
 * @param {object} opciones
 * @param {Filtros} opciones.inicial
 * @param {(filtros: Filtros, info: { paisesCambiados: boolean, inmediato: boolean }) => void}
 *   opciones.alCambiar
 * @param {(texto: string) => void} opciones.anunciar
 * @param {() => void} opciones.alVer pulsado «Ver n sismos» en móvil
 */
export function crearFiltrosUI({ inicial, alCambiar, anunciar, alVer }) {
  const seccion = /** @type {HTMLElement} */ (document.querySelector('.fil'));
  const boton = /** @type {HTMLButtonElement} */ (document.getElementById('btn-filtros'));
  const resumen = /** @type {HTMLElement} */ (document.getElementById('resumen-filtros'));
  const casillas = /** @type {HTMLInputElement[]} */ ([
    ...document.querySelectorAll('input[name="pais"]'),
  ]);
  const grupoPaises = /** @type {HTMLFieldSetElement} */ (document.getElementById('paises'));
  const errorPaises = /** @type {HTMLElement} */ (document.getElementById('error-paises'));
  const magnitud = /** @type {HTMLSelectElement} */ (document.getElementById('magnitud'));
  const periodo = /** @type {HTMLSelectElement} */ (document.getElementById('periodo'));
  const filaRestablecer = /** @type {HTMLElement} */ (document.getElementById('restablecer-fila'));
  const restablecer = /** @type {HTMLButtonElement} */ (document.getElementById('restablecer'));
  const ver = /** @type {HTMLButtonElement} */ (document.getElementById('btn-ver'));

  for (const o of OPCIONES_MAGNITUD) {
    magnitud.append(crear('option', { texto: o.texto, atributos: { value: o.valor } }));
  }
  for (const o of OPCIONES_PERIODO) {
    periodo.append(crear('option', { texto: o.texto, atributos: { value: o.valor } }));
  }

  /** @type {Filtros} */
  let actuales = inicial;
  let paisesEnviados = inicial.paises.join(',');
  let temporizador = 0;

  /** @param {Filtros} f */
  function pintar(f) {
    for (const c of casillas) c.checked = f.paises.includes(/** @type {any} */ (c.value));
    magnitud.value = f.magMin;
    periodo.value = f.periodo;
    actualizarAyudas(f);
  }

  /** @param {Filtros} f */
  function actualizarAyudas(f) {
    const ninguno = f.paises.length === 0;
    errorPaises.hidden = !ninguno;
    grupoPaises.setAttribute(
      'aria-describedby',
      ninguno ? 'ayuda-paises error-paises' : 'ayuda-paises',
    );
    filaRestablecer.hidden = !difiereDeDefecto(f);
    resumen.textContent = resumenFiltros(f);
  }

  /** @returns {Filtros} */
  function leer() {
    return {
      paises: ordenarPaises(casillas.filter((c) => c.checked).map((c) => c.value)),
      magMin: /** @type {any} */ (magnitud.value),
      periodo: /** @type {any} */ (periodo.value),
    };
  }

  /** @param {boolean} inmediato */
  function emitir(inmediato) {
    clearTimeout(temporizador);
    const enviar = () => {
      const clave = actuales.paises.join(',');
      const paisesCambiados = clave !== paisesEnviados;
      paisesEnviados = clave;
      alCambiar(actuales, { paisesCambiados, inmediato });
    };
    if (inmediato) enviar();
    else temporizador = window.setTimeout(enviar, ESPERA_MS);
  }

  function alModificar() {
    actuales = leer();
    actualizarAyudas(actuales);
    // Sin países no se consulta: se avisa al momento (HU-03).
    emitir(actuales.paises.length === 0);
  }

  for (const c of casillas) c.addEventListener('change', alModificar);
  magnitud.addEventListener('change', alModificar);
  periodo.addEventListener('change', alModificar);

  restablecer.addEventListener('click', () => {
    actuales = filtrosPorDefecto();
    pintar(actuales);
    emitir(true);
    anunciar('Filtros restablecidos: tres países, 2.0 o más, últimas 24 h.');
    casillas[0]?.focus();
  });

  /** @param {boolean} abrir */
  function desplegar(abrir) {
    seccion.classList.toggle('abierto', abrir);
    boton.setAttribute('aria-expanded', String(abrir));
    boton.querySelector('use')?.setAttribute('href', abrir ? '#i-arriba' : '#i-abajo');
  }

  boton.addEventListener('click', () => desplegar(boton.getAttribute('aria-expanded') !== 'true'));
  seccion.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && seccion.classList.contains('abierto')) {
      e.preventDefault();
      desplegar(false);
      boton.focus();
    }
  });
  ver.addEventListener('click', () => {
    desplegar(false);
    alVer();
  });

  pintar(actuales);

  return Object.freeze({
    /** @returns {Filtros} */
    get filtros() {
      return actuales;
    },

    /**
     * Texto del botón final del panel en móvil: «Ver 12 sismos», «Ver 1 sismo» o «Cerrar
     * filtros» si no hay resultados ni países.
     * @param {number | null} n
     */
    ponerResultado(n) {
      if (n === null || n === 0 || actuales.paises.length === 0) ver.textContent = 'Cerrar filtros';
      else if (n === 1) ver.textContent = 'Ver 1 sismo';
      else ver.textContent = `Ver ${new Intl.NumberFormat('es').format(n)} sismos`;
    },

    /** Despliega el panel (móvil) y lleva el foco a «España» («Abrir filtros»). */
    abrirYEnfocar() {
      desplegar(true);
      casillas[0]?.focus();
    },

    /** Restablece los filtros como el botón «Restablecer filtros». */
    restablecer() {
      restablecer.click();
    },
  });
}
