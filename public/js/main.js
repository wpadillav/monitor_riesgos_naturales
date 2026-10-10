/**
 * Arranque de la página (T4.5): tema, filtros, lista, mapa y carga desde `GET /api/sismos`.
 *
 * **Integración con T4.6b y T4.7.** Todo lo que necesitan está en el objeto `integracion` de
 * abajo: el estado de la vista (`aplicarSismo`, `eliminarSismo`, `reemplazar`, `suscribir`),
 * la barra de estado (`poner('en-vivo' | 'reconectando' | 'sin-conexion')`, `ponerFuentes`),
 * los filtros actuales, el `ultimoEventoId` de la última carga y `recargar()`. Hasta que exista
 * el stream, `iniciarRecargaPeriodica` vuelve a pedir `/api/sismos` cada minuto; T4.6b la
 * sustituye por la suscripción SSE.
 */

import { ErrorApi, consultarFuentes, consultarSismos } from './api.js';
import { crearBarraEstado } from './barra-estado.js';
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

const RECARGA_MS = 60_000;
const SALUD_MS = 30_000;
const REFRESCO_MS = 30_000;
const LENTO_MS = 3_000;
const MUY_LENTO_MS = 10_000;
/** Reintentos con espera creciente: primero a los 5 s y como máximo cada 60 s (RNF-06). */
const ESPERAS_S = Object.freeze([5, 10, 20, 40, 60]);

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

/**
 * De la lista al mapa: vuela al sismo, abre su ventana y, con teclado, lleva el foco al título.
 * @param {string} id
 * @param {{ enfocar: boolean }} opciones
 */
function verEnMapa(id, { enfocar }) {
  const entrada = estado.obtener(id);
  if (!entrada || !mapa) return;
  seleccion = id;
  lista.seleccionar(id);
  if (esMovil()) contenedorMapa.scrollIntoView({ block: 'nearest' });
  mapa.abrir(entrada, { enfocar });
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
    // Esc o «Cerrar» devuelven el foco al elemento de la lista (wireframes §9.2).
    if (focoDentro || document.activeElement === document.body) lista.enfocar(id);
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
    cargar('filtros');
  },
  alVer() {
    if (!lista.enfocar()) tituloLista.focus();
  },
});
notaColombia.hidden = !filtrosUI.filtros.paises.includes('CO');
tituloLista.setAttribute('tabindex', '-1');

/* ---------- Pintado de los datos ---------- */
let cargaHecha = false;
let consultando = false;
/** @type {ErrorApi | null} */
let errorActual = null;
let pintadoPendiente = false;

function pintarDatos() {
  pintadoPendiente = false;
  const entradas = estado.lista();
  lista.actualizar(entradas);
  mapa?.sincronizar(entradas);
  contador.textContent = cargaHecha ? `(${formatearNumero(entradas.length)})` : '';
  pintarVacio();
}

estado.suscribir(() => {
  if (pintadoPendiente) return;
  pintadoPendiente = true;
  queueMicrotask(pintarDatos);
});

/** Estados de la lista (textos.md §6). */
function pintarVacio() {
  const filtros = filtrosUI.filtros;
  const n = estado.tamano;
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
    reintentar.addEventListener('click', () => cargar(motivoPendiente));
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

/* ---------- Carga con reintentos ---------- */
/** @type {AbortController | null} */
let controlador = null;
let temporizadorLento = 0;
let temporizadorMuyLento = 0;
let intentos = 0;
let temporizadorReintento = 0;
let segundosRestantes = 0;
/** @type {'inicial' | 'filtros' | 'periodica'} */
let motivoPendiente = 'inicial';
/** @type {HTMLElement[]} */
let cuentas = [];
/** @type {number | null} */
let ultimaCarga = null;
/** @type {string | null} */
let ultimoEventoId = null;
/** @type {string | null} */
let ultimoTextoFuentes = null;

/** @returns {(Node | string)[]} «Volveremos a intentarlo en {n} s.» con el número actualizable */
function textoCuentaAtras() {
  const n = crear('span', { texto: String(segundosRestantes) });
  cuentas.push(n);
  return ['Volveremos a intentarlo en ', n, ' s.'];
}

function cancelarReintento() {
  clearInterval(temporizadorReintento);
  temporizadorReintento = 0;
  cuentas = [];
}

function terminarConsulta() {
  consultando = false;
  clearTimeout(temporizadorLento);
  clearTimeout(temporizadorMuyLento);
  progreso.hidden = true;
  lista.ponerOcupada(false);
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
 * @param {number} n
 * @param {'inicial' | 'filtros' | 'periodica'} motivo
 */
function anunciarResultado(n, motivo) {
  if (motivo === 'periodica') return;
  if (n === 0) anunciar('No hay sismos con estos filtros.');
  else if (motivo === 'inicial') {
    anunciar(n === 1 ? '1 sismo cargado.' : `${formatearNumero(n)} sismos cargados.`);
  } else anunciar(n === 1 ? 'Mostrando 1 sismo.' : `Mostrando ${formatearNumero(n)} sismos.`);
}

/**
 * Consulta `GET /api/sismos` con los filtros actuales. Cancela la anterior (AbortController).
 * @param {'inicial' | 'filtros' | 'periodica'} motivo
 */
async function cargar(motivo) {
  const filtros = filtrosUI.filtros;
  controlador?.abort();
  controlador = null;
  cancelarReintento();
  terminarConsulta();

  if (filtros.paises.length === 0) {
    errorActual = null;
    ponerCaja(null);
    cargaHecha = true;
    estado.reemplazar([]);
    barra.poner('sin-paises');
    filtrosUI.ponerResultado(0);
    anunciar('Selecciona al menos un país.');
    return;
  }

  const ctrl = new AbortController();
  controlador = ctrl;
  const silenciosa = motivo === 'periodica';
  if (!silenciosa) {
    consultando = true;
    if (estado.tamano === 0) barra.poner('cargando');
    else {
      barra.poner('actualizando', { n: estado.tamano });
      progreso.hidden = false;
    }
    lista.ponerOcupada(true);
    pintarVacio();
    temporizadorLento = window.setTimeout(() => {
      ponerCaja('neutro', ['Consultando las fuentes. Con 7 o 30 días puede tardar unos segundos.']);
    }, LENTO_MS);
    temporizadorMuyLento = window.setTimeout(() => {
      const periodo = textosPeriodo(filtros.periodo).enFrase;
      ponerCaja('neutro', [
        `La consulta de ${periodo} está tardando más de lo normal. Seguimos intentándolo.`,
      ]);
    }, MUY_LENTO_MS);
  }

  try {
    const respuesta = await consultarSismos(filtros, { signal: ctrl.signal });
    if (ctrl !== controlador || respuesta === null) return;
    controlador = null;
    terminarConsulta();
    intentos = 0;
    errorActual = null;
    ponerCaja(null);
    const primera = !cargaHecha;
    cargaHecha = true;
    ultimaCarga = Date.now();
    ultimoEventoId = respuesta.ultimoEventoId;
    estado.reemplazar(respuesta.sismos, { marcarNuevos: silenciosa });
    ponerFuentes(respuesta.fuentes);
    barra.poner('cargado', { n: estado.tamano, hora: ultimaCarga });
    filtrosUI.ponerResultado(estado.tamano);
    anunciarResultado(estado.tamano, primera ? 'inicial' : motivo);
    pintarVacio();
  } catch (err) {
    if (ctrl !== controlador || ctrl.signal.aborted) return;
    controlador = null;
    terminarConsulta();
    programarReintento(err instanceof ErrorApi ? err : new ErrorApi('red'), motivo);
  }
}

/**
 * Error: reintento automático con espera creciente y cuenta atrás que no se anuncia.
 * @param {ErrorApi} error
 * @param {'inicial' | 'filtros' | 'periodica'} motivo
 */
function programarReintento(error, motivo) {
  const espera = ESPERAS_S[Math.min(intentos, ESPERAS_S.length - 1)];
  intentos += 1;
  segundosRestantes = espera;
  motivoPendiente = motivo === 'periodica' ? 'periodica' : motivo;
  const primerError = errorActual === null;
  errorActual = error;
  cuentas = [];

  barra.poner(error.tipo === 'red' ? 'sin-conexion' : 'error-servidor', { hora: ultimaCarga });

  if (estado.tamano > 0 && motivo !== 'periodica') {
    const reintentar = crear('button', {
      clase: 'btn-texto',
      texto: 'Reintentar ahora',
      atributos: { type: 'button' },
    });
    reintentar.addEventListener('click', () => cargar(motivoPendiente));
    ponerCaja('error', [
      icono('triangulo', 'ico ico-s'),
      crear('span', {}, [
        'No se han podido aplicar los filtros. Se muestran los resultados anteriores. ',
        ...textoCuentaAtras(),
      ]),
      reintentar,
    ]);
  } else if (estado.tamano === 0) {
    ponerCaja(null);
  }
  pintarVacio();
  if (primerError && estado.tamano === 0) anunciar('No se han podido cargar los sismos.');

  temporizadorReintento = window.setInterval(() => {
    segundosRestantes -= 1;
    if (segundosRestantes <= 0) {
      cancelarReintento();
      cargar(motivoPendiente);
      return;
    }
    for (const n of cuentas) n.textContent = String(segundosRestantes);
  }, 1000);
}

/* ---------- Integración con T4.6b (stream) y T4.7 (avisos) ---------- */
export const integracion = Object.freeze({
  estado,
  barra,
  anunciar,
  /** @returns {import('./filtros.js').Filtros} */
  obtenerFiltros: () => filtrosUI.filtros,
  /** @returns {string | null} `ultimoEventoId` de la última carga (para `/api/stream`) */
  obtenerUltimoEventoId: () => ultimoEventoId,
  /** Abre la ventana emergente de un sismo (clic en una notificación, T4.7). */
  verEnMapa,
  recargar: () => cargar('filtros'),
});

/**
 * Provisional hasta T4.6b: vuelve a pedir los sismos cada minuto. Los que no estaban se marcan
 * como «Nuevo». T4.6b sustituye esta función por la suscripción a `/api/stream`.
 */
function iniciarRecargaPeriodica() {
  window.setInterval(() => {
    if (controlador || temporizadorReintento || filtrosUI.filtros.paises.length === 0) return;
    cargar('periodica');
  }, RECARGA_MS);
}

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
cargar('inicial');
iniciarRecargaPeriodica();
