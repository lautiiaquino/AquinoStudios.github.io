import './core/components.js';
import { html, raw, render, safeUrl, cssUrl } from './core/html.js';
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
import { HEART, donationsOn } from './core/donate.js';

const profile = await renderLayout('games');

const state = { games: [], stats: {}, filter: new URLSearchParams(location.search).get('filtro') || 'all' };
const empty = (text) => html`<div class="empty" style="grid-column:1/-1">${text}</div>`;

// ---------- Comunidad: Discord y grupo de Roblox (se completan en js/config.js) ----------
const svg = (d) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`);
const DISCORD = svg('M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4-2 1 1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.8zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z');
const ROBLOX = svg('M5.2 0 0 18.8 18.8 24 24 5.2zm8.4 14.9-4.5-1.2 1.2-4.5 4.5 1.2z');
const community = [];
if (safeUrl(SOCIALS.discord)) community.push(html`
  <a class="community-card cc-discord" href="${SOCIALS.discord}" target="_blank" rel="noopener">
    <span class="cc-icon" aria-hidden="true">${DISCORD}</span><b>Discord</b><span>Hablá con el equipo, reportá bugs y enterate primero de las updates.</span><em>Unirme</em>
  </a>`);
if (safeUrl(SOCIALS.roblox)) community.push(html`
  <a class="community-card cc-roblox" href="${SOCIALS.roblox}" target="_blank" rel="noopener">
    <span class="cc-icon" aria-hidden="true">${ROBLOX}</span><b>Grupo de Roblox</b><span>Unite al grupo para tener los beneficios en nuestros juegos.</span><em>Unirme</em>
  </a>`);
if (donationsOn()) community.push(html`
  <a class="community-card cc-donate" href="#donar" data-donate>
    <span class="cc-icon" aria-hidden="true">${HEART}</span><b>Apoyá al estudio</b><span>Si te gustan nuestros juegos, podés donar lo que quieras con Mercado Pago.</span><em>Donar</em>
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

// ---------- Portada: juego destacado ----------
function renderHero() {
  const g = state.games.find((x) => x.featured);
  if (!g) return;
  const s = state.stats[g.roblox_place_id];
  const img = gameImage(g, s);
  const like = likePct(s);
  const canPlay = g.roblox_place_id && g.status === 'publicado';
  // La imagen del juego también queda de fondo, tenue, detrás de todo el hero
  const bg = $('#heroBg');
  if (img) { bg.style.backgroundImage = cssUrl(img); bg.classList.add('on'); }
  render($('#heroFeature'), html`
    <article class="poster">
      <span class="poster-sticker">${g.status === 'publicado' ? 'Destacado' : g.status === 'en_desarrollo' ? 'En desarrollo' : 'Próximamente'}</span>
      <a class="poster-art" href="${gameUrl(g.slug)}" style="${img ? `background-image:${cssUrl(img)}` : ''}" aria-label="Ver ${g.title}">
        ${img ? '' : html`<span class="poster-initial">${g.title.slice(0, 1)}</span>`}
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
          <a class="btn ${canPlay ? 'btn-white btn-lg' : 'btn-primary btn-lg'}" href="${gameUrl(g.slug)}">Ver juego</a>
        </div>
      </div>
    </article>`);
}

// El fondo del hero se corre un poco siguiendo al mouse (la tarjeta, al revés): da profundidad
function heroDepth() {
  const hero = $('#hero');
  if (!matchMedia('(hover: hover)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layers = [[$('#heroBg'), 14], [$('#heroFeature'), -8]];
  let frame = 0;
  hero.addEventListener('pointermove', (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      for (const [el, d] of layers) el.style.translate = `${(-x * d).toFixed(1)}px ${(-y * d).toFixed(1)}px`;
    });
  }, { passive: true });
  hero.addEventListener('pointerleave', () => layers.forEach(([el]) => (el.style.translate = '')));
}
heroDepth();

// Tarjetas de comunidad: la luz sigue al mouse (variables CSS --mx / --my)
on($('#community'), 'pointermove', '.community-card', (e, card) => {
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
});

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
