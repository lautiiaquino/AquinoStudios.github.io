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
  if (m.includes('duplicate key') && m.includes('banned_words')) return 'Esa palabra ya está en la lista.';
  if (m.includes('violates check constraint')) return 'Algún dato no tiene el formato correcto.';
  if (m.includes('row-level security')) return 'No tenés permiso para hacer esto (si tu cuenta está suspendida, no podés participar).';
  if (m.includes('exceeded the maximum allowed size') || m.includes('payload too large')) return 'La imagen pesa más de 5 MB.';
  if (m.includes('mime type')) return 'Formato de imagen no permitido (usá PNG, JPG, WEBP o GIF).';
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
const LOGO = `<svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true"><rect width="32" height="32" rx="4" fill="var(--accent)"/><path d="M8 25 16 6l8 19h-4.6L16 16.2 12.6 25z" fill="var(--accent-ink)"/></svg>`;
const BRAND = `${LOGO}<span class="brand-word"><b>Aquino</b><small>Studios</small></span>`;
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

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
      <a href="index.html" class="brand" aria-label="Aquino Studios, inicio">${BRAND}</a>
      <button class="nav-toggle" aria-label="Abrir menú" aria-expanded="false"><span></span><span></span><span></span></button>
      <div class="nav-links">
        ${link('index.html#juegos', 'Juegos', 'games')}
        ${link('index.html#noticias', 'Noticias', 'news')}
        ${link('proximamente.html', 'Próximo', 'next')}
        ${link('index.html#nosotros', 'Nosotros', 'about')}
        ${link('index.html#contacto', 'Contacto', 'contact')}
        <button class="theme-btn" id="themeBtn" type="button"></button>
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
  enableTilt();
  addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 10), { passive: true });

  // Modo claro / oscuro (el tema inicial lo pone js/theme.js)
  const themeBtn = $('#themeBtn', header);
  const paintTheme = () => {
    const dark = document.documentElement.dataset.theme !== 'light';
    themeBtn.innerHTML = dark ? SUN : MOON;
    themeBtn.dataset.label = dark ? 'Modo claro' : 'Modo oscuro';
    themeBtn.setAttribute('aria-label', themeBtn.dataset.label);
    themeBtn.title = themeBtn.dataset.label;
  };
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
    paintTheme();
  });
  paintTheme();

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <a href="index.html" class="brand" aria-label="Aquino Studios, inicio">${BRAND}</a>
          <p class="muted">Estudio independiente de juegos de Roblox. Hechos para jugar con amigos.</p>
          <div class="socials">${socialLinks()}</div>
        </div>
        <div>
          <h4>Sitio</h4>
          <ul>
            <li><a href="index.html#juegos">Juegos</a></li>
            <li><a href="index.html#noticias">Noticias</a></li>
            <li><a href="proximamente.html">Próximo lanzamiento</a></li>
            <li><a href="index.html#equipo">Equipo</a></li>
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
      <div class="footer-bottom mono">
        <span>© ${new Date().getFullYear()} Aquino Studios</span>
        <span>No afiliado a Roblox Corporation</span>
      </div>
    </div>
    <div class="footer-mark" aria-hidden="true">Aquino</div>`;
  document.body.append(footer);

  if (!configured) {
    const warn = document.createElement('div');
    warn.className = 'config-warning';
    warn.innerHTML = 'Falta configurar Supabase en <code>js/config.js</code>. Mirá el archivo <code>README.md</code>.';
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

// ---------- YouTube ----------
// Acepta un link de YouTube (watch, youtu.be, shorts, embed) o el ID de 11 caracteres.
export function youtubeId(input) {
  const v = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  const m = v.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function youtubeEmbedHtml(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) return '';
  return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Video del juego"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
}

// ---------- Cuenta regresiva ----------
// Dibuja días/horas/minutos/segundos en `el` hasta `date`. Llama a onEnd cuando llega a cero.
export function startCountdown(el, date, onEnd) {
  const target = new Date(date).getTime();
  const pad = (n) => String(n).padStart(2, '0');
  let timer;
  const tick = () => {
    const left = Math.max(0, target - Date.now());
    const d = Math.floor(left / 86400000);
    const h = Math.floor(left / 3600000) % 24;
    const m = Math.floor(left / 60000) % 60;
    const sec = Math.floor(left / 1000) % 60;
    el.innerHTML = [[d, d === 1 ? 'día' : 'días'], [pad(h), 'horas'], [pad(m), 'min'], [pad(sec), 'seg']]
      .map(([v, l]) => `<div class="cd-box"><b>${v}</b><span>${l}</span></div>`).join('');
    if (left === 0) { clearInterval(timer); onEnd?.(); }
  };
  tick();
  timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------- Sugerencias / bugs ----------
export const REPORT_STATUS = {
  nueva: { label: 'Nueva', cls: 'badge-blue' },
  en_revision: { label: 'En revisión', cls: 'badge-amber' },
  planeada: { label: 'Planeada', cls: 'badge-accent' },
  resuelta: { label: 'Resuelta', cls: 'badge-green' },
  descartada: { label: 'Descartada', cls: '' },
};
export const REPORT_KIND = { sugerencia: 'Sugerencia', bug: 'Bug' };

// ---------- Encuestas ----------
const pollOpen = (p) => p.active && (!p.closes_at || new Date(p.closes_at) > new Date());

// Carga y dibuja encuestas en `container`. `filter` recibe la consulta de Supabase para filtrarla.
// Devuelve la cantidad de encuestas mostradas.
export async function renderPolls(container, profile, filter) {
  if (!sb) return 0;
  const { data: polls } = await filter(sb.from('polls').select('*, poll_options(id, label, sort_order)'))
    .order('created_at', { ascending: false }).limit(6);
  if (!polls?.length) return 0;

  const ids = polls.map((p) => p.id);
  const [{ data: counts }, { data: mine }] = await Promise.all([
    sb.rpc('poll_counts', { ids }),
    profile ? sb.from('poll_votes').select('poll_id, option_id').in('poll_id', ids).eq('user_id', profile.id) : { data: [] },
  ]);
  const votes = Object.fromEntries((counts || []).map((c) => [c.option_id, Number(c.votes)]));
  const myVote = Object.fromEntries((mine || []).map((v) => [v.poll_id, v.option_id]));

  container.innerHTML = polls.map((p) => {
    const opts = [...p.poll_options].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const total = opts.reduce((a, o) => a + (votes[o.id] || 0), 0);
    const open = pollOpen(p);
    const voted = myVote[p.id];
    const showResults = voted || !open || !profile;
    return `
      <article class="poll" data-poll="${p.id}">
        <h3>${esc(p.question)}</h3>
        <div class="poll-options">
          ${opts.map((o) => {
            const pct = total ? Math.round(((votes[o.id] || 0) / total) * 100) : 0;
            const tag = open && profile ? 'button' : 'div';
            return `<${tag} class="poll-option ${voted === o.id ? 'mine' : ''}" ${tag === 'button' ? `type="button" data-option="${o.id}"` : ''}>
              ${showResults ? `<span class="fill" style="width:${pct}%"></span>` : ''}
              <span>${voted === o.id ? '✓ ' : ''}${esc(o.label)}</span>
              ${showResults ? `<span class="pct">${pct}%</span>` : ''}
            </${tag}>`;
          }).join('')}
        </div>
        <div class="poll-foot">
          <span>${total} ${total === 1 ? 'voto' : 'votos'}</span>
          <span>${!open ? 'Encuesta cerrada' : !profile ? '<a href="login.html">Iniciá sesión</a> para votar'
            : voted ? 'Podés cambiar tu voto' : p.closes_at ? `Cierra el ${formatDate(p.closes_at)}` : 'Tocá una opción para votar'}</span>
        </div>
      </article>`;
  }).join('');

  if (profile && !container.dataset.bound) {
    container.dataset.bound = '1';
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-option]');
      if (!btn) return;
      const pollId = Number(btn.closest('[data-poll]').dataset.poll);
      const { error } = await sb.from('poll_votes').upsert(
        { poll_id: pollId, option_id: Number(btn.dataset.option), user_id: profile.id },
        { onConflict: 'poll_id,user_id' });
      if (error) return toast(errorMsg(error), 'error');
      toast('¡Voto registrado!');
      renderPolls(container, profile, filter);
    });
  }
  return polls.length;
}

// ---------- Efecto 3D en las tarjetas de juegos ----------
// Inclina la tarjeta siguiendo el mouse. Se desactiva en pantallas táctiles y con "reducir movimiento".
function enableTilt() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let current = null;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.game-card');
    if (current && current !== card) current.style.transform = '';
    current = card;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (current) current.style.transform = ''; });
}
