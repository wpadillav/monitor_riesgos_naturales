/**
 * Bloque «Avisos» del panel de filtros (T4.7; HU-10; textos.md §8.1 y §8.2; wireframes §7).
 *
 * - **Nunca se pide permiso al cargar:** solo al pulsar «Activar avisos».
 * - Estados: inicial, esperando, sin respuesta, activados, desactivados, bloqueados y no
 *   soportado. Al cambiar de estado, si el foco estaba en el bloque, pasa al control
 *   equivalente (wireframes §9.1, paso 10).
 * - El umbral («Avisar desde») y si están activados se guardan en `localStorage` (AM-27).
 */

import { OPCIONES_AVISO_MIN } from '/shared/reglas.js';
import { crear, icono } from './dom.js';
import { textoUmbral } from './avisos.js';
import { guardarAvisos, leerAvisos } from './preferencias.js';

/**
 * @typedef {'no-soportado' | 'inicial' | 'esperando' | 'sin-respuesta' | 'activados' |
 *   'desactivados' | 'bloqueados'} EstadoAvisos
 */

/**
 * Estado del bloque a partir del permiso del navegador y de la preferencia guardada
 * (textos.md §8.1). Función pura.
 * @param {NotificationPermission | null} permiso `null` si no hay API `Notification`
 * @param {boolean | null} activos preferencia guardada
 * @returns {EstadoAvisos}
 */
export function estadoInicialAvisos(permiso, activos) {
  if (permiso === null) return 'no-soportado';
  if (permiso === 'denied') return 'bloqueados';
  if (permiso === 'granted') {
    if (activos === true) return 'activados';
    if (activos === false) return 'desactivados';
  }
  return 'inicial';
}

/**
 * @param {object} deps
 * @param {HTMLElement} deps.contenedor nodo que se rellena según el estado
 * @param {Storage | null} deps.almacen
 * @param {(texto: string) => void} deps.anunciar
 * @param {import('./avisos.js').Notificador} deps.notificador
 * @param {(typeof Notification) | null} deps.NotificationImpl `null` sin soporte
 * @param {() => void} deps.alCambiar se activan, se desactivan o cambia el umbral (el stream
 *   se reabre con el nuevo `avisoMin`)
 */
export function crearAvisosUI({
  contenedor,
  almacen,
  anunciar,
  notificador,
  NotificationImpl,
  alCambiar,
}) {
  const preferencia = leerAvisos(almacen);
  let umbral = preferencia.umbral;
  let activos = preferencia.activos;
  /** @type {EstadoAvisos} */
  let estado = estadoInicialAvisos(NotificationImpl?.permission ?? null, activos);

  const permiso = () => NotificationImpl?.permission ?? null;

  function sincronizarNotificador() {
    notificador.configurar({ activo: estado === 'activados', umbral: Number(umbral) });
  }

  function guardar() {
    if (activos !== null) guardarAvisos(almacen, { activos, umbral });
  }

  /**
   * Botón principal «Activar avisos» (o «Esperando permiso…», que sigue siendo enfocable para
   * no perder el foco mientras el navegador pregunta).
   * @param {boolean} esperando
   */
  function botonActivar(esperando) {
    const boton = crear(
      'button',
      {
        clase: 'btn btn-pri',
        atributos: { type: 'button', 'data-foco': 'principal' },
      },
      [icono('campana'), esperando ? 'Esperando permiso…' : 'Activar avisos'],
    );
    if (esperando) boton.setAttribute('aria-disabled', 'true');
    else boton.addEventListener('click', activar);
    return boton;
  }

  /**
   * @param {string} texto
   * @param {string} nombreIcono
   * @param {string} clase
   */
  function lineaEstado(texto, nombreIcono, clase) {
    return crear('p', { clase: `avisos-estado ${clase}` }, [icono(nombreIcono), texto]);
  }

  /** @param {string} texto */
  const ayuda = (texto) => crear('p', { clase: 'ayuda', texto });

  /** @returns {Node[]} */
  function contenido() {
    switch (estado) {
      case 'no-soportado':
        return [
          lineaEstado('Avisos no disponibles', 'campana-off', 'e-neutro'),
          ayuda(
            'Este navegador no permite avisos. Prueba con Chrome o Firefox de escritorio actualizados. El resto de la aplicación funciona igual.',
          ),
        ];
      case 'esperando':
        return [botonActivar(true), ayuda('Responde al mensaje del navegador para continuar.')];
      case 'sin-respuesta':
        return [
          botonActivar(false),
          ayuda('No has respondido al permiso. Pulsa «Activar avisos» para volver a intentarlo.'),
        ];
      case 'activados': {
        const probar = crear('button', {
          clase: 'btn-texto',
          texto: 'Probar aviso',
          atributos: { type: 'button' },
        });
        probar.addEventListener('click', probarAviso);
        const select = crear('select', {
          clase: 'sel',
          atributos: { id: 'umbral-avisos', name: 'umbral-avisos', 'data-foco': 'principal' },
        });
        for (const valor of OPCIONES_AVISO_MIN) {
          select.append(crear('option', { texto: `${valor} o más`, atributos: { value: valor } }));
        }
        select.value = umbral;
        select.addEventListener('change', () => cambiarUmbral(select.value));
        const desactivar = crear('button', {
          clase: 'btn btn-sec',
          texto: 'Desactivar avisos',
          atributos: { type: 'button' },
        });
        desactivar.addEventListener('click', desactivarAvisos);
        return [
          crear('div', { clase: 'avisos-fila avisos-fila-cab' }, [
            lineaEstado('Avisos activados', 'campana-ok', 'e-ok'),
            probar,
          ]),
          crear('div', { clase: 'avisos-fila avisos-fila-umbral' }, [
            crear('div', { clase: 'campo' }, [
              crear('label', {
                clase: 'etq',
                texto: 'Avisar desde',
                atributos: { for: 'umbral-avisos' },
              }),
              select,
            ]),
            desactivar,
          ]),
          ayuda(
            'Solo sismos nuevos en los países marcados. Funciona mientras esta pestaña esté abierta.',
          ),
        ];
      }
      case 'desactivados':
        return [
          lineaEstado('Avisos desactivados', 'campana-off', 'e-neutro'),
          botonActivar(false),
          ayuda('No recibirás avisos hasta que los actives.'),
        ];
      case 'bloqueados': {
        const comprobar = crear('button', {
          clase: 'btn btn-sec',
          texto: 'Comprobar de nuevo',
          atributos: { type: 'button', 'data-foco': 'principal' },
        });
        comprobar.addEventListener('click', comprobarDeNuevo);
        return [
          lineaEstado('Avisos bloqueados en el navegador', 'campana-off', 'e-error'),
          ayuda(
            'Para recibirlos, pulsa el icono que hay a la izquierda de la dirección (candado o ajustes), busca «Notificaciones», elige «Permitir» y pulsa «Comprobar de nuevo». El resto de la aplicación funciona igual.',
          ),
          comprobar,
        ];
      }
      default:
        return [
          botonActivar(false),
          ayuda(
            `Te avisaremos de los sismos nuevos de magnitud ${umbral} o más en los países marcados, aunque esta pestaña esté en segundo plano. Déjala abierta.`,
          ),
        ];
    }
  }

  /** @param {EstadoAvisos} nuevo */
  function poner(nuevo) {
    const anterior = estado;
    const focoDentro = contenedor.contains(document.activeElement);
    estado = nuevo;
    contenedor.setAttribute('data-estado', nuevo);
    contenedor.replaceChildren(...contenido());
    if (focoDentro) {
      /** @type {HTMLElement | null} */ (
        contenedor.querySelector('[data-foco="principal"]')
      )?.focus();
    }
    sincronizarNotificador();
    const cambioActivo = (anterior === 'activados') !== (nuevo === 'activados');
    if (cambioActivo) alCambiar();
  }

  function marcarActivados() {
    activos = true;
    guardar();
    poner('activados');
    anunciar(`Avisos activados para sismos de magnitud ${umbral} o más.`);
  }

  async function activar() {
    if (!NotificationImpl) return;
    if (permiso() === 'granted') {
      marcarActivados();
      return;
    }
    if (permiso() === 'denied') {
      poner('bloqueados');
      anunciar('Avisos bloqueados en el navegador.');
      return;
    }
    poner('esperando');
    /** @type {NotificationPermission} */
    let respuesta;
    try {
      respuesta = await NotificationImpl.requestPermission();
    } catch {
      respuesta = permiso() ?? 'default';
    }
    if (respuesta === 'granted') marcarActivados();
    else if (respuesta === 'denied') {
      poner('bloqueados');
      anunciar('Avisos bloqueados en el navegador.');
    } else poner('sin-respuesta');
  }

  function desactivarAvisos() {
    activos = false;
    guardar();
    poner('desactivados');
    anunciar('Avisos desactivados.');
  }

  /** @param {string} valor */
  function cambiarUmbral(valor) {
    if (!OPCIONES_AVISO_MIN.includes(valor) || valor === umbral) return;
    umbral = /** @type {import('./preferencias.js').OpcionUmbral} */ (valor);
    guardar();
    sincronizarNotificador();
    anunciar(`Umbral de avisos: ${umbral} o más.`);
    alCambiar();
  }

  function probarAviso() {
    if (permiso() !== 'granted') {
      revisarPermiso();
      return;
    }
    notificador.probar();
  }

  function comprobarDeNuevo() {
    const p = permiso();
    if (p === 'granted') marcarActivados();
    else if (p === 'default') poner('inicial');
    else anunciar('Avisos bloqueados en el navegador.');
  }

  /**
   * Si el usuario cambia el permiso en el navegador con la página abierta, el bloque lo refleja
   * al volver a la pestaña. No pasa a «activados» sin que el usuario lo pida.
   */
  function revisarPermiso() {
    const p = permiso();
    if (p === null) return;
    if (p === 'denied' && estado !== 'bloqueados') poner('bloqueados');
    else if (p === 'default' && (estado === 'activados' || estado === 'desactivados')) {
      poner('inicial');
    }
  }

  window.addEventListener('focus', revisarPermiso);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') revisarPermiso();
  });

  poner(estado);

  return Object.freeze({
    /** @returns {EstadoAvisos} */
    get estado() {
      return estado;
    },
    /** `avisoMin` para `/api/stream`: solo con los avisos activados (contrato). */
    get avisoMin() {
      return estado === 'activados' ? umbral : null;
    },
    /** Umbral vigente (también con los avisos desactivados: ventana emergente, §8.4). */
    get umbral() {
      return Number(umbral);
    },
    /** Texto del umbral: «4.5». */
    get textoUmbral() {
      return textoUmbral(Number(umbral));
    },
  });
}
