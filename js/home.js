import './core/components.js';
import { html, render, safeUrl, cssUrl } from './core/html.js';
import { $, $$, on, transition } from './core/dom.js';
import { sb } from './core/supabase.js';
import { getUser } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { mountPolls } from './core/polls.js';
import { toast, busy, say, validate, errorMsg } from './core/ui.js';
import {
  gameCard, gameImage, avatar, robloxGameUrl, robloxUserUrl, gameUrl, fetchRobloxStats, likePct, ICON,
} from './core/view.js';
import * as fmt from './core/format.js';
import { SOCIALS } from './config.js';

const profile = await renderLayout('games');

const state = { games: [], stats: {}, filter: new URLSearchParams(location.search).get('filtro') || 'all' };
const empty = (text) => html`<div class="empty" style="grid-column:1/-1">${text}</div>`;

// ---------- Comunidad: Discord y grupo de Roblox (se completan en js/config.js) ----------
const community = [];
if (safeUrl(SOCIALS.discord)) community.push(html`
  <a class="community-card cc-discord" href="${SOCIALS.discord}" target="_blank" rel="noopener">
    <b>Discord</b><span>Hablá con el equipo, reportá bugs y enterate primero de las updates.</span><em>Unirme</em>
  </a>`);
if (safeUrl(SOCIALS.roblox)) community.push(html`
  <a class="community-card cc-roblox" href="${SOCIALS.roblox}" target="_blank" rel="noopener">
    <b>Grupo de Roblox</b><span>Unite al grupo para tener los beneficios en nuestros juegos.</span><em>Unirme</em>
  </a>`);
if (community.length) $('#community').insertAdjacentHTML('afterbegin', community.join(''));

if (new URLSearchParams(location.search).get('cuenta') === 'borrada') {
  toast('Tu cuenta y tus datos se borraron. ¡Gracias por haber jugado!');
  history.replaceState(null, '', location.pathname);
}

// ---------- Si hay sesión ----------
if (profile) {
  Object.assign($('#heroJoin'), { textContent: 'Mi cuenta', href: 'cuenta.html' });
  $('#ctaTitle').textContent = `Hola, ${profile.username}`;
  $('#ctaText').textContent = 'Mirá tus favoritos, tus reportes y editá tu perfil.';
  $('#ctaBtn').href = 'cuenta.html';
  $('#contactForm').elements.name.value = profile.username;
  getUser().then((u) => u?.email && ($('#contactForm').elements.email.value = u.email));
}

// ---------- Portada: póster del juego destacado ----------
function renderHero() {
  const g = state.games.find((x) => x.featured);
  if (!g) return;
  const s = state.stats[g.roblox_place_id];
  const img = gameImage(g, s);
  const like = likePct(s);
  const canPlay = g.roblox_place_id && g.status === 'publicado';
  render($('#heroFeature'), html`
    <article class="poster">
      <span class="poster-sticker">${g.status === 'publicado' ? 'Destacado' : g.status === 'en_desarrollo' ? 'En desarrollo' : 'Próximamente'}</span>
      <a class="poster-art" href="${gameUrl(g.slug)}" style="${img ? `background-image:${cssUrl(img)}` : ''}" aria-label="Ver ${g.title}">
        ${img ? '' : html`<div class="big-cube"><i></i><i></i><i></i></div>`}
      </a>
      <div class="poster-body">
        <h2 class="poster-title">${g.title}</h2>
        <p>${g.short_description ?? ''}</p>
        ${s ? html`<ul class="poster-stats">
          <li>${ICON.user}<b>${fmt.number(s.playing)}</b> jugando</li>
          <li>${ICON.eye}<b>${fmt.number(s.visits)}</b> visitas</li>
          ${like !== null ? html`<li>${ICON.thumb}<b>${like}%</b></li>` : ''}
        </ul>` : ''}
        <div class="poster-actions">
          ${canPlay ? html`<a class="btn btn-play btn-lg" href="${robloxGameUrl(g.roblox_place_id)}" target="_blank" rel="noopener">${ICON.play} Jugar</a>` : ''}
          <a class="btn ${canPlay ? 'btn-white' : 'btn-play btn-lg'}" href="${gameUrl(g.slug)}">Ver juego</a>
        </div>
      </div>
    </article>`);
}

// Bloques y monedas del cielo que se mueven con el mouse (parallax)
function skyParallax() {
  const hero = $('#hero');
  const items = $$('[data-depth]', hero);
  if (!matchMedia('(hover: hover)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let frame = 0;
  hero.addEventListener('pointermove', (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      for (const el of items) {
        const d = Number(el.dataset.depth);
        el.style.translate = `${(-x * d).toFixed(1)}px ${(-y * d).toFixed(1)}px`;
      }
    });
  }, { passive: true });
  hero.addEventListener('pointerleave', () => items.forEach((el) => (el.style.translate = '')));
}
skyParallax();

// ---------- Juegos ----------
function renderGames() {
  const list = state.games.filter((g) => state.filter === 'all' || g.status === state.filter);
  render($('#gamesGrid'), list.length ? list.map((g) => gameCard(g, state.stats[g.roblox_place_id])) : empty('No hay juegos acá todavía.'));
  $$('#filters .chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.filter === state.filter);
    c.setAttribute('aria-pressed', c.dataset.filter === state.filter);
  });
}

on($('#filters'), 'click', '.chip', (e, chip) => {
  state.filter = chip.dataset.filter;
  const url = new URL(location.href);
  state.filter === 'all' ? url.searchParams.delete('filtro') : url.searchParams.set('filtro', state.filter);
  history.replaceState(null, '', url);
  transition(renderGames);
});

// Próximo lanzamiento: el juego con la fecha de salida más cercana
function renderRelease() {
  const now = Date.now();
  const next = state.games.filter((g) => g.release_at && new Date(g.release_at) > now)
    .sort((a, b) => new Date(a.release_at) - new Date(b.release_at))[0];
  const box = $('#releaseBanner');
  if (!next) return box.classList.add('hidden');
  render(box, html`
    <div>
      <span class="pill pill-red">Sale pronto</span>
      <h3>${next.title}</h3>
      <p>${next.short_description || 'Muy pronto en Roblox.'}</p>
    </div>
    <count-down to="${next.release_at}"></count-down>
    <a class="btn btn-primary" href="proximamente.html">Avisame</a>`);
  box.classList.remove('hidden');
  box.querySelector('count-down').addEventListener('end', () => box.classList.add('hidden'));
}

async function loadGames() {
  if (!sb) return render($('#gamesGrid'), empty('Configurá Supabase para ver los juegos.'));
  const { data, error } = await sb.from('games').select('*').order('sort_order').order('created_at', { ascending: false });
  if (error) return render($('#gamesGrid'), empty(`No se pudieron cargar los juegos: ${errorMsg(error)}`));
  state.games = data;
  $('#statGames').setAttribute('value', data.length);
  renderRelease();
  renderHero();
  renderGames();

  state.stats = await fetchRobloxStats(data.map((g) => g.roblox_place_id));
  const values = Object.values(state.stats);
  $('#statPlaying').setAttribute('value', values.reduce((a, s) => a + (s.playing || 0), 0));
  $('#statVisits').setAttribute('value', values.reduce((a, s) => a + (s.visits || 0), 0));
  if (values.length) { renderHero(); renderGames(); }
}

// ---------- Novedades ----------
async function loadNews() {
  if (!sb) return render($('#newsList'), empty('Configurá Supabase para ver las novedades.'));
  const { data } = await sb.from('news').select('*, games(title, slug)').eq('published', true)
    .order('created_at', { ascending: false }).limit(6);
  render($('#newsList'), data?.length ? data.map((n) => html`
    <article class="news-card">
      ${safeUrl(n.image_url) ? html`<img src="${n.image_url}" alt="" loading="lazy" decoding="async">` : ''}
      <div class="news-body">
        <div class="news-date"><time datetime="${n.created_at}">${fmt.date(n.created_at)}</time>${n.games ? html` · <a href="${gameUrl(n.games.slug)}">${n.games.title}</a>` : ''}</div>
        <h3>${n.title}</h3>
        <p class="clamp">${n.body}</p>
      </div>
    </article>`) : empty('Todavía no hay novedades.'));
}

// ---------- Equipo ----------
async function loadTeam() {
  if (!sb) return;
  const { data } = await sb.from('team_members').select('*').order('sort_order').order('created_at');
  if (!data?.length) return;
  render($('#teamGrid'), data.map((m) => html`
    <article class="member">
      ${avatar({ avatar_url: m.avatar_url, username: m.name }, 88)}
      <div>
        <h3>${m.name}</h3>
        ${m.roblox_username ? html`<a class="small" href="${robloxUserUrl(m.roblox_username)}" target="_blank" rel="noopener">@${m.roblox_username}</a>` : ''}
        ${m.role_title ? html`<div class="role">${m.role_title}</div>` : ''}
        ${m.bio ? html`<p>${m.bio}</p>` : ''}
      </div>
    </article>`));
  $('#equipo').classList.remove('hidden');
}

async function loadSiteStats() {
  if (!sb) return;
  const { data } = await sb.rpc('site_stats');
  if (data) $('#statMembers').setAttribute('value', data.members);
}

// ---------- Contacto ----------
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
    say(form, '¡Listo! Te respondemos pronto.', 'success');
    toast('Mensaje enviado');
  });
});

await Promise.allSettled([
  loadGames(), loadNews(), loadTeam(), loadSiteStats(),
  mountPolls($('#pollsList'), { profile, filter: (q) => q.is('game_id', null) })
    .then((n) => n && $('#encuestas').classList.remove('hidden')),
]);
