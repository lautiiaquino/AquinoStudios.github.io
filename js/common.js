import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SOCIALS } from './config.js';

export const configured = /^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL) && !SUPABASE_ANON_KEY.startsWith('TU_');
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ---------- Utilidades ----------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Solo acepta URLs https (evita javascript: y similares en contenido de usuarios)
export function safeUrl(url) {
  return typeof url === 'string' && /^https:\/\//i.test(url) ? url : '';
}

export function formatNumber(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'hace un momento';
  const units = [[31536000, 'año', 'años'], [2592000, 'mes', 'meses'], [86400, 'día', 'días'], [3600, 'hora', 'horas'], [60, 'minuto', 'minutos']];
  for (const [secs, one, many] of units) {
    const v = Math.floor(s / secs);
    if (v >= 1) return `hace ${v} ${v === 1 ? one : many}`;
  }
}

export const STATUS = {
  publicado: { label: 'Disponible', cls: 'badge-green' },
  en_desarrollo: { label: 'En desarrollo', cls: 'badge-amber' },
  proximamente: { label: 'Próximamente', cls: 'badge-blue' },
};

export function robloxGameUrl(placeId) {
  return placeId ? `https://www.roblox.com/games/${encodeURIComponent(placeId)}` : '';
}

export function initials(name) {
  return esc((name || '?').slice(0, 2).toUpperCase());
}

export function avatarHtml(profile, size = 36) {
  const url = safeUrl(profile?.avatar_url);
  return url
    ? `<img class="avatar" style="width:${size}px;height:${size}px" src="${esc(url)}" alt="" loading="lazy">`
    : `<span class="avatar avatar-fallback" style="width:${size}px;height:${size}px;font-size:${size * 0.38}px">${initials(profile?.username)}</span>`;
}

// ---------- Avisos ----------
export function toast(message, type = 'ok') {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.classList.add('out'), 3500);
  setTimeout(() => el.remove(), 4000);
}

// Traduce los errores más comunes de Supabase
export function errorMsg(err) {
  const m = (err?.message || String(err || '')).toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Tenés que confirmar tu email antes de entrar. Revisá tu bandeja de entrada.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese email.';
  if (m.includes('password should be at least')) return 'La contraseña es demasiado corta.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Esperá un momento y probá de nuevo.';
  if (m.includes('duplicate key') && m.includes('username')) return 'Ese nombre de usuario ya está en uso.';
  if (m.includes('duplicate key') && m.includes('slug')) return 'Ya existe un juego con ese identificador (slug).';
  if (m.includes('violates check constraint')) return 'Algún dato no tiene el formato correcto.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Error de conexión. Revisá tu internet.';
  return err?.message || 'Ocurrió un error inesperado.';
}

// ---------- Sesión ----------
let profileCache;

export async function getSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getProfile(force = false) {
  if (!sb) return null;
  if (profileCache !== undefined && !force) return profileCache;
  const session = await getSession();
  if (!session) return (profileCache = null);
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  return (profileCache = data);
}

export async function requireAuth({ admin = false } = {}) {
  if (!sb) return null;
  const profile = await getProfile();
  if (!profile) {
    location.href = `login.html?next=${encodeURIComponent(location.pathname.split('/').pop() + location.search)}`;
    return null;
  }
  if (admin && profile.role !== 'admin') {
    location.href = 'index.html';
    return null;
  }
  return profile;
}

export async function signOut() {
  await sb?.auth.signOut();
  profileCache = null;
  location.href = 'index.html';
}

// ---------- Layout (barra superior + pie) ----------
const LOGO = `<svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true"><rect x="3" y="3" width="26" height="26" rx="7" fill="var(--accent)" stroke="var(--ink)" stroke-width="2"/><path d="M10 22 16 9l6 13h-3.5L16 16l-2.5 6z" fill="var(--ink)"/></svg>`;

const ICONS = {
  roblox: '<path d="M5.2 0 0 18.8 18.8 24 24 5.2zm8.4 14.9-4.5-1.2 1.2-4.5 4.5 1.2z"/>',
  discord: '<path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4-2 1 1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.8zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/>',
  youtube: '<path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6z"/>',
  tiktok: '<path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.2V2h-3.4v13.7a2.9 2.9 0 1 1-2-2.8V9.4a6.3 6.3 0 1 0 5.4 6.3V8.7a8.2 8.2 0 0 0 4.8 1.5V6.8z"/>',
};

function socialLinks() {
  return Object.entries(SOCIALS)
    .filter(([, url]) => safeUrl(url))
    .map(([k, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="${k}"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">${ICONS[k]}</svg></a>`)
    .join('');
}

export async function renderLayout(active = '') {
  const header = document.createElement('header');
  header.className = 'site-header';
  const link = (href, text, key) => `<a href="${href}" class="${active === key ? 'active' : ''}">${text}</a>`;
  header.innerHTML = `
    <nav class="nav container">
      <a href="index.html" class="brand">${LOGO}<span>Aquino<b>Studios</b></span></a>
      <button class="nav-toggle" aria-label="Abrir menú" aria-expanded="false"><span></span><span></span><span></span></button>
      <div class="nav-links">
        ${link('index.html', 'Inicio', 'home')}
        ${link('index.html#juegos', 'Juegos', 'games')}
        ${link('index.html#noticias', 'Noticias', 'news')}
        ${link('index.html#nosotros', 'Nosotros', 'about')}
        ${link('index.html#contacto', 'Contacto', 'contact')}
        <div class="nav-user" id="navUser">
          <a href="login.html" class="btn btn-sm btn-ghost">Entrar</a>
          <a href="login.html?tab=register" class="btn btn-sm btn-primary">Crear cuenta</a>
        </div>
      </div>
    </nav>`;
  document.body.prepend(header);

  const toggle = $('.nav-toggle', header);
  toggle.addEventListener('click', () => {
    const open = header.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  $$('.nav-links a', header).forEach((a) => a.addEventListener('click', () => header.classList.remove('open')));
  addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <a href="index.html" class="brand">${LOGO}<span>Aquino<b>Studios</b></span></a>
          <p class="muted">Estudio independiente creando experiencias en Roblox para jugar con amigos.</p>
          <div class="socials">${socialLinks()}</div>
        </div>
        <div>
          <h4>Sitio</h4>
          <ul>
            <li><a href="index.html#juegos">Juegos</a></li>
            <li><a href="index.html#noticias">Noticias</a></li>
            <li><a href="index.html#nosotros">Nosotros</a></li>
            <li><a href="index.html#contacto">Contacto</a></li>
          </ul>
        </div>
        <div>
          <h4>Cuenta</h4>
          <ul>
            <li><a href="login.html">Iniciar sesión</a></li>
            <li><a href="login.html?tab=register">Crear cuenta</a></li>
            <li><a href="cuenta.html">Mi cuenta</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <span class="muted small">© ${new Date().getFullYear()} Aquino Studios</span>
        <span class="muted small">No afiliado a Roblox Corporation.</span>
      </div>
    </div>`;
  document.body.append(footer);

  if (!configured) {
    const warn = document.createElement('div');
    warn.className = 'config-warning';
    warn.innerHTML = '⚠️ Falta configurar Supabase en <code>js/config.js</code>. Mirá el archivo <code>README.md</code>.';
    header.after(warn);
    return null;
  }

  const profile = await getProfile();
  const navUser = $('#navUser');
  if (profile) {
    navUser.innerHTML = `
      <button class="user-btn" aria-haspopup="true" aria-expanded="false">${avatarHtml(profile, 32)}<span>${esc(profile.username)}</span></button>
      <div class="user-menu" role="menu">
        <a href="cuenta.html" role="menuitem">Mi cuenta</a>
        ${profile.role === 'admin' ? '<a href="admin.html" role="menuitem">Panel de admin</a>' : ''}
        <button role="menuitem" id="logoutBtn">Cerrar sesión</button>
      </div>`;
    const btn = $('.user-btn', navUser);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = navUser.classList.toggle('open');
      btn.setAttribute('aria-expanded', open);
    });
    document.addEventListener('click', () => navUser.classList.remove('open'));
    $('#logoutBtn').addEventListener('click', signOut);
  }
  return profile;
}

// Botón con estado de carga
export async function withLoading(button, fn) {
  const text = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>';
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.innerHTML = text;
  }
}

// Imagen de un juego: la que cargó el admin, o el ícono de Roblox, o un placeholder
export function thumbStyle(game, stats) {
  const url = safeUrl(game.thumbnail_url) || safeUrl(stats?.icon);
  return url ? `style="background-image:url('${esc(url)}')"` : '';
}

export function gameCardHtml(game, stats) {
  const st = STATUS[game.status] || STATUS.publicado;
  const hasImg = safeUrl(game.thumbnail_url) || safeUrl(stats?.icon);
  return `
    <a class="game-card" href="juego.html?slug=${encodeURIComponent(game.slug)}">
      <div class="game-thumb" ${thumbStyle(game, stats)}>
        ${hasImg ? '' : `<div class="thumb-placeholder">${initials(game.title)}</div>`}
        <span class="badge ${st.cls}">${st.label}</span>
        ${stats?.playing ? `<span class="live-pill">${formatNumber(stats.playing)} jugando</span>` : ''}
      </div>
      <div class="game-info">
        <h3>${esc(game.title)}</h3>
        <p>${esc(game.short_description || '')}</p>
        <div class="game-meta">
          <span>${esc(game.genre || '')}</span>
          <span>${stats?.visits ? formatNumber(stats.visits) + ' visitas' : ''}</span>
        </div>
      </div>
    </a>`;
}

// Estadísticas de Roblox (via Edge Function). Si la función no está desplegada, devuelve {}.
export async function fetchRobloxStats(placeIds) {
  const ids = placeIds.filter(Boolean);
  if (!sb || ids.length === 0) return {};
  try {
    const { data, error } = await sb.functions.invoke('roblox-stats', { body: { placeIds: ids } });
    return error || !data || data.error ? {} : data;
  } catch {
    return {};
  }
}
