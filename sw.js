"use strict";
/* ============================================================
   Gasapp — Service Worker (PWA)
   Guarda en caché las páginas y los recursos propios para que
   la app se pueda instalar, abra rápido y funcione sin conexión
   (los precios quedan como la última foto guardada).
   Los servicios externos (mapa de OpenStreetMap, rutas OSRM y
   la API de comentarios) NO se cachean: van siempre a la red.
   ============================================================ */
const CACHE = "gasapp-v4";
const PROPIOS = [
  "./",
  "index.html",
  "mapa.html",
  "estacion.html",
  "calculadora.html",
  "rendimiento.html",
  "radio.html",
  "acerca.html",
  "estilos.css",
  "app.js",
  "datos.js",
  "manifest.json",
  "assets/logo-gasapp.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icono-ajustes.png",
  "assets/icono-alertas.png",
  "assets/icono-buscar.png",
  "assets/icono-comunidad.png",
  "assets/icono-estadisticas.png",
  "assets/icono-favoritos.png",
  "assets/icono-filtros.png",
  "assets/icono-mapa.png",
  "assets/icono-resenas.png",
  "assets/icono-tiempo.png"
];

self.addEventListener("install", ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PROPIOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", ev => {
  ev.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // externos: directo a la red
  ev.respondWith(
    caches.match(req, { ignoreSearch: true }).then(enCache => {
      const aLaRed = fetch(req).then(res => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return res;
      }).catch(() => enCache);
      // Caché primero (abre rápido e instalado); la red actualiza en segundo plano.
      return enCache || aLaRed;
    })
  );
});
