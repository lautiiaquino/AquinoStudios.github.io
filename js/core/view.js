// Piezas de interfaz que se repiten en varias páginas.
import { html, safeUrl, cssUrl } from './html.js';
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
  return url
    ? html`<img class="avatar" style="${style}" src="${url}" alt="" loading="lazy" decoding="async">`
    : html`<span class="avatar avatar-fallback" style="${style};font-size:${Math.round(size * 0.4)}px" aria-hidden="true">${initials(profile?.username)}</span>`;
}

export const robloxGameUrl = (placeId) => (placeId ? `https://www.roblox.com/games/${encodeURIComponent(placeId)}` : '');
export const robloxUserUrl = (name) => `https://www.roblox.com/search/users?keyword=${encodeURIComponent(name)}`;
export const gameUrl = (slug) => `juego.html?slug=${encodeURIComponent(slug)}`;

// Imagen de un juego: la que cargó el admin, o el ícono de Roblox, o nada (se ve el placeholder)
export const gameImage = (game, stats) => safeUrl(game.thumbnail_url) || safeUrl(stats?.icon);
export const bgStyle = (url) => (url ? `background-image:${cssUrl(url)}` : '');
export const placeholder = (game, id = '') => html`<div class="thumb-placeholder" ${id ? html`id="${id}"` : ''} aria-hidden="true">${initials(game.title)}</div>`;

export function gameCard(game, stats) {
  const img = gameImage(game, stats);
  return html`
    <a class="game-card" href="${gameUrl(game.slug)}" data-slug="${game.slug}">
      <div class="game-thumb" style="${bgStyle(img)}">
        ${img ? '' : placeholder(game)}
        ${statusBadge(game.status)}
        ${stats?.playing ? html`<span class="live-pill">${fmt.number(stats.playing)} jugando</span>` : ''}
      </div>
      <div class="game-info">
        <h3>${game.title}</h3>
        <p>${game.short_description ?? ''}</p>
        <div class="game-meta">
          <span>${game.genre ?? ''}</span>
          <span>${stats?.visits ? `${fmt.number(stats.visits)} visitas` : ''}</span>
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
