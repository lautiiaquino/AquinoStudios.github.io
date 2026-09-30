// Perfil público: perfil.html?u=usuario
// Muestra avatar (o el de Roblox), insignias, bio, números, juegos favoritos (si el dueño lo permite)
// y los últimos comentarios. Todo sale de una sola consulta (RPC public_profile).
import { html, render, safeUrl } from './core/html.js';
import { $ } from './core/dom.js';
import { sb } from './core/supabase.js';
import { renderLayout } from './core/layout.js';
import { errorMsg } from './core/ui.js';
import { avatar, gameCard, robloxUserUrl, gameUrl, profileUrl } from './core/view.js';
import * as fmt from './core/format.js';

const me = await renderLayout();
const page = $('#page');
const name = new URLSearchParams(location.search).get('u') ?? me?.username ?? '';

const notFound = (text) => render(page, html`
  <div class="container launch"><div class="empty"><h2>404</h2><p>${text}</p>
    <a class="btn btn-primary" href="index.html">Volver al inicio</a></div></div>`);

// Logros que se calculan con los números del perfil
function achievements(p) {
  const days = (Date.now() - new Date(p.created_at)) / 864e5;
  return [
    p.role === 'admin' && ['🛠️', 'Staff', 'Parte del equipo de Aquino Studios'],
    p.supporter && ['💙', 'Donador', 'Apoyó al estudio con una donación'],
    days >= 365 && ['🏆', 'Veterano', 'Más de un año en la comunidad'],
    days < 30 && ['🌱', 'Nuevo', 'Se sumó este mes'],
    p.comments_count >= 1 && ['💬', 'Primer comentario', 'Comentó en un juego'],
    p.comments_count >= 25 && ['🗣️', 'Charlatán', '25 comentarios o más'],
    p.votes_count >= 1 && ['🗳️', 'Votante', 'Votó en una encuesta'],
    p.favorites_count >= 3 && ['⭐', 'Coleccionista', '3 juegos favoritos o más'],
  ].filter(Boolean);
}

if (!sb) notFound('El sitio todavía no está configurado.');
else if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) notFound('Ese usuario no existe.');
else {
  const { data: p, error } = await sb.rpc('public_profile', { p_username: name });
  if (error) notFound(errorMsg(error));
  else if (!p) notFound(`No encontramos a "${name}".`);
  else {
    document.title = `${p.username} — Aquino Studios`;
    const mine = me && me.username.toLowerCase() === p.username.toLowerCase();
    render(page, html`
      <header class="profile-hero stage">
        <div class="container profile-hero-inner">
          ${avatar(p, 128)}
          <div class="profile-id">
            <span class="kicker">Perfil</span>
            <h1>${p.username}</h1>
            <p class="muted">Miembro desde ${fmt.date(p.created_at)}
              ${p.roblox_username ? html` · <a href="${robloxUserUrl(p.roblox_username)}" target="_blank" rel="noopener">@${p.roblox_username} en Roblox</a>` : ''}</p>
            ${p.banned ? html`<span class="badge badge-amber">Cuenta suspendida</span>` : ''}
            ${p.bio ? html`<p class="profile-bio">${p.bio}</p>` : ''}
            ${mine ? html`<a class="btn btn-sm btn-ghost" href="cuenta.html">Editar mi perfil</a>` : ''}
          </div>
        </div>
      </header>

      <div class="container" style="padding:28px 0 80px">
        <div class="rbx-stats">
          <div class="stat"><div class="stat-label">Comentarios</div><div class="stat-value">${fmt.fullNumber(p.comments_count)}</div></div>
          <div class="stat"><div class="stat-label">Favoritos</div><div class="stat-value">${fmt.fullNumber(p.favorites_count)}</div></div>
          <div class="stat"><div class="stat-label">Votos</div><div class="stat-value">${fmt.fullNumber(p.votes_count)}</div></div>
          <div class="stat"><div class="stat-label">Insignias</div><div class="stat-value">${achievements(p).length}</div></div>
        </div>

        <h2 class="profile-h">Insignias</h2>
        <div class="achievements">
          ${achievements(p).map(([icon, title, desc]) => html`<div class="achievement" title="${desc}"><span>${icon}</span><div><b>${title}</b><small>${desc}</small></div></div>`)}
        </div>

        ${p.show_favorites ? html`
          <h2 class="profile-h">Juegos favoritos</h2>
          ${p.favorites.length ? html`<div class="grid">${p.favorites.map((g) => gameCard(g))}</div>`
            : html`<p class="muted">Todavía no tiene favoritos.</p>`}` : ''}

        <h2 class="profile-h">Últimos comentarios</h2>
        ${p.recent_comments.length ? html`<div class="card">${p.recent_comments.map((c) => html`
          <article class="comment">
            <div class="comment-body">
              <div class="comment-head"><a href="${gameUrl(c.game_slug)}#c${c.id}"><b>${c.game_title}</b></a>
                <time class="muted small" datetime="${c.created_at}">${fmt.ago(c.created_at)}</time></div>
              <p>${c.body}</p>
            </div>
          </article>`)}</div>` : html`<p class="muted">Todavía no comentó nada.</p>`}
      </div>`);
    // Link para compartir el perfil propio
    if (mine) history.replaceState(null, '', profileUrl(p.username));
  }
}
