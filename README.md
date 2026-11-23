# Gasapp

**La gasolina más barata cerca de ti, con la verdad de la comunidad.**

Gasapp es una app web para México que muestra los precios de gasolina y diésel
por estación de servicio (datos oficiales), encuentra la opción más barata cerca
de tu ubicación, traza la ruta por calles hasta la estación que elijas y recoge
las calificaciones de los propios usuarios: atención del personal y **litros
completos** (si te cargan lo que pagas o te dan de menos), además de la
afluencia estimada por hora y el tiempo de fila.

## Qué trae esta versión

- **Precios reales**: foto de datos del **22 de noviembre de 2026** con 26
  estaciones alrededor de Tlatelolco, CDMX (nombre, permiso, coordenadas y
  precio de Magna, Premium y Diésel), tomada del listado XML público de la
  **Comisión Nacional de Energía (CNE)** — precios reportados por los
  permisionarios, actualización diaria a las 18:00 h:
  - Estaciones: `https://publicacionexterna.azurewebsites.net/publicaciones/places`
  - Precios: `https://publicacionexterna.azurewebsites.net/publicaciones/prices`
- **Varias páginas** con menú desplegable compartido: Inicio (lista), Mapa
  GPS, detalle por estación, Calculadora, Rendimiento por carga, Radio en
  vivo y «Cómo funciona».
- **Radio en vivo** (`radio.html`): cinco estaciones de la Ciudad de México
  con transmisión pública por internet verificada (Ibero 90.9, Radio UNAM
  96.1, W Radio 96.9, Reactor 105.7 y Radio Educación 1060), con un solo
  reproductor compartido, control de volumen y aviso de consumo de datos.
- **App instalable (PWA)**: botón «📲 Descargar la app» en el Inicio y en el
  menú de todas las páginas. En Android/Chrome dispara el aviso de
  instalación del navegador; en iPhone/Safari muestra los pasos (Compartir →
  «Agregar a pantalla de inicio»). El service worker (`sw.js`) guarda las
  páginas y los iconos en caché: la app abre rápido y funciona sin conexión
  con la última foto de precios guardada.
- **Mapa GPS con rutas**: mapa de OpenStreetMap (Leaflet) con las 26
  estaciones y su precio; botón «Mi ubicación»; ruta por calles calculada con
  **OSRM** (distancia y tiempo por carretera) y botón para abrir la ruta en
  Google Maps. Si el mapa o el cálculo de ruta no cargan, la página ofrece los
  enlaces directos a Google Maps.
- **GPS**: botón «Usar mi ubicación» que recalcula las distancias reales; la
  ubicación se recuerda entre páginas durante la sesión.
- **Orden** por mejor precio, cercanía o calificación de la comunidad.
- **Calculadora de ahorro** por carga y al mes (más barata vs. más cara).
- **Calculadora de rendimiento** (`rendimiento.html`): registra cada carga
  con el kilometraje del odómetro y calcula los kilómetros por litro entre
  cargas consecutivas, con promedio general, mejor/peor carga y **promedio
  por estación** — la otra cara de los «litros completos»: si una estación
  rinde menos, puede que no dé los litros que cobra. Los registros se
  guardan solo en el dispositivo del conductor (localStorage).
- **Detalle por estación** (`estacion.html?id=…`): precios, sello de mejor
  precio, afluencia estimada por hora, tiempo de fila aproximado, ruta en el
  mapa y opiniones de la comunidad.
- **Comentarios y calificaciones** con filtro de groserías en español
  (cliente y servidor). Si la API no está conectada, la app funciona en
  **modo local**: guarda las opiniones solo en el dispositivo.
- **Identidad visual propia**: tema oscuro estilo App CDMX (fondo verde
  casi negro, superficies verde petróleo, acento turquesa y títulos en
  dorado), encabezado con saludo y fecha, tarjeta héroe «Precio y ahorro
  hoy» con medidores calculados de los datos reales y fila de servicios
  circulares. Iconos en `assets/` (logo, mapa, buscar, estadísticas,
  favoritos, reseñas, comunidad, tiempo, alertas, filtros y ajustes),
  recortados de las hojas de diseño originales.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | Inicio: controles (GPS, combustible, orden, buscador) y lista de estaciones. |
| `mapa.html` | Mapa GPS (Leaflet + OpenStreetMap) con marcadores de precio y rutas por calles con OSRM. |
| `estacion.html` | Detalle de una estación según `?id=`: precios, afluencia, ruta y opiniones. |
| `calculadora.html` | Calculadora de ahorro: más barata vs. más cara, por carga y al mes. |
| `rendimiento.html` | Calculadora de rendimiento por carga: odómetro y litros por carga, km/L entre cargas, promedios general y por estación (localStorage). |
| `radio.html` | Radio en vivo: 5 estaciones de CDMX con streams públicos verificados, reproductor único y volumen. |
| `acerca.html` | «Cómo funciona»: explicación, fuente de datos y límites honestos. |
| `estilos.css` | Hoja de estilos compartida por todas las páginas. |
| `datos.js` | El arreglo `ESTACIONES` (la foto de datos CNE) y su fecha. |
| `app.js` | Lógica compartida: GPS, distancias, comentarios (API o modo local), filtro de groserías, afluencia y el menú. Aquí va `API_BASE`. |
| `assets/` | Logo e iconos de la app (PNG) + iconos PWA 192/512. |
| `manifest.json` | Manifiesto para instalarla como app (PWA). |
| `sw.js` | Service worker: caché de páginas y assets propios para instalar y abrir sin conexión. |
| `worker.js` | API de comentarios para Cloudflare Workers + D1. |
| `schema.sql` | Creación de la tabla `comentarios` en D1. |

Las únicas dependencias externas son Leaflet y OpenStreetMap (mapa) y OSRM
(rutas), todas por CDN y sin llave; si fallan, la app sigue usable con los
enlaces a Google Maps.

## 1. Publicar la app en GitHub Pages

El repositorio es **https://github.com/mago-del-caos/Gasapp** (público).

1. Sube a la raíz del repositorio todos los HTML, `estilos.css`, `datos.js`,
   `app.js`, `sw.js`, `manifest.json` y la carpeta `assets/` completa (también puedes
   subir `worker.js`, `schema.sql` y este README como referencia; no afectan
   al sitio).
2. En GitHub: **Settings → Pages → Build and deployment → Source:
   «Deploy from a branch»**, rama `main`, carpeta `/ (root)`. Guarda.
3. En 1–2 minutos la app queda en **https://mago-del-caos.github.io/Gasapp/**.
4. Sin el paso 2 (Worker), la app ya funciona con precios, GPS y mapa; los
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
1. Abre `app.js` y busca al inicio:
   ```js
   const API_BASE = "";
   ```
2. Pon la URL de tu Worker entre las comillas, sin diagonal final:
   ```js
   const API_BASE = "https://gasapp-api.<tu-subdominio>.workers.dev";
   ```
3. Sube el `app.js` actualizado a GitHub. A partir de ahí, las opiniones
   se guardan en D1 y las ven todos; el filtro de groserías se aplica en el
   navegador y otra vez en el servidor (rechaza con error 400).

## 3. Actualizar la foto de precios (cuando se quiera)

1. Descarga de nuevo los dos XML de la CNE (enlaces arriba).
2. Cruza estaciones y precios por `place_id`, filtra la zona que quieras
   (esta versión: 4 km alrededor de Tlatelolco, 19.4551, -99.1416) y
   reemplaza el arreglo `ESTACIONES` y `FECHA_FOTO` dentro de `datos.js`.
3. Sube el archivo a GitHub.

## Notas

- Los precios son los reportados por cada permisionario a la CNE; Gasapp no
  los garantiza: verifica siempre el precio en la bomba.
- La afluencia por hora es una **estimación** de Gasapp (modelo por estación),
  no una medición en vivo.
- El XML oficial no publica el domicilio de cada estación, solo nombre,
  permiso y coordenadas; por eso las rutas trabajan con las coordenadas
  exactas y el botón «Cómo llegar» abre la ruta en Google Maps.
- Las distancias de la lista son en línea recta; las del mapa son por calles
  (OSRM) e incluyen el tiempo estimado manejando.
