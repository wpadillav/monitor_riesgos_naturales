/**
 * Controlador de carga de la página (R-09 de la revisión T5.2): consulta `GET /api/sismos` con los
 * filtros actuales, coordina el stream y reintenta con espera creciente. Sin DOM: todo lo visible
 * lo hace `main.js` a través de `vista`, y los temporizadores y el reloj se inyectan para las
 * pruebas, como en `stream.js`.
 *
 * Ciclo de una carga: al empezar se cancela la consulta anterior y se cierra el stream; al
 * terminar bien, los sismos cargados se dan por conocidos (no se notifican) y el stream se abre
 * con el `ultimoEventoId` de la carga, de modo que no se pierde ni se duplica nada. Con
 * `flujo.reiniciar` (motivo `reanudacion`), recarga silenciosa y reapertura. El indicador pasa a
 * «En vivo» cuando el stream se abre (wireframes §6).
 */

import { ErrorApi } from './api.js';
import { formatearNumero } from './formato.js';

/** Aparece «Consultando las fuentes…» si la consulta tarda más que esto. */
export const LENTO_MS = 3_000;
/** Aparece «… está tardando más de lo normal» si la consulta tarda más que esto. */
export const MUY_LENTO_MS = 10_000;
/** Reintentos con espera creciente: primero a los 5 s y como máximo cada 60 s (RNF-06). */
export const ESPERAS_S = Object.freeze([5, 10, 20, 40, 60]);

/**
 * @typedef {'inicial' | 'filtros' | 'reanudacion'} MotivoCarga
 * @typedef {'lento' | 'muy-lento' | 'error-con-datos'} TipoAvisoCarga
 *
 * @typedef {object} VistaCarga lo que la página muestra (implementado en `main.js`)
 * @property {(tipo: TipoAvisoCarga | null, d?: { filtros: import('./filtros.js').Filtros })
 *   => void} aviso caja sobre la lista: consulta lenta, error con datos, o nada (`null`)
 * @property {(visible: boolean) => void} progreso barra de progreso de «Actualizando…»
 * @property {(ocupada: boolean) => void} ocupada lista marcada como ocupada (`aria-busy`)
 * @property {() => void} pintarVacio estados de la lista vacía (cargando, error, sin datos)
 * @property {(n: number) => void} ponerResultado número de resultados en los filtros
 * @property {(texto: string) => void} anunciar región viva para lectores de pantalla
 * @property {(fuentes: unknown) => void} ponerFuentes estado de las fuentes
 * @property {(segundos: number | null) => void} cuenta actualiza la cuenta atrás visible;
 *   `null` = las cuentas pintadas hasta ahora ya no valen
 */

/**
 * @param {object} deps
 * @param {{ consultarSismos: typeof import('./api.js').consultarSismos }} deps.api
 * @param {import('./estado.js').Estado} deps.estado
 * @param {{ abrir: () => void, cerrar: () => void }} deps.vivo
 * @param {{ poner: (e: any, d?: { n?: number, hora?: number | null }) => void }} deps.barra
 * @param {{ conocer: (sismos: ReadonlyArray<unknown>) => void }} deps.notificador
 * @param {() => import('./filtros.js').Filtros} deps.obtenerFiltros
 * @param {VistaCarga} deps.vista
 * @param {() => boolean} [deps.hayEventSource] ¿admite el navegador `EventSource`?
 * @param {() => number} [deps.ahora]
 * @param {(fn: () => void, ms: number) => unknown} [deps.programar]
 * @param {(t: unknown) => void} [deps.cancelar]
 * @param {(fn: () => void, ms: number) => unknown} [deps.repetir]
 * @param {(t: unknown) => void} [deps.pararRepetir]
 */
export function crearCargador({
  api,
  estado,
  vivo,
  barra,
  notificador,
  obtenerFiltros,
  vista,
  hayEventSource = () => Boolean(globalThis.EventSource),
  ahora = () => Date.now(),
  programar = (fn, ms) => setTimeout(fn, ms),
  cancelar = (t) => clearTimeout(/** @type {any} */ (t)),
  repetir = (fn, ms) => setInterval(fn, ms),
  pararRepetir = (t) => clearInterval(/** @type {any} */ (t)),
}) {
  let cargaHecha = false;
  let consultando = false;
  /** @type {ErrorApi | null} */
  let errorActual = null;
  /** @type {AbortController | null} */
  let controlador = null;
  /** @type {unknown} */
  let temporizadorLento = null;
  /** @type {unknown} */
  let temporizadorMuyLento = null;
  /** @type {unknown} */
  let temporizadorReintento = null;
  let intentos = 0;
  let segundosRestantes = 0;
  /** @type {MotivoCarga} */
  let motivoPendiente = 'inicial';
  /** @type {number | null} */
  let ultimaCarga = null;
  /** @type {string | null} */
  let ultimoEventoId = null;

  function cancelarReintento() {
    if (temporizadorReintento !== null) pararRepetir(temporizadorReintento);
    temporizadorReintento = null;
    vista.cuenta(null);
  }

  function terminarConsulta() {
    consultando = false;
    if (temporizadorLento !== null) cancelar(temporizadorLento);
    if (temporizadorMuyLento !== null) cancelar(temporizadorMuyLento);
    temporizadorLento = null;
    temporizadorMuyLento = null;
    vista.progreso(false);
    vista.ocupada(false);
  }

  /**
   * @param {number} n
   * @param {MotivoCarga} motivo
   */
  function anunciarResultado(n, motivo) {
    if (motivo === 'reanudacion') return;
    if (n === 0) vista.anunciar('No hay sismos con estos filtros.');
    else if (motivo === 'inicial') {
      vista.anunciar(n === 1 ? '1 sismo cargado.' : `${formatearNumero(n)} sismos cargados.`);
    } else {
      vista.anunciar(n === 1 ? 'Mostrando 1 sismo.' : `Mostrando ${formatearNumero(n)} sismos.`);
    }
  }

  /**
   * Consulta `GET /api/sismos` con los filtros actuales. Cancela la anterior (AbortController).
   * @param {MotivoCarga} motivo
   * @returns {Promise<void>}
   */
  async function cargar(motivo) {
    const filtros = obtenerFiltros();
    controlador?.abort();
    controlador = null;
    cancelarReintento();
    terminarConsulta();
    // El stream se reabre al terminar la carga, con su `ultimoEventoId`.
    vivo.cerrar();

    if (filtros.paises.length === 0) {
      errorActual = null;
      vista.aviso(null);
      cargaHecha = true;
      estado.reemplazar([]);
      barra.poner('sin-paises');
      vista.ponerResultado(0);
      vista.anunciar('Selecciona al menos un país.');
      return;
    }

    const ctrl = new AbortController();
    controlador = ctrl;
    const silenciosa = motivo === 'reanudacion';
    if (!silenciosa) {
      consultando = true;
      if (estado.tamano === 0) barra.poner('cargando');
      else {
        barra.poner('actualizando', { n: estado.tamano });
        vista.progreso(true);
      }
      vista.ocupada(true);
      vista.pintarVacio();
      temporizadorLento = programar(() => vista.aviso('lento', { filtros }), LENTO_MS);
      temporizadorMuyLento = programar(() => vista.aviso('muy-lento', { filtros }), MUY_LENTO_MS);
    }

    try {
      const respuesta = await api.consultarSismos(filtros, { signal: ctrl.signal });
      if (ctrl !== controlador || respuesta === null) return;
      controlador = null;
      terminarConsulta();
      intentos = 0;
      errorActual = null;
      vista.aviso(null);
      const primera = !cargaHecha;
      cargaHecha = true;
      ultimaCarga = ahora();
      ultimoEventoId = respuesta.ultimoEventoId;
      // Lo que llega en una carga nunca se notifica (HU-11; AM-22, también tras `flujo.reiniciar`).
      notificador.conocer(respuesta.sismos);
      estado.reemplazar(respuesta.sismos, { marcarNuevos: silenciosa });
      vista.ponerFuentes(respuesta.fuentes);
      // El indicador pasa a «En vivo» al abrirse el stream; sin `EventSource`, «Datos cargados».
      if (hayEventSource()) vivo.abrir();
      else barra.poner('cargado', { n: estado.tamano, hora: ultimaCarga });
      vista.ponerResultado(estado.tamano);
      anunciarResultado(estado.tamano, primera ? 'inicial' : motivo);
      vista.pintarVacio();
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
   * @param {MotivoCarga} motivo
   */
  function programarReintento(error, motivo) {
    const espera = ESPERAS_S[Math.min(intentos, ESPERAS_S.length - 1)];
    intentos += 1;
    segundosRestantes = espera;
    motivoPendiente = motivo;
    const primerError = errorActual === null;
    errorActual = error;
    vista.cuenta(null);

    barra.poner(error.tipo === 'red' ? 'sin-conexion' : 'error-servidor', { hora: ultimaCarga });

    if (estado.tamano > 0 && motivo !== 'reanudacion') vista.aviso('error-con-datos');
    else if (estado.tamano === 0) vista.aviso(null);
    vista.pintarVacio();
    if (primerError && estado.tamano === 0) vista.anunciar('No se han podido cargar los sismos.');

    temporizadorReintento = repetir(() => {
      segundosRestantes -= 1;
      if (segundosRestantes <= 0) {
        cancelarReintento();
        cargar(motivoPendiente);
        return;
      }
      vista.cuenta(segundosRestantes);
    }, 1000);
  }

  return Object.freeze({
    cargar,

    /** «Reintentar ahora»: repite la carga que falló, con su motivo. */
    reintentar() {
      return cargar(motivoPendiente);
    },

    /** ¿Ha terminado alguna carga (o se ha vaciado la lista por no haber países)? */
    get cargaHecha() {
      return cargaHecha;
    },

    /** ¿Hay una consulta visible en curso? (las silenciosas no cuentan) */
    get consultando() {
      return consultando;
    },

    /** Error de la última consulta, o `null` si fue bien. */
    get error() {
      return errorActual;
    },

    /** Segundos que faltan para el próximo reintento automático. */
    get segundosRestantes() {
      return segundosRestantes;
    },

    /** `ultimoEventoId` de la última carga correcta (para abrir el stream). */
    get ultimoEventoId() {
      return ultimoEventoId;
    },

    /** Instante (ms) de la última carga correcta. */
    get ultimaCarga() {
      return ultimaCarga;
    },
  });
}

/** @typedef {ReturnType<typeof crearCargador>} Cargador */
