/* ============================================================
   Gasapp API — Cloudflare Worker + D1
   ------------------------------------------------------------
   Endpoints:
     GET  /api/comentarios?estacion=ID   Lista comentarios y promedios
     POST /api/comentarios               Guarda comentario + calificaciones
     GET  /api/salud                     Comprobación simple

   Binding requerido (panel de Cloudflare → Worker → Settings →
   Bindings → D1 database):  nombre de variable  DB
   La base se crea con schema.sql (ver README.md).
   ============================================================ */

const CORS = {
  "Access-Control-Allow-Origin": "*", // En producción puedes limitarlo a tu dominio de GitHub Pages
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

/* --- Filtro de groserías (servidor; el cliente aplica el mismo) --- */
const GROSERIAS = ["pendejo","pendeja","pendejos","pendejas","pendejada","pendejadas",
  "chingar","chingada","chingado","chingados","chingadera","chingaderas","chingas","chingue",
  "pinche","pinches","culero","culera","culeros","culeras","mierda","mierdas",
  "verga","vergas","verguiza","puto","puta","putos","putas","putiza",
  "cabron","cabrona","cabrones","mamada","mamadas","mamon","mamona","mamones",
  "idiota","idiotas","imbecil","imbeciles","estupido","estupida","estupidos","estupidas",
  "joto","jotos","marica","maricas","maricon","maricones","cono","ojete","ojetes",
  "huevon","huevona","huevones","culiao","culiada","hdp","pende"];

function normalizar(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a")
    .replace(/@/g, "a").replace(/\$/g, "s");
}
function contieneGroserias(t) {
  const tokens = normalizar(t).split(/[^a-z]+/).filter(Boolean);
  return tokens.some((tok) => GROSERIAS.includes(tok));
}

function esEntero1a5(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/api/salud") {
      return json({ ok: true, servicio: "gasapp-api" });
    }

    if (url.pathname === "/api/comentarios" && request.method === "GET") {
      const estacion = (url.searchParams.get("estacion") || "").trim();
      if (!estacion || estacion.length > 40) {
        return json({ error: "Falta el parámetro estacion." }, 400);
      }
      const lista = await env.DB.prepare(
        `SELECT id, estacion_id, nombre, atencion, litros, texto, creado_en
           FROM comentarios
          WHERE estacion_id = ?
          ORDER BY creado_en DESC, id DESC
          LIMIT 100`
      ).bind(estacion).all();
      const prom = await env.DB.prepare(
        `SELECT AVG(atencion) AS prom_atencion, AVG(litros) AS prom_litros, COUNT(*) AS total
           FROM comentarios WHERE estacion_id = ?`
      ).bind(estacion).first();
      return json({
        estacion_id: estacion,
        promedios: {
          atencion: prom && prom.prom_atencion !== null ? Math.round(prom.prom_atencion * 10) / 10 : null,
          litros: prom && prom.prom_litros !== null ? Math.round(prom.prom_litros * 10) / 10 : null,
          total: prom ? prom.total : 0,
        },
        comentarios: lista.results || [],
      });
    }

    if (url.pathname === "/api/comentarios" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: "El cuerpo debe ser JSON válido." }, 400);
      }
      const estacionId = String(body.estacion_id || "").trim();
      const nombre = String(body.nombre || "Anónimo").trim().slice(0, 60) || "Anónimo";
      const texto = String(body.texto || "").trim();
      const atencion = body.atencion;
      const litros = body.litros;

      if (!estacionId || estacionId.length > 40) {
        return json({ error: "Falta estacion_id válido." }, 400);
      }
      if (!esEntero1a5(atencion) || !esEntero1a5(litros)) {
        return json({ error: "Las calificaciones deben ser enteros entre 1 y 5." }, 400);
      }
      if (texto.length < 3 || texto.length > 500) {
        return json({ error: "El comentario debe tener entre 3 y 500 caracteres." }, 400);
      }
      if (contieneGroserias(texto) || contieneGroserias(nombre)) {
        return json({ error: "El comentario contiene groserías y no se puede publicar." }, 400);
      }

      const res = await env.DB.prepare(
        `INSERT INTO comentarios (estacion_id, nombre, atencion, litros, texto)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(estacionId, nombre, Number(atencion), Number(litros), texto).run();

      return json({ ok: true, id: res.meta && res.meta.last_row_id }, 201);
    }

    return json({ error: "Ruta no encontrada." }, 404);
  },
};
