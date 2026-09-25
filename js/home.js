import './core/components.js';
import { html, render, safeUrl, cssUrl } from './core/html.js';
import { $, $$, on, transition } from './core/dom.js';
import { sb } from './core/supabase.js';
import { getUser } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { heroCanvas } from './core/hero-canvas.js';
import { mountPolls } from './core/polls.js';
import { toast, busy, say, validate, errorMsg } from './core/ui.js';
import {
  gameCard, gameImage, bgStyle, placeholder, statusBadge, avatar, robloxGameUrl, robloxUserUrl, gameUrl, fetchRobloxStats,
} from './core/view.js';
import * as fmt from './core/format.js';

const profile = await renderLayout('home');
heroCanvas($('.hero'));

const state = { games: [], stats: {}, filter: new URLSearchParams(location.search).get('filtro') || 'all' };
const empty = (text) => html`<div class="empty" style="grid-column:1/-1">${text}</div>`;

// ---------- Personalización si hay sesión ----------
if (profile) {
  Object.assign($('#heroJoin'), { textContent: 'Mi cuenta', href: 'cuenta.html' });
  $('#ctaTitle').textContent = 'Tu cuenta';
  $('#ctaText').textContent = `Hola, ${profile.username} — favoritos, reportes y perfil`;
  $('#ctaBtn').href = 'cuenta.html';
  $('#contactForm').elements.name.value = profile.username;
  getUser().then((u) => u?.email && ($('#contactForm').elements.email.value = u.email));
}

// ---------- Juegos ----------
function renderFeatured() {
  const g = state.games.find((x) => x.featured);
  if (!g) return render($('#featured'), '');
  const s = state.stats[g.roblox_place_id];
  const img = gameImage(g, s);
  if (img) { $('#heroBg').style.backgroundImage = cssUrl(img); $('#heroBg').classList.add('on'); }
  render($('#featured'), html`
    <article class="featured reveal">
      <div class="featured-img" style="${bgStyle(img)}">${img ? '' : placeholder(g)}</div>
      <div class="featured-body">
        <div class="featured-tag">Juego destacado</div>
        <h3>${g.title}</h3>
        <div>${statusBadge(g.status)} ${g.genre ? html`<span class="badge badge-accent">${g.genre}</span>` : ''}</div>
        <p class="muted" style="margin-top:14px">${g.short_description ?? ''}</p>
        ${s ? html`<div class="mini-stats">
          <div><strong>${fmt.number(s.playing)}</strong>jugando</div>
          <div><strong>${fmt.number(s.visits)}</strong>visitas</div>
          <div><strong>${fmt.number(s.favorites)}</strong>favoritos</div>
        </div>` : ''}
        <div class="hero-actions" style="justify-content:flex-start">
          ${g.roblox_place_id && g.status === 'publicado' ? html`<a class="btn btn-play" href="${robloxGameUrl(g.roblox_place_id)}" target="_blank" rel="noopener">Jugar en Roblox ↗</a>` : ''}
          <a class="btn btn-ghost" href="${gameUrl(g.slug)}">Ver más</a>
        </div>
      </div>
    </article>`);
}

function renderGames() {
  const list = state.games.filter((g) => state.filter === 'all' || g.status === state.filter);
  render($('#gamesGrid'), list.length ? list.map((g) => gameCard(g, state.stats[g.roblox_place_id])) : empty('No hay juegos en esta categoría todavía.'));
  $$('#filters .chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.filter === state.filter);
    c.setAttribute('aria-pressed', c.dataset.filter === state.filter);
  });
}

// Filtros: animados con View Transitions y guardados en la URL (?filtro=...)
on($('#filters'), 'click', '.chip', (e, chip) => {
  state.filter = chip.dataset.filter;
  const url = new URL(location.href);
  state.filter === 'all' ? url.searchParams.delete('filtro') : url.searchParams.set('filtro', state.filter);
  history.replaceState(null, '', url);
  transition(renderGames);
});

// Aviso del próximo lanzamiento: el juego con la fecha de salida más cercana
function renderRelease() {
  const now = Date.now();
  const next = state.games.filter((g) => g.release_at && new Date(g.release_at) > now)
    .sort((a, b) => new Date(a.release_at) - new Date(b.release_at))[0];
  const box = $('#releaseBanner');
  if (!next) return box.classList.add('hidden');
  render(box, html`
    <div><span class="kicker">Próximo lanzamiento</span><h3>${next.title}</h3>
      <p>${next.short_description || 'Muy pronto en Roblox.'}</p></div>
    <count-down to="${next.release_at}"></count-down>
    <a class="btn btn-primary" href="proximamente.html">Ver más</a>`);
  box.classList.remove('hidden');
  box.querySelector('count-down').addEventListener('end', () => box.classList.add('hidden'));
}

async function loadGames() {
  if (!sb) return render($('#gamesGrid'), empty('Configurá Supabase para ver los juegos.'));
  const { data, error } = await sb.from('games').select('*').order('sort_order').order('created_at', { ascending: false });
  if (error) return render($('#gamesGrid'), empty(`Error al cargar juegos: ${errorMsg(error)}`));
  state.games = data;
  $('#statGames').setAttribute('value', data.length);
  renderRelease();
  renderFeatured();
  renderGames();

  // Estadísticas en vivo de Roblox (se completan cuando llegan)
  state.stats = await fetchRobloxStats(data.map((g) => g.roblox_place_id));
  const values = Object.values(state.stats);
  const playing = values.reduce((a, s) => a + (s.playing || 0), 0);
  $('#statPlaying').setAttribute('value', playing);
  $('#statVisits').setAttribute('value', values.reduce((a, s) => a + (s.visits || 0), 0));
  if (playing > 0) $('#heroLive').textContent = `${fmt.number(playing)} jugando ahora`;
  if (values.length) { renderFeatured(); renderGames(); }
}

// ---------- Noticias ----------
async function loadNews() {
  if (!sb) return render($('#newsList'), empty('Configurá Supabase para ver las noticias.'));
  const { data } = await sb.from('news').select('*, games(title, slug)').eq('published', true)
    .order('created_at', { ascending: false }).limit(6);
  render($('#newsList'), data?.length ? data.map((n) => html`
    <article class="news-card reveal">
      ${safeUrl(n.image_url) ? html`<img src="${n.image_url}" alt="" loading="lazy" decoding="async">` : ''}
      <div class="news-body">
        <div class="news-date"><time datetime="${n.created_at}">${fmt.date(n.created_at)}</time>${n.games ? html` · <a href="${gameUrl(n.games.slug)}">${n.games.title}</a>` : ''}</div>
        <h3>${n.title}</h3>
        <p class="clamp">${n.body}</p>
      </div>
    </article>`) : empty('Todavía no hay noticias.'));
}

// ---------- Equipo ----------
async function loadTeam() {
  if (!sb) return;
  const { data } = await sb.from('team_members').select('*').order('sort_order').order('created_at');
  if (!data?.length) return;
  render($('#teamGrid'), data.map((m) => html`
    <article class="member reveal">
      ${avatar({ avatar_url: m.avatar_url, username: m.name }, 96)}
      <h3>${m.name}</h3>
      ${m.role_title ? html`<div class="role">${m.role_title}</div>` : ''}
      ${m.bio ? html`<p>${m.bio}</p>` : ''}
      ${m.roblox_username ? html`<a href="${robloxUserUrl(m.roblox_username)}" target="_blank" rel="noopener">@${m.roblox_username} en Roblox</a>` : ''}
    </article>`));
  $('#equipo').classList.remove('hidden');
}

// ---------- Contadores del HUD ----------
async function loadSiteStats() {
  if (!sb) return;
  const { data } = await sb.rpc('site_stats');
  if (data) $('#statMembers').setAttribute('value', data.members);
}

// ---------- Contacto (Constraint Validation API + FormData) ----------
$('#contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const { ok, data, message } = validate(form);
  if (!ok) return say(form, message);
  if (!sb) return say(form, 'El sitio todavía no está configurado.');
  await busy(form.querySelector('[type=submit]'), async () => {
    const { error } = await sb.from('contact_messages').insert({ ...data, user_id: profile?.id ?? null });
    if (error) return say(form, errorMsg(error));
    form.elements.message.value = '';
    say(form, '¡Mensaje enviado! Te vamos a responder pronto.', 'success');
    toast('Mensaje enviado');
  });
});

// Todo en paralelo
await Promise.allSettled([
  loadGames(), loadNews(), loadTeam(), loadSiteStats(),
  mountPolls($('#pollsList'), { profile, filter: (q) => q.is('game_id', null) })
    .then((n) => n && $('#encuestas').classList.remove('hidden')),
]);
