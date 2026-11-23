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
function hayGPS() {
  // Verdadero si en esta sesión ya se fijó la ubicación real (botón GPS).
  try { return !!sessionStorage.getItem("gasapp_origen"); } catch (e) { return false; }
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
/* ---------- Valoración con estrellas: promedio → 5 estrellas gráficas ----------
   Llena si el promedio cubre ≥75% del tramo de esa estrella; media si
   cubre ≥25%; si no, vacía. Ej.: 4.2 → ★★★★☆ · 4.5 → ★★★★ y media. */
function pintarEstrellas(prom) {
  const p = Math.max(0, Math.min(5, +prom || 0));
  let html = '<span class="estrellas-ver" aria-hidden="true">';
  for (let i = 1; i <= 5; i++) {
    const clase = p >= i - 0.25 ? "llena" : (p >= i - 0.75 ? "media" : "vacia");
    html += `<span class="est ${clase}">★</span>`;
  }
  return html + "</span>";
}
function bloqueCalif(est) {
  const r = resumenes[est.id];
  if (!r) return `<span class="sin-calif">Sin calificaciones todavía — sé el primero en opinar</span>`;
  const comb = (r.promA + r.promL) / 2;
  return `<span class="calif">${pintarEstrellas(comb)} ${comb.toFixed(1)} <small>· Litros completos ${r.promL.toFixed(1)} · Servicio ${r.promA.toFixed(1)} · ${r.n} opinión(es)</small></span>`;
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

/* ---------- Saludo con fecha (encabezado compartido) ---------- */
function initSaludo() {
  const hoy = new Date().toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const fecha = hoy.charAt(0).toUpperCase() + hoy.slice(1);
  document.querySelectorAll(".fecha-hoy").forEach(el => { el.textContent = fecha; });
}
document.addEventListener("DOMContentLoaded", initSaludo);

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

/* ============================================================
   Radio en vivo: reproductor COMPARTIDO por toda la app.
   Un solo <audio> creado aquí; su estado (estación, si sonaba y
   volumen) vive en sessionStorage para retomarlo al cambiar de
   página, con una barra inferior fija en todas las páginas y
   controles del sistema vía Media Session API.
   ============================================================ */
const ESTACIONES_RADIO = [
  { nombre: "Ibero 90.9", url: "https://shaincast.caster.fm:20866/listen.mp3" },
  { nombre: "Radio UNAM 96.1", url: "https://tv.radiohosting.online:9484/stream" },
  { nombre: "W Radio 96.9", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/W_RADIO.mp3" },
  { nombre: "Reactor 105.7", url: "https://s2.mexside.net/8002/stream" },
  { nombre: "Radio Educación 1060", url: "https://s2.mexside.net:8176/stream" }
];
const RADIO_KEY = "gasapp_radio";
let radioAudio = null;        // el único <audio> de toda la app
let radioIdx = -1;            // estación cargada (-1 = ninguna)
let radioQueriaSonar = false; // intención: estaba sonando (para reanudar)
let radioBloqueada = false;   // play() rechazado por política de autoplay
let radioError = false;       // la señal no respondió

function radioLeerEstado() {
  try { return JSON.parse(sessionStorage.getItem(RADIO_KEY) || "null"); } catch (e) { return null; }
}
function radioGuardarEstado() {
  try {
    if (radioIdx < 0) { sessionStorage.removeItem(RADIO_KEY); return; }
    sessionStorage.setItem(RADIO_KEY, JSON.stringify({
      idx: radioIdx,
      sonando: radioQueriaSonar,
      volumen: radioAudio ? radioAudio.volume : 0.9
    }));
  } catch (e) { /* sin sessionStorage */ }
}
function radioElAudio() {
  if (radioAudio) return radioAudio;
  radioAudio = document.createElement("audio");
  radioAudio.preload = "none";
  radioAudio.setAttribute("playsinline", "");
  radioAudio.addEventListener("play", () => {
    radioQueriaSonar = true; radioBloqueada = false; radioError = false;
    radioGuardarEstado(); radioMediaSesion(); radioPintar();
  });
  radioAudio.addEventListener("pause", () => {
    // También capta pausas hechas desde los controles del sistema.
    radioQueriaSonar = false;
    radioGuardarEstado(); radioPintar();
  });
  radioAudio.addEventListener("error", () => {
    if (radioIdx >= 0) { radioError = true; radioPintar(); }
  }, true);
  document.body.appendChild(radioAudio);
  return radioAudio;
}
function radioIntentarPlay() {
  const a = radioElAudio();
  try {
    const p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => { radioBloqueada = true; radioPintar(); });
    }
  } catch (e) { radioBloqueada = true; radioPintar(); }
}
function radioCargar(i) {
  const a = radioElAudio();
  radioIdx = i;
  radioError = false; radioBloqueada = false; radioQueriaSonar = true;
  a.src = ESTACIONES_RADIO[i].url;
  radioGuardarEstado();
  radioMediaSesion();
  radioIntentarPlay();
  radioPintar();
}
function radioReproducir(i) {
  if (i === radioIdx && radioAudio) { radioToggle(); return; }
  radioCargar(i);
}
function radioToggle() {
  if (radioIdx < 0) return;
  const a = radioElAudio();
  if (a.paused) {
    radioQueriaSonar = true; radioBloqueada = false; radioError = false;
    radioGuardarEstado();
    radioIntentarPlay();
  } else {
    radioQueriaSonar = false;
    radioGuardarEstado();
    a.pause();
  }
  radioPintar();
}
function radioDetener() {
  radioIdx = -1;
  radioQueriaSonar = false; radioBloqueada = false; radioError = false;
  if (radioAudio) {
    radioAudio.pause();
    radioAudio.removeAttribute("src");
    try { radioAudio.load(); } catch (e) { /* nada que cargar */ }
  }
  radioGuardarEstado();
  radioPintar();
}
function radioCambiar(delta) {
  const n = ESTACIONES_RADIO.length;
  if (!n) return;
  const sig = radioIdx < 0 ? (delta > 0 ? 0 : n - 1) : (radioIdx + delta + n) % n;
  if (sig === radioIdx) { radioToggle(); return; }
  radioCargar(sig);
}
function radioFijarVolumen(v) {
  const a = radioElAudio();
  a.volume = Math.min(1, Math.max(0, v));
  radioGuardarEstado();
}
function radioInfo() {
  const st = radioLeerEstado();
  return {
    idx: radioIdx,
    sonando: radioIdx >= 0 && !!radioAudio && !radioAudio.paused,
    bloqueada: radioBloqueada,
    error: radioError,
    volumen: radioAudio ? radioAudio.volume : (st && typeof st.volumen === "number" ? st.volumen : 0.9)
  };
}
/* Controles del sistema: notificación y pantalla bloqueada del teléfono. */
function radioMediaSesion() {
  if (!("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  const poner = (accion, fn) => { try { ms.setActionHandler(accion, fn); } catch (e) { /* acción no soportada */ } };
  poner("play", () => radioToggle());
  poner("pause", () => { if (radioAudio && !radioAudio.paused) radioToggle(); });
  poner("previoustrack", () => radioCambiar(-1));
  poner("nexttrack", () => radioCambiar(1));
  poner("stop", () => radioDetener());
  if (radioIdx >= 0 && typeof MediaMetadata !== "undefined") {
    try {
      ms.metadata = new MediaMetadata({
        title: ESTACIONES_RADIO[radioIdx].nombre,
        artist: "Gasapp Radio",
        album: "Radio en vivo · Gasapp"
      });
    } catch (e) { /* sin metadatos */ }
  }
}
/* ---------- Barra inferior (mini-reproductor) ---------- */
function radioCrearBarra() {
  if (document.getElementById("barraRadio")) return;
  const barra = document.createElement("div");
  barra.className = "barra-radio";
  barra.id = "barraRadio";
  barra.hidden = true;
  barra.innerHTML =
    '<button type="button" class="br-btn" id="brPrev" aria-label="Estación anterior">⏮</button>' +
    '<button type="button" class="br-btn br-play" id="brPlay" aria-label="Reproducir la radio">▶</button>' +
    '<button type="button" class="br-btn" id="brNext" aria-label="Estación siguiente">⏭</button>' +
    '<a class="br-nombre" id="brNombre" href="radio.html"></a>' +
    '<span class="br-estado" id="brEstado"></span>' +
    '<button type="button" class="br-btn" id="brStop" aria-label="Detener la radio">■</button>';
  document.body.appendChild(barra);
  barra.querySelector("#brPrev").addEventListener("click", () => radioCambiar(-1));
  barra.querySelector("#brNext").addEventListener("click", () => radioCambiar(1));
  barra.querySelector("#brPlay").addEventListener("click", radioToggle);
  barra.querySelector("#brStop").addEventListener("click", radioDetener);
}
function radioPintar() {
  const barra = document.getElementById("barraRadio");
  if (barra) {
    const info = radioInfo();
    barra.hidden = info.idx < 0;
    document.body.classList.toggle("con-barra-radio", info.idx >= 0);
    if (info.idx >= 0) {
      barra.querySelector("#brNombre").textContent = ESTACIONES_RADIO[info.idx].nombre;
      const btnPlay = barra.querySelector("#brPlay");
      btnPlay.textContent = info.sonando ? "⏸" : "▶";
      btnPlay.setAttribute("aria-label", info.sonando ? "Pausar la radio" : "Reproducir la radio");
      barra.querySelector("#brEstado").textContent =
        info.error ? "Señal no disponible" :
        info.sonando ? "EN VIVO" :
        info.bloqueada ? "Seguir escuchando" : "En pausa";
      barra.classList.toggle("sonando", info.sonando);
    }
  }
  // radio.html dibuja además sus tarjetas desde el mismo estado.
  if (typeof window.radioPintarPagina === "function") window.radioPintarPagina();
}
function initRadio() {
  radioCrearBarra();
  const st = radioLeerEstado();
  if (st && ESTACIONES_RADIO[st.idx]) {
    radioIdx = st.idx;
    const a = radioElAudio();
    a.src = ESTACIONES_RADIO[radioIdx].url;
    if (typeof st.volumen === "number") a.volume = Math.min(1, Math.max(0, st.volumen));
    radioMediaSesion();
    if (st.sonando) {
      radioQueriaSonar = true;
      radioIntentarPlay(); // si el navegador lo bloquea, la barra ofrece «Seguir escuchando»
    }
  }
  radioPintar();
}
document.addEventListener("DOMContentLoaded", initRadio);

/* ============================================================
   Asistente (chat local en burbuja): responde SOLO con los datos
   de la app — datos.js, el GPS de la sesión y la bitácora de
   rendimiento — por coincidencia de palabras clave. Sin API.
   ============================================================ */
function botDistanciaTxt(est) {
  if (!hayGPS()) return "";
  return " a " + distanciaKm(origen.lat, origen.lng, est.lat, est.lng).toFixed(1) + " km de ti";
}
function botPreciosTxt(est) {
  return ["regular", "premium", "diesel"].map(f => {
    const p = precioDe(est, f);
    return NOMBRES_FUEL[f] + " " + (p === null ? "—" : dinero(p));
  }).join(" · ");
}
function botExtremo(fuel, dir) { // dir: -1 = más barata, 1 = más cara
  let sel = null;
  for (const e of ESTACIONES) {
    const p = precioDe(e, fuel);
    if (p === null) continue;
    if (sel === null || (dir < 0 ? p < precioDe(sel, fuel) : p > precioDe(sel, fuel))) sel = e;
  }
  return sel;
}
const BOT_GENERICAS = new Set(["sa", "de", "cv", "s", "rl", "servicio", "servicios",
  "gasolinero", "gasolinera", "nacional", "combustibles", "lubricantes", "estaciones"]);
function botBuscarEstacion(t) {
  // Por el número distintivo del permiso (ej. «4133»).
  const porPermiso = ESTACIONES.find(e => t.includes(e.permiso.split("/")[1]));
  if (porPermiso) return { tipo: "una", est: porPermiso };
  const palabras = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));
  const candidatos = [];
  for (const e of ESTACIONES) {
    const claves = normalizar(e.nombre).split(/[^a-z]+/)
      .filter(w => w.length >= 4 && !BOT_GENERICAS.has(w));
    const hits = claves.filter(k => palabras.has(k)).length;
    if (hits) candidatos.push({ e, hits });
  }
  if (!candidatos.length) return null;
  candidatos.sort((a, b) => b.hits - a.hits);
  const tope = candidatos[0].hits;
  const mejores = candidatos.filter(c => c.hits === tope);
  if (mejores.length === 1) return { tipo: "una", est: mejores[0].e };
  return { tipo: "varias", lista: mejores.slice(0, 4).map(c => c.e) };
}
function botTxtVarias(b) {
  return "Hay varias estaciones con ese nombre: " +
    b.lista.map(e => "<strong>" + esc(e.nombre) + "</strong> (permiso " + esc(e.permiso) + ")").join(", ") +
    ". Dime el número de permiso para distinguirla.";
}
function botRegistrosRendimiento() {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem("gasapp_rendimiento") || "[]"); } catch (e) { arr = []; }
  if (!Array.isArray(arr) || arr.length < 2) return { conDatos: false };
  const ord = [...arr].sort((a, b) => a.odometro - b.odometro);
  let km = 0, litros = 0, n = 0;
  for (let i = 1; i < ord.length; i++) {
    const rec = ord[i].odometro - ord[i - 1].odometro;
    if (rec > 0 && ord[i].litros > 0) { km += rec; litros += ord[i].litros; n++; }
  }
  if (!n || litros <= 0) return { conDatos: false };
  return { conDatos: true, promedio: km / litros, n };
}
function botResumenDe(est) {
  // Agregado conocido en este dispositivo: el ya cargado (de la API, si
  // cargó) o, si no, el calculado de las opiniones guardadas localmente.
  if (resumenes[est.id]) return resumenes[est.id];
  return resumir(comentariosLocales(est.id));
}
function botMejorValorada(criterio) { // criterio: "litros" | "servicio" | "combinada"
  let mejor = null, mejorClave = -1;
  for (const e of ESTACIONES) {
    const r = botResumenDe(e);
    if (!r) continue;
    const clave = criterio === "litros" ? r.promL :
      criterio === "servicio" ? r.promA : (r.promA + r.promL) / 2;
    if (clave > mejorClave) { mejorClave = clave; mejor = { est: e, r, clave }; }
  }
  return mejor;
}
function botRespuesta(textoCrudo) {
  const t = " " + normalizar(textoCrudo) + " ";
  const fuel = /premium/.test(t) ? "premium" : /diesel/.test(t) ? "diesel" : "regular";
  const nombreFuel = NOMBRES_FUEL[fuel];

  /* --- Radio: poner una estación o listarlas --- */
  const ALIAS_RADIO = [["ibero", 0], ["unam", 1], ["w radio", 2], ["wradio", 2], ["reactor", 3], ["educacion", 4]];
  let idxRadio = -1;
  for (const [alias, i] of ALIAS_RADIO) if (t.includes(alias)) { idxRadio = i; break; }
  if (idxRadio >= 0 && /\s(pon|reproduce|escuchar|escucha|toca)\s/.test(t)) {
    radioReproducir(idxRadio);
    return "Poniendo <strong>" + esc(ESTACIONES_RADIO[idxRadio].nombre) + "</strong> en vivo. " +
      "Suena en toda la app: sigue navegando y contrólala desde la barra inferior o desde los controles de tu teléfono.";
  }
  if (/\bradio\b/.test(t)) {
    return "En Gasapp puedes escuchar en vivo: <strong>" +
      ESTACIONES_RADIO.map(r => esc(r.nombre)).join(", ") +
      "</strong>. Dime «pon Reactor» y la pongo aquí mismo, o ve a la página de Radio.";
  }

  /* --- Rendimiento --- */
  if (/rendimiento/.test(t)) {
    if (/(como funciona|que es|como se calcula|como lo mido|explica)/.test(t)) {
      return "El <strong>rendimiento</strong> mide cuántos kilómetros recorres por litro: al registrar " +
        "cada carga con el kilometraje de tu odómetro, Gasapp resta el kilometraje de la carga anterior " +
        "y lo divide entre los litros de la carga nueva (km recorridos ÷ litros). Si en una estación te " +
        "dan menos litros de los que pagas, tu rendimiento ahí baja: así detectas litros incompletos. " +
        "Es más fiel si llenas el tanque en cada carga. Registra tus cargas en la página de <strong>Rendimiento</strong>.";
    }
    const regs = botRegistrosRendimiento();
    if (regs.conDatos) {
      return "Tu rendimiento promedio es de <strong>" + regs.promedio.toFixed(1) + " km/L</strong>, " +
        "medido en " + regs.n + " carga(s) de tu bitácora. El detalle por estación está en la página de <strong>Rendimiento</strong>.";
    }
    return "Todavía no tienes cargas suficientes en tu bitácora para calcular tu rendimiento " +
      "(se necesitan al menos dos cargas con odómetro). Registra tus cargas en la página de " +
      "<strong>Rendimiento</strong> y te digo tu promedio en km/L.";
  }

  /* --- Valoración de la comunidad: litros completos y servicio --- */
  if (/(valorad|calificad|litros completos|mejor servicio|buen servicio)/.test(t)) {
    const criterio = /litros/.test(t) ? "litros" : /servicio/.test(t) ? "servicio" : "combinada";
    const m = botMejorValorada(criterio);
    if (!m) {
      return "Todavía no hay opiniones registradas en este dispositivo, así que aún no puedo " +
        "decirte cuál es la mejor valorada. Cuando cargues gasolina, deja tu opinión en la ficha " +
        "de la estación: se califica con estrellas si te dieron <strong>litros completos</strong> " +
        "y cómo fue el <strong>servicio</strong>.";
    }
    const desglose = "Litros completos <strong>" + m.r.promL.toFixed(1) + "</strong> · Servicio <strong>" +
      m.r.promA.toFixed(1) + "</strong>, con " + m.r.n + " opinión(es) conocida(s) en este dispositivo";
    if (criterio === "litros") {
      return "Donde mejor dan <strong>litros completos</strong>, según las opiniones de la comunidad, " +
        "es en <strong>" + esc(m.est.nombre) + "</strong>" + botDistanciaTxt(m.est) + ": " + desglose + ".";
    }
    if (criterio === "servicio") {
      return "El mejor <strong>servicio</strong>, según las opiniones de la comunidad, está en " +
        "<strong>" + esc(m.est.nombre) + "</strong>" + botDistanciaTxt(m.est) + ": " + desglose + ".";
    }
    return "La estación <strong>mejor valorada</strong> es <strong>" + esc(m.est.nombre) + "</strong>" +
      botDistanciaTxt(m.est) + ", con promedio de <strong>" + m.clave.toFixed(1) + "</strong>: " + desglose + ".";
  }

  /* --- Afluencia --- */
  if (/(gente|afluencia|fila|lleno|llena|tranquil)/.test(t)) {
    const b = botBuscarEstacion(t);
    if (b && b.tipo === "una") {
      const perfil = perfilAfluencia(b.est.id);
      let mejorHora = 6, menor = Infinity;
      for (let h = 6; h <= 22; h++) if (perfil[h] < menor) { menor = perfil[h]; mejorHora = h; }
      return "En <strong>" + esc(b.est.nombre) + "</strong>, la hora con menos gente según el modelo de " +
        "afluencia de Gasapp es alrededor de las <strong>" + mejorHora + ":00</strong> (afluencia estimada " +
        "del " + menor + "%, fila de unos " + filaEstimada(menor) + " min). Es una estimación de la app, no una medición en vivo.";
    }
    if (b && b.tipo === "varias") return botTxtVarias(b);
    return "¿De qué estación quieres saber la afluencia? Dime su nombre, por ejemplo: " +
      "«¿a qué hora hay menos gente en Servicio Norte?».";
  }

  /* --- La más cercana --- */
  if (/(cerca|cercana|cercano|proxim)/.test(t)) {
    if (!hayGPS()) {
      return "Todavía no conozco tu ubicación en esta sesión. Toca el botón " +
        "<strong>«Usar mi ubicación (GPS)»</strong> en el Inicio o en el Mapa y pregúntame de nuevo: te digo cuál te queda más cerca.";
    }
    let cerca = null, dMin = Infinity;
    for (const e of ESTACIONES) {
      const d = distanciaKm(origen.lat, origen.lng, e.lat, e.lng);
      if (d < dMin) { dMin = d; cerca = e; }
    }
    return "La estación más cerca de ti es <strong>" + esc(cerca.nombre) + "</strong>, a <strong>" +
      dMin.toFixed(1) + " km</strong>. Sus precios: " + botPreciosTxt(cerca) + ".";
  }

  /* --- Ahorro --- */
  if (/ahorr/.test(t)) {
    const barata = botExtremo(fuel, -1), cara = botExtremo(fuel, 1);
    if (!barata || !cara) return "No tengo precios de " + nombreFuel + " en la lista para calcular el ahorro.";
    const mLitros = t.match(/(\d+(?:[.,]\d+)?)\s*(litros|l\b)/);
    const litros = mLitros ? parseFloat(mLitros[1].replace(",", ".")) : 40;
    const porCarga = (precioDe(cara, fuel) - precioDe(barata, fuel)) * litros;
    let r = "Cargando <strong>" + litros + " L</strong> de " + nombreFuel + " en la más barata " +
      "(<strong>" + esc(barata.nombre) + "</strong>, " + dinero(precioDe(barata, fuel)) + "/L) en vez de " +
      "en la más cara (<strong>" + esc(cara.nombre) + "</strong>, " + dinero(precioDe(cara, fuel)) + "/L), " +
      "ahorras <strong>" + dinero(porCarga) + "</strong> por carga.";
    const mCargas = t.match(/(\d+)\s*cargas/);
    if (mCargas || /\bmes\b/.test(t)) {
      const cargas = mCargas ? parseInt(mCargas[1], 10) : 4;
      r += " Con " + cargas + " cargas al mes, son <strong>" + dinero(porCarga * cargas) + "</strong>.";
    }
    return r;
  }

  /* --- La más barata --- */
  if (/(barat|economic)/.test(t)) {
    const barata = botExtremo(fuel, -1);
    if (!barata) return "No tengo precios de " + nombreFuel + " en la lista.";
    return "La " + nombreFuel + " más barata está en <strong>" + esc(barata.nombre) + "</strong> a " +
      "<strong>" + dinero(precioDe(barata, fuel)) + "</strong> por litro" + botDistanciaTxt(barata) +
      ". Es de la foto de datos del " + FECHA_FOTO + "; confirma el precio en la bomba.";
  }

  /* --- Precio de una estación nombrada --- */
  const b = botBuscarEstacion(t);
  if (b && b.tipo === "una") {
    return "<strong>" + esc(b.est.nombre) + "</strong> (" + esc(b.est.permiso) + ")" + botDistanciaTxt(b.est) +
      " tiene estos precios: " + botPreciosTxt(b.est) + ".";
  }
  if (b && b.tipo === "varias") return botTxtVarias(b);

  /* --- Saludo / ayuda --- */
  if (/^\s*(hola|buenas|hey|que tal|buenos dias|buenas tardes|buenas noches)\b/.test(t.trim()) ||
      /(ayuda|que puedes|para que sirves|que sabes hacer)/.test(t)) {
    return "¡Hola! Soy el asistente de <strong>Gasapp</strong> y respondo con los datos de la app. " +
      "Pregúntame por la gasolina <strong>más barata</strong>, el <strong>precio de una estación</strong>, " +
      "<strong>cuánto ahorras</strong> por carga, la estación <strong>más cercana</strong>, la hora con " +
      "<strong>menos gente</strong>, la <strong>radio</strong> en vivo o tu <strong>rendimiento</strong> en km/L.";
  }

  /* --- Fuera de tema --- */
  return "Eso todavía no lo sé contestar. Puedo ayudarte con: la gasolina <strong>más barata</strong>, " +
    "el <strong>precio de una estación</strong>, <strong>cuánto ahorras</strong> por carga, la estación " +
    "<strong>más cercana</strong>, la <strong>mejor valorada</strong> en litros completos y servicio, la hora " +
    "con <strong>menos gente</strong>, poner la <strong>radio</strong> " +
    "y tu <strong>rendimiento</strong> en km/L.";
}
/* ---------- Interfaz del chat ---------- */
const CHAT_SUGERENCIAS = [
  "¿Cuál es la Magna más barata?",
  "¿Cuánto ahorro si cargo 40 litros?",
  "¿Cuál me queda más cerca?",
  "¿Qué estaciones de radio hay?"
];
let chatSaludoMostrado = false;
function chatCrear() {
  if (document.getElementById("chatBurbuja")) return;
  const burbuja = document.createElement("button");
  burbuja.type = "button";
  burbuja.className = "chat-burbuja";
  burbuja.id = "chatBurbuja";
  burbuja.setAttribute("aria-label", "Abrir el asistente de Gasapp");
  burbuja.textContent = "💬";
  document.body.appendChild(burbuja);
  const panel = document.createElement("div");
  panel.className = "chat-panel";
  panel.id = "chatPanel";
  panel.hidden = true;
  panel.innerHTML =
    '<div class="chat-cabeza"><span>Asistente Gasapp</span>' +
    '<button type="button" id="chatCerrar" aria-label="Cerrar el chat">✕</button></div>' +
    '<div class="chat-msjs" id="chatMsjs"></div>' +
    '<div class="chat-chips" id="chatChips">' +
    CHAT_SUGERENCIAS.map(s => '<button type="button" class="chat-chip">' + esc(s) + "</button>").join("") +
    "</div>" +
    '<form class="chat-form" id="chatForm">' +
    '<input type="text" id="chatInput" placeholder="Pregúntame por precios, ahorro, radio…" autocomplete="off" aria-label="Escribe tu pregunta">' +
    '<button type="submit" aria-label="Enviar la pregunta">➤</button></form>';
  document.body.appendChild(panel);
  burbuja.addEventListener("click", () => {
    const abierto = panel.hidden;
    panel.hidden = !abierto;
    burbuja.classList.toggle("abierto", abierto);
    if (abierto && !chatSaludoMostrado) {
      chatSaludoMostrado = true;
      chatAgregarMsg("bot", "¡Hola! Soy el asistente de <strong>Gasapp</strong>. Te respondo con los datos " +
        "de la app: precios, ahorro, cercanía, afluencia, radio y tu rendimiento. Toca una sugerencia o escribe tu pregunta.");
    }
    if (abierto) { const inp = document.getElementById("chatInput"); if (inp) inp.focus(); }
  });
  panel.querySelector("#chatCerrar").addEventListener("click", () => {
    panel.hidden = true;
    burbuja.classList.remove("abierto");
  });
  panel.querySelector("#chatForm").addEventListener("submit", ev => {
    ev.preventDefault();
    const inp = document.getElementById("chatInput");
    chatEnviar(inp.value);
    inp.value = "";
  });
  panel.querySelectorAll(".chat-chip").forEach(ch =>
    ch.addEventListener("click", () => chatEnviar(ch.textContent)));
}
function chatAgregarMsg(clase, html) {
  const cont = document.getElementById("chatMsjs");
  if (!cont) return;
  const div = document.createElement("div");
  div.className = "chat-msj " + clase;
  div.innerHTML = html;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}
function chatEnviar(texto) {
  const limpio = String(texto == null ? "" : texto).trim();
  if (!limpio) return;
  chatAgregarMsg("usuario", esc(limpio));
  chatAgregarMsg("bot", botRespuesta(limpio));
}
document.addEventListener("DOMContentLoaded", chatCrear);
