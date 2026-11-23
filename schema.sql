-- Gasapp — Esquema de la base de datos D1 (Cloudflare)
-- Ejecuta este archivo en la consola de tu base D1
-- (panel de Cloudflare → Workers & Pages → D1 → tu base → Console)
-- o con Wrangler:  wrangler d1 execute gasapp-db --file=schema.sql

CREATE TABLE IF NOT EXISTS comentarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  estacion_id TEXT    NOT NULL,               -- place_id oficial de la estación (CNE)
  nombre      TEXT    NOT NULL DEFAULT 'Anónimo',
  atencion    INTEGER NOT NULL CHECK (atencion BETWEEN 1 AND 5),  -- estrellas de atención
  litros      INTEGER NOT NULL CHECK (litros   BETWEEN 1 AND 5),  -- estrellas de litros completos
  texto       TEXT    NOT NULL,
  creado_en   TEXT    NOT NULL DEFAULT (datetime('now'))          -- UTC
);

-- Índice para listar por estación, más recientes primero,
-- y para calcular los promedios (AVG) por estación.
CREATE INDEX IF NOT EXISTS idx_comentarios_estacion_fecha
  ON comentarios (estacion_id, creado_en DESC);

-- Los promedios se calculan al vuelo en el Worker con:
--   SELECT AVG(atencion), AVG(litros), COUNT(*)
--     FROM comentarios WHERE estacion_id = ?
-- por lo que no se necesita tabla adicional.
