/**
 * Lista de sismos virtualizada con tabindex itinerante (wireframes §9 y §10; RNF-03).
 *
 * - Solo se pintan las filas visibles más un margen; cada fila va con posición absoluta y
 *   `translateY`, así que se puede pintar cualquier subconjunto sin mover las demás. La fila
 *   itinerante y la enfocada se pintan siempre, aunque estén fuera de la vista: así Tab vuelve al
 *   último elemento visitado y el foco nunca se pierde al desplazar con la rueda.
 * - Alturas variables (los lugares largos hacen salto de línea): se miden al pintar y se usa la
 *   media como estimación para las demás. Al cambiar los datos o las alturas se conserva la fila
 *   que el usuario está viendo (ancla), salvo si está arriba del todo.
 * - Un solo punto de tabulación: flechas, Inicio, Fin, RePág y AvPág dentro; Intro o Espacio
 *   activan el botón.
 * - Los ids externos nunca van al DOM (AM-24): `WeakMap` de botón a id.
 */

import { crear, textoOculto } from './dom.js';
import { esNuevo } from './estado.js';
import { formatearLugar, lineaPaisProfundidad } from './formato.js';
import { bandaMagnitud, formatearMagnitud } from './magnitud.js';
import { haceTexto, horaLista } from '/shared/hora.js';

const ALTO_INICIAL = 76;
const MARGEN_PX = 600;
const PASO_PAGINA = 10;
const MAX_PASADAS = 4;

/**
 * @typedef {import('./estado.js').Entrada} Entrada
 *
 * @typedef {object} Fila
 * @property {HTMLLIElement} li
 * @property {HTMLButtonElement} boton
 * @property {HTMLSpanElement} tiempo
 * @property {HTMLSpanElement} chipNuevo
 * @property {number} version
 * @property {number} posicion
 */

/**
 * Contenido de la fila (sin el texto de tiempo, que se refresca aparte).
 * @param {Entrada} entrada
 * @returns {{ nodos: Node[], tiempo: HTMLSpanElement, chipNuevo: HTMLSpanElement }}
 */
function contenidoFila(entrada) {
  const { sismo } = entrada;
  const banda = bandaMagnitud(sismo.magnitud);
  const tiempo = crear('span', { clase: 'meta' });
  const chipNuevo = crear('span', { clase: 'chip', texto: 'Nuevo' });
  chipNuevo.hidden = true;
  const chips = crear('span', { clase: 'chips' }, [
    chipNuevo,
    entrada.magnitudAnterior !== null
      ? crear('span', { clase: 'chip chip-rev', texto: 'Revisado' })
      : null,
  ]);
  return {
    nodos: [
      crear('span', { clase: `insignia b${banda}` }, [
        textoOculto('Magnitud '),
        formatearMagnitud(sismo.magnitud),
      ]),
      crear('span', { clase: 'info' }, [
        crear('span', { clase: 'lugar', texto: formatearLugar(sismo.lugar) }),
        crear('span', { clase: 'meta', texto: lineaPaisProfundidad(sismo) }),
        tiempo,
      ]),
      chips,
    ],
    tiempo,
    chipNuevo,
  };
}

/**
 * @param {object} opciones
 * @param {HTMLElement} opciones.scroller contenedor con desplazamiento
 * @param {HTMLUListElement} opciones.ul
 * @param {() => number} [opciones.ahora]
 * @param {(id: string, origen: { teclado: boolean }) => void} opciones.alActivar
 */
export function crearLista({ scroller, ul, ahora = () => Date.now(), alActivar }) {
  /** @type {Entrada[]} */
  let entradas = [];
  /** @type {Map<string, number>} */
  let indice = new Map();
  /** @type {Map<string, number>} */
  const altos = new Map();
  let altoMedio = ALTO_INICIAL;
  let offsets = new Float64Array(1);
  let sucio = true;
  /** @type {Map<string, Fila>} */
  const filas = new Map();
  /** @type {WeakMap<Element, string>} */
  const idDe = new WeakMap();
  /** @type {string | null} */
  let idItinerante = null;
  /** @type {string | null} */
  let idSeleccionado = null;
  let marco = 0;
  let anchoPrevio = 0;

  function recalcular() {
    const n = entradas.length;
    offsets = new Float64Array(n + 1);
    for (let i = 0; i < n; i += 1) {
      offsets[i + 1] = offsets[i] + (altos.get(entradas[i].sismo.id) ?? altoMedio);
    }
    sucio = false;
  }

  /**
   * Primer índice cuya fila acaba por debajo de `y`.
   * @param {number} y
   */
  function buscar(y) {
    let lo = 0;
    let hi = entradas.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, lo);
  }

  /** @returns {{ id: string, delta: number } | null} */
  function tomarAncla() {
    if (entradas.length === 0 || scroller.scrollTop <= 0) return null;
    if (sucio) recalcular();
    const i = buscar(scroller.scrollTop);
    return { id: entradas[i].sismo.id, delta: offsets[i] - scroller.scrollTop };
  }

  /** @param {{ id: string, delta: number } | null} ancla */
  function aplicarAncla(ancla) {
    if (!ancla) return;
    if (sucio) recalcular();
    const i = indice.get(ancla.id);
    if (i !== undefined) scroller.scrollTop = Math.max(0, offsets[i] - ancla.delta);
  }

  /**
   * @param {Entrada} entrada
   * @returns {Fila}
   */
  function obtenerFila(entrada) {
    const id = entrada.sismo.id;
    let fila = filas.get(id);
    if (!fila) {
      const boton = crear('button', { clase: 'item', atributos: { type: 'button' } });
      boton.tabIndex = -1;
      const li = crear('li', { clase: 'fila' }, [boton]);
      idDe.set(boton, id);
      fila = {
        li,
        boton,
        tiempo: crear('span'),
        chipNuevo: crear('span'),
        version: -1,
        posicion: -1,
      };
      filas.set(id, fila);
    }
    if (fila.version !== entrada.version) {
      const { nodos, tiempo, chipNuevo } = contenidoFila(entrada);
      fila.boton.replaceChildren(...nodos);
      fila.tiempo = tiempo;
      fila.chipNuevo = chipNuevo;
      fila.version = entrada.version;
    }
    const t = ahora();
    const textoTiempo = `${haceTexto(entrada.instante, t)} · ${horaLista(
      entrada.instante,
      entrada.sismo.zonaHoraria,
      t,
    )}`;
    if (fila.tiempo.textContent !== textoTiempo) fila.tiempo.textContent = textoTiempo;
    const nuevo = esNuevo(entrada, t);
    if (fila.chipNuevo.hidden === nuevo) fila.chipNuevo.hidden = !nuevo;
    const seleccionado = id === idSeleccionado;
    fila.boton.classList.toggle('sel', seleccionado);
    if (seleccionado) fila.boton.setAttribute('aria-current', 'true');
    else fila.boton.removeAttribute('aria-current');
    return fila;
  }

  /** @returns {string | null} id de la fila que tiene el foco, si es de esta lista */
  function idEnfocado() {
    const activo = document.activeElement;
    return activo && ul.contains(activo) ? (idDe.get(activo) ?? null) : null;
  }

  function pintar() {
    marco = 0;
    for (let pasada = 0; pasada < MAX_PASADAS; pasada += 1) {
      if (!pintarUnaVez()) break;
    }
  }

  /** @returns {boolean} `true` si alguna altura medida cambió (hay que repetir) */
  function pintarUnaVez() {
    const ancla = tomarAncla();
    if (sucio) recalcular();
    const n = entradas.length;
    const total = offsets[n];
    ul.style.height = `${total}px`;
    if (n === 0) {
      ul.replaceChildren();
      filas.clear();
      return false;
    }
    if (idItinerante === null || !indice.has(idItinerante)) idItinerante = entradas[0].sismo.id;

    const alto = scroller.clientHeight;
    const arriba = scroller.scrollTop;
    const ini = buscar(arriba - MARGEN_PX);
    const fin = alto > 0 ? Math.min(n, buscar(arriba + alto + MARGEN_PX) + 1) : Math.min(n, 1);
    /** @type {Set<number>} */
    const posiciones = new Set();
    for (let i = ini; i < fin; i += 1) posiciones.add(i);
    for (const id of [idItinerante, idEnfocado()]) {
      const i = id === null ? undefined : indice.get(id);
      if (i !== undefined) posiciones.add(i);
    }
    const orden = [...posiciones].sort((a, b) => a - b);

    const enfocado = idEnfocado();
    /** @type {Set<HTMLLIElement>} */
    const deseadas = new Set();
    /** @type {HTMLLIElement[]} */
    const lis = [];
    for (const i of orden) {
      const fila = obtenerFila(entradas[i]);
      if (fila.posicion !== i) {
        fila.li.style.transform = `translateY(${offsets[i]}px)`;
        fila.li.setAttribute('aria-posinset', String(i + 1));
        fila.posicion = i;
      }
      fila.li.setAttribute('aria-setsize', String(n));
      fila.boton.tabIndex = entradas[i].sismo.id === idItinerante ? 0 : -1;
      deseadas.add(fila.li);
      lis.push(fila.li);
    }
    for (const [id, fila] of filas) {
      if (!deseadas.has(fila.li)) {
        fila.li.remove();
        filas.delete(id);
      }
    }
    let cursor = ul.firstChild;
    for (const li of lis) {
      if (li === cursor) cursor = cursor.nextSibling;
      else ul.insertBefore(li, cursor);
    }
    if (enfocado !== null && idEnfocado() !== enfocado) {
      filas.get(enfocado)?.boton.focus({ preventScroll: true });
    }

    // Medir: si cambian las alturas, se repite con las posiciones corregidas.
    let cambio = false;
    for (const i of orden) {
      const id = entradas[i].sismo.id;
      const fila = filas.get(id);
      if (!fila) continue;
      const h = fila.li.offsetHeight;
      if (h > 0 && altos.get(id) !== h) {
        altos.set(id, h);
        cambio = true;
      }
    }
    if (cambio) {
      let suma = 0;
      for (const h of altos.values()) suma += h;
      altoMedio = suma / altos.size;
      sucio = true;
      for (const fila of filas.values()) fila.posicion = -1;
      aplicarAncla(ancla);
    }
    return cambio;
  }

  function programar() {
    if (!marco) marco = requestAnimationFrame(pintar);
  }

  /**
   * Desplaza lo justo para que la fila `i` se vea entera.
   * @param {number} i
   * @param {'cerca' | 'centro'} [modo]
   */
  function asegurarVisible(i, modo = 'cerca') {
    if (sucio) recalcular();
    const y = offsets[i];
    const h = offsets[i + 1] - y;
    const vista = scroller.clientHeight;
    const arriba = scroller.scrollTop;
    if (modo === 'centro' && (y < arriba || y + h > arriba + vista)) {
      scroller.scrollTop = Math.max(0, y - (vista - h) / 2);
    } else if (y < arriba) {
      scroller.scrollTop = y;
    } else if (y + h > arriba + vista) {
      scroller.scrollTop = y + h - vista;
    }
  }

  /** @param {number} i */
  function moverA(i) {
    const destino = Math.max(0, Math.min(entradas.length - 1, i));
    const id = entradas[destino]?.sismo.id;
    if (id === undefined) return;
    idItinerante = id;
    asegurarVisible(destino);
    pintar();
    asegurarVisible(destino);
    filas.get(id)?.boton.focus({ preventScroll: true });
  }

  ul.addEventListener('keydown', (e) => {
    const boton = e.target instanceof Element ? e.target.closest('button.item') : null;
    const id = boton ? idDe.get(boton) : undefined;
    const i = id === undefined ? undefined : indice.get(id);
    if (i === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    /** @type {Record<string, number>} */
    const destinos = {
      ArrowDown: i + 1,
      ArrowUp: i - 1,
      Home: 0,
      End: entradas.length - 1,
      PageDown: i + PASO_PAGINA,
      PageUp: i - PASO_PAGINA,
    };
    if (!Object.hasOwn(destinos, e.key)) return;
    e.preventDefault();
    moverA(destinos[e.key]);
  });

  ul.addEventListener('focusin', (e) => {
    const id = e.target instanceof Element ? idDe.get(e.target) : undefined;
    if (id === undefined || id === idItinerante) return;
    const previo = idItinerante === null ? undefined : filas.get(idItinerante);
    if (previo) previo.boton.tabIndex = -1;
    idItinerante = id;
    const fila = filas.get(id);
    if (fila) fila.boton.tabIndex = 0;
  });

  ul.addEventListener('click', (e) => {
    const boton = e.target instanceof Element ? e.target.closest('button.item') : null;
    const id = boton ? idDe.get(boton) : undefined;
    if (id === undefined) return;
    alActivar(id, { teclado: e.detail === 0 });
  });

  scroller.addEventListener('scroll', programar, { passive: true });
  new ResizeObserver(() => {
    const ancho = scroller.clientWidth;
    if (ancho !== anchoPrevio) {
      anchoPrevio = ancho;
      altos.clear();
      sucio = true;
    }
    programar();
  }).observe(scroller);

  return Object.freeze({
    /**
     * Sustituye las entradas (ya ordenadas, más recientes primero) y repinta.
     * @param {Entrada[]} nuevas
     */
    actualizar(nuevas) {
      const ancla = tomarAncla();
      const enfocado = idEnfocado();
      const indicePrevio = idItinerante === null ? undefined : indice.get(idItinerante);
      entradas = nuevas;
      indice = new Map(nuevas.map((e, i) => [e.sismo.id, i]));
      for (const id of altos.keys()) if (!indice.has(id)) altos.delete(id);
      sucio = true;
      for (const fila of filas.values()) fila.posicion = -1;
      // Si el sismo itinerante desaparece (sale del periodo), pasa al siguiente.
      if (idItinerante !== null && !indice.has(idItinerante)) {
        const i = Math.min(indicePrevio ?? 0, nuevas.length - 1);
        idItinerante = i >= 0 ? nuevas[i].sismo.id : null;
      }
      aplicarAncla(ancla);
      pintar();
      if (enfocado !== null && !indice.has(enfocado) && idItinerante !== null) {
        filas.get(idItinerante)?.boton.focus({ preventScroll: true });
      }
    },

    /** Repinta (refresca «hace X» y la etiqueta «Nuevo» de las filas visibles). */
    refrescar() {
      pintar();
    },

    /**
     * Marca un sismo como seleccionado (`aria-current`) sin mover el foco.
     * @param {string | null} id
     * @param {{ desplazar?: boolean }} [opciones]
     */
    seleccionar(id, { desplazar = false } = {}) {
      idSeleccionado = id;
      const i = id === null ? undefined : indice.get(id);
      if (i !== undefined) {
        idItinerante = id;
        if (desplazar) asegurarVisible(i, 'centro');
      }
      pintar();
    },

    /**
     * Lleva el foco a la fila itinerante (enlace para saltar, «Ver n sismos», Esc).
     * @param {string | null} [id] si se indica, a esa fila
     * @returns {boolean} `false` si la lista está vacía
     */
    enfocar(id = null) {
      const destino = id ?? idItinerante ?? entradas[0]?.sismo.id ?? null;
      const i = destino === null ? undefined : indice.get(destino);
      if (i === undefined) return false;
      moverA(i);
      return true;
    },

    /** @param {boolean} ocupada */
    ponerOcupada(ocupada) {
      if (ocupada) ul.setAttribute('aria-busy', 'true');
      else ul.removeAttribute('aria-busy');
    },

    get tamano() {
      return entradas.length;
    },
  });
}
