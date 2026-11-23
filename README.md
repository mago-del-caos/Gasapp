# Gasapp

**La gasolina más barata cerca de ti, con la verdad de la comunidad.**

Gasapp es una app web para México que muestra los precios de gasolina y diésel
por estación de servicio (datos oficiales), encuentra la opción más barata cerca
de tu ubicación y recoge las calificaciones de los propios usuarios: atención
del personal y **litros completos** (si te cargan lo que pagas o te dan de
menos), además de la afluencia estimada por hora y el tiempo de fila.

## Qué trae esta versión

- **Precios reales**: foto de datos del **22 de noviembre de 2026** con 26
  estaciones alrededor de Tlatelolco, CDMX (nombre, permiso, coordenadas y
  precio de Magna, Premium y Diésel), tomada del listado XML público de la
  **Comisión Nacional de Energía (CNE)** — precios reportados por los
  permisionarios, actualización diaria a las 18:00 h:
  - Estaciones: `https://publicacionexterna.azurewebsites.net/publicaciones/places`
  - Precios: `https://publicacionexterna.azurewebsites.net/publicaciones/prices`
- **GPS**: botón «Usar mi ubicación» que recalcula las distancias reales.
- **Orden** por mejor precio, cercanía o calificación de la comunidad.
- **Calculadora de ahorro** por carga y al mes (más barata vs. más cara).
- **Detalle por estación**: afluencia estimada por hora, tiempo de fila
  aproximado y botón «Cómo llegar» (Google Maps).
- **Comentarios y calificaciones** con filtro de groserías en español
  (cliente y servidor). Si la API no está conectada, la app funciona en
  **modo local**: guarda las opiniones solo en el dispositivo.
- **Identidad visual propia**: iconos y paleta verde/amarillo en `assets/`
  (logo, mapa, buscar, estadísticas, favoritos, reseñas, comunidad, tiempo,
  alertas, filtros y ajustes), recortados de las hojas de diseño originales.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app completa (un solo archivo, sin dependencias). |
| `assets/` | Logo e iconos de la app (PNG) + iconos PWA 192/512. |
| `manifest.json` | Manifiesto para instalarla como app (PWA). |
| `worker.js` | API de comentarios para Cloudflare Workers + D1. |
| `schema.sql` | Creación de la tabla `comentarios` en D1. |

## 1. Publicar la app en GitHub Pages

El repositorio es **https://github.com/mago-del-caos/Gasapp** (público).

1. Sube a la raíz del repositorio: `index.html`, `manifest.json` y la carpeta
   `assets/` completa (también puedes subir `worker.js`, `schema.sql` y este
   README como referencia; no afectan al sitio).
2. En GitHub: **Settings → Pages → Build and deployment → Source:
   «Deploy from a branch»**, rama `main`, carpeta `/ (root)`. Guarda.
3. En 1–2 minutos la app queda en **https://mago-del-caos.github.io/Gasapp/**.
4. Sin el paso 2 (Worker), la app ya funciona con precios y GPS; los
   comentarios quedan en modo local.

## 2. Activar los comentarios para todos (Cloudflare Worker + D1)

El token de API disponible es de solo lectura, así que estos pasos se hacen
una sola vez en el panel de Cloudflare, con tu sesión:

### a) Crear la base de datos D1
1. Panel de Cloudflare → **Workers & Pages → D1 → Create database**.
2. Nombre: `gasapp-db`. Créala.
3. Entra a la base → pestaña **Console** → pega todo el contenido de
   `schema.sql` → **Execute**. Debe crear la tabla `comentarios` y su índice.

### b) Crear el Worker
1. **Workers & Pages → Create → Worker**. Nombre sugerido: `gasapp-api`.
   Créalo y entra a **Edit code**.
2. Borra el código de ejemplo y pega todo el contenido de `worker.js`.
   **Deploy**.
3. En el Worker: **Settings → Bindings → Add → D1 database**:
   - Variable name: `DB`  ← exactamente así, el código lo espera.
   - D1 database: `gasapp-db`. Guarda y vuelve a desplegar si lo pide.
4. Comprueba en el navegador: `https://gasapp-api.<tu-subdominio>.workers.dev/api/salud`
   debe responder `{"ok":true,"servicio":"gasapp-api"}`.

### c) Conectar la app con el Worker
1. Abre `index.html` y busca al inicio del script:
   ```js
   const API_BASE = "";
   ```
2. Pon la URL de tu Worker entre las comillas, sin diagonal final:
   ```js
   const API_BASE = "https://gasapp-api.<tu-subdominio>.workers.dev";
   ```
3. Sube el `index.html` actualizado a GitHub. A partir de ahí, las opiniones
   se guardan en D1 y las ven todos; el filtro de groserías se aplica en el
   navegador y otra vez en el servidor (rechaza con error 400).

## 3. Actualizar la foto de precios (cuando se quiera)

1. Descarga de nuevo los dos XML de la CNE (enlaces arriba).
2. Cruza estaciones y precios por `place_id`, filtra la zona que quieras
   (esta versión: 4 km alrededor de Tlatelolco, 19.4551, -99.1416) y
   reemplaza el arreglo `ESTACIONES` y la fecha de la foto dentro de
   `index.html`.
3. Sube el archivo a GitHub.

## Notas

- Los precios son los reportados por cada permisionario a la CNE; Gasapp no
  los garantiza: verifica siempre el precio en la bomba.
- La afluencia por hora es una **estimación** de Gasapp (modelo por estación),
  no una medición en vivo.
- El XML oficial no publica el domicilio de cada estación, solo nombre,
  permiso y coordenadas; por eso el botón «Cómo llegar» abre la ruta en
  Google Maps con las coordenadas exactas.
