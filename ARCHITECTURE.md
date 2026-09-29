# Arquitectura de Aquino Studios

Guía para que el sitio pueda crecer ordenado: dónde va cada cosa, cómo agregar funciones nuevas
y qué está preparado para muchos visitantes.

## Cómo está armado

```
Navegador (GitHub Pages, archivos estáticos)
   │  HTML + CSS + módulos de JavaScript (sin compilar, sin build)
   │
   ├── Supabase Auth ........ cuentas, sesiones, recuperar contraseña
   ├── Supabase Postgres .... datos (con Row Level Security: cada fila decide quién la ve)
   ├── Supabase Realtime .... comentarios en vivo y "personas en línea"
   ├── Supabase Storage ..... imágenes que sube el admin
   └── Edge Functions ....... código de servidor para lo que no puede ir en el navegador
         ├── roblox-stats .... APIs de Roblox (con caché)
         ├── donate .......... crea pagos (Mercado Pago, PayPal, Stripe)
         ├── donate-confirm .. confirma pagos de PayPal y Stripe
         └── mp-webhook ...... Mercado Pago avisa pagos aprobados
```

No hay servidor propio: GitHub Pages sirve los archivos y Supabase hace todo lo demás.
Eso escala solo: GitHub Pages usa una CDN mundial y Supabase crece cambiando de plan.

## Carpetas

| Carpeta / archivo | Qué hay |
|---|---|
| `*.html` | Una página por archivo. Solo tienen la estructura; el contenido lo arma el JS. |
| `css/styles.css` | Todos los estilos. Colores y tipografías arriba de todo (variables CSS). |
| `fonts/` | Tipografías propias (no se usa Google Fonts). |
| `js/config.js` | **Lo único que se edita para configurar**: Supabase, redes, donaciones, captcha. |
| `js/core/` | Módulos compartidos (ver abajo). |
| `js/<página>.js` | El código de cada página (`home.js`, `game.js`, `admin.js`, etc.). |
| `js/theme.js`, `js/gate.js` | Scripts chicos que corren antes de dibujar la página (tema y login obligatorio). |
| `supabase/schema.sql` | Toda la base: tablas, índices, reglas, funciones. Se puede correr las veces que quieras. |
| `supabase/functions/` | Edge Functions (una carpeta por función). |
| `sw.js` | Service Worker: caché y modo sin conexión. |

### Módulos de `js/core/`

| Módulo | Para qué |
|---|---|
| `html.js` | Plantillas `html\`...\`` que escapan todo automáticamente (evita inyecciones). |
| `dom.js` | Atajos (`$`, `$$`, `on`), transiciones, caché (`memo`, `swr`), descargas. |
| `supabase.js` | Cliente de Supabase (versión fija). |
| `session.js` | Sesión, perfil y `requireAuth`. |
| `layout.js` | Encabezado, pie, tema, login obligatorio, visitas, personas en línea. |
| `ui.js` | Avisos (`toast`), confirmaciones (`ask`), validación de formularios, mensajes de error. |
| `view.js` | Piezas visuales reutilizables (tarjetas de juego, avatares, datos de Roblox). |
| `consent.js` | Aviso y preferencias de cookies. |
| `captcha.js` | Verificación anti-bots (Turnstile), opcional. |
| `donate.js` | Ventana de donaciones y métodos de pago. |
| `polls.js`, `components.js`, `images.js`, `confetti.js`, `format.js` | Encuestas, Web Components, compresión de imágenes, confeti y formatos de fecha/número. |

## Cómo agregar algo nuevo

**Una página nueva**
1. Copiá una página simple (por ejemplo `terminos.html`), cambiá el título y el contenido.
2. Si necesita login, agregá `<script src="js/gate.js"></script>` en el `<head>`.
3. Creá `js/mipagina.js` que empiece con `await renderLayout();`.
4. Sumala a `CORE` en `sw.js` (y subí `VERSION`) y, si es pública, a `sitemap.xml`.

**Una tabla nueva**
1. Agregala en `supabase/schema.sql` con `create table if not exists` (así se puede volver a correr).
2. Activá `row level security` y escribí sus políticas (usá `(select auth.uid())`, no `auth.uid()` suelto: es mucho más rápido con muchas filas).
3. Agregá índices para las columnas por las que vas a filtrar u ordenar.
4. Si los usuarios pueden escribir en ella, agregale el límite anti-spam: `execute function public.rate_limit('5', '1 minute')`.

**Un servicio externo nuevo** (una API, un script, un iframe)
- Agregá su dominio a la política de seguridad (`Content-Security-Policy`) en el `<head>` de **todas** las páginas, o el navegador lo va a bloquear.
- Si guarda datos en el navegador o usa cookies, sumalo a `cookies.html` y a `privacidad.html`.

## Preparado para mucho tráfico

| Qué | Cómo |
|---|---|
| Archivos del sitio | GitHub Pages (CDN) + Service Worker: después de la primera visita casi no se descarga nada. |
| Consultas a la base | Índices en todas las búsquedas frecuentes; reglas de seguridad optimizadas (`select auth.uid()`). |
| Inicio | Juegos y novedades se muestran al instante desde una copia local y se actualizan en paralelo (`swr`). |
| Roblox | La función `roblox-stats` guarda las respuestas 30-60 s y agrupa pedidos iguales. |
| Estadísticas del panel | Se calculan en una sola pasada agrupada por día. |
| Crecimiento de datos | `prune_old_data()` borra visitas de más de 180 días y pagos abandonados (automático con pg_cron). |
| Spam y bots | Límites por usuario en comentarios, reportes y mensajes; captcha opcional en login y registro. |
| Visitas | Como mucho 1 registro por usuario y página cada 5 minutos. |

### Cuándo pasar a un plan pago de Supabase
El plan gratis alcanza para empezar. Conviene pasar al plan Pro cuando:
- se acerque a los límites de usuarios activos por mes, de base de datos (500 MB) o de transferencia;
- necesites **backups diarios** automáticos y sin pausas por inactividad;
- quieras la protección de contraseñas filtradas (Leaked Password Protection).

Todo lo demás del sitio no cambia al cambiar de plan.

## Seguridad

- **Row Level Security** en todas las tablas: aunque alguien use la API directo, solo ve lo que le corresponde.
- **Content-Security-Policy** en todas las páginas: solo se ejecutan scripts propios y de los orígenes permitidos.
- Las claves secretas (Mercado Pago, PayPal, Stripe, service role) viven solo en los *Secrets* de Supabase.
- Los pagos se confirman siempre preguntándole al proveedor, nunca creyéndole al navegador.
- Todo el texto de usuarios se escapa al mostrarse (`html.js`), y los links se filtran (`safeUrl`).
