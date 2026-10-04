// Encabezado, pie, tema, animaciones globales y funciones de la app (PWA).
import { html, raw, render, safeUrl } from './html.js';
import { $, $$, on, reducedMotion, idle } from './dom.js';
import { sb, configured } from './supabase.js';
import { getProfile, signOut } from './session.js';
import { avatar, hydrateRobloxAvatars, profileUrl } from './view.js';
import { toast, errorMsg } from './ui.js';
import { SOCIALS } from '../config.js';
import { HEART, donationsOn, openDonate, donationReturn } from './donate.js';
import { initConsent } from './consent.js';
import { initI18n, langPicker } from './i18n.js';
import { initMotion } from './motion.js';

// Logo: el emblema de los cubos (icons/logo-mark.webp); el logo completo está en icons/logo.png
const LOGO = raw('<img class="brand-mark" src="icons/logo-mark.webp" width="38" height="38" alt="" decoding="async">');
const BRAND = html`${LOGO}<span class="brand-word">Aquino<b>Studios</b></span>`;
const SUN = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>');
const MOON = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>');
const ICONS = {
  roblox: 'M5.2 0 0 18.8 18.8 24 24 5.2zm8.4 14.9-4.5-1.2 1.2-4.5 4.5 1.2z',
  discord: 'M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4-2 1 1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.8zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z',
  youtube: 'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6z',
  tiktok: 'M19.6 6.7a4.8 4.8 0 0 1-3.8-4.2V2h-3.4v13.7a2.9 2.9 0 1 1-2-2.8V9.4a6.3 6.3 0 1 0 5.4 6.3V8.7a8.2 8.2 0 0 0 4.8 1.5V6.8z',
};

const NAV = [
  ['index.html#juegos', 'Juegos', 'games'],
  ['index.html#noticias', 'Novedades', 'news'],
  ['proximamente.html', 'Próximo', 'next'],
  ['chat.html', 'Chat', 'chat'],
  ['index.html#nosotros', 'Comunidad', 'about'],
];

// ---------- Tema claro / oscuro con transición circular ----------
function currentTheme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }

function paintThemeButton(btn) {
  const dark = currentTheme() === 'dark';
  render(btn, dark ? SUN : MOON);
  btn.dataset.label = dark ? 'Modo claro' : 'Modo oscuro';
  btn.setAttribute('aria-label', btn.dataset.label);
  btn.title = btn.dataset.label;
}

async function toggleTheme(e, btn) {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  const apply = () => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* sin almacenamiento */ }
    paintThemeButton(btn);
  };
  if (!document.startViewTransition || reducedMotion()) return apply();
  // El nuevo tema aparece como un círculo que crece desde el botón
  const x = e.clientX || innerWidth - 40;
  const y = e.clientY || 30;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.documentElement.classList.add('theme-switch');
  const t = document.startViewTransition(apply);
  // Si el navegador tarda en arrancar la animación, el tema cambia igual (sin animación)
  const guard = setTimeout(() => { if (currentTheme() !== next) { t.skipTransition(); apply(); } }, 250);
  t.updateCallbackDone.finally(() => clearTimeout(guard)).catch(() => {});
  try {
    await t.ready;
    document.documentElement.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.2,.7,.1,1)', pseudoElement: '::view-transition-new(root)' });
    await t.finished;
  } catch {
    // La animación se cortó: si el cambio no llegó a aplicarse, se aplica sin animación
    if (currentTheme() !== next) apply();
  } finally {
    document.documentElement.classList.remove('theme-switch');
  }
}

// ---------- Menú de usuario con la Popover API ----------
function userMenu(profile) {
  return html`
    <button class="user-btn" popovertarget="userMenu" aria-haspopup="menu">${avatar(profile, 32)}<span>${profile.username}</span></button>
    <div class="user-menu" id="userMenu" popover role="menu">
      <a href="${profileUrl(profile.username)}" role="menuitem">Mi perfil</a>
      <a href="cuenta.html" role="menuitem">Mi cuenta</a>
      ${profile.role === 'admin' ? html`<a href="admin.html" role="menuitem">Panel de admin</a>` : ''}
      <button role="menuitem" id="logoutBtn" type="button">Cerrar sesión</button>
    </div>`;
}

function placePopover(menu, button) {
  const r = button.getBoundingClientRect();
  menu.style.top = `${r.bottom + 8}px`;
  menu.style.left = `${Math.max(12, Math.min(innerWidth - menu.offsetWidth - 12, r.right - menu.offsetWidth))}px`;
}

// ---------- Aparición de elementos al hacer scroll (se aplica sola a todo .reveal) ----------
function autoReveal() {
  if (reducedMotion()) {
    const show = () => $$('.reveal').forEach((el) => el.classList.add('visible'));
    new MutationObserver(show).observe(document.body, { childList: true, subtree: true });
    return show();
  }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
  }), { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  const scan = (root) => {
    if (root.matches?.('.reveal:not(.visible)')) io.observe(root);
    root.querySelectorAll?.('.reveal:not(.visible)').forEach((el) => io.observe(el));
  };
  scan(document.body);
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n))))
    .observe(document.body, { childList: true, subtree: true });
}

// ---------- Barra de progreso de lectura y botón "volver arriba" ----------
function scrollExtras(header) {
  // La barra se anima sola con CSS (animation-timeline: scroll()); acá solo se agrega al DOM
  const bar = Object.assign(document.createElement('div'), { className: 'scroll-progress' });
  bar.setAttribute('aria-hidden', 'true');
  header.append(bar);

  const top = Object.assign(document.createElement('button'), { className: 'to-top', type: 'button', title: 'Volver arriba' });
  top.setAttribute('aria-label', 'Volver arriba');
  render(top, raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5.5 4 13.5l1.9 1.9L12 9.3l6.1 6.1 1.9-1.9z"/></svg>'));
  document.body.append(top);
  top.addEventListener('click', () => scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }));
  // Aparece cuando bajaste más de una pantalla
  const marker = Object.assign(document.createElement('div'), { className: 'to-top-marker' });
  document.body.prepend(marker);
  new IntersectionObserver(([e]) => top.classList.toggle('show', !e.isIntersecting)).observe(marker);
}

// ---------- Transición entre páginas: la imagen del juego "vuela" a la página del juego ----------
function shareElementTransitions() {
  on(document, 'click', '.game-card', (e, card) => {
    $$('[style*="view-transition-name"]').forEach((el) => (el.style.viewTransitionName = ''));
    const thumb = $('.game-thumb', card);
    if (thumb) thumb.style.viewTransitionName = 'game-art';
  });
  // Al volver con "atrás" se limpia para que no queden dos elementos con el mismo nombre
  addEventListener('pageshow', () => $$('.game-thumb').forEach((el) => (el.style.viewTransitionName = '')));
}

// ---------- Precarga inteligente de páginas (Speculation Rules API) ----------
// OJO: la política de seguridad (CSP, en el <head> de cada página) permite estas reglas por su huella
// (sha256). Si cambiás el texto de las reglas, hay que actualizar esa huella en todos los .html
// (el navegador la muestra en la consola: "a hash ('sha256-…') is required").
function speculate() {
  if (!HTMLScriptElement.supports?.('speculationrules')) return;
  const s = document.createElement('script');
  s.type = 'speculationrules';
  s.textContent = JSON.stringify({
    prerender: [{
      where: { or: [{ href_matches: '*/juego.html*' }, { href_matches: '*/proximamente.html' }, { href_matches: '*/index.html*' }] },
      eagerness: 'moderate',
    }],
  });
  document.head.append(s);
}

// ---------- App instalable y con modo sin conexión (Service Worker) ----------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !isSecureContext) return;
  idle(() => navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ }));
}

// ---------- Errores no capturados → aviso en pantalla ----------
function globalErrors() {
  addEventListener('unhandledrejection', (e) => {
    // Cortes de animaciones o de pedidos cancelados no son errores para el usuario
    if (['AbortError', 'InvalidStateError', 'TimeoutError'].includes(e.reason?.name)) return;
    console.error(e.reason);
    toast(errorMsg(e.reason), 'error');
  });
}

// ---------- Cuántas personas están en el sitio ahora (Supabase Realtime Presence) ----------
function onlineNow(profile) {
  if (!sb.channel) return;
  const pill = Object.assign(document.createElement('div'), { className: 'online-pill', role: 'status' });
  pill.setAttribute('aria-live', 'polite');
  document.body.append(pill);
  const channel = sb.channel('online', { config: { presence: { key: profile.id } } });
  channel
    .on('presence', { event: 'sync' }, () => {
      const n = Object.keys(channel.presenceState()).length;
      render(pill, html`<b>${n}</b> ${n === 1 ? 'persona en línea' : 'personas en línea'}`);
      pill.classList.toggle('show', n > 0);
    })
    .subscribe((status) => { if (status === 'SUBSCRIBED') channel.track({ at: Date.now() }); });
  addEventListener('pagehide', () => sb.removeChannel(channel), { once: true });
}

// =====================================================================
export async function renderLayout(active = '', { bare = false } = {}) {
  await initI18n();
  // Pantallas sin menú (el login): solo lo básico
  if (bare) {
    registerServiceWorker();
    globalErrors();
    initConsent();
    $('.auth-foot')?.append(' · ', langPicker('lang-inline'));
    if (!configured) {
      const warn = Object.assign(document.createElement('div'), { className: 'config-warning' });
      render(warn, html`Falta configurar Supabase en <code>js/config.js</code>. Mirá el archivo <code>README.md</code>.`);
      document.body.prepend(warn);
    }
    return null;
  }
  const header = document.createElement('header');
  header.className = 'site-header';
  render(header, html`
    <nav class="nav container" aria-label="Principal">
      <a href="index.html" class="brand" aria-label="Aquino Studios, inicio">${BRAND}</a>
      <button class="nav-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="navLinks"><span></span><span></span><span></span></button>
      <div class="nav-links" id="navLinks">
        ${NAV.map(([href, text, key]) => html`<a href="${href}" class="${active === key ? 'active' : ''}" ${active === key ? raw('aria-current="page"') : ''}>${text}</a>`)}
        ${donationsOn() ? html`<button class="btn btn-sm btn-donate" type="button" data-donate>${HEART}Donar</button>` : ''}
        ${safeUrl(SOCIALS.discord) ? html`<a class="btn btn-sm btn-discord" href="${SOCIALS.discord}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="${ICONS.discord}"/></svg>Discord</a>` : ''}
        <button class="theme-btn" id="themeBtn" type="button"></button>
        <div class="nav-user" id="navUser">
          <a href="login.html" class="btn btn-sm btn-ghost">Entrar</a>
          <a href="login.html?tab=register" class="btn btn-sm btn-primary">Crear cuenta</a>
        </div>
      </div>
    </nav>`);
  document.body.prepend(header);

  // Borde del encabezado al bajar: un "sentinel" observado en vez de escuchar cada scroll
  const sentinel = Object.assign(document.createElement('div'), { className: 'scroll-sentinel' });
  header.after(sentinel);
  new IntersectionObserver(([e]) => header.classList.toggle('scrolled', !e.isIntersecting)).observe(sentinel);

  const toggle = $('.nav-toggle', header);
  const setOpen = (open) => {
    header.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    document.documentElement.classList.toggle('no-scroll', open);
  };
  toggle.addEventListener('click', () => setOpen(!header.classList.contains('open')));
  on(header, 'click', '.nav-links a', () => setOpen(false));
  on(header, 'click', '[data-donate]', () => setOpen(false));
  addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));

  if (!/admin\.html$/.test(location.pathname)) $('#themeBtn', header).before(langPicker());
  const themeBtn = $('#themeBtn', header);
  paintThemeButton(themeBtn);
  themeBtn.addEventListener('click', (e) => toggleTheme(e, themeBtn));

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  render(footer, html`
    <div class="container footer-inner">
      <div class="footer-brand">
        <a href="index.html" class="brand" aria-label="Aquino Studios, inicio">${BRAND}</a>
        <p>Estudio independiente de juegos en Roblox. Jugá, votá lo que viene y sumate a la comunidad.</p>
        <div class="socials">
          ${Object.entries(SOCIALS).filter(([k, url]) => ICONS[k] && safeUrl(url)).map(([k, url]) => html`
            <a href="${url}" target="_blank" rel="noopener" aria-label="${k}"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="${ICONS[k]}"/></svg></a>`)}
        </div>
      </div>
      <nav aria-label="Sitio"><h4>Sitio</h4>
        <a href="index.html#juegos">Juegos</a><a href="index.html#noticias">Novedades</a>
        <a href="proximamente.html">Próximo lanzamiento</a><a href="chat.html">Chat</a><a href="index.html#faq">Preguntas</a><a href="index.html#contacto">Contacto</a>
      </nav>
      <nav aria-label="Cuenta"><h4>Cuenta</h4>
        <a href="login.html">Iniciar sesión</a><a href="login.html?tab=register">Crear cuenta</a><a href="cuenta.html">Mi cuenta</a>
      </nav>
      <nav aria-label="Legal"><h4>Legal</h4>
        ${donationsOn() ? html`<a href="#donar" data-donate>Donar al estudio</a>` : ''}
        <a href="terminos.html">Términos y condiciones</a><a href="privacidad.html">Privacidad</a><a href="cookies.html">Cookies</a>
        <a href="#cookies" data-open-consent>Preferencias de cookies</a>
      </nav>
    </div>
    <div class="container footer-bottom">
      <span>© ${new Date().getFullYear()} Aquino Studios</span>
      <span>No estamos afiliados a Roblox Corporation. Roblox es una marca de Roblox Corporation.</span>
    </div>`);
  document.body.append(footer);

  // Avatares de Roblox: cualquier avatar nuevo con data-rbx se reemplaza por la cara del avatar de Roblox
  let rbxTimer = 0;
  const rbx = () => { clearTimeout(rbxTimer); rbxTimer = setTimeout(() => hydrateRobloxAvatars(), 150); };
  new MutationObserver(rbx).observe(document.body, { childList: true, subtree: true });
  rbx();

  // Botones de donar (menú, pie o cualquier elemento con data-donate)
  on(document, 'click', '[data-donate]', (e) => { e.preventDefault(); openDonate(); });
  donationReturn();

  initConsent();
  autoReveal();
  initMotion();
  scrollExtras(header);
  shareElementTransitions();
  speculate();
  registerServiceWorker();
  globalErrors();

  if (!configured) {
    const warn = Object.assign(document.createElement('div'), { className: 'config-warning' });
    render(warn, html`Falta configurar Supabase en <code>js/config.js</code>. Mirá el archivo <code>README.md</code>.`);
    header.after(warn);
    document.documentElement.classList.add('ready');
    return null;
  }

  const profile = await getProfile();
  if (profile) {
    // Estadística de visitas para el panel (máximo 1 por página cada 5 minutos, lo controla la base)
    const page = location.pathname.split('/').pop() || 'index.html';
    idle(() => sb.rpc('log_visit', { p_path: page }).then(() => {}, () => {}));
    onlineNow(profile);
    const navUser = $('#navUser');
    render(navUser, userMenu(profile));
    const menu = $('#userMenu');
    const btn = $('.user-btn', navUser);
    if (menu.togglePopover) {
      menu.addEventListener('beforetoggle', (e) => e.newState === 'open' && requestAnimationFrame(() => placePopover(menu, btn)));
    } else {
      // Navegadores sin Popover API
      menu.removeAttribute('popover');
      btn.addEventListener('click', (e) => { e.stopPropagation(); navUser.classList.toggle('open'); });
      document.addEventListener('click', () => navUser.classList.remove('open'));
    }
    $('#logoutBtn').addEventListener('click', () => signOut());
  }

  // Si cerrás sesión en otra pestaña, esta se actualiza sola
  sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && profile) location.reload(); });
  document.documentElement.classList.add('ready'); // saca la pantalla de carga
  return profile;
}
