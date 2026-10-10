/**
 * Hora local del sismo (HU-08, RNF-13). Común al servidor y a la página; usa solo `Intl`.
 *
 * Las horas se muestran en formato de 24 h, con la zona entre paréntesis. Las zonas IANA son
 * las del contrato (`ZonaHoraria`); `Africa/Ceuta` se admite por si una fuente la usa.
 */

/** Texto entre paréntesis de cada zona (textos.md §5). */
export const ETIQUETA_ZONA = Object.freeze({
  'Europe/Madrid': 'hora peninsular',
  'Africa/Ceuta': 'hora peninsular',
  'Atlantic/Canary': 'hora de Canarias',
  'America/Bogota': 'hora de Colombia',
  'America/Panama': 'hora de Panamá',
});

/** Zona de reserva si llega una desconocida: se muestra la hora UTC y se dice. */
const ZONA_RESERVA = 'UTC';

/** @type {Map<string, Intl.DateTimeFormat>} */
const formateadores = new Map();

/**
 * @param {string} zona
 * @returns {Intl.DateTimeFormat}
 */
function formateador(zona) {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('es-ES', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formateadores.set(zona, f);
  }
  return f;
}

/**
 * Etiqueta de la zona: «hora peninsular», «hora de Canarias»… o «UTC» si no se conoce.
 * @param {unknown} zona
 * @returns {string}
 */
export function etiquetaZona(zona) {
  return typeof zona === 'string' && Object.hasOwn(ETIQUETA_ZONA, zona)
    ? ETIQUETA_ZONA[zona]
    : ZONA_RESERVA;
}

/**
 * Partes de la fecha y la hora en la zona del sismo, con dos cifras.
 * @param {number} instante ms desde la época
 * @param {unknown} zona zona IANA
 * @returns {{ dia: string, mes: string, anio: string, hora: string, minuto: string,
 *   segundo: string }}
 */
export function partesLocales(instante, zona) {
  const z = typeof zona === 'string' && Object.hasOwn(ETIQUETA_ZONA, zona) ? zona : ZONA_RESERVA;
  /** @type {Record<string, string>} */
  const p = {};
  for (const { type, value } of formateador(z).formatToParts(new Date(instante))) p[type] = value;
  return {
    dia: p.day,
    mes: p.month,
    anio: p.year,
    hora: p.hour,
    minuto: p.minute,
    segundo: p.second,
  };
}

/**
 * Hora de la lista: «07:42 (hora de Colombia)»; si el sismo tiene 24 h o más, con el día y el
 * mes delante: «07/10 22:15 (hora peninsular)».
 * @param {number} instante ms
 * @param {unknown} zona
 * @param {number} ahora ms
 * @returns {string}
 */
export function horaLista(instante, zona, ahora) {
  const p = partesLocales(instante, zona);
  const hora = `${p.hora}:${p.minuto}`;
  const fecha = ahora - instante >= 86_400_000 ? `${p.dia}/${p.mes} ` : '';
  return `${fecha}${hora} (${etiquetaZona(zona)})`;
}

/**
 * Hora completa de la ventana emergente: «10/10/2026 07:42:15 (hora de Colombia)».
 * @param {number} instante ms
 * @param {unknown} zona
 * @returns {string}
 */
export function horaCompleta(instante, zona) {
  const p = partesLocales(instante, zona);
  return `${p.dia}/${p.mes}/${p.anio} ${p.hora}:${p.minuto}:${p.segundo} (${etiquetaZona(zona)})`;
}

/**
 * Hora corta sin zona: «07:42». Se usa en el título de las notificaciones (T4.7) junto con la
 * etiqueta de zona.
 * @param {number} instante ms
 * @param {unknown} zona
 * @returns {string}
 */
export function horaCorta(instante, zona) {
  const p = partesLocales(instante, zona);
  return `${p.hora}:${p.minuto}`;
}

/**
 * Antigüedad en texto (textos.md §5): «hace instantes», «hace 8 min», «hace 1 h 35 min»,
 * «hace 3 días». Un instante futuro (reloj de la fuente adelantado) cuenta como «instantes».
 * @param {number} instante ms
 * @param {number} ahora ms
 * @returns {string}
 */
export function haceTexto(instante, ahora) {
  const minutos = Math.floor(Math.max(0, ahora - instante) / 60_000);
  if (minutos < 1) return 'hace instantes';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    return resto === 0 ? `hace ${horas} h` : `hace ${horas} h ${resto} min`;
  }
  const dias = Math.floor(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}
