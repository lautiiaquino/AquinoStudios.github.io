# Aquino Studios — Sitio web

Sitio oficial de Aquino Studios, un estudio de juegos de Roblox.

- **Frontend:** HTML, CSS y JavaScript sin frameworks, publicado con GitHub Pages.
- **Backend:** [Supabase](https://supabase.com) (gratis), que aporta login, base de datos y funciones en la nube.

## Qué incluye

| Página | Qué hace |
|---|---|
| `index.html` | Inicio: juego destacado, lista de juegos con filtros, estadísticas en vivo, noticias, "sobre nosotros" y formulario de contacto |
| `login.html` | Iniciar sesión, crear cuenta (con verificación de email) y recuperar contraseña |
| `juego.html?slug=...` | Página de cada juego: estadísticas de Roblox, botón "Jugar", favoritos y comentarios |
| `cuenta.html` | Mi cuenta: editar perfil, ver favoritos, cambiar contraseña o email, cerrar sesión en todos los dispositivos |
| `proximamente.html` | Cuenta regresiva para el próximo lanzamiento (el juego con la fecha de salida más cercana) |
| `admin.html` | Panel de admin: estadísticas, juegos (con galería, video y registro de cambios), noticias, encuestas, sugerencias y bugs, moderación de comentarios y palabras prohibidas, usuarios (roles y suspensiones), equipo y mensajes de contacto. Las imágenes se pueden subir directo desde el panel |

**Estilo:** GUI de Roblox: tipografía Fredoka/Nunito, títulos con borde negro, botones con profundidad y fondo de studs. Los colores están arriba de todo en `css/styles.css` (`--brand`, `--play`, etc.). Para que aparezcan las tarjetas de Discord y del grupo de Roblox, completá `SOCIALS` en `js/config.js`.

**Cómo está hecho el JavaScript (`js/`):**
- `js/core/` son módulos compartidos: plantillas HTML seguras (`html.js`), sesión, encabezado/pie, formatos con `Intl`, encuestas, imágenes y más.
- **Web Components propios:** `<count-down>`, `<count-up>`, `<lite-youtube>` (el video carga recién al tocar play) y `<image-drop>` (arrastrar, pegar o elegir imágenes; se comprimen solas a WEBP con Canvas antes de subirlas).
- **APIs de HTML5:** View Transitions (animaciones entre páginas y al cambiar de tema), Popover (menú de usuario), `<dialog>` (confirmaciones), Constraint Validation + FormData (formularios), Drag & Drop (ordenar la galería), Web Share, Notifications, Speculation Rules (precarga) y descarga de archivos `.ics`/`.csv` con Blob.
- **App instalable (PWA):** `manifest.webmanifest` + `sw.js`. Se puede instalar en el celular o la compu y el sitio abre aunque no haya internet (muestra la última versión guardada). Si cambiás muchos archivos y querés forzar que todos los descarguen, subí el número de `VERSION` en `sw.js`.
- **Tiempo real:** los comentarios nuevos aparecen sin recargar (Supabase Realtime).

**Backend (`supabase/`):**
- `schema.sql`: tablas, reglas de seguridad (RLS), triggers y datos de ejemplo.
- `functions/roblox-stats`: consulta a Roblox los jugadores activos, visitas, favoritos, votos e ícono de cada juego; y para la página del juego trae las capturas, la **Tienda** (game passes con precio en Robux), los **servidores públicos** (con botón para unirse) y las **insignias** (con rareza). También trae la cara del avatar de Roblox de cada usuario que puso su usuario de Roblox en el perfil. **Si ya la tenías publicada, volvé a pegar el archivo nuevo y tocá Deploy.**
- `functions/donate`: crea el pago de una donación en Mercado Pago, PayPal o Stripe (las claves quedan guardadas en Supabase, nunca en el sitio).
- `functions/mp-webhook`: Mercado Pago avisa acá cuando un pago se aprueba; la función lo confirma con la API de Mercado Pago y marca la donación como aprobada.
- `functions/donate-confirm`: al volver de PayPal o Stripe, confirma el pago preguntándole al proveedor.

**Extras:** códigos canjeables de los juegos (se cargan en **Panel de admin → Códigos** y aparecen en el inicio y en cada juego), contador de **personas en línea** en tiempo real (Supabase Realtime Presence), insignia de **Donador**, sección **Mis donaciones** en Mi cuenta.

**Login obligatorio:** para ver el inicio, los juegos y "Próximo" hay que iniciar sesión (lo controla `js/gate.js`). Los términos, la privacidad y la página 404 se ven sin cuenta. Cada página que abre un usuario queda anotada en la tabla `visits` (como mucho una vez cada 5 minutos por página) y en el panel de admin ves visitas por día, usuarios activos y páginas más vistas.

---

## Configuración (una sola vez, unos 10 minutos)

### 1. Crear el proyecto en Supabase
1. Entrá a https://supabase.com, creá una cuenta y hacé clic en **New project**.
2. Poné un nombre (por ejemplo `aquino-studios`) y una contraseña para la base de datos, y elegí la región más cercana (São Paulo).

### 2. Crear la base de datos
1. En tu proyecto, andá a **SQL Editor**, luego a **New query**.
2. Pegá todo el contenido de `supabase/schema.sql` y tocá **Run**.

### 3. Conectar el sitio
1. Andá a **Project Settings**, luego a **API**.
2. Copiá la **Project URL** y la **anon public key** en `js/config.js`.
3. Si querés, completá también tus redes (Discord, grupo de Roblox, etc.) en ese mismo archivo.

> La *anon key* es pública a propósito. La seguridad real la dan las reglas del archivo `schema.sql`.
> **Nunca** pongas la *service_role key* en el sitio.

### 4. Configurar las URLs de login
En **Authentication**, luego **URL Configuration**:
- **Site URL:** `https://lautiiaquino.github.io/AquinoStudios.github.io/`
- **Redirect URLs:** agregá `https://lautiiaquino.github.io/AquinoStudios.github.io/**`

(Si probás el sitio en tu PC, agregá también `http://localhost:8000/**`.)

### 4b. Entrar con Google o Discord (opcional)
1. En Supabase, andá a **Authentication**, luego **Sign In / Providers**, y activá **Google** o **Discord** (cada uno te pide un *Client ID* y un *Secret*; Supabase explica ahí cómo sacarlos).
2. En `js/config.js` poné, por ejemplo: `export const AUTH_PROVIDERS = ['google', 'discord'];`
3. Los botones aparecen solos en la página de login.

### 5. Estadísticas de Roblox en vivo (opcional pero recomendado)
En **Edge Functions**, luego **Deploy a new function** y **Via Editor**:
1. Nombre: `roblox-stats`.
2. Pegá el contenido de `supabase/functions/roblox-stats/index.ts` y tocá **Deploy**.
3. En los ajustes de la función, desactivá **Verify JWT / Enforce JWT verification**. La clave nueva (`sb_publishable_...`) no es un JWT; si la verificación queda activada, la función rechaza las llamadas del sitio.

Sin este paso el sitio funciona igual, pero no muestra jugadores activos ni visitas.

### 5b. Donaciones (varios métodos de pago)
Todo se configura en `js/config.js` → `DONATIONS`. **Cada método aparece solo si lo completás**, así que podés activar uno solo o todos.

| Método | Qué hay que hacer | Se confirma solo |
|---|---|---|
| **Mercado Pago** (pesos: tarjeta, débito, dinero en cuenta, efectivo) | `mercadopago: true` + secreto `MP_ACCESS_TOKEN` | Sí |
| **PayPal** (dólares) | `paypal: true` + secretos `PAYPAL_CLIENT_ID` y `PAYPAL_SECRET` | Sí |
| **Tarjeta internacional / Apple Pay / Google Pay** (Stripe, dólares) | `stripe: true` + secreto `STRIPE_SECRET_KEY` | Sí |
| **PayPal.me** (dólares, sin claves) | Poné tu link en `paypalme` (ej: `https://paypal.me/tuusuario`) | No: se abre PayPal con el monto cargado, la persona avisa y vos confirmás |
| **Payoneer** (dólares, sin claves) | En `payoneer`, poné tu link de **Request a payment** (tarjeta o transferencia) y/o el email de tu cuenta | No: la persona avisa y vos confirmás |
| **Transferencia** (alias / CVU) | Completá `transfer` con tu alias y CVU | No: la persona avisa y vos confirmás en el panel |
| **Cripto** (USDT, BTC, ETH, Binance Pay) | Completá las direcciones en `crypto` y/o `binance` | No: igual que transferencia |
| **Robux** | Creá un Game Pass de donación y poné el link en `robux` | No: igual que transferencia |
| **Cafecito, Ko-fi, Patreon, Buy Me a Coffee, Lemon, Ualá** | Poné tus links en `links` | Se maneja en cada plataforma |

**Pagos automáticos (Mercado Pago, PayPal, Stripe):**
1. Sacá las claves:
   - **Mercado Pago:** https://www.mercadopago.com.ar/developers/panel/app → creá una app de **Checkout Pro** → **Credenciales de producción** → **Access Token** (`APP_USR-...`).
   - **PayPal:** https://developer.paypal.com/dashboard/applications → **Create App** → copiá **Client ID** y **Secret** (de la pestaña *Live*).
   - **Stripe:** https://dashboard.stripe.com/apikeys → **Secret key** (`sk_live_...`).
2. En Supabase → **Edge Functions → Secrets**, cargá solo las que uses: `MP_ACCESS_TOKEN`, `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `STRIPE_SECRET_KEY`. **Son secretas: nunca las pongas en el sitio ni se las pases a nadie.**
3. Creá tres funciones con **Deploy a new function → Via Editor** y desactivá **Verify JWT** en las tres:
   - `donate` → `supabase/functions/donate/index.ts` (crea el pago)
   - `donate-confirm` → `supabase/functions/donate-confirm/index.ts` (confirma PayPal y Stripe al volver, preguntándole al proveedor)
   - `mp-webhook` → `supabase/functions/mp-webhook/index.ts` (Mercado Pago avisa acá cuando se aprueba un pago)
4. En `js/config.js` poné en `true` los métodos que activaste.

Para probar sin plata real: Mercado Pago con credenciales `TEST-...`, PayPal con el secreto `PAYPAL_ENV=sandbox` y claves de *Sandbox*, Stripe con `sk_test_...` y la tarjeta `4242 4242 4242 4242`.

**Métodos manuales:** la persona ve tus datos (alias, billetera o pase de Robux) y toca **"Ya doné, quiero avisar"**. La donación queda **por confirmar** y la aprobás o rechazás en **Panel de admin → Donaciones**.

**Meta del mes y muro de donadores:** en **Panel de admin → Donaciones** ponés la meta en pesos y a cuánto tomás el dólar y el Robux (para sumar todo en pesos). El inicio muestra la barra de la meta, el top de donadores y los últimos mensajes. Quien dona recibe la insignia **Donador** en sus comentarios. Solo aparecen los que dejaron marcado "Mostrar mi nombre".

### 6. Hacerte admin
1. Registrate en el sitio con tu cuenta.
2. En Supabase, abrí el **SQL Editor** y ejecutá (con tu nombre de usuario):
   ```sql
   update public.profiles set role = 'admin' where username = 'TU_USUARIO';
   ```
3. Recargá el sitio. En el menú de tu usuario va a aparecer **Panel de admin**.

### 7. Publicar en GitHub Pages
1. Subí los cambios al repositorio.
2. En GitHub, andá a **Settings** y después a **Pages**. En **Source** elegí `Deploy from a branch`, luego `main` y `/ (root)`, y guardá.
3. En uno o dos minutos el sitio queda en https://lautiiaquino.github.io/AquinoStudios.github.io/

---

### 8. Seguridad, cookies y verificación (recomendado)
El sitio ya trae: política de seguridad (CSP) en todas las páginas, aviso y política de **cookies** (`cookies.html`), tipografías propias (sin Google Fonts), `security.txt`, sitemap, reglas de seguridad en la base y límites anti-spam. Para dejarlo 100 % en regla:

1. **Supabase → Authentication:**
   - *Sign In / Providers → Email:* activá **Confirm email** (así no se crean cuentas con emails falsos).
   - *Rate Limits:* dejá los límites por defecto o bajalos si ves abuso.
   - *Attack Protection:* activá la protección de contraseñas filtradas (plan Pro).
2. **Protección contra bots (Cloudflare Turnstile, gratis):**
   - Creá un widget en https://dash.cloudflare.com → *Turnstile* con el dominio `lautiiaquino.github.io`.
   - Pegá la **Site Key** en `js/config.js` → `CAPTCHA_SITE_KEY`.
   - En Supabase → *Authentication → Attack Protection → Enable CAPTCHA protection*, elegí Turnstile y pegá la **Secret Key**.
3. **Limpieza automática de la base:** en Supabase → *Database → Extensions*, activá **pg_cron** y volvé a correr `schema.sql`. Desde ahí se borran solos los datos viejos todos los días.
4. **Google Search Console** (para aparecer y verificarte en Google): entrá a https://search.google.com/search-console, agregá la propiedad `https://lautiiaquino.github.io/AquinoStudios.github.io/`, elegí el método **etiqueta HTML** y pasame el código (o subí el archivo `google....html` que te dan a la raíz del repositorio). Después enviá el `sitemap.xml`.
5. **Dominio propio (opcional, lo más "profesional"):** con un dominio (por ejemplo `aquinostudios.com`) configurado en *GitHub → Settings → Pages → Custom domain* con **Enforce HTTPS**, el `robots.txt` y el `security.txt` quedan en la raíz del dominio (donde los buscan Google y los investigadores de seguridad) y podés verificar el dominio completo en Google.

Cómo está organizado el código y cómo agregar cosas sin romper nada: ver [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Actualizar la base de datos
Cuando el sitio agrega funciones nuevas, `supabase/schema.sql` trae las tablas nuevas.
Volvé a pegar **todo** el archivo en **SQL Editor** y tocá **Run**. Se puede ejecutar
las veces que quieras: no borra tus juegos, usuarios ni comentarios.

## Probar en tu PC
Como el sitio usa módulos de JavaScript, no alcanza con abrir el `.html` con doble clic. Hay que levantar un servidor local:
```
python -m http.server 8000
```
Después abrí http://localhost:8000

## Personalizar
- **Colores:** variables al principio de `css/styles.css`. El modo noche tiene sus propias variables en el bloque `[data-theme="dark"]`.
- **Textos del inicio:** `index.html`.
- **Términos y privacidad:** `terminos.html` y `privacidad.html`. Son una base; revisalos y adaptalos a tu caso.
- **Borrar cuenta / descargar datos:** está en *Mi cuenta → Seguridad*. Para que borrar funcione, tenés que haber corrido la versión nueva de `schema.sql` (función `delete_my_account`).
- **Juegos y noticias:** desde el panel de admin, sin tocar código.
