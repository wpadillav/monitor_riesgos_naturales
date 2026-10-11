/**
 * Micro-medición de la ingesta del catálogo (T5.4, hallazgo de coste de CPU por sismo).
 *
 * Mide, en el mismo proceso y sin red:
 * 1. el coste de `asignarPais` por llamada (puntos aleatorios en los rectángulos de las zonas);
 * 2. el coste de `catalogo.ingerirLote` por registro con y sin duplicados de USGS;
 * 3. el coste de `aplicarTope` cuando el catálogo está en el tope (lote de 1 sismo nuevo);
 * 4. qué parte de 1 se debe a los puntos en la franja CO-PA (varias zonas candidatas), donde
 *    `asignarPais` calcula la distancia a la tierra de cada zona con Turf.
 *
 * Uso: `node scripts/rendimiento/micro-ingesta.js [nSismos=2000]`
 * Perfil: `node --cpu-prof --cpu-prof-dir=docs/rendimiento/datos scripts/rendimiento/micro-ingesta.js 2000`
 */

import { performance } from 'node:perf_hooks';
import { createCatalogo } from '../../src/server/dominio/catalogo.js';
import { asignarPais } from '../../src/server/geo/asignar-pais.js';
import { ZONAS } from '../../src/shared/zonas.js';
import { crearAzar, crearPosiciones, crearRegistros } from './sinteticos.js';

const N = Number(process.argv[2] ?? 2000);
const azar = crearAzar(7);
const resultado = {};

// 1. asignarPais
const puntos = [];
for (let i = 0; i < 2000; i += 1) {
  const r = ZONAS[i % ZONAS.length].rectangulo;
  puntos.push([
    r.minLat + azar() * (r.maxLat - r.minLat),
    r.minLon + azar() * (r.maxLon - r.minLon),
  ]);
}
let t = performance.now();
let conPais = 0;
for (const [lat, lon] of puntos) if (asignarPais(lat, lon) !== null) conPais += 1;
resultado.asignarPaisMsPorLlamada = Number(((performance.now() - t) / puntos.length).toFixed(3));
resultado.asignarPaisConPais = `${conPais}/${puntos.length}`;
resultado.verticesPorZona = Object.fromEntries(
  ZONAS.map((z) => {
    let n = 0;
    for (const g of [z.zona, z.tierra])
      for (const p of g.coordinates) for (const r of p) n += r.length;
    return [z.id, n];
  }),
);

// 4. coste según el número de zonas candidatas
{
  const una = [];
  const varias = [];
  for (const [lat, lon] of puntos) {
    const u = asignarPais(lat, lon);
    if (u === null) continue;
    (u.paisesCandidatos.length > 1 ? varias : una).push([lat, lon]);
  }
  const medir = (lista) => {
    const t0 = performance.now();
    for (const [lat, lon] of lista) asignarPais(lat, lon);
    return lista.length ? Number(((performance.now() - t0) / lista.length).toFixed(3)) : null;
  };
  resultado.asignarPaisPorTipo = {
    unaZona: { puntos: una.length, msPorLlamada: medir(una) },
    variasZonasFranjaCoPa: { puntos: varias.length, msPorLlamada: medir(varias) },
  };
}

const posiciones = crearPosiciones(3000, azar);
{
  let multi = 0;
  for (const p of posiciones)
    if ((asignarPais(p.lat, p.lon)?.paisesCandidatos.length ?? 0) > 1) multi += 1;
  resultado.posicionesSinteticasEnFranja = `${multi}/${posiciones.length}`;
}
const ahora = Date.now();

// 2. ingesta
for (const dup of [0, 0.5]) {
  const catalogo = createCatalogo({ asignarPais });
  const regs = crearRegistros({
    n: N,
    desde: ahora - 30 * 86_400_000,
    hasta: ahora - 60_000,
    ahora,
    prefijo: `d${dup}`,
    fraccionDuplicados: dup,
    posiciones,
    azar,
  });
  t = performance.now();
  for (let i = 0; i < regs.length; i += 500) {
    catalogo.ingerirLote(regs.slice(i, i + 500), { recibidoEn: Date.now() });
  }
  const ms = performance.now() - t;
  resultado[`ingesta_dup${dup}`] = {
    registros: regs.length,
    sismos: catalogo.contar(),
    totalMs: Math.round(ms),
    msPorRegistro: Number((ms / regs.length).toFixed(3)),
  };
}

// 3. tope (catálogo pequeño con tope reducido para que sea rápido de llenar)
{
  const tope = Math.min(N, 5000);
  const catalogo = createCatalogo({ asignarPais, tope });
  const regs = crearRegistros({
    n: tope,
    desde: ahora - 30 * 86_400_000,
    hasta: ahora - 60_000,
    ahora,
    prefijo: 't',
    fraccionDuplicados: 0,
    posiciones,
    azar,
  });
  catalogo.ingerirLote(regs, { recibidoEn: Date.now() });
  const extra = crearRegistros({
    n: 20,
    desde: ahora - 60_000,
    hasta: ahora - 1000,
    ahora,
    prefijo: 'tx',
    fraccionDuplicados: 0,
    posiciones,
    azar,
  });
  const tiempos = [];
  for (const r of extra) {
    const t0 = performance.now();
    catalogo.ingerirLote([r], { recibidoEn: Date.now() });
    tiempos.push(performance.now() - t0);
  }
  tiempos.sort((a, b) => a - b);
  resultado.loteDe1EnTope = { tope, medianaMs: Number(tiempos[10].toFixed(2)) };
}

console.log(JSON.stringify(resultado, null, 2));
