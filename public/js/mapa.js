/* global L */
/**
 * Mapa Leaflet (HU-07, HU-09; wireframes §8 y §10). Leaflet 1.9.4 lo sirve el propio servidor en
 * `/vendor/leaflet/` (AM-20) y se carga antes como script clásico (`L` global).
 *
 * - Marcadores en un renderizador **canvas** (rinde con miles de sismos). El halo de «última
 *   hora» va en el mismo canvas, sin eventos (P-06: con SVG, mil halos eran mil nodos que se
 *   recalculaban en cada zoom). El pulso es un anillo HTML (`divIcon`) en un panel sin eventos
 *   de puntero, animado con CSS en el compositor; hay como mucho `MAX_PULSOS` a la vez, solo de
 *   sismos a la vista.
 * - Actualización incremental (P-01): `aplicarCambios(ids)` crea, cambia o quita solo los
 *   marcadores afectados. El orden de dibujo (los grandes debajo) se mantiene con un array
 *   ordenado y `bringToFront` solo desde el primer marcador nuevo.
 * - La ventana emergente se construye con nodos DOM y `textContent` (AM-01); nunca con cadenas
 *   HTML. El enlace «Más info» es el que construye el servidor y se vuelve a comprobar (AM-02).
 * - Los marcadores se localizan con un `Map<id, …>` en memoria (AM-24).
 */

import { crear, crearSvg, icono, movimientoReducido, textoOculto } from './dom.js';
import { NOMBRE_FUENTE, formatearCoordenadas, formatearLugar, nombrePais } from './formato.js';
import {
  COLOR_BANDA,
  TEXTO_BANDA,
  bandaMagnitud,
  bordeMarcador,
  formatearMagnitud,
  radioMarcador,
} from './magnitud.js';
import { MAX_PULSOS, elegirPulsos, ordenDibujo, posicionDibujo } from './orden-mapa.js';
import { esUrlFichaValida } from '/shared/enlaces.js';
import { haceTexto, horaCompleta } from '/shared/hora.js';
import { sanear } from '/shared/texto.js';

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';

/** Capas de teselas por tema (tokens.md §8). */
const TESELAS = Object.freeze({
  oscuro: ['World_Dark_Gray_Base', 'World_Dark_Gray_Reference'],
  dia: ['World_Light_Gray_Base', 'World_Light_Gray_Reference'],
});

/**
 * Atribución de Esri (C4 de la revisión T5.5): «Powered by Esri», que exigen sus términos, y los
 * proveedores del `copyrightText` del servicio, traducido. Constante del código, no un dato de
 * una fuente: Leaflet la inserta como HTML. En móvil, `.atrib-fuentes` se oculta y la lista de
 * proveedores pasa al pie (C5).
 */
const ATRIBUCION_ESRI =
  '<span lang="en">Powered by</span> ' +
  '<a href="https://www.esri.com" target="_blank" rel="noopener noreferrer">Esri<span class="vh"> (se abre en otra pestaña)</span></a>' +
  '<span class="atrib-fuentes"> | Fuentes: Esri, HERE, Garmin, © colaboradores de OpenStreetMap y la comunidad de usuarios de SIG</span>';

/** Prefijo de la atribución (sin la bandera SVG por defecto de Leaflet). */
const PREFIJO_LEAFLET =
  '<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet<span class="vh"> (se abre en otra pestaña)</span></a>';

/**
 * Capa de teselas compatible con la CSP (`img-src` sin `data:`). Leaflet 1.9.4 cancela las
 * teselas que ya no necesita poniéndoles `src` = GIF en `data:`, que la CSP bloquea (y registra
 * como violación). Aquí se cancela quitando el atributo `src`, que también aborta la descarga y
 * no dispara `error`; las teselas sin `src` se ignoran al terminar.
 */
const CapaTeselas = L.TileLayer.extend({
  _abortLoading() {
    for (const clave of Object.keys(this._tiles)) {
      const t = this._tiles[clave];
      if (t.coords.z === this._tileZoom) continue;
      const img = t.el;
      img.onload = null;
      img.onerror = null;
      if (!img.complete) {
        img.removeAttribute('src');
        img.remove();
        delete this._tiles[clave];
        this.fire('tileabort', { tile: img, coords: t.coords });
      }
    }
  },
  /** @param {string} clave */
  _removeTile(clave) {
    const t = this._tiles[clave];
    if (!t) return undefined;
    t.el.removeAttribute('src');
    return L.GridLayer.prototype._removeTile.call(this, clave);
  },
  /**
   * @param {unknown} coords
   * @param {unknown} err
   * @param {HTMLImageElement} [tile]
   */
  _tileReady(coords, err, tile) {
    if (!this._map || (tile && !tile.getAttribute('src'))) return undefined;
    return L.GridLayer.prototype._tileReady.call(this, coords, err, tile);
  },
});

/** Borde de los marcadores por tema (`--marcador-borde`). */
const BORDE = Object.freeze({ oscuro: '#f5f5f5', dia: '#1a1a1a' });

/** Encuadre de cada país (rectángulos de las zonas del PRD, E2). */
const ENCUADRE = Object.freeze({
  ES: [
    [26.6, -18.8],
    [44.3, 4.9],
  ],
  CO: [
    [-4.5, -82.3],
    [14.0, -66.5],
  ],
  PA: [
    [5.0, -83.3],
    [10.2, -77.0],
  ],
});

const UNA_HORA_MS = 3_600_000;
const DURACION_PULSO_MS = 3 * 1600 + 200;
const ZOOM_SISMO = 7;

/** Radios y bordes de las muestras de la leyenda (wireframes, `ley-1` … `ley-5`). */
const MUESTRAS = Object.freeze([
  [5, 1],
  [6.5, 1],
  [7.5, 1],
  [8.2, 2],
  [8.6, 3],
]);

/**
 * @typedef {import('./estado.js').Entrada} Entrada
 * @typedef {'oscuro' | 'dia'} Tema
 *
 * @typedef {object} Marca
 * @property {string} id
 * @property {any} marcador
 * @property {any | null} halo
 * @property {number} version
 * @property {number} magnitud
 * @property {number} instante
 */


/**
 * Contenido de la ventana emergente (textos.md §7).
 * @param {Entrada} entrada
 * @param {number} ahora
 * @returns {{ nodo: HTMLElement, titulo: HTMLElement, hace: HTMLElement }}
 */
export function contenidoVentana(entrada, ahora) {
  const { sismo } = entrada;
  const mag = formatearMagnitud(sismo.magnitud);
  const lugar = formatearLugar(sismo.lugar);
  const titulo = crear('h2', { clase: 'p-tit', atributos: { tabindex: '-1' } }, [
    crear('span', {
      clase: `insignia b${bandaMagnitud(sismo.magnitud)}`,
      texto: mag,
      atributos: { 'aria-hidden': 'true' },
    }),
    crear('span', { texto: `M ${mag} · ${lugar}` }),
  ]);
  const fuente = NOMBRE_FUENTE[sismo.fuentePreferida] ?? '';
  const autor = sanear(sismo.autor, 32);
  const textoFuente = [fuente && `Fuente: ${fuente}`, autor && `autor: ${autor}`]
    .filter(Boolean)
    .join(' · ');
  const hace = crear('span', { clase: 'p-hace', texto: haceTexto(entrada.instante, ahora) });
  const profundidad =
    typeof sismo.profundidadKm === 'number' && Number.isFinite(sismo.profundidadKm)
      ? `${Math.round(sismo.profundidadKm) || 0} km`
      : 'Desconocida';

  const enlaces = [];
  const fuentes = Array.isArray(sismo.fuentes) ? sismo.fuentes : [];
  for (const f of fuentes) {
    const nombre = NOMBRE_FUENTE[f?.fuente];
    if (!nombre || !esUrlFichaValida(f.url)) continue; // AM-02: sin enlace si no pasa
    enlaces.push(
      crear('a', { atributos: { href: f.url, target: '_blank', rel: 'noopener noreferrer' } }, [
        `Más info en ${nombre}`,
        icono('externo', 'ico ico-s'),
        textoOculto(' (se abre en otra pestaña)'),
      ]),
    );
  }

  const nodo = crear('div', { clase: 'p-cuerpo' }, [
    titulo,
    crear('p', { clase: 'p-pais', texto: nombrePais(sismo.pais) }),
    textoFuente ? crear('p', { clase: 'p-fuente', texto: textoFuente }) : null,
    crear('dl', {}, [
      crear('dt', { texto: 'Hora local' }),
      crear('dd', {}, [
        crear('span', { texto: horaCompleta(entrada.instante, sismo.zonaHoraria) }),
        hace,
      ]),
      crear('dt', { texto: 'Profundidad' }),
      crear('dd', { texto: profundidad }),
      crear('dt', { texto: 'Coordenadas' }),
      crear('dd', { texto: formatearCoordenadas(sismo.lat, sismo.lon) }),
    ]),
    entrada.magnitudAnterior !== null
      ? crear('p', {
          clase: 'p-rev',
          texto: `Magnitud revisada: antes ${formatearMagnitud(entrada.magnitudAnterior)}`,
        })
      : null,
    enlaces.length > 0 ? crear('p', { clase: 'p-enlaces' }, enlaces) : null,
  ]);
  return { nodo, titulo, hace };
}

/**
 * Leyenda plegable (textos.md §7).
 * @param {boolean} abierta
 * @param {boolean} arriba el control está en una esquina superior
 */
function crearLeyenda(abierta, arriba) {
  // La flecha indica hacia dónde se moverá el contenido: abajo, la leyenda se despliega hacia
  // arriba; arriba (móvil), hacia abajo.
  const flecha = (/** @type {boolean} */ abrir) => (abrir !== arriba ? 'abajo' : 'arriba');
  const lista = crear(
    'ul',
    {},
    TEXTO_BANDA.map((texto, i) => {
      const [r, borde] = MUESTRAS[i];
      const svg = crearSvg('svg', {
        class: 'ley-muestra',
        viewBox: '0 0 34 20',
        'aria-hidden': 'true',
        focusable: 'false',
      });
      svg.append(
        crearSvg('circle', {
          class: `ley-b${i + 1}`,
          cx: '17',
          cy: '10',
          r: String(r),
          'stroke-width': String(borde),
        }),
      );
      return crear('li', {}, [svg, texto]);
    }),
  );
  const halo = crearSvg('svg', {
    class: 'ley-muestra',
    viewBox: '0 0 34 20',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  halo.append(
    crearSvg('circle', { class: 'ley-centro', cx: '17', cy: '10', r: '4', 'stroke-width': '1' }),
    crearSvg('circle', {
      class: 'ley-halo',
      cx: '17',
      cy: '10',
      r: '8.5',
      'stroke-width': '1.5',
      'stroke-dasharray': '3 3',
    }),
  );
  lista.append(crear('li', {}, [halo, 'Anillo discontinuo: última hora']));

  const contenido = crear(
    'div',
    { clase: 'leyenda', atributos: { id: 'leyenda-mapa', role: 'group' } },
    [crear('p', { clase: 'leyenda-tit', texto: 'Magnitud' }), lista],
  );
  contenido.setAttribute('aria-label', 'Leyenda: magnitud');
  contenido.hidden = !abierta;
  const boton = crear(
    'button',
    {
      clase: 'btn btn-sec btn-leyenda',
      atributos: {
        type: 'button',
        'aria-expanded': String(abierta),
        'aria-controls': 'leyenda-mapa',
      },
    },
    ['Leyenda', icono(flecha(abierta), 'ico ico-s')],
  );
  boton.addEventListener('click', () => {
    const abrir = contenido.hidden;
    contenido.hidden = !abrir;
    boton.setAttribute('aria-expanded', String(abrir));
    boton.querySelector('use')?.setAttribute('href', `#i-${flecha(abrir)}`);
  });
  return crear('div', { clase: 'leyenda-control' }, [boton, contenido]);
}

/**
 * @param {object} opciones
 * @param {HTMLElement} opciones.contenedor
 * @param {Tema} opciones.tema
 * @param {boolean} opciones.leyendaAbierta abierta y abajo a la izquierda (escritorio) o plegada
 *   y arriba a la derecha (móvil)
 * @param {() => number} [opciones.ahora]
 * @param {(id: string) => void} opciones.alPulsarMarcador
 * @param {(info: { id: string, focoDentro: boolean }) => void} opciones.alCerrarVentana
 */
export function crearMapa({
  contenedor,
  tema,
  leyendaAbierta,
  ahora = () => Date.now(),
  alPulsarMarcador,
  alCerrarVentana,
}) {
  const mapa = L.map(contenedor, {
    zoomControl: false,
    worldCopyJump: true,
    minZoom: 2,
    maxZoom: 16,
    zoomAnimation: !movimientoReducido(),
    fadeAnimation: !movimientoReducido(),
    markerZoomAnimation: !movimientoReducido(),
  }).setView([20, -40], 3);

  L.control
    .zoom({ position: 'topleft', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' })
    .addTo(mapa);
  mapa.attributionControl.setPrefix(PREFIJO_LEAFLET);

  mapa.createPane('halos');
  const panelHalos = mapa.getPane('halos');
  panelHalos.classList.add('panel-halos');
  const canvas = L.canvas({ padding: 0.5 });
  const grupoMarcadores = L.layerGroup().addTo(mapa);
  const grupoHalos = L.layerGroup().addTo(mapa);

  // Aviso si las teselas no cargan (textos.md §7).
  const avisoTeselas = crear('div', {
    clase: 'aviso-mapa',
    texto: 'No se puede cargar el mapa de fondo. Los sismos siguen en la lista y en el mapa.',
  });
  avisoTeselas.hidden = true;
  const ControlAviso = L.Control.extend({ onAdd: () => avisoTeselas });
  new ControlAviso({ position: 'topright' }).addTo(mapa);

  const leyenda = crearLeyenda(leyendaAbierta, !leyendaAbierta);
  L.DomEvent.disableClickPropagation(leyenda);
  L.DomEvent.disableScrollPropagation(leyenda);
  const ControlLeyenda = L.Control.extend({ onAdd: () => leyenda });
  // En móvil, arriba a la derecha: abajo la taparía la atribución, que ocupa varias líneas.
  new ControlLeyenda({ position: leyendaAbierta ? 'bottomleft' : 'topright' }).addTo(mapa);

  let temaActual = tema;
  /** @type {any[]} */
  let capas = [];
  let erroresTeselas = 0;

  /** @param {Tema} t */
  function ponerTeselas(t) {
    for (const capa of capas) mapa.removeLayer(capa);
    capas = TESELAS[t].map((nombre, i) =>
      new CapaTeselas(`${ESRI}/${nombre}/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16,
        attribution: i === 0 ? ATRIBUCION_ESRI : '',
      })
        .on('tileerror', () => {
          erroresTeselas += 1;
          if (erroresTeselas >= 3) avisoTeselas.hidden = false;
        })
        .on('tileload', () => {
          erroresTeselas = 0;
          avisoTeselas.hidden = true;
        })
        .addTo(mapa),
    );
  }
  ponerTeselas(tema);

  /** @type {Map<string, Marca>} */
  const marcas = new Map();
  /** @type {Marca[]} marcas en orden de dibujo ({@link ordenDibujo}) */
  let orden = [];
  /**
   * Sismos que ya han pulsado (o que ya no pulsarán), con su instante. Solo los de la última
   * hora: los demás se olvidan en `refrescar` (R-18, antes crecía sin límite).
   * @type {Map<string, number>}
   */
  const pulsados = new Map();
  let pulsosActivos = 0;
  let numHalos = 0;

  /**
   * @param {Entrada} entrada
   * @returns {any}
   */
  function crearMarcador(entrada) {
    const { sismo } = entrada;
    const marcador = L.circleMarker([sismo.lat, sismo.lon], {
      renderer: canvas,
      radius: radioMarcador(sismo.magnitud),
      color: BORDE[temaActual],
      weight: bordeMarcador(sismo.magnitud),
      opacity: 1,
      fillColor: COLOR_BANDA[bandaMagnitud(sismo.magnitud) - 1],
      fillOpacity: 0.75,
    });
    marcador.on('click', () => alPulsarMarcador(sismo.id));
    return marcador;
  }

  /**
   * @param {Entrada} entrada
   * @returns {any}
   */
  function crearHalo(entrada) {
    const { sismo } = entrada;
    return L.circleMarker([sismo.lat, sismo.lon], {
      renderer: canvas,
      radius: radioMarcador(sismo.magnitud) + 5,
      color: BORDE[temaActual],
      weight: 1.5,
      opacity: 1,
      dashArray: '3 3',
      fill: false,
      interactive: false,
    });
  }

  /** @param {Entrada} entrada */
  function pulsar(entrada) {
    const { sismo } = entrada;
    pulsosActivos += 1;
    // Anillo HTML que anima `transform` y `opacity` (CSS): lo mueve el compositor, sin repintar
    // una capa SVG del tamaño del mapa en cada frame (P-06). Tamaño por CSSOM, no por atributo.
    const diametro = 2 * radioMarcador(sismo.magnitud);
    const anillo = crear('span', { clase: `pulso pulso-b${bandaMagnitud(sismo.magnitud)}` });
    anillo.style.width = `${diametro}px`;
    anillo.style.height = `${diametro}px`;
    const pulso = L.marker([sismo.lat, sismo.lon], {
      pane: 'halos',
      icon: L.divIcon({ className: 'pulso-icono', html: anillo, iconSize: [diametro, diametro] }),
      interactive: false,
      keyboard: false,
    }).addTo(grupoHalos);
    setTimeout(() => {
      grupoHalos.removeLayer(pulso);
      pulsosActivos -= 1;
      contar();
    }, DURACION_PULSO_MS);
  }

  /**
   * Halo mientras el sismo tenga menos de 1 h. Devuelve `true` si el sismo es candidato a pulso
   * (reciente y sin pulsar todavía).
   * @param {Entrada} entrada
   * @param {Marca} marca
   * @param {number} t
   * @returns {boolean}
   */
  function ajustarHalo(entrada, marca, t) {
    const reciente = t - entrada.instante < UNA_HORA_MS;
    if (reciente && !marca.halo) {
      marca.halo = crearHalo(entrada).addTo(grupoHalos);
      numHalos += 1;
    } else if (!reciente && marca.halo) {
      grupoHalos.removeLayer(marca.halo);
      marca.halo = null;
      numHalos -= 1;
    }
    return reciente && !pulsados.has(entrada.sismo.id);
  }

  /**
   * Pulso de 3 ciclos para los candidatos (P-06): como mucho `MAX_PULSOS` a la vez, los más
   * recientes y solo los que están a la vista. Todos quedan marcados: no pulsan más tarde.
   * @param {Entrada[]} candidatos
   */
  function pulsarCandidatos(candidatos) {
    if (candidatos.length === 0) return;
    for (const e of candidatos) pulsados.set(e.sismo.id, e.instante);
    if (movimientoReducido()) return;
    const vista = mapa.getBounds().pad(0.1);
    const visibles = candidatos.filter((e) => vista.contains([e.sismo.lat, e.sismo.lon]));
    for (const e of elegirPulsos(visibles, MAX_PULSOS - pulsosActivos)) pulsar(e);
  }

  /** Recuento para las pruebas E2E (el canvas no deja contar los halos en el DOM). */
  function contar() {
    contenedor.dataset.halos = String(numHalos);
    contenedor.dataset.pulsos = String(pulsosActivos);
  }

  /** @param {Marca} marca */
  function sacarDeOrden(marca) {
    const i = posicionDibujo(orden, marca);
    if (orden[i] === marca) orden.splice(i, 1);
    else orden = orden.filter((m) => m !== marca);
  }

  /** @param {string} id */
  function quitar(id) {
    const marca = marcas.get(id);
    if (!marca) return;
    grupoMarcadores.removeLayer(marca.marcador);
    if (marca.halo) {
      grupoHalos.removeLayer(marca.halo);
      numHalos -= 1;
    }
    marcas.delete(id);
    sacarDeOrden(marca);
  }

  /**
   * Crea los marcadores de `nuevas` (ya quitados los anteriores) en su sitio del orden de dibujo.
   * @param {Entrada[]} nuevas
   * @param {number} t
   * @returns {Entrada[]} candidatas a pulso
   */
  function colocar(nuevas, t) {
    /** @type {Entrada[]} */
    const candidatos = [];
    if (nuevas.length === 0) return candidatos;
    /** @type {Marca[]} */
    const creadas = nuevas.map((e) => ({
      id: e.sismo.id,
      marcador: crearMarcador(e),
      halo: null,
      version: e.version,
      magnitud: e.sismo.magnitud,
      instante: e.instante,
    }));
    creadas.sort(ordenDibujo);
    let desde = orden.length;
    for (const marca of creadas) {
      const i = posicionDibujo(orden, marca);
      orden.splice(i, 0, marca);
      if (i < desde) desde = i;
      marcas.set(marca.id, marca);
      marca.marcador.addTo(grupoMarcadores);
    }
    // Los nuevos se han dibujado encima de todo. Si alguno debe ir debajo de marcadores que ya
    // estaban, se reordena desde el primero nuevo (operaciones de lista, un solo redibujado).
    if (orden.length - desde > creadas.length) {
      for (let i = desde; i < orden.length; i += 1) orden[i].marcador.bringToFront();
    }
    for (const e of nuevas) {
      const marca = marcas.get(e.sismo.id);
      if (marca && ajustarHalo(e, marca, t)) candidatos.push(e);
    }
    return candidatos;
  }

  /** @type {{ id: string, popup: any, hace: HTMLElement, focoDentro: boolean } | null} */
  let ventana = null;
  let solicitud = 0;

  mapa.on('popupclose', (/** @type {any} */ e) => {
    if (!ventana || e.popup !== ventana.popup) return;
    const { id, focoDentro } = ventana;
    ventana = null;
    alCerrarVentana({ id, focoDentro });
  });

  /**
   * @param {Entrada} entrada
   * @param {boolean} enfocar
   */
  function abrirAhora(entrada, enfocar) {
    const { nodo, titulo, hace } = contenidoVentana(entrada, ahora());
    const popup = L.popup({
      maxWidth: 300,
      minWidth: 230,
      autoPanPadding: [16, 16],
      className: 'ventana-sismo',
    })
      .setLatLng([entrada.sismo.lat, entrada.sismo.lon])
      .setContent(nodo);
    if (ventana) mapa.closePopup(ventana.popup);
    const actual = { id: entrada.sismo.id, popup, hace, focoDentro: false };
    ventana = actual;
    popup.openOn(mapa);
    const elemento = popup.getElement();
    const cerrar = elemento?.querySelector('.leaflet-popup-close-button');
    if (cerrar) {
      cerrar.setAttribute('aria-label', 'Cerrar');
      cerrar.setAttribute('title', 'Cerrar');
    }
    elemento?.addEventListener('focusin', () => {
      actual.focoDentro = true;
    });
    elemento?.addEventListener('focusout', (/** @type {FocusEvent} */ e) => {
      if (e.relatedTarget instanceof Node && !elemento.contains(e.relatedTarget)) {
        actual.focoDentro = false;
      }
    });
    elemento?.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        mapa.closePopup(popup);
      }
    });
    if (enfocar) titulo.focus({ preventScroll: true });
  }

  return Object.freeze({
    /**
     * Sincroniza todos los marcadores con las entradas (carga o cambio de filtros): diferencias
     * por id y versión.
     * @param {Entrada[]} entradas
     */
    sincronizar(entradas) {
      const t = ahora();
      const vigentes = new Set();
      /** @type {Entrada[]} */
      const nuevas = [];
      /** @type {Entrada[]} */
      const candidatos = [];
      for (const e of entradas) {
        vigentes.add(e.sismo.id);
        const marca = marcas.get(e.sismo.id);
        if (!marca || marca.version !== e.version) nuevas.push(e);
        else if (ajustarHalo(e, marca, t)) candidatos.push(e);
      }
      for (const id of [...marcas.keys()]) if (!vigentes.has(id)) quitar(id);
      for (const e of nuevas) quitar(e.sismo.id);
      candidatos.push(...colocar(nuevas, t));
      pulsarCandidatos(candidatos);
      if (ventana && !vigentes.has(ventana.id)) mapa.closePopup(ventana.popup);
      contar();
    },

    /**
     * Aplica solo los cambios de unos ids (stream, P-01): alta, revisión o baja.
     * @param {Iterable<string>} ids
     * @param {(id: string) => Entrada | undefined} obtener entrada vigente del estado
     */
    aplicarCambios(ids, obtener) {
      const t = ahora();
      /** @type {Entrada[]} */
      const nuevas = [];
      for (const id of ids) {
        const e = obtener(id);
        const marca = marcas.get(id);
        if (!e) {
          quitar(id);
          if (ventana?.id === id) mapa.closePopup(ventana.popup);
        } else if (!marca || marca.version !== e.version) {
          quitar(id);
          nuevas.push(e);
        }
      }
      pulsarCandidatos(colocar(nuevas, t));
      contar();
    },

    /** Recalcula halos y el «hace X» de la ventana abierta (cada 30 s). */
    refrescar(/** @type {Entrada[]} */ entradas) {
      const t = ahora();
      for (const e of entradas) {
        const marca = marcas.get(e.sismo.id);
        // Un sismo que deja de ser reciente no vuelve a ser candidato: aquí no se pulsa.
        if (marca) ajustarHalo(e, marca, t);
      }
      for (const [id, instante] of pulsados) {
        if (t - instante >= UNA_HORA_MS) pulsados.delete(id);
      }
      contar();
      if (ventana) {
        const e = entradas.find((x) => x.sismo.id === ventana?.id);
        if (e) ventana.hace.textContent = haceTexto(e.instante, t);
      }
    },

    /**
     * Vuela al sismo y abre su ventana emergente.
     * @param {Entrada} entrada
     * @param {{ enfocar?: boolean, volar?: boolean }} [opciones]
     */
    abrir(entrada, { enfocar = false, volar = true } = {}) {
      const id = ++solicitud;
      const destino = L.latLng(entrada.sismo.lat, entrada.sismo.lon);
      if (!volar) {
        abrirAhora(entrada, enfocar);
        return;
      }
      const zoom = Math.max(mapa.getZoom(), ZOOM_SISMO);
      const yaEsta = mapa.getZoom() === zoom && mapa.getBounds().pad(-0.2).contains(destino);
      if (yaEsta) {
        abrirAhora(entrada, enfocar);
      } else if (movimientoReducido()) {
        mapa.setView(destino, zoom, { animate: false });
        abrirAhora(entrada, enfocar);
      } else {
        mapa.once('moveend', () => {
          if (id === solicitud) abrirAhora(entrada, enfocar);
        });
        mapa.flyTo(destino, zoom, { duration: 0.8 });
      }
    },

    cerrarVentana() {
      if (ventana) mapa.closePopup(ventana.popup);
    },

    /** @returns {string | null} id del sismo con la ventana abierta */
    get idAbierto() {
      return ventana?.id ?? null;
    },

    /**
     * Encuadra los países marcados (al cambiar los países, no la magnitud ni el periodo).
     * @param {ReadonlyArray<string>} paises
     * @param {{ animar?: boolean }} [opciones]
     */
    encuadrar(paises, { animar = true } = {}) {
      const rect = paises.filter((p) => Object.hasOwn(ENCUADRE, p)).map((p) => ENCUADRE[p]);
      if (rect.length === 0) return;
      const limites = L.latLngBounds(rect.flat());
      mapa.fitBounds(limites, { padding: [16, 16], animate: animar && !movimientoReducido() });
    },

    /** @param {Tema} t */
    ponerTema(t) {
      if (t === temaActual) return;
      temaActual = t;
      ponerTeselas(t);
      for (const marca of marcas.values()) {
        marca.marcador.setStyle({ color: BORDE[t] });
        marca.halo?.setStyle({ color: BORDE[t] });
      }
    },

    invalidar() {
      mapa.invalidateSize();
    },
  });
}
