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
- `functions/roblox-stats`: función que consulta a Roblox los jugadores activos, las visitas, los favoritos y el ícono de cada juego.

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
- **Colores:** variables al principio de `css/styles.css` (`--accent`, `--accent-2`, etc.). El modo claro tiene sus propias variables en el bloque `[data-theme="light"]`.
- **Textos del inicio:** `index.html`.
- **Juegos y noticias:** desde el panel de admin, sin tocar código.
