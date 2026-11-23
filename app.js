"use strict";
/* ============================================================
   Gasapp — lógica compartida por todas las páginas
   Pega en API_BASE la URL de tu Worker de Cloudflare cuando lo
   despliegues (ejemplo: "https://gasapp-api.TU-USUARIO.workers.dev").
   Si queda vacío, la app funciona en MODO LOCAL: los comentarios
   y calificaciones se guardan solo en este dispositivo.
   ============================================================ */
const API_BASE = "";

/* Origen por defecto: Nonoalco Tlatelolco, CDMX. El GPS lo reemplaza
   y se recuerda entre páginas durante la sesión. */
const CENTRO_DEFECTO = { lat: 19.4551, lng: -99.1416, etiqueta: "Tlatelolco, CDMX (referencia)" };
let origen = (() => {
  try {
    const o = JSON.parse(sessionStorage.getItem("gasapp_origen") || "null");
    if (o && typeof o.lat === "number" && typeof o.lng === "number") return o;
  } catch (e) { /* sin sessionStorage */ }
  return { ...CENTRO_DEFECTO };
})();
function fijarOrigen(o) {
  origen = o;
  try { sessionStorage.setItem("gasapp_origen", JSON.stringify(o)); } catch (e) { /* modo local */ }
}
function pedirUbicacion(onOk, onError) {
  if (!navigator.geolocation) { if (onError) onError("Este navegador no ofrece geolocalización."); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      fijarOrigen({ lat: pos.coords.latitude, lng: pos.coords.longitude, etiqueta: "tu ubicación" });
      if (onOk) onOk(origen);
    },
    () => { if (onError) onError("No se pudo obtener tu ubicación; se mantiene la referencia de Tlatelolco."); },
    { enableHighAccuracy: true, timeout: 12000 }
  );
}

const NOMBRES_FUEL = { regular: "Magna", premium: "Premium", diesel: "Diésel" };
let resumenes = {};   // id -> {promA, promL, n} según comentarios conocidos

/* ---------- Utilidades ---------- */
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function $(s) { return document.querySelector(s); }
function esc(t) {
  return String(t == null ? "" : t).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function dinero(n) { return "$" + n.toFixed(2); }
function precioDe(est, fuel) { const p = est[fuel]; return (p === null || p === undefined) ? null : p; }
function estacionPorId(id) { return ESTACIONES.find(e => e.id === String(id)) || null; }
function esMejorPrecio(est) {
  // Verdadero si la estación tiene el precio mínimo de la zona en algún combustible.
  return ["regular", "premium", "diesel"].some(f => {
    const p = precioDe(est, f);
    if (p === null) return false;
    return ESTACIONES.every(e => precioDe(e, f) === null || precioDe(e, f) >= p);
  });
}
function pintarAvisoDatos(el) {
  if (!el) return;
  el.textContent =
    "Foto de datos del " + FECHA_FOTO + " · Fuente: Comisión Nacional de Energía (CNE) — " +
    ESTACIONES.length + " estaciones alrededor de Tlatelolco, CDMX. Los precios cambian a diario: confirma en la bomba.";
}

/* ---------- Filtro de groserías (cliente; el servidor aplica el mismo) ---------- */
const GROSERIAS = ["pendejo","pendeja","pendejos","pendejas","pendejada","pendejadas",
  "chingar","chingada","chingado","chingados","chingadera","chingaderas","chingas","chingue",
  "pinche","pinches","culero","culera","culeros","culeras","mierda","mierdas",
  "verga","vergas","verguiza","puto","puta","putos","putas","putiza",
  "cabron","cabrona","cabrones","mamada","mamadas","mamon","mamona","mamones",
  "idiota","idiotas","imbecil","imbeciles","estupido","estupida","estupidos","estupidas",
  "joto","jotos","marica","maricas","maricon","maricones","cono","ojete","ojetes",
  "huevon","huevona","huevones","culiao","culiada","hdp","pende"];
function normalizar(t) {
  return String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a").replace(/@/g, "a").replace(/\$/g, "s");
}
function contieneGroserias(t) {
  const tokens = normalizar(t).split(/[^a-z]+/).filter(Boolean);
  return tokens.some(tok => GROSERIAS.includes(tok));
}

/* ---------- Comentarios: API o modo local ---------- */
const LS_KEY = "gasapp_comentarios_v1";
function comentariosLocales(id) {
  try {
    const todo = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return todo[id] || [];
  } catch (e) { return []; }
}
function guardarLocal(id, c) {
  const todo = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  todo[id] = todo[id] || [];
  todo[id].unshift(c);
  localStorage.setItem(LS_KEY, JSON.stringify(todo));
}
async function cargarComentarios(id) {
  if (API_BASE) {
    try {
      const r = await fetch(API_BASE + "/api/comentarios?estacion=" + encodeURIComponent(id));
      if (r.ok) {
        const data = await r.json();
        return { lista: data.comentarios || [], fuente: "api" };
      }
    } catch (e) { /* cae a modo local */ }
  }
  return { lista: comentariosLocales(id), fuente: "local" };
}
async function enviarComentario(id, c) {
  if (API_BASE) {
    try {
      const r = await fetch(API_BASE + "/api/comentarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estacion_id: id, nombre: c.nombre, atencion: c.atencion, litros: c.litros, texto: c.texto })
      });
      if (r.ok) return { ok: true, fuente: "api" };
      const data = await r.json().catch(() => ({}));
      if (r.status === 400 && data.error) return { ok: false, error: data.error };
    } catch (e) { /* cae a modo local */ }
  }
  guardarLocal(id, c);
  return { ok: true, fuente: "local" };
}
function resumir(lista) {
  if (!lista.length) return null;
  const a = lista.reduce((s, c) => s + (+c.atencion || 0), 0) / lista.length;
  const l = lista.reduce((s, c) => s + (+c.litros || 0), 0) / lista.length;
  return { promA: a, promL: l, n: lista.length };
}
async function refrescarResumen(id) {
  const { lista } = await cargarComentarios(id);
  resumenes[id] = resumir(lista);
  return lista;
}

/* ---------- Afluencia estimada (modelo por hora, varía por estación) ---------- */
function perfilAfluencia(id) {
  let semilla = 0;
  for (const ch of String(id)) semilla = (semilla * 31 + ch.charCodeAt(0)) % 997;
  const rnd = (n) => { const x = Math.sin(semilla * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  const perfil = [];
  for (let h = 0; h < 24; h++) {
    const pico = (c, w, a) => a * Math.exp(-((h - c) ** 2) / (2 * w * w));
    let v = 6 + pico(8, 1.6, 62 + rnd(h) * 18) + pico(13.5, 1.8, 40 + rnd(h + 40) * 15) + pico(19, 2.0, 68 + rnd(h + 80) * 20);
    if (h < 5) v = 3 + rnd(h) * 5;
    perfil.push(Math.min(98, Math.round(v)));
  }
  return perfil;
}
function filaEstimada(pct) { return Math.max(0, Math.round((pct / 100) * 14)); }

/* ---------- Bloques HTML reutilizables ---------- */
function bloquePrecio(est, fuel, selFuel) {
  const p = precioDe(est, fuel);
  const sel = fuel === selFuel ? " sel" : "";
  if (p === null) return `<div class="precio sin${sel}"><div class="tipo">${NOMBRES_FUEL[fuel]}</div><div class="valor">—</div></div>`;
  return `<div class="precio${sel}"><div class="tipo">${NOMBRES_FUEL[fuel]}</div><div class="valor">${dinero(p)}</div></div>`;
}
function bloqueCalif(est) {
  const r = resumenes[est.id];
  if (!r) return `<span class="sin-calif">Sin calificaciones todavía — sé el primero en opinar</span>`;
  return `<span class="calif">★ ${((r.promA + r.promL) / 2).toFixed(1)} <small>· Atención ${r.promA.toFixed(1)} · Litros ${r.promL.toFixed(1)} · ${r.n} opinión(es)</small></span>`;
}
function enlaceGoogleMaps(est) {
  return "https://www.google.com/maps/dir/?api=1&destination=" + est.lat + "," + est.lng;
}

/* ---------- Estrellas del formulario de opinión ---------- */
function montarEstrellas(sel) {
  const cont = $(sel);
  if (!cont) return;
  cont.dataset.valor = "0";
  cont.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = "★"; b.dataset.v = i;
    b.setAttribute("aria-label", i + " estrellas");
    b.addEventListener("click", () => {
      cont.dataset.valor = String(i);
      cont.querySelectorAll("button").forEach(x => x.classList.toggle("on", +x.dataset.v <= i));
    });
    cont.appendChild(b);
  }
}

/* ---------- PWA: registro del service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* la app sigue sin SW */ });
  });
}

/* ---------- PWA: botón «Descargar la app» ---------- */
let avisoInstalacion = null;   // evento beforeinstallprompt capturado (Android/Chrome)
let avisoConsumido = false;
window.addEventListener("beforeinstallprompt", ev => {
  ev.preventDefault();
  avisoInstalacion = ev;
});
window.addEventListener("appinstalled", () => {
  avisoInstalacion = null;
  avisoConsumido = true;
});
function appYaInstalada() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
}
function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function hojaInstalar() {
  let hoja = document.getElementById("hojaInstalar");
  if (hoja) return hoja;
  hoja = document.createElement("div");
  hoja.id = "hojaInstalar";
  hoja.className = "hoja-instalar";
  hoja.innerHTML = `
    <div class="hoja-titulo" id="hojaInstalarTitulo"></div>
    <div class="hoja-texto" id="hojaInstalarTexto"></div>
    <button type="button" class="destacado" id="hojaInstalarCerrar">Entendido</button>`;
  document.body.appendChild(hoja);
  hoja.querySelector("#hojaInstalarCerrar").addEventListener("click", () => hoja.classList.remove("visible"));
  return hoja;
}
function mostrarHojaInstalar(titulo, html) {
  const hoja = hojaInstalar();
  hoja.querySelector("#hojaInstalarTitulo").textContent = titulo;
  hoja.querySelector("#hojaInstalarTexto").innerHTML = html;
  hoja.classList.add("visible");
}
function accionInstalar() {
  if (appYaInstalada()) {
    mostrarHojaInstalar("Gasapp ya está instalada",
      "Ya tienes Gasapp en tu pantalla de inicio. Ábrela desde ahí: funciona como app, sin navegador.");
    return;
  }
  if (avisoInstalacion) {
    const aviso = avisoInstalacion;
    avisoInstalacion = null;
    avisoConsumido = true;
    aviso.prompt();
    if (aviso.userChoice) aviso.userChoice.catch(() => {});
    return;
  }
  if (esIOS()) {
    mostrarHojaInstalar("Instala Gasapp en tu iPhone",
      "Safari no instala con un solo toque; hazlo así:<br>" +
      "1. Toca el botón <strong>Compartir</strong> (el cuadro con la flecha hacia arriba).<br>" +
      "2. Elige <strong>«Agregar a pantalla de inicio»</strong>.<br>" +
      "3. Toca <strong>«Agregar»</strong> y Gasapp quedará como app en tu pantalla.");
    return;
  }
  if (avisoConsumido) {
    mostrarHojaInstalar("Gasapp ya está instalada",
      "El aviso de instalación ya se usó en este dispositivo: busca Gasapp en tu pantalla de inicio o en tus aplicaciones.");
    return;
  }
  mostrarHojaInstalar("Descarga Gasapp como app",
    "Abre el menú del navegador (<strong>⋮</strong>) y elige <strong>«Instalar app»</strong> o " +
    "<strong>«Agregar a pantalla de inicio»</strong>. Gasapp quedará instalada y abrirá sin navegador.");
}
function initInstalar() {
  document.querySelectorAll(".btn-instalar").forEach(b =>
    b.addEventListener("click", accionInstalar));
}
document.addEventListener("DOMContentLoaded", initInstalar);

/* ---------- Menú desplegable compartido ---------- */
function initMenu() {
  const btn = document.getElementById("btnMenu");
  const nav = document.getElementById("menuNav");
  if (!btn || !nav) return;
  const pagina = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  nav.querySelectorAll("a").forEach(a => {
    if ((a.getAttribute("href") || "").toLowerCase() === pagina) a.classList.add("activo");
  });
  const cerrar = () => { nav.classList.remove("abierto"); btn.setAttribute("aria-expanded", "false"); btn.textContent = "☰"; };
  btn.addEventListener("click", ev => {
    ev.stopPropagation();
    const abierto = nav.classList.toggle("abierto");
    btn.setAttribute("aria-expanded", String(abierto));
    btn.textContent = abierto ? "✕" : "☰";
  });
  document.addEventListener("click", ev => { if (!nav.contains(ev.target)) cerrar(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape") cerrar(); });
}
document.addEventListener("DOMContentLoaded", initMenu);
