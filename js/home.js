import {
  sb, $, $$, esc, safeUrl, formatNumber, formatDate, STATUS, robloxGameUrl, initials,
  renderLayout, toast, errorMsg, withLoading, fetchRobloxStats, thumbStyle, gameCardHtml,
} from './common.js';

const profile = await renderLayout('home');

// Animación al hacer scroll
const io = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
}), { threshold: 0.1 });
const observeReveal = () => $$('.reveal:not(.visible)').forEach((el) => io.observe(el));
observeReveal();

if (profile) {
  $('#heroJoin').textContent = 'Mi cuenta';
  $('#heroJoin').href = 'cuenta.html';
  $('#ctaTitle').textContent = `¡Hola, ${profile.username}!`;
  $('#ctaText').textContent = 'Ya sos parte de la comunidad. Mirá tus favoritos o editá tu perfil.';
  $('#ctaBtn').textContent = 'Ir a mi cuenta →';
  $('#ctaBtn').href = 'cuenta.html';
  $('#cName').value = profile.username;
  $('#cEmail').value = (await sb.auth.getUser()).data.user?.email || '';
}

let games = [];
let stats = {};

function renderFeatured() {
  const g = games.find((x) => x.featured);
  if (!g) return ($('#featured').innerHTML = '');
  const s = stats[g.roblox_place_id];
  const st = STATUS[g.status] || STATUS.publicado;
  const hasImg = safeUrl(g.thumbnail_url) || safeUrl(s?.icon);
  $('#featured').innerHTML = `
    <article class="featured reveal">
      <div class="featured-img" ${thumbStyle(g, s)}>${hasImg ? '' : `<div class="thumb-placeholder">${initials(g.title)}</div>`}</div>
      <div class="featured-body">
        <div class="featured-tag">⭐ Juego destacado</div>
        <h3>${esc(g.title)}</h3>
        <div><span class="badge ${st.cls}">${st.label}</span> ${g.genre ? `<span class="badge badge-accent">${esc(g.genre)}</span>` : ''}</div>
        <p class="muted" style="margin-top:14px">${esc(g.short_description || '')}</p>
        ${s ? `<div class="mini-stats">
          <div><strong>${formatNumber(s.playing)}</strong>jugando</div>
          <div><strong>${formatNumber(s.visits)}</strong>visitas</div>
          <div><strong>${formatNumber(s.favorites)}</strong>favoritos</div>
        </div>` : ''}
        <div class="hero-actions" style="justify-content:flex-start">
          ${g.roblox_place_id && g.status === 'publicado' ? `<a class="btn btn-play" href="${robloxGameUrl(g.roblox_place_id)}" target="_blank" rel="noopener">▶ Jugar en Roblox</a>` : ''}
          <a class="btn btn-ghost" href="juego.html?slug=${encodeURIComponent(g.slug)}">Ver más</a>
        </div>
      </div>
    </article>`;
  observeReveal();
}

function renderGames(filter = 'all') {
  const list = games.filter((g) => filter === 'all' || g.status === filter);
  $('#gamesGrid').innerHTML = list.length
    ? list.map((g) => gameCardHtml(g, stats[g.roblox_place_id])).join('')
    : '<div class="empty" style="grid-column:1/-1">No hay juegos en esta categoría todavía.</div>';
}

$('#filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  $$('.chip', $('#filters')).forEach((c) => c.classList.toggle('active', c === chip));
  renderGames(chip.dataset.filter);
});

async function loadGames() {
  if (!sb) {
    $('#gamesGrid').innerHTML = '<div class="empty" style="grid-column:1/-1">Configurá Supabase para ver los juegos.</div>';
    return;
  }
  const { data, error } = await sb.from('games').select('*').order('sort_order').order('created_at', { ascending: false });
  if (error) {
    $('#gamesGrid').innerHTML = `<div class="empty" style="grid-column:1/-1">Error al cargar juegos: ${esc(errorMsg(error))}</div>`;
    return;
  }
  games = data;
  $('#statGames').textContent = games.length;
  renderFeatured();
  renderGames();

  // Estadísticas en vivo de Roblox
  stats = await fetchRobloxStats(games.map((g) => g.roblox_place_id));
  const values = Object.values(stats);
  if (values.length) {
    const playing = values.reduce((a, s) => a + (s.playing || 0), 0);
    $('#statPlaying').textContent = formatNumber(playing);
    $('#statVisits').textContent = formatNumber(values.reduce((a, s) => a + (s.visits || 0), 0));
    if (playing > 0) $('#heroLive').textContent = `${formatNumber(playing)} jugando ahora mismo`;
    renderFeatured();
    renderGames($('.chip.active').dataset.filter);
  } else {
    $('#statPlaying').textContent = '0';
    $('#statVisits').textContent = '0';
  }
}

async function loadNews() {
  if (!sb) return ($('#newsList').innerHTML = '<div class="empty">Configurá Supabase para ver las noticias.</div>');
  const { data, error } = await sb.from('news').select('*, games(title, slug)').eq('published', true)
    .order('created_at', { ascending: false }).limit(6);
  if (error || !data.length) {
    $('#newsList').innerHTML = '<div class="empty" style="grid-column:1/-1">Todavía no hay noticias.</div>';
    return;
  }
  $('#newsList').innerHTML = data.map((n) => `
    <article class="news-card reveal">
      ${safeUrl(n.image_url) ? `<img src="${esc(n.image_url)}" alt="" loading="lazy">` : ''}
      <div class="news-body">
        <div class="news-date">${formatDate(n.created_at)}${n.games ? ` · <a href="juego.html?slug=${encodeURIComponent(n.games.slug)}">${esc(n.games.title)}</a>` : ''}</div>
        <h3>${esc(n.title)}</h3>
        <p class="clamp">${esc(n.body)}</p>
      </div>
    </article>`).join('');
  observeReveal();
}

async function loadSiteStats() {
  if (!sb) return;
  const { data } = await sb.rpc('site_stats');
  if (data) $('#statMembers').textContent = formatNumber(data.members);
}

$('#contactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const msg = $('#contactMsg');
  const name = $('#cName').value.trim();
  const email = $('#cEmail').value.trim();
  const message = $('#cMsg').value.trim();
  msg.innerHTML = '';
  if (!name || !email || !message) return (msg.innerHTML = '<div class="form-msg error">Completá todos los campos.</div>');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return (msg.innerHTML = '<div class="form-msg error">El email no es válido.</div>');
  if (!sb) return (msg.innerHTML = '<div class="form-msg error">El sitio todavía no está configurado.</div>');

  await withLoading(form.querySelector('button[type=submit]'), async () => {
    const { error } = await sb.from('contact_messages').insert({ name, email, message, user_id: profile?.id ?? null });
    if (error) {
      msg.innerHTML = `<div class="form-msg error">${esc(errorMsg(error))}</div>`;
    } else {
      $('#cMsg').value = '';
      msg.innerHTML = '<div class="form-msg success">¡Mensaje enviado! Te vamos a responder pronto.</div>';
      toast('Mensaje enviado');
    }
  });
});

loadGames();
loadNews();
loadSiteStats();
