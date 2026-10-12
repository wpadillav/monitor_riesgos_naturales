/**
 * Arranque de la página: tema, filtros, lista, mapa, carga desde `GET /api/sismos` (T4.5),
 * datos en vivo por `/api/stream` (T4.6b, `stream.js`) y avisos del navegador (T4.7,
 * `avisos.js` y `avisos-ui.js`).
 *
 * Este módulo solo cablea: la lógica de la carga y los reintentos está en `cargador.js` (R-09),
 * la del stream en `stream.js` y las reglas de filtro y aviso, compartidas con el servidor, en
 * `src/shared/reglas.js` (R-01, R-02 y R-06).
 *
 * Pintado (P-01): los cambios del estado se agrupan por frame (`agrupador.js`). Una carga repinta
 * la lista y sincroniza todo el mapa; los eventos del stream solo tocan los marcadores afectados.
 */

import { alcanzaAviso } from '/shared/reglas.js';
import { crearAgrupador } from './agrupador.js';
import { consultarFuentes, consultarSismos } from './api.js';
import { abrirVentanaPendiente, crearMostrador, crearNotificador } from './avisos.js';
import { crearAvisosUI } from './avisos-ui.js';
import { crearBarraEstado } from './barra-estado.js';
import { crearCargador } from './cargador.js';
import { crear, esMovil, icono } from './dom.js';
import { crearEstado } from './estado.js';
import { difiereDeDefecto, duracionPeriodo, textosPeriodo } from './filtros.js';
import { crearFiltrosUI } from './filtros-ui.js';
import { formatearNumero } from './formato.js';
import { textoFuentes } from './fuentes.js';
import { crearLista } from './lista.js';
import { crearMapa } from './mapa.js';
import {
  almacenNavegador,
  guardarFiltros,
  guardarTema,
  leerFiltros,
  leerTema,
  resolverTema,
} from './preferencias.js';
import { crearAnunciadorNuevos, crearConexionVivo } from './stream.js';

const SALUD_MS = 30_000;
const REFRESCO_MS = 30_000;

const almacen = almacenNavegador();

/* ---------- Anuncios para lectores de pantalla (textos.md §10) ---------- */
const regionAnuncios = /** @type {HTMLElement} */ (document.getElementById('anuncios'));
let temporizadorAnuncio = 0;
/** @param {string} texto */
function anunciar(texto) {
  clearTimeout(temporizadorAnuncio);
  regionAnuncios.textContent = '';
  temporizadorAnuncio = window.setTimeout(() => {
    regionAnuncios.textContent = texto;
  }, 60);
}

/* ---------- Tema: Sistema / Oscuro / Día (HU-09) ---------- */
const consultaClaro = window.matchMedia('(prefers-color-scheme: light)');
let preferenciaTema = leerTema(almacen);
const temaEfectivo = () => resolverTema(preferenciaTema, consultaClaro.matches);

/** @type {ReturnType<typeof crearMapa> | null} */
let mapa = null;

function aplicarTema() {
  const tema = temaEfectivo();
  document.documentElement.setAttribute('data-tema', tema);
  mapa?.ponerTema(tema);
}

for (const radio of /** @type {NodeListOf<HTMLInputElement>} */ (
  document.querySelectorAll('input[name="tema"]')
)) {
  radio.checked = radio.value === preferenciaTema;
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    preferenciaTema = /** @type {'sistema' | 'oscuro' | 'dia'} */ (radio.value);
    guardarTema(almacen, preferenciaTema);
    aplicarTema();
  });
}
consultaClaro.addEventListener('change', () => {
  if (preferenciaTema === 'sistema') aplicarTema();
});
aplicarTema();

/* ---------- Estado, lista y mapa ---------- */
const estado = crearEstado();
const barra = crearBarraEstado();
const scroller = /** @type {HTMLElement} */ (document.getElementById('lista-scroll'));
const ul = /** @type {HTMLUListElement} */ (document.getElementById('lista-sismos'));
const skeleton = /** @type {HTMLElement} */ (document.getElementById('skeleton'));
const vacio = /** @type {HTMLElement} */ (document.getElementById('lista-vacio'));
const caja = /** @type {HTMLElement} */ (document.getElementById('caja-aviso'));
const progreso = /** @type {HTMLElement} */ (document.getElementById('progreso'));
const contador = /** @type {HTMLElement} */ (document.getElementById('contador'));
const tituloLista = /** @type {HTMLElement} */ (document.getElementById('h-sismos'));
const contenedorMapa = /** @type {HTMLElement} */ (document.getElementById('mapa'));
const notaColombia = /** @type {HTMLElement} */ (document.getElementById('nota-colombia'));

/** @type {string | null} */
let seleccion = null;
/** @type {string | null} ventana abierta sola por un sismo nuevo (§8.4): al cerrarse no mueve el foco */
let ventanaAutomatica = null;
let abriendoAutomatica = false;

/**
 * De la lista al mapa: vuela al sismo, abre su ventana y, con teclado, lleva el foco al título.
 * @param {string} id
 * @param {{ enfocar: boolean }} opciones
 */
function verEnMapa(id, { enfocar }) {
  agrupador.vaciar();
  const entrada = estado.obtener(id);
  if (!entrada || !mapa) return;
  ventanaAutomatica = null;
  seleccion = id;
  lista.seleccionar(id);
  if (esMovil()) contenedorMapa.scrollIntoView({ block: 'nearest' });
  mapa.abrir(entrada, { enfocar });
}

/**
 * Sismo nuevo que supera el umbral con la pestaña a la vista (textos.md §8.4): abre su ventana
 * **sin mover el foco**. No sustituye una ventana en la que el usuario tiene el foco.
 * @param {string} id
 */
function abrirSinFoco(id) {
  agrupador.vaciar();
  const entrada = estado.obtener(id);
  if (!entrada || !mapa) return;
  const activo = document.activeElement;
  if (activo instanceof Element && activo.closest('.leaflet-popup')) return;
  // La ventana que se cierre al abrir esta tampoco mueve el foco.
  abriendoAutomatica = true;
  try {
    mapa.abrir(entrada, { volar: false, enfocar: false });
  } finally {
    abriendoAutomatica = false;
  }
  ventanaAutomatica = id;
}

/**
 * Clic en la notificación de un sismo (HU-11): ventana emergente con el foco en su título. Si el
 * sismo no está en la lista (aviso por debajo de la magnitud mínima de la lista, D4), se abre la
 * ventana con los datos del aviso.
 * @param {string} id
 * @param {import('./estado.js').Sismo | null} sismo
 */
function verAviso(id, sismo) {
  if (estado.obtener(id)) {
    verEnMapa(id, { enfocar: true });
    return;
  }
  if (!sismo || !mapa) return;
  ventanaAutomatica = null;
  if (esMovil()) contenedorMapa.scrollIntoView({ block: 'nearest' });
  mapa.abrir(
    {
      sismo,
      instante: Date.parse(sismo.tiempo),
      llegadoEn: null,
      magnitudAnterior: null,
      version: 0,
    },
    { enfocar: true },
  );
}

const lista = crearLista({
  scroller,
  ul,
  alActivar: (id, { teclado }) => verEnMapa(id, { enfocar: teclado }),
});

mapa = crearMapa({
  contenedor: contenedorMapa,
  tema: temaEfectivo(),
  leyendaAbierta: !esMovil(),
  alPulsarMarcador(id) {
    agrupador.vaciar();
    const entrada = estado.obtener(id);
    if (!entrada || !mapa) return;
    seleccion = id;
    mapa.abrir(entrada, { volar: false, enfocar: false });
    lista.seleccionar(id, { desplazar: true });
  },
  alCerrarVentana({ id, focoDentro }) {
    if (seleccion === id) {
      seleccion = null;
      lista.seleccionar(null);
    }
    const automatica = abriendoAutomatica || ventanaAutomatica === id;
    if (automatica) ventanaAutomatica = null;
    // Esc o «Cerrar» devuelven el foco al elemento de la lista (wireframes §9.2). Una ventana
    // que se abrió sola y se cierra sin haber tenido el foco no lo mueve (§8.4).
    if (focoDentro || (!automatica && document.activeElement === document.body)) {
      lista.enfocar(id);
    }
  },
});
new ResizeObserver(() => mapa?.invalidar()).observe(contenedorMapa);

/* ---------- Filtros ---------- */
const filtrosUI = crearFiltrosUI({
  inicial: leerFiltros(almacen),
  anunciar,
  alCambiar(filtros, { paisesCambiados }) {
    guardarFiltros(almacen, filtros);
    notaColombia.hidden = !filtros.paises.includes('CO');
    if (paisesCambiados && filtros.paises.length > 0) mapa?.encuadrar(filtros.paises);
    cargador.cargar('filtros');
  },
  alVer() {
    if (!lista.enfocar()) tituloLista.focus();
  },
});
notaColombia.hidden = !filtrosUI.filtros.paises.includes('CO');
tituloLista.setAttribute('tabindex', '-1');

/* ---------- Pintado de los datos ---------- */
/**
 * Sismo nuevo cuya ventana se abre sola tras el próximo pintado (§8.4), con el instante en que
 * llegó. Se descarta si al pintar ya no procede (N-05, {@link abrirVentanaPendiente}).
 * @type {{ id: string, pedidaEn: number } | null}
 */
let ventanaPendiente = null;
// Al ocultar la pestaña, la ventana pendiente se descarta: no se abre al volver (N-05).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') ventanaPendiente = null;
});

/**
 * Un pintado por frame como mucho (P-01).
 * @param {import('./agrupador.js').Lote} lote
 */
function pintarDatos(lote) {
  const entradas = estado.lista();
  lista.actualizar(entradas);
  if (lote.completo) mapa?.sincronizar(entradas);
  else mapa?.aplicarCambios(lote.ids, (id) => estado.obtener(id));
  const texto = cargador.cargaHecha ? `(${formatearNumero(entradas.length)})` : '';
  if (contador.textContent !== texto) contador.textContent = texto;
  pintarVacio();
  // En una ráfaga solo se abre la ventana del último sismo que la pedía, no una por evento.
  const pendiente = ventanaPendiente;
  ventanaPendiente = null;
  if (
    pendiente !== null &&
    abrirVentanaPendiente({
      pedidaEn: pendiente.pedidaEn,
      ahora: Date.now(),
      visibilidad: document.visibilityState,
      magnitud: estado.obtener(pendiente.id)?.sismo.magnitud ?? null,
      umbral: avisosUI.umbral,
    })
  ) {
    abrirSinFoco(pendiente.id);
  }
}

const agrupador = crearAgrupador({ pintar: pintarDatos });
estado.suscribir((cambio) => agrupador.anotar(cambio));

/** Estados de la lista (textos.md §6). */
function pintarVacio() {
  const filtros = filtrosUI.filtros;
  const n = estado.tamano;
  const { consultando, error: errorActual, cargaHecha } = cargador;
  skeleton.hidden = !(consultando && n === 0 && !errorActual);
  /** @type {Node[] | null} */
  let contenido = null;
  vacio.classList.remove('error');
  if (filtros.paises.length === 0) {
    const abrir = crear('button', {
      clase: 'btn btn-sec solo-movil',
      texto: 'Abrir filtros',
      atributos: { type: 'button' },
    });
    abrir.addEventListener('click', () => filtrosUI.abrirYEnfocar());
    contenido = [
      icono('mapa', 'ico ico-g'),
      crear('p', { clase: 'v-tit', texto: 'Selecciona al menos un país' }),
      crear('p', {
        clase: 'v-texto',
        texto: 'Marca España, Colombia o Panamá en Filtros para ver sus sismos.',
      }),
      abrir,
    ];
  } else if (errorActual && n === 0) {
    vacio.classList.add('error');
    const reintentar = crear('button', {
      clase: 'btn btn-pri',
      texto: 'Reintentar ahora',
      atributos: { type: 'button' },
    });
    reintentar.addEventListener('click', () => cargador.reintentar());
    const texto =
      errorActual.tipo === 'red'
        ? 'El servidor local no responde. Comprueba que sigue en marcha (npm start). '
        : 'El servidor local ha devuelto un error. ';
    contenido = [
      icono('triangulo', 'ico ico-g'),
      crear('p', { clase: 'v-tit', texto: 'No se han podido cargar los sismos' }),
      crear('p', { clase: 'v-texto' }, [texto, ...textoCuentaAtras()]),
      reintentar,
    ];
  } else if (cargaHecha && !consultando && n === 0) {
    contenido = [
      icono('lupa', 'ico ico-g'),
      crear('p', { clase: 'v-tit', texto: 'No hay sismos con estos filtros' }),
      crear('p', {
        clase: 'v-texto',
        texto: 'Prueba a bajar la magnitud mínima o a elegir un periodo más largo.',
      }),
    ];
    if (difiereDeDefecto(filtros)) {
      const restablecer = crear('button', {
        clase: 'btn btn-sec',
        texto: 'Restablecer filtros',
        atributos: { type: 'button' },
      });
      restablecer.addEventListener('click', () => filtrosUI.restablecer());
      contenido.push(restablecer);
    }
  }
  if (contenido) vacio.replaceChildren(...contenido);
  vacio.hidden = contenido === null;
}

/* ---------- Avisos sobre la lista (consulta lenta, error con datos) ---------- */
/**
 * @param {'neutro' | 'error' | null} tipo
 * @param {(Node | string)[]} [hijos]
 */
function ponerCaja(tipo, hijos = []) {
  caja.hidden = tipo === null;
  caja.className = `caja-aviso${tipo === 'error' ? ' error' : ''}`;
  if (tipo !== null) caja.replaceChildren(...hijos);
}

/* ---------- Carga con reintentos (cargador.js) ---------- */
/** @type {HTMLElement[]} números de las cuentas atrás pintadas */
let cuentas = [];
/** @type {string | null} */
let ultimoTextoFuentes = null;

/** @returns {(Node | string)[]} «Volveremos a intentarlo en {n} s.» con el número actualizable */
function textoCuentaAtras() {
  const n = crear('span', { texto: String(cargador.segundosRestantes) });
  cuentas.push(n);
  return ['Volveremos a intentarlo en ', n, ' s.'];
}

/** @param {unknown} fuentes */
function ponerFuentes(fuentes) {
  const ahora = Date.now();
  barra.ponerFuentes(fuentes, ahora);
  const texto = textoFuentes(fuentes, ahora);
  if (texto !== null && texto !== ultimoTextoFuentes) {
    anunciar(texto.endsWith('.') ? texto : `${texto}.`);
  }
  ultimoTextoFuentes = texto;
}

/**
 * Caja sobre la lista según el estado de la carga.
 * @param {import('./cargador.js').TipoAvisoCarga | null} tipo
 * @param {{ filtros: import('./filtros.js').Filtros }} [datos]
 */
function avisoCarga(tipo, datos) {
  if (tipo === null) {
    ponerCaja(null);
  } else if (tipo === 'lento') {
    ponerCaja('neutro', ['Consultando las fuentes. Con 7 o 30 días puede tardar unos segundos.']);
  } else if (tipo === 'muy-lento') {
    const periodo = textosPeriodo((datos?.filtros ?? filtrosUI.filtros).periodo).enFrase;
    ponerCaja('neutro', [
      `La consulta de ${periodo} está tardando más de lo normal. Seguimos intentándolo.`,
    ]);
  } else {
    const reintentar = crear('button', {
      clase: 'btn-texto',
      texto: 'Reintentar ahora',
      atributos: { type: 'button' },
    });
    reintentar.addEventListener('click', () => cargador.reintentar());
    ponerCaja('error', [
      icono('triangulo', 'ico ico-s'),
      crear('span', {}, [
        'No se han podido aplicar los filtros. Se muestran los resultados anteriores. ',
        ...textoCuentaAtras(),
      ]),
      reintentar,
    ]);
  }
}

/* ---------- Avisos (T4.7) ---------- */
const NotificationApi =
  typeof globalThis.Notification === 'function' ? globalThis.Notification : null;

const notificador = crearNotificador({
  mostrar: NotificationApi
    ? crearMostrador({
        NotificationImpl: NotificationApi,
        enfocarPestana: () => window.focus(),
        alPulsar(aviso) {
          if (aviso.tipo === 'sismo' && aviso.sismo) verAviso(aviso.sismo.id, aviso.sismo);
          else if (aviso.tipo === 'resumen' && !lista.enfocar()) tituloLista.focus();
        },
      })
    : () => {},
});

const avisosUI = crearAvisosUI({
  contenedor: /** @type {HTMLElement} */ (document.getElementById('avisos-cuerpo')),
  almacen,
  anunciar,
  notificador,
  NotificationImpl: NotificationApi,
  alCambiar() {
    filtrosUI.ponerAvisos(avisosUI.estado === 'activados');
    vivo.reabrir();
  },
});
filtrosUI.ponerAvisos(avisosUI.estado === 'activados');

/* ---------- Datos en vivo (T4.6b) ---------- */
const anunciadorNuevos = crearAnunciadorNuevos({ anunciar });

/**
 * Cada sismo que llega por el stream: anuncio, aviso del navegador y, con la pestaña a la vista,
 * su ventana emergente si supera el umbral (textos.md §8.4 y §10).
 * @param {import('./stream.js').Resultado} r
 */
function alEventoVivo(r) {
  if (r.tipo === 'sismo.eliminado') {
    if (r.motivo === 'fusionado') notificador.trasladar(r.id, r.reemplazadoPor);
    return;
  }
  if (r.alta && r.enLista) anunciadorNuevos.nuevo(r.sismo);
  notificador.procesar({
    sismo: r.sismo,
    notificable: r.notificable,
    paises: filtrosUI.filtros.paises,
  });
  if (
    r.alta &&
    r.enLista &&
    r.notificable &&
    alcanzaAviso(r.sismo.magnitud, avisosUI.umbral) &&
    document.visibilityState === 'visible'
  ) {
    ventanaPendiente = { id: r.sismo.id, pedidaEn: Date.now() };
  }
}

const vivo = crearConexionVivo({
  estado,
  barra,
  obtenerFiltros: () => filtrosUI.filtros,
  obtenerUltimoEventoId: () => cargador.ultimoEventoId,
  obtenerAvisoMin: () => avisosUI.avisoMin,
  recargar: () => cargador.cargar('reanudacion'),
  ponerFuentes,
  alEvento: alEventoVivo,
});

const cargador = crearCargador({
  api: { consultarSismos },
  estado,
  vivo,
  barra,
  notificador,
  obtenerFiltros: () => filtrosUI.filtros,
  vista: {
    aviso: avisoCarga,
    progreso(visible) {
      progreso.hidden = !visible;
    },
    ocupada: (ocupada) => lista.ponerOcupada(ocupada),
    pintarVacio,
    ponerResultado: (n) => filtrosUI.ponerResultado(n),
    anunciar,
    ponerFuentes,
    cuenta(segundos) {
      if (segundos === null) cuentas = [];
      else for (const n of cuentas) n.textContent = String(segundos);
    },
  },
});

/* ---------- Tareas periódicas ---------- */
// «hace X», etiqueta «Nuevo», halos y sismos que salen del periodo (HU-05), cada 30 s.
window.setInterval(() => {
  const desde = Date.now() - duracionPeriodo(filtrosUI.filtros.periodo);
  if (estado.purgar(desde).length === 0) lista.refrescar();
  mapa?.refrescar(estado.lista());
}, REFRESCO_MS);

// Estado de las fuentes (también cuando no hay países y no se consulta nada).
async function revisarFuentes() {
  try {
    ponerFuentes(await consultarFuentes());
  } catch {
    // El error de conexión ya lo muestra la carga de sismos.
  }
}
window.setInterval(revisarFuentes, SALUD_MS);

/* ---------- Enlace para saltar y pie en móvil ---------- */
document.querySelector('.saltar')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!lista.enfocar()) tituloLista.focus();
});

const pie = /** @type {HTMLElement} */ (document.querySelector('.pie'));
const botonFuentes = /** @type {HTMLButtonElement} */ (document.getElementById('btn-fuentes'));
botonFuentes.addEventListener('click', () => {
  const abrir = botonFuentes.getAttribute('aria-expanded') !== 'true';
  pie.classList.toggle('abierto', abrir);
  botonFuentes.setAttribute('aria-expanded', String(abrir));
});

/* ---------- Arranque ---------- */
mapa.encuadrar(filtrosUI.filtros.paises, { animar: false });
cargador.cargar('inicial');
