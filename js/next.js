import './core/components.js';
import { html, render, safeUrl, cssUrl } from './core/html.js';
import { $, download } from './core/dom.js';
import { sb } from './core/supabase.js';
import { loginUrl } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { toast, errorMsg } from './core/ui.js';
import { statusBadge, robloxGameUrl, gameUrl, gameImage, bgStyle, placeholder, fetchRobloxStats, releaseIcs } from './core/view.js';
import * as fmt from './core/format.js';

const profile = await renderLayout('next');
const page = $('#page');

const empty = (text) => render(page, html`
  <div class="container launch"><div class="empty"><h2>Pronto</h2><p>${text}</p>
    <a class="btn btn-primary" href="index.html#juegos">Ver nuestros juegos</a></div></div>`);

if (!sb) empty('El sitio todavía no está configurado.');
else {
  const { data: games } = await sb.from('games').select('*').in('status', ['proximamente', 'en_desarrollo'])
    .order('sort_order').order('created_at', { ascending: false });
  const now = Date.now();
  // Primero el lanzamiento con fecha más cercana; si no hay fechas, el primer juego en camino.
  const game = (games ?? []).filter((g) => g.release_at && new Date(g.release_at) > now)
    .sort((a, b) => new Date(a.release_at) - new Date(b.release_at))[0] ?? games?.[0];
  game ? renderLaunch(game) : empty('Por ahora no hay lanzamientos anunciados. ¡Seguí atento a las noticias!');
}

// Notificación del sistema (usa el Service Worker si está, así también funciona en el celular)
async function notify(title, body) {
  if (window.Notification?.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  reg ? reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }) : new Notification(title, { body });
}

function renderLaunch(game) {
  document.title = `${game.title} — Próximo lanzamiento`;
  const img = gameImage(game);
  const hasDate = game.release_at && new Date(game.release_at) > new Date();

  render(page, html`
    <div class="container launch">
      <span class="pill pill-red">Próximo lanzamiento</span>
      <h1 class="stroke-title">${game.title}</h1>
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
        ${statusBadge(game.status)}
        ${game.genre ? html`<span class="badge badge-accent">${game.genre}</span>` : ''}
      </div>
      <div id="whenBox" style="margin-top:44px">
        ${hasDate ? html`
          <p class="muted" style="margin-bottom:12px">Sale el <strong><time datetime="${game.release_at}">${fmt.dateTime(game.release_at)}</time></strong></p>
          <count-down to="${game.release_at}" size="lg"></count-down>`
        : html`<p class="muted" style="margin-bottom:28px">Todavía no tiene fecha. Seguinos en Discord para enterarte.</p>`}
      </div>
      <p class="muted" style="max-width:620px;margin:0 auto 28px">${game.short_description ?? ''}</p>
      <div class="hero-actions" style="justify-content:center">
        <button class="btn btn-primary" id="notifyBtn" type="button" aria-pressed="false">Avisame cuando salga</button>
        ${hasDate ? html`<button class="btn btn-ghost" id="icsBtn" type="button">Agregar al calendario</button>` : ''}
        <a class="btn btn-ghost" href="${gameUrl(game.slug)}">Ver página del juego</a>
      </div>
      <div class="game-hero-img" id="launchImg" style="${bgStyle(img)}">${img ? '' : placeholder(game, 'launchPh')}</div>
      ${game.youtube_id ? html`<div style="max-width:820px;margin:48px auto 0"><lite-youtube videoid="${game.youtube_id}"></lite-youtube></div>` : ''}
    </div>`);

  $('count-down')?.addEventListener('end', () => {
    render($('#whenBox'), html`<h2 class="stroke-title" style="margin-bottom:24px">¡Ya salió!</h2>
      ${game.roblox_place_id ? html`<a class="btn btn-play" href="${robloxGameUrl(game.roblox_place_id)}" target="_blank" rel="noopener" style="margin-bottom:28px">Jugar</a>` : ''}`);
    notify(`¡Ya salió ${game.title}!`, 'Entrá a jugarlo en Roblox.');
  });

  $('#icsBtn')?.addEventListener('click', () => {
    download(`${game.slug}-lanzamiento.ics`, releaseIcs(game, new URL(gameUrl(game.slug), location.href).href), 'text/calendar');
    toast('Abrí el archivo para agregarlo a tu calendario');
  });

  if (!safeUrl(game.thumbnail_url) && game.roblox_place_id) {
    fetchRobloxStats([game.roblox_place_id]).then((all) => {
      const icon = safeUrl(all[game.roblox_place_id]?.icon);
      if (icon) { $('#launchImg').style.backgroundImage = cssUrl(icon); $('#launchPh')?.remove(); }
    });
  }

  setupNotify(game);
}

// "Avisame" = favorito + (si el navegador deja) notificación cuando termine la cuenta regresiva
async function setupNotify(game) {
  const btn = $('#notifyBtn');
  let on = false;
  const paint = () => {
    btn.textContent = on ? '✓ Te vamos a avisar' : 'Avisame cuando salga';
    btn.setAttribute('aria-pressed', on);
    btn.classList.toggle('btn-ghost', on);
    btn.classList.toggle('btn-primary', !on);
  };
  if (profile) {
    const { data } = await sb.from('favorites').select('game_id').eq('user_id', profile.id).eq('game_id', game.id).maybeSingle();
    on = !!data;
    paint();
  }
  btn.addEventListener('click', async () => {
    if (!profile) return location.assign(loginUrl());
    on = !on;
    paint();
    const { error } = on
      ? await sb.from('favorites').insert({ user_id: profile.id, game_id: game.id })
      : await sb.from('favorites').delete().eq('user_id', profile.id).eq('game_id', game.id);
    if (error) { on = !on; paint(); return toast(errorMsg(error), 'error'); }
    if (on && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
    toast(on ? 'Listo: está en tus favoritos y te avisamos si tenés la página abierta' : 'Listo, ya no te avisamos');
  });
}
