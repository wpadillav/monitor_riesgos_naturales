/**
 * Genera `src/shared/zonas.js`: las zonas de país con su franja marina (ADR-0005).
 *
 * Solo para desarrollo: usa las dependencias Turf de `devDependencies`, que no llegan a producción.
 * Uso: `npm run zonas` (o `FRANJA_KM=<km> npm run zonas`). El resultado es determinista: dos
 * ejecuciones con la misma entrada producen el mismo archivo byte a byte.
 *
 * Pasos:
 * 1. Natural Earth 10m `admin_0_countries` v5.1.2 (dominio público), con el SHA-256 verificado y
 *    una caché local en `.cache/natural-earth/` (ignorada por git).
 * 2. Correcciones manuales de `scripts/datos/territorios-extra.geojson` (Alborán y Vélez).
 * 3. Partición de cada país en zonas por el centro de cada parte.
 * 4. `zona = buffer(partes, FRANJA_KM) − tierra de los demás países`. Antes se resta de la tierra
 *    de los vecinos la tierra propia, para que un territorio propio enclavado en el polígono de
 *    un vecino (el Peñón de Vélez dentro de Marruecos) no desaparezca.
 * 5. Simplificación (0,01°) y redondeo a 3 decimales (unos 110 m) de `zona` y de `tierra`.
 * 6. Rectángulo = envolvente de `zona` + 0,1°, redondeada hacia fuera a 0,1°.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import bbox from '@turf/bbox';
import buffer from '@turf/buffer';
import difference from '@turf/difference';
import simplify from '@turf/simplify';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const NATURAL_EARTH = Object.freeze({
  nombre: 'Natural Earth 10m admin_0_countries',
  version: '5.1.2',
  url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson',
  sha256: '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
  bytes: 13287234,
  licencia: 'Dominio público (https://www.naturalearthdata.com/about/terms-of-use/)',
});

const CACHE = join(RAIZ, '.cache', 'natural-earth', 'ne_10m_admin_0_countries-v5.1.2.geojson');
const EXTRAS = join(RAIZ, 'scripts', 'datos', 'territorios-extra.geojson');
const SALIDA = join(RAIZ, 'src', 'shared', 'zonas.js');

const TOLERANCIA_GRADOS = 0.01;
const DECIMALES = 3;
const MARGEN_RECTANGULO = 0.1;
const PASOS_BUFFER = 8;

/**
 * Países y zonas (ADR-0005, tabla de partición). `zonaDe` recibe el centro [lon, lat] de cada
 * parte de Natural Earth.
 */
const PAISES = Object.freeze([
  {
    pais: 'ES',
    adm0: 'ESP',
    zonas: [
      { id: 'ES-PEN', zonaHoraria: 'Europe/Madrid' },
      { id: 'ES-CAN', zonaHoraria: 'Atlantic/Canary' },
    ],
    zonaDe: ([, lat]) => (lat < 31 ? 'ES-CAN' : 'ES-PEN'),
  },
  {
    pais: 'CO',
    adm0: 'COL',
    zonas: [
      { id: 'CO-CONT', zonaHoraria: 'America/Bogota' },
      { id: 'CO-SAI', zonaHoraria: 'America/Bogota' },
    ],
    // San Andrés, Providencia y Roncador están al norte de 11° y al oeste de −79,5°.
    zonaDe: ([lon, lat]) => (lat > 11 && lon < -79.5 ? 'CO-SAI' : 'CO-CONT'),
  },
  {
    pais: 'PA',
    adm0: 'PAN',
    zonas: [{ id: 'PA', zonaHoraria: 'America/Panama' }],
    zonaDe: () => 'PA',
  },
]);

function log(mensaje) {
  process.stdout.write(`${mensaje}\n`);
}

function sha256(datos) {
  return createHash('sha256').update(datos).digest('hex');
}

/** Contenido de la caché, o `null` si aún no existe. */
async function leerCache() {
  try {
    return await readFile(CACHE);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Descarga Natural Earth y solo lo guarda en la caché si el SHA-256 coincide. */
async function descargarNaturalEarth() {
  log(`Descargando ${NATURAL_EARTH.url}`);
  const respuesta = await fetch(NATURAL_EARTH.url, {
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  });
  if (!respuesta.ok) throw new Error(`Descarga fallida: HTTP ${respuesta.status}`);
  const datos = Buffer.from(await respuesta.arrayBuffer());
  if (sha256(datos) !== NATURAL_EARTH.sha256) {
    throw new Error('El SHA-256 descargado no coincide con el del ADR-0005; no se guarda.');
  }
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, datos);
  return datos;
}

/** Lee Natural Earth de la caché o lo descarga; en ambos casos comprueba el SHA-256. */
async function leerNaturalEarth() {
  const datos = (await leerCache()) ?? (await descargarNaturalEarth());
  const hash = sha256(datos);
  if (hash !== NATURAL_EARTH.sha256 || datos.length !== NATURAL_EARTH.bytes) {
    throw new Error(
      `SHA-256 o tamaño inesperado en ${relative(RAIZ, CACHE)} (${hash}, ${datos.length} bytes). Bórralo y vuelve a ejecutar.`,
    );
  }
  return JSON.parse(datos.toString('utf8'));
}

/** Polígonos (coordenadas) de una geometría Polygon o MultiPolygon. */
function poligonos(geometria) {
  if (!geometria) return [];
  if (geometria.type === 'Polygon') return [geometria.coordinates];
  if (geometria.type === 'MultiPolygon') return geometria.coordinates;
  throw new Error(`Geometría no admitida: ${geometria.type}`);
}

const multi = (coordenadas) => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'MultiPolygon', coordinates: coordenadas },
});

function centroRectangulo(poligono) {
  const [minLon, minLat, maxLon, maxLat] = bbox(multi([poligono]));
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

const seSolapan = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Resta a `base` (coordenadas MultiPolygon) los polígonos de `restar`. */
function restar(base, restar) {
  if (base.length === 0 || restar.length === 0) return base;
  const resultado = difference({
    type: 'FeatureCollection',
    features: [multi(base), ...restar.map((p) => multi([p]))],
  });
  return resultado ? poligonos(resultado.geometry) : [];
}

const redondear = (x) => {
  const factor = 10 ** DECIMALES;
  const r = Math.round(x * factor) / factor;
  return Object.is(r, -0) ? 0 : r;
};

/** Redondea un anillo, quita puntos repetidos seguidos y lo deja cerrado. */
function limpiarAnillo(anillo) {
  const limpio = [];
  for (const [lon, lat] of anillo) {
    const punto = [redondear(lon), redondear(lat)];
    const previo = limpio.at(-1);
    if (!previo || previo[0] !== punto[0] || previo[1] !== punto[1]) limpio.push(punto);
  }
  const [primero] = limpio;
  const ultimo = limpio.at(-1);
  if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) limpio.push([...primero]);
  return limpio;
}

/** Simplifica, redondea y quita anillos degenerados. */
function compactar(coordenadas) {
  const simplificado = simplify(multi(coordenadas), {
    tolerance: TOLERANCIA_GRADOS,
    highQuality: true,
  });
  const salida = [];
  for (const poligono of poligonos(simplificado.geometry)) {
    const anillos = poligono.map(limpiarAnillo);
    // Si el anillo exterior degenera, el polígono (con sus huecos) no aporta nada.
    if (anillos[0].length < 4) continue;
    salida.push(anillos.filter((anillo) => anillo.length >= 4));
  }
  return salida;
}

function contarVertices(coordenadas) {
  let n = 0;
  for (const poligono of coordenadas) for (const anillo of poligono) n += anillo.length;
  return n;
}

function rectanguloDe(coordenadas) {
  const [minLon, minLat, maxLon, maxLat] = bbox(multi(coordenadas));
  const abajo = (x) => Number((Math.floor((x - MARGEN_RECTANGULO) * 10 + 1e-9) / 10).toFixed(1));
  const arriba = (x) => Number((Math.ceil((x + MARGEN_RECTANGULO) * 10 - 1e-9) / 10).toFixed(1));
  return {
    minLat: abajo(minLat),
    maxLat: arriba(maxLat),
    minLon: abajo(minLon),
    maxLon: arriba(maxLon),
  };
}

async function versionPaquete(nombre) {
  const ruta = join(RAIZ, 'node_modules', ...nombre.split('/'), 'package.json');
  return JSON.parse(await readFile(ruta, 'utf8')).version;
}

function leerFranja() {
  const texto = process.env.FRANJA_KM ?? '100';
  const km = Number(texto);
  if (!/^\d{1,3}$/.test(texto) || km < 1 || km > 500) {
    throw new Error(`FRANJA_KM debe ser un entero entre 1 y 500 (recibido: «${texto}»).`);
  }
  return km;
}

async function main() {
  const franjaKm = leerFranja();
  const mundo = await leerNaturalEarth();
  const extras = JSON.parse(await readFile(EXTRAS, 'utf8'));

  const zonas = [];
  for (const def of PAISES) {
    const propios = mundo.features.filter((f) => f.properties.ADM0_A3 === def.adm0);
    if (propios.length !== 1) throw new Error(`Se esperaba un único ${def.adm0} en Natural Earth.`);
    const extrasPais = extras.features.filter((f) => f.properties.pais === def.pais);

    /** @type {Map<string, number[][][][]>} */
    const partesPorZona = new Map(def.zonas.map((z) => [z.id, []]));
    for (const poligono of poligonos(propios[0].geometry)) {
      partesPorZona.get(def.zonaDe(centroRectangulo(poligono))).push(poligono);
    }
    for (const extra of extrasPais) {
      partesPorZona.get(extra.properties.zona).push(...poligonos(extra.geometry));
    }
    const tierraPropia = [...partesPorZona.values()].flat();

    for (const zonaDef of def.zonas) {
      const partes = partesPorZona.get(zonaDef.id);
      if (partes.length === 0) throw new Error(`La zona ${zonaDef.id} no tiene partes.`);

      const ampliado = buffer(multi(partes), franjaKm, {
        units: 'kilometers',
        steps: PASOS_BUFFER,
      });
      const caja = bbox(ampliado);

      // Tierra de los demás países que toca la caja, sin la tierra propia (Vélez en Marruecos).
      const tierraAjena = [];
      for (const otro of mundo.features) {
        if (otro.properties.ADM0_A3 === def.adm0 || !otro.geometry) continue;
        if (!seSolapan(bbox(otro), caja)) continue;
        const cajaOtro = bbox(otro);
        const propiasDentro = tierraPropia.filter((p) => seSolapan(bbox(multi([p])), cajaOtro));
        tierraAjena.push(...restar(poligonos(otro.geometry), propiasDentro));
      }

      const zona = compactar(restar(poligonos(ampliado.geometry), tierraAjena));
      const tierra = compactar(partes);
      zonas.push({
        id: zonaDef.id,
        pais: def.pais,
        zonaHoraria: zonaDef.zonaHoraria,
        rectangulo: rectanguloDe(zona),
        zona: { type: 'MultiPolygon', coordinates: zona },
        tierra: { type: 'MultiPolygon', coordinates: tierra },
      });
      log(
        `${zonaDef.id}: ${contarVertices(zona)} vértices en zona, ${contarVertices(tierra)} en tierra, rectángulo ${JSON.stringify(zonas.at(-1).rectangulo)}`,
      );
    }
  }

  const meta = {
    franjaKm,
    fuente: {
      nombre: NATURAL_EARTH.nombre,
      version: NATURAL_EARTH.version,
      url: NATURAL_EARTH.url,
      sha256: NATURAL_EARTH.sha256,
      licencia: NATURAL_EARTH.licencia,
    },
    correcciones: extras.features.map((f) => f.properties.nombre),
    turf: {
      buffer: await versionPaquete('@turf/buffer'),
      difference: await versionPaquete('@turf/difference'),
      simplify: await versionPaquete('@turf/simplify'),
      bbox: await versionPaquete('@turf/bbox'),
    },
    toleranciaGrados: TOLERANCIA_GRADOS,
    decimales: DECIMALES,
    vertices: Object.fromEntries(
      zonas.map((z) => [
        z.id,
        {
          zona: contarVertices(z.zona.coordinates),
          tierra: contarVertices(z.tierra.coordinates),
        },
      ]),
    ),
  };

  await writeFile(SALIDA, modulo(meta, zonas));
  const { size } = await stat(SALIDA);
  log(`Escrito ${relative(RAIZ, SALIDA)} (${size} bytes).`);
}

/** Módulo ES con una zona por línea lógica: diffs legibles y sin pasar por Prettier. */
function modulo(meta, zonas) {
  const lineasZona = zonas.map((z) =>
    [
      '  Object.freeze({',
      `    id: ${JSON.stringify(z.id)},`,
      `    pais: ${JSON.stringify(z.pais)},`,
      `    zonaHoraria: ${JSON.stringify(z.zonaHoraria)},`,
      `    rectangulo: Object.freeze(${JSON.stringify(z.rectangulo)}),`,
      `    zona: ${JSON.stringify(z.zona)},`,
      `    tierra: ${JSON.stringify(z.tierra)},`,
      '  }),',
    ].join('\n'),
  );
  return [
    '// ARCHIVO GENERADO por scripts/generar-zonas.js (ADR-0005). No lo edites a mano:',
    '// regenéralo con `npm run zonas` (ver scripts/README.md).',
    '//',
    `// Contornos: ${NATURAL_EARTH.nombre} v${NATURAL_EARTH.version}, de dominio público`,
    '// (Natural Earth, https://www.naturalearthdata.com/about/terms-of-use/), más las correcciones',
    '// de scripts/datos/territorios-extra.geojson. Franja marina sin la tierra de los países vecinos.',
    '',
    "/** @typedef {import('./pais.js').ZonaPais} ZonaPais */",
    '',
    `export const META_ZONAS = Object.freeze(${JSON.stringify(meta)});`,
    '',
    '/** @type {ReadonlyArray<ZonaPais>} */',
    'export const ZONAS = Object.freeze([',
    ...lineasZona,
    ']);',
    '',
  ].join('\n');
}

await main();
