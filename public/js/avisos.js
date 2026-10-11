/**
 * Avisos del navegador (T4.7; PRD E4, HU-10 y HU-11; textos.md §8; amenazas AM-07, AM-22 y
 * AM-23). Lógica sin DOM: qué se notifica, con qué texto y a qué ritmo. Los estados del bloque
 * «Avisos» y el permiso están en `avisos-ui.js`.
 *
 * Reglas:
 * - solo sismos con `notificable: true` (el servidor ya descarta la carga inicial y los de hace
 *   más de 1 h), de un país marcado y con la magnitud **redondeada** ≥ umbral (D1, D4), aunque no
 *   cumplan los filtros de la lista;
 * - una sola vez por id, también tras una revisión o una fusión entre fuentes (`trasladar`);
 * - una revisión notifica solo si **cruza** el umbral: si el sismo ya se conocía por encima (de
 *   la carga inicial o de antes de activar los avisos), no se notifica;
 * - como máximo 3 avisos en cualquier ventana de 60 s; los que sobran se agrupan en un único aviso
 *   de resumen cuando vuelve a haber hueco (AM-22).
 */

import { etiquetaZona, horaCorta } from '/shared/hora.js';
import { sanear } from '/shared/texto.js';
import { NOMBRE_FUENTE, formatearLugar, lineaPaisProfundidad } from './formato.js';
import { formatearMagnitud, redondearMagnitud } from './magnitud.js';

/** Avisos como máximo en `VENTANA_LIMITE_MS` (AM-22). */
export const LIMITE_AVISOS = 3;
export const VENTANA_LIMITE_MS = 60_000;
/** Longitud máxima del título y de cada línea variable (AM-23). */
export const MAX_TEXTO = 120;
/**
 * Ids recordados (notificados y magnitudes conocidas); los más antiguos se olvidan. Cubre la
 * carga más grande (10 000 sismos, RNF-03) con margen.
 */
export const MAX_RECORDADOS = 20_000;
/** Icono propio, del mismo origen (AM-23: nunca una URL externa). */
export const ICONO = '/favicon.svg';

/**
 * @typedef {import('./estado.js').Sismo} Sismo
 *
 * @typedef {object} Aviso lo que se entrega a la API de notificaciones
 * @property {'sismo' | 'resumen' | 'prueba'} tipo
 * @property {string} titulo
 * @property {string} cuerpo
 * @property {string} etiqueta `tag`: el id del sismo (evita duplicados en el sistema)
 * @property {Sismo | null} sismo el sismo avisado (para abrirlo al pulsar)
 *
 * @typedef {'avisar' | 'inactivo' | 'ya-notificado' | 'no-notificable' | 'pais-no-marcado' |
 *   'bajo-umbral' | 'ya-superaba'} MotivoAviso
 */

/**
 * Umbral con un decimal: «4.5».
 * @param {number} umbral
 */
export function textoUmbral(umbral) {
  return umbral.toFixed(1);
}

/**
 * ¿Se avisa de este sismo? Función pura (PRD E4, HU-11, AM-22).
 * @param {object} p
 * @param {{ pais: string, magnitud: number }} p.sismo
 * @param {boolean} p.notificable `datos.notificable` del stream
 * @param {ReadonlyArray<string>} p.paises países marcados
 * @param {number} p.umbral
 * @param {boolean} p.yaNotificado
 * @param {number | undefined} p.magnitudPrevia magnitud redondeada con la que ya se conocía el
 *   sismo (carga inicial o evento anterior); `undefined` si no se conocía
 * @returns {{ motivo: MotivoAviso, antes: number | null }} `antes`: magnitud previa si el aviso
 *   es por una revisión que cruza el umbral
 */
export function decidirAviso({ sismo, notificable, paises, umbral, yaNotificado, magnitudPrevia }) {
  const no = (/** @type {MotivoAviso} */ motivo) => ({ motivo, antes: null });
  if (yaNotificado) return no('ya-notificado');
  if (notificable !== true) return no('no-notificable');
  if (!paises.includes(sismo.pais)) return no('pais-no-marcado');
  const m = redondearMagnitud(sismo.magnitud);
  if (!(m >= umbral)) return no('bajo-umbral');
  if (magnitudPrevia === undefined) return { motivo: 'avisar', antes: null };
  if (magnitudPrevia >= umbral) return no('ya-superaba');
  return { motivo: 'avisar', antes: magnitudPrevia !== m ? magnitudPrevia : null };
}

/**
 * Recorta a `max` puntos de código con «…» al final.
 * @param {string} texto
 * @param {number} max
 */
function recortar(texto, max) {
  const puntos = Array.from(texto);
  if (puntos.length <= max) return texto;
  return `${puntos
    .slice(0, Math.max(0, max - 1))
    .join('')
    .trimEnd()}…`;
}

/**
 * Título con el lugar recortado para que el total quepa en `MAX_TEXTO` (AM-23).
 * @param {string} antes texto fijo delante del lugar
 * @param {string} lugar
 * @param {string} despues texto fijo detrás del lugar
 */
function conLugar(antes, lugar, despues) {
  const hueco = MAX_TEXTO - Array.from(antes).length - Array.from(despues).length;
  return `${antes}${recortar(lugar, Math.max(1, hueco))}${despues}`;
}

/**
 * «Fuente: EMSC · autor: IGC.» (AM-07). Vacío si no se conoce la fuente.
 * @param {Partial<Sismo>} sismo
 */
function textoFuenteAutor(sismo) {
  const fuente =
    typeof sismo.fuentePreferida === 'string' && Object.hasOwn(NOMBRE_FUENTE, sismo.fuentePreferida)
      ? NOMBRE_FUENTE[/** @type {'emsc' | 'usgs'} */ (sismo.fuentePreferida)]
      : '';
  const autor = recortar(sanear(sismo.autor, 40), 20);
  if (!fuente) return '';
  return autor ? `Fuente: ${fuente} · autor: ${autor}. ` : `Fuente: ${fuente}. `;
}

/**
 * Texto de la notificación de un sismo (textos.md §8.3, PRD HU-11, AM-07, AM-23):
 * - título «M 5.2 · Golfo de Urabá · 07:42 (hora de Colombia)», como mucho 120 caracteres;
 * - cuerpo «Colombia · 12 km de profundidad. Pulsa para verlo en el mapa.» (con «· magnitud
 *   revisada (antes 4.3)» si cruza el umbral por una revisión) y, en otra línea, la fuente, el
 *   autor y «Solo informativo.».
 * Todo es texto plano: la API de notificaciones no interpreta HTML.
 * @param {Sismo} sismo
 * @param {{ antes?: number | null }} [opciones]
 * @returns {{ titulo: string, cuerpo: string }}
 */
export function textoAvisoSismo(sismo, { antes = null } = {}) {
  const instante = Date.parse(sismo.tiempo);
  const hora = `${horaCorta(instante, sismo.zonaHoraria)} (${etiquetaZona(sismo.zonaHoraria)})`;
  const titulo = conLugar(
    `M ${formatearMagnitud(sismo.magnitud)} · `,
    formatearLugar(sismo.lugar),
    ` · ${hora}`,
  );
  const linea = lineaPaisProfundidad(sismo);
  const revisada = antes === null ? '' : ` · magnitud revisada (antes ${formatearMagnitud(antes)})`;
  const cuerpo = `${linea}${revisada}. Pulsa para verlo en el mapa.\n${textoFuenteAutor(sismo)}Solo informativo.`;
  return { titulo, cuerpo };
}

/**
 * Aviso de resumen (textos.md §8.3, AM-22): «7 sismos de magnitud 4.5 o más».
 * @param {number} n
 * @param {number} umbral
 * @param {Sismo} mayor
 * @returns {{ titulo: string, cuerpo: string }}
 */
export function textoAvisoResumen(n, umbral, mayor) {
  const antes = `El mayor: M ${formatearMagnitud(mayor.magnitud)} · `;
  const despues = '. Pulsa para verlos en la lista.';
  return {
    titulo: `${n} sismos de magnitud ${textoUmbral(umbral)} o más`,
    cuerpo: `${conLugar(antes, formatearLugar(mayor.lugar), despues)}\nSolo informativo.`,
  };
}

/**
 * Notificación de prueba (textos.md §8.3).
 * @param {number} umbral
 * @returns {{ titulo: string, cuerpo: string }}
 */
export function textoAvisoPrueba(umbral) {
  return {
    titulo: 'Aviso de prueba',
    cuerpo: `Así verás los avisos de sismos de magnitud ${textoUmbral(umbral)} o más.`,
  };
}

/**
 * `Map` acotado: al pasar de un 25 % por encima de `MAX_RECORDADOS`, se conservan los
 * `MAX_RECORDADOS` más recientes. Se poda por lotes: borrar de uno en uno el más antiguo es
 * O(n) en cada inserción con los huecos que deja `Map` (O(n²) en una carga de 10 000 sismos).
 * @template V
 * @param {Map<string, V>} mapa
 * @param {string} clave
 * @param {V} valor
 */
function recordar(mapa, clave, valor) {
  mapa.delete(clave);
  mapa.set(clave, valor);
  if (mapa.size > MAX_RECORDADOS * 1.25) {
    const recientes = [...mapa].slice(-MAX_RECORDADOS);
    mapa.clear();
    for (const [k, v] of recientes) mapa.set(k, v);
  }
}

/**
 * Notificador: decide, deduplica, limita y agrupa. No sabe nada de la API del navegador: entrega
 * cada `Aviso` a `mostrar`.
 * @param {object} deps
 * @param {(aviso: Aviso) => void} deps.mostrar
 * @param {() => number} [deps.ahora]
 * @param {(fn: () => void, ms: number) => unknown} [deps.programar]
 * @param {(t: unknown) => void} [deps.cancelar]
 */
export function crearNotificador({
  mostrar,
  ahora = () => Date.now(),
  programar = (fn, ms) => setTimeout(fn, ms),
  cancelar = (t) => clearTimeout(/** @type {any} */ (t)),
}) {
  let activo = false;
  let umbral = 4.5;
  /** @type {Map<string, true>} ids ya notificados (sobrevive a revisiones y fusiones) */
  const notificados = new Map();
  /** @type {Map<string, number>} última magnitud redondeada conocida por id */
  const magnitudes = new Map();
  /** @type {number[]} instantes de los avisos enviados en la ventana */
  let enviados = [];
  /** @type {Sismo[]} avisos retenidos por el límite */
  let grupo = [];
  /** @type {unknown} */
  let temporizador = null;

  function limpiarVentana() {
    const t = ahora();
    enviados = enviados.filter((x) => t - x < VENTANA_LIMITE_MS);
  }

  /** @param {Aviso} aviso */
  function enviar(aviso) {
    enviados.push(ahora());
    mostrar(aviso);
  }

  /**
   * @param {Sismo} sismo
   * @param {number | null} antes
   */
  function avisoSismo(sismo, antes) {
    const { titulo, cuerpo } = textoAvisoSismo(sismo, { antes });
    return { tipo: /** @type {const} */ ('sismo'), titulo, cuerpo, etiqueta: sismo.id, sismo };
  }

  function vaciarGrupo() {
    temporizador = null;
    const pendientes = grupo;
    grupo = [];
    if (pendientes.length === 0 || !activo) return;
    if (pendientes.length === 1) {
      enviar(avisoSismo(pendientes[0], null));
      return;
    }
    const mayor = pendientes.reduce((a, b) =>
      redondearMagnitud(b.magnitud) > redondearMagnitud(a.magnitud) ? b : a,
    );
    const { titulo, cuerpo } = textoAvisoResumen(pendientes.length, umbral, mayor);
    enviar({ tipo: 'resumen', titulo, cuerpo, etiqueta: `resumen-${ahora()}`, sismo: null });
  }

  function programarGrupo() {
    if (temporizador !== null) return;
    limpiarVentana();
    const espera = enviados.length > 0 ? enviados[0] + VENTANA_LIMITE_MS - ahora() : 0;
    temporizador = programar(vaciarGrupo, Math.max(0, espera));
  }

  return Object.freeze({
    /**
     * @param {{ activo?: boolean, umbral?: number }} opciones
     */
    configurar(opciones) {
      if (typeof opciones.umbral === 'number' && Number.isFinite(opciones.umbral)) {
        umbral = opciones.umbral;
      }
      if (typeof opciones.activo === 'boolean') {
        activo = opciones.activo;
        if (!activo) {
          grupo = [];
          if (temporizador !== null) cancelar(temporizador);
          temporizador = null;
        }
      }
    },

    get activo() {
      return activo;
    },

    get umbral() {
      return umbral;
    },

    /**
     * Sismos de una carga (`GET /api/sismos`): se recuerda su magnitud y nunca se notifican
     * por haber llegado así (HU-11 «La carga inicial no notifica»).
     * @param {ReadonlyArray<unknown>} sismos
     */
    conocer(sismos) {
      for (const s of sismos) {
        const v = /** @type {Partial<Sismo>} */ (s);
        if (v && typeof v.id === 'string' && typeof v.magnitud === 'number') {
          recordar(magnitudes, v.id, redondearMagnitud(v.magnitud));
        }
      }
    },

    /**
     * Sismo llegado por el stream (`sismo.nuevo` o `sismo.actualizado`).
     * @param {{ sismo: Sismo, notificable: boolean, paises: ReadonlyArray<string> }} p
     * @returns {MotivoAviso | 'agrupado'}
     */
    procesar({ sismo, notificable, paises }) {
      const previa = magnitudes.get(sismo.id);
      recordar(magnitudes, sismo.id, redondearMagnitud(sismo.magnitud));
      if (!activo) return 'inactivo';
      const { motivo, antes } = decidirAviso({
        sismo,
        notificable,
        paises,
        umbral,
        yaNotificado: notificados.has(sismo.id),
        magnitudPrevia: previa,
      });
      if (motivo !== 'avisar') return motivo;
      recordar(notificados, sismo.id, true);
      limpiarVentana();
      if (grupo.length === 0 && enviados.length < LIMITE_AVISOS) {
        enviar(avisoSismo(sismo, antes));
        return 'avisar';
      }
      grupo.push(sismo);
      programarGrupo();
      return 'agrupado';
    },

    /**
     * `sismo.eliminado` con `motivo: fusionado`: el «ya notificado» y la magnitud pasan al id que
     * lo sustituye (contrato `DatosSismoEliminado`).
     * @param {string} id
     * @param {string | null} reemplazadoPor
     */
    trasladar(id, reemplazadoPor) {
      if (typeof reemplazadoPor !== 'string' || reemplazadoPor === '') return;
      if (notificados.has(id)) recordar(notificados, reemplazadoPor, true);
      const m = magnitudes.get(id);
      if (m !== undefined && !magnitudes.has(reemplazadoPor)) {
        recordar(magnitudes, reemplazadoPor, m);
      }
    },

    /** «Probar aviso»: no cuenta para el límite ni marca nada como notificado. */
    probar() {
      const { titulo, cuerpo } = textoAvisoPrueba(umbral);
      mostrar({ tipo: 'prueba', titulo, cuerpo, etiqueta: 'prueba', sismo: null });
    },

    /** @param {string} id */
    yaNotificado(id) {
      return notificados.has(id);
    },
  });
}

/** @typedef {ReturnType<typeof crearNotificador>} Notificador */

/**
 * Entrega un `Aviso` a la API `Notification` del navegador. Al pulsarlo: enfoca la pestaña,
 * cierra la notificación y llama a `alPulsar` (HU-11).
 * @param {object} deps
 * @param {typeof Notification} deps.NotificationImpl
 * @param {(aviso: Aviso) => void} deps.alPulsar
 * @param {() => void} [deps.enfocarPestana]
 * @returns {(aviso: Aviso) => boolean} `false` si el navegador no la ha creado
 */
export function crearMostrador({ NotificationImpl, alPulsar, enfocarPestana = () => {} }) {
  return (aviso) => {
    if (NotificationImpl.permission !== 'granted') return false;
    try {
      const n = new NotificationImpl(aviso.titulo, {
        body: aviso.cuerpo,
        tag: aviso.etiqueta,
        lang: 'es',
        icon: ICONO,
      });
      n.addEventListener('click', (e) => {
        e.preventDefault();
        enfocarPestana();
        n.close();
        alPulsar(aviso);
      });
      return true;
    } catch {
      // Android y algunos navegadores solo admiten notificaciones desde un service worker.
      return false;
    }
  };
}
