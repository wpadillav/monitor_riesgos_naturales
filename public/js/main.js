/* global L */
// Mapa vacío del esqueleto (T4.1). La interfaz real llega en T4.5.

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';

const mapa = L.map('mapa', { worldCopyJump: true, minZoom: 2 }).setView([20, -40], 3);

L.tileLayer(`${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
  attribution: 'Teselas © Esri',
  maxZoom: 16,
}).addTo(mapa);
L.tileLayer(`${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
  maxZoom: 16,
}).addTo(mapa);
