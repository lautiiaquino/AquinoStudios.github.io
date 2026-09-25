// Encabezado, pie, tema, animaciones globales y funciones de la app (PWA).
import { html, raw, render, safeUrl } from './html.js';
import { $, $$, on, reducedMotion, idle } from './dom.js';
import { sb, configured } from './supabase.js';
import { getProfile, signOut } from './session.js';
import { avatar } from './view.js';
import { toast, errorMsg } from './ui.js';
import { SOCIALS } from '../config.js';

const LOGO = raw('<svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true"><rect width="32" height="32" rx="4" fill="var(--accent)"/><path d="M8 25 16 6l8 19h-4.6L16 16.2 12.6 25z" fill="var(--accent-ink)"/></svg>');
const BRAND = html`${LOGO}<span class="brand-word"><b>Aquino</b><small>Studios</small></span>`;
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
  ['index.html#noticias', 'Noticias', 'news'],
  ['proximamente.html', 'Próximo', 'next'],
  ['index.html#nosotros', 'Nosotros', 'about'],
  ['index.html#contacto', 'Contacto', 'contact'],
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

// ---------- Tarjetas de juegos con inclinación 3D ----------
function enableTilt() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || reducedMotion()) return;
  let current = null;
  let frame = 0;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.game-card');
    if (current && current !== card) current.style.transform = '';
    current = card;
    if (!card || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`;
      card.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
      card.style.setProperty('--my', `${(y + 0.5) * 100}%`);
    });
  }, { passive: true });
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

// =====================================================================
export async function renderLayout(active = '') {
  const header = document.createElement('header');
  header.className = 'site-header';
  render(header, html`
    <nav class="nav container" aria-label="Principal">
      <a href="index.html" class="brand" aria-label="Aquino Studios, inicio">${BRAND}</a>
      <button class="nav-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="navLinks"><span></span><span></span><span></span></button>
      <div class="nav-links" id="navLinks">
        ${NAV.map(([href, text, key]) => html`<a href="${href}" class="${active === key ? 'active' : ''}" ${active === key ? raw('aria-current="page"') : ''}>${text}</a>`)}
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
  addEventListener('keydown', (e) => e.key === 'Escape' && setOpen(false));

  const themeBtn = $('#themeBtn', header);
  paintThemeButton(themeBtn);
  themeBtn.addEventListener('click', (e) => toggleTheme(e, themeBtn));

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  render(footer, html`
    <div class="container">
      <div class="footer-grid">
        <div>
          <a href="index.html" class="brand" aria-label="Aquino Studios, inicio">${BRAND}</a>
          <p class="muted">Estudio independiente de juegos de Roblox. Hechos para jugar con amigos.</p>
          <div class="socials">
            ${Object.entries(SOCIALS).filter(([k, url]) => ICONS[k] && safeUrl(url)).map(([k, url]) => html`
              <a href="${url}" target="_blank" rel="noopener" aria-label="${k}"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="${ICONS[k]}"/></svg></a>`)}
          </div>
        </div>
        <nav aria-label="Sitio"><h4>Sitio</h4><ul>
          <li><a href="index.html#juegos">Juegos</a></li><li><a href="index.html#noticias">Noticias</a></li>
          <li><a href="proximamente.html">Próximo lanzamiento</a></li><li><a href="index.html#equipo">Equipo</a></li>
          <li><a href="index.html#contacto">Contacto</a></li>
        </ul></nav>
        <nav aria-label="Cuenta"><h4>Cuenta</h4><ul>
          <li><a href="login.html">Iniciar sesión</a></li><li><a href="login.html?tab=register">Crear cuenta</a></li>
          <li><a href="cuenta.html">Mi cuenta</a></li>
        </ul></nav>
      </div>
      <div class="footer-bottom mono">
        <span>© ${new Date().getFullYear()} Aquino Studios</span>
        <span>No afiliado a Roblox Corporation</span>
      </div>
    </div>
    <div class="footer-mark" aria-hidden="true">Aquino</div>`);
  document.body.append(footer);

  autoReveal();
  enableTilt();
  shareElementTransitions();
  speculate();
  registerServiceWorker();
  globalErrors();

  if (!configured) {
    const warn = Object.assign(document.createElement('div'), { className: 'config-warning' });
    render(warn, html`Falta configurar Supabase en <code>js/config.js</code>. Mirá el archivo <code>README.md</code>.`);
    header.after(warn);
    return null;
  }

  const profile = await getProfile();
  if (profile) {
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
  return profile;
}
