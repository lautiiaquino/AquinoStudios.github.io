// Piezas de interfaz que se repiten en varias páginas.
import { html, raw, safeUrl, cssUrl } from './html.js';
import { sb } from './supabase.js';
import { memo } from './dom.js';
import * as fmt from './format.js';

export const STATUS = {
  publicado: { label: 'Disponible', cls: 'badge-green' },
  en_desarrollo: { label: 'En desarrollo', cls: 'badge-amber' },
  proximamente: { label: 'Próximamente', cls: 'badge-blue' },
};
export const REPORT_STATUS = {
  nueva: { label: 'Nueva', cls: 'badge-blue' },
  en_revision: { label: 'En revisión', cls: 'badge-amber' },
  planeada: { label: 'Planeada', cls: 'badge-accent' },
  resuelta: { label: 'Resuelta', cls: 'badge-green' },
  descartada: { label: 'Descartada', cls: '' },
};
export const REPORT_KIND = { sugerencia: 'Sugerencia', bug: 'Bug' };

export const statusBadge = (status) => {
  const st = STATUS[status] ?? STATUS.publicado;
  return html`<span class="badge ${st.cls}">${st.label}</span>`;
};

export const initials = (name) => (name || '?').trim().slice(0, 2).toUpperCase();

export function avatar(profile, size = 36) {
  const url = safeUrl(profile?.avatar_url);
  const style = `width:${size}px;height:${size}px`;
  const rbx = validRobloxName(profile?.roblox_username) ? profile.roblox_username : '';
  // Si la foto no carga (link roto, o no es una imagen directa), se cae sola a las iniciales
  // en vez de mostrar el ícono de imagen rota (ver el "error" global más abajo).
  return url
    ? html`<img class="avatar" style="${style}" src="${url}" alt="" loading="lazy" decoding="async"
        data-fallback-size="${size}" data-fallback-name="${profile?.username ?? ''}" ${rbx ? raw(`data-fallback-rbx="${rbx}"`) : ''}>`
    : html`<span class="avatar avatar-fallback" style="${style};font-size:${Math.round(size * 0.4)}px" aria-hidden="true"
        ${rbx ? raw(`data-rbx="${rbx}"`) : ''}>${initials(profile?.username)}</span>`;
}
const validRobloxName = (n) => typeof n === 'string' && /^[A-Za-z0-9_]{3,20}$/.test(n);

// "error" no se propaga (no "burbujea"), así que se escucha en la fase de captura, una sola vez
// para toda la página. Reemplaza cualquier <img class="avatar"> rota por las iniciales (o, si
// tiene usuario de Roblox, el MutationObserver de layout.js la cambia después por su avatar real).
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('avatar') || img.dataset.fallbackDone) return;
  img.dataset.fallbackDone = '1';
  const size = Number(img.dataset.fallbackSize) || 36;
  const span = document.createElement('span');
  span.className = 'avatar avatar-fallback';
  span.setAttribute('aria-hidden', 'true');
  span.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px`;
  if (img.dataset.fallbackRbx) span.dataset.rbx = img.dataset.fallbackRbx;
  span.textContent = initials(img.dataset.fallbackName);
  img.replaceWith(span);
}, true);

// ---------- Avatares de Roblox ----------
// Si alguien no subió foto pero puso su usuario de Roblox, se muestra la cara de su avatar de Roblox.
// Los <span data-rbx="usuario"> se reemplazan solos (lo llama un MutationObserver de layout.js).
const avatarCache = new Map(); // usuario → Promise<url|null>
export async function hydrateRobloxAvatars(root = document) {
  const spans = [...root.querySelectorAll('[data-rbx]:not([data-rbx-done])')];
  if (!spans.length || !sb) return;
  spans.forEach((el) => el.setAttribute('data-rbx-done', ''));
  const names = [...new Set(spans.map((el) => el.dataset.rbx))];
  const missing = names.filter((n) => !avatarCache.has(n.toLowerCase()));
  if (missing.length) {
    const req = sb.functions.invoke('roblox-stats', { body: { action: 'avatars', usernames: missing } })
      .then(({ data }) => data ?? {}, () => ({}));
    for (const n of missing) avatarCache.set(n.toLowerCase(), req.then((d) => safeUrl(d[n]?.headshot) || null));
  }
  for (const el of spans) {
    const url = await avatarCache.get(el.dataset.rbx.toLowerCase());
    if (!url || !el.isConnected) continue;
    const img = Object.assign(document.createElement('img'), { className: 'avatar avatar-rbx', src: url, alt: '', decoding: 'async' });
    img.style.cssText = el.style.cssText;
    img.title = `@${el.dataset.rbx} en Roblox`;
    el.replaceWith(img);
  }
}

// Datos extra de la página del juego (imágenes, tienda, servidores, insignias)
export async function fetchRobloxDetails(placeId) {
  if (!sb || !placeId) return null;
  const key = `rdetails:${placeId}`;
  const cached = memo.get(key, 30_000);
  if (cached) return cached;
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
    const { data, error } = await Promise.race([sb.functions.invoke('roblox-stats', { body: { action: 'details', placeId: Number(placeId) } }), timeout]);
    if (error || !data || data.error) return null;
    memo.set(key, data);
    return data;
  } catch {
    return null;
  }
}

// Íconos estilo Roblox
export const ROBUX = raw('<svg class="robux" viewBox="0 0 24 24" aria-label="Robux" role="img"><path fill="currentColor" d="M12 1.5 21.1 6.75v10.5L12 22.5l-9.1-5.25V6.75zm0 2.3L4.9 7.9v8.2L12 20.2l7.1-4.1V7.9zm0 2.9 4.6 2.65v5.3L12 17.3l-4.6-2.65v-5.3zm0 2.3-2.6 1.5v3l2.6 1.5 2.6-1.5v-3z"/></svg>');
export const robloxPassUrl = (id) => `https://www.roblox.com/game-pass/${encodeURIComponent(id)}`;
export const robloxBadgeUrl = (id) => `https://www.roblox.com/badges/${encodeURIComponent(id)}`;
export const robloxServerUrl = (placeId, serverId) => `https://www.roblox.com/games/start?placeId=${encodeURIComponent(placeId)}&gameInstanceId=${encodeURIComponent(serverId)}`;

export const robloxGameUrl = (placeId) => (placeId ? `https://www.roblox.com/games/${encodeURIComponent(placeId)}` : '');
export const robloxUserUrl = (name) => `https://www.roblox.com/search/users?keyword=${encodeURIComponent(name)}`;
export const gameUrl = (slug) => `juego.html?slug=${encodeURIComponent(slug)}`;
export const profileUrl = (username) => `perfil.html?u=${encodeURIComponent(username)}`;

// Imagen de un juego: la que cargó el admin, o el ícono de Roblox, o nada (se ve el placeholder)
export const gameImage = (game, stats) => safeUrl(game.thumbnail_url) || safeUrl(stats?.icon);
export const bgStyle = (url) => (url ? `background-image:${cssUrl(url)}` : '');
export const placeholder = (game, id = '') => html`<div class="thumb-placeholder" ${id ? html`id="${id}"` : ''} aria-hidden="true">${initials(game.title)}</div>`;

// Íconos (los mismos que usa cualquiera en una GUI de Roblox)
export const ICON = {
  play: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>'),
  user: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z"/></svg>'),
  thumb: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 21h4V9H2v12zm20-11a2 2 0 0 0-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 8 6 8.5 6 9v10a2 2 0 0 0 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z"/></svg>'),
  eye: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>'),
  star: raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 3 6.6 7 .7-5.3 4.8 1.6 7L12 17.6 5.7 21l1.6-7L2 9.3l7-.7z"/></svg>'),
};

export const likePct = (s) => {
  const total = (s?.upVotes ?? 0) + (s?.downVotes ?? 0);
  return total ? Math.round((s.upVotes / total) * 100) : null;
};

// Tarjeta de juego como las de roblox.com: miniatura, nombre, % de me gusta y jugando
export function gameCard(game, stats) {
  const img = gameImage(game, stats);
  const like = likePct(stats);
  return html`
    <a class="game-card" href="${gameUrl(game.slug)}" data-slug="${game.slug}">
      <div class="game-thumb" style="${bgStyle(img)}" aria-hidden="true">
        ${img ? '' : placeholder(game)}
        ${game.status !== 'publicado' ? statusBadge(game.status) : ''}
      </div>
      <div class="game-info">
        <h3>${game.title}</h3>
        <div class="game-meta">
          ${stats ? html`
            <span title="Me gusta">${ICON.thumb} ${like === null ? '--' : `${like}%`}</span>
            <span title="Jugando ahora">${ICON.user} ${fmt.number(stats.playing ?? 0)}</span>`
          : html`<span>${game.genre ?? STATUS[game.status]?.label ?? ''}</span>`}
        </div>
      </div>
    </a>`;
}

// Estadísticas de Roblox vía la Edge Function "roblox-stats".
// Se guardan 60 segundos en sessionStorage y, si la función no responde en 8 s, se sigue sin ellas.
export async function fetchRobloxStats(placeIds) {
  const ids = [...new Set(placeIds.filter(Boolean))].sort();
  if (!sb || !ids.length) return {};
  const key = `rstats:${ids.join(',')}`;
  const cached = memo.get(key, 60_000);
  if (cached) return cached;
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
    const { data, error } = await Promise.race([sb.functions.invoke('roblox-stats', { body: { placeIds: ids } }), timeout]);
    if (error || !data || data.error) return {};
    memo.set(key, data);
    return data;
  } catch {
    return {};
  }
}

// Acepta un link de YouTube (watch, youtu.be, shorts, embed, live) o el ID de 11 caracteres.
export function youtubeId(input) {
  const v = String(input ?? '').trim();
  if (/^[\w-]{11}$/.test(v)) return v;
  return v.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1] ?? null;
}

export const bannedNotice = (profile) => html`
  <div class="notice notice-danger" role="alert">Tu cuenta está suspendida${profile?.banned_reason ? html`: ${profile.banned_reason}` : ''}.
    No podés comentar, votar ni mandar reportes.</div>`;

// Archivo de calendario (.ics) para agregar un lanzamiento a Google Calendar, Outlook o el celular
export function releaseIcs(game, pageUrl) {
  const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = (s) => String(s ?? '').replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const start = new Date(game.release_at);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Aquino Studios//Lanzamientos//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:release-${game.id}@aquinostudios`,
    `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${text(`Sale ${game.title} (Aquino Studios)`)}`,
    `DESCRIPTION:${text(game.short_description || 'Nuevo juego de Aquino Studios en Roblox.')}`,
    `URL:${pageUrl}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Sale en 15 minutos', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

// Tarjeta de un código canjeable (inicio y página del juego)
const COPY = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>');
export const codeCard = (c, gameTitle) => html`
  <div class="code-card">
    <div>
      <code>${c.code}</code>
      ${c.reward ? html`<span class="reward">${c.reward}</span>` : ''}
      <small>${c.on_launch ? '🚀 lanzamiento · ' : ''}${gameTitle ? html`${gameTitle} · ` : ''}${c.expires_at ? html`vence ${fmt.ago(c.expires_at)}` : 'sin vencimiento'}</small>
    </div>
    <button class="btn btn-sm btn-ghost" type="button" data-code="${c.code}" aria-label="Copiar código ${c.code}">${COPY} Copiar</button>
  </div>`;
