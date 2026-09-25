// Service Worker de Aquino Studios: hace que el sitio cargue rápido y funcione sin conexión.
// - Páginas HTML: primero la red (siempre lo último); si no hay internet, la copia guardada.
// - CSS, JS e íconos propios: también primero la red (así nunca se mezclan versiones), y sin internet la copia.
// - Librerías del CDN: se muestra la copia guardada y se actualiza en segundo plano.
// - Tipografías de Google: se guardan una vez y se reutilizan.
// - Supabase (datos, login) NUNCA se guarda: siempre va directo a la red.
// Cambiá VERSION cuando quieras forzar que todos descarguen los archivos nuevos.
const VERSION = 'v3';
const STATIC = `aquino-static-${VERSION}`;
const PAGES = `aquino-pages-${VERSION}`;
const FONTS = 'aquino-fonts';

const CORE = [
  './', 'index.html', 'juego.html', 'proximamente.html', 'login.html', 'cuenta.html', 'offline.html',
  'css/styles.css', 'js/config.js', 'js/theme.js', 'manifest.webmanifest', 'icons/icon-192.png',
  'js/core/html.js', 'js/core/dom.js', 'js/core/format.js', 'js/core/supabase.js', 'js/core/ui.js',
  'js/core/session.js', 'js/core/view.js', 'js/core/layout.js', 'js/core/components.js',
  'js/core/polls.js', 'js/core/hero-canvas.js', 'js/core/images.js',
  'js/home.js', 'js/game.js', 'js/next.js', 'js/login.js', 'js/account.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([STATIC, PAGES, FONTS]);
    for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName = PAGES) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await caches.match(req, { ignoreSearch: true }))
      || (req.mode === 'navigate' ? caches.match('offline.html') : Response.error());
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => cached);
  return cached || fresh;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') return e.respondWith(networkFirst(req));
    if (url.pathname.endsWith('/sw.js')) return;
    return e.respondWith(networkFirst(req, STATIC));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    return e.respondWith(staleWhileRevalidate(req, FONTS));
  }
  if (url.hostname === 'cdn.jsdelivr.net') {
    return e.respondWith(staleWhileRevalidate(req, STATIC));
  }
  // Todo lo demás (Supabase, Roblox, YouTube) pasa directo a la red.
});
