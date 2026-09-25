import {
  sb, $, $$, esc, safeUrl, formatNumber, formatDate, STATUS, robloxGameUrl, initials,
  renderLayout, toast, errorMsg, withLoading, fetchRobloxStats, thumbStyle, gameCardHtml,
  avatarHtml, startCountdown, renderPolls,
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
  $('#ctaTitle').textContent = 'Tu cuenta';
  $('#ctaText').textContent = `Hola, ${profile.username} — favoritos, reportes y perfil`;
  $('#ctaBtn').href = 'cuenta.html';
  $('#cName').value = profile.username;
  $('#cEmail').value = (await sb.auth.getUser()).data.user?.email || '';
}

let games = [];
let stats = {};

// Contador animado para los números del HUD
function countUp(el, target) {
  target = Number(target) || 0;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) return (el.textContent = formatNumber(target));
  const start = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - start) / 1200);
    el.textContent = formatNumber(Math.round(target * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderFeatured() {
  const g = games.find((x) => x.featured);
  if (!g) return ($('#featured').innerHTML = '');
  const s = stats[g.roblox_place_id];
  // La imagen del juego destacado queda de fondo en el hero
  const heroImg = safeUrl(g.thumbnail_url) || safeUrl(s?.icon);
  if (heroImg) {
    $('#heroBg').style.backgroundImage = `url('${heroImg}')`;
    $('#heroBg').classList.add('on');
  }
  const st = STATUS[g.status] || STATUS.publicado;
  const hasImg = safeUrl(g.thumbnail_url) || safeUrl(s?.icon);
  $('#featured').innerHTML = `
    <article class="featured reveal">
      <div class="featured-img" ${thumbStyle(g, s)}>${hasImg ? '' : `<div class="thumb-placeholder">${initials(g.title)}</div>`}</div>
      <div class="featured-body">
        <div class="featured-tag">Juego destacado</div>
        <h3>${esc(g.title)}</h3>
        <div><span class="badge ${st.cls}">${st.label}</span> ${g.genre ? `<span class="badge badge-accent">${esc(g.genre)}</span>` : ''}</div>
        <p class="muted" style="margin-top:14px">${esc(g.short_description || '')}</p>
        ${s ? `<div class="mini-stats">
          <div><strong>${formatNumber(s.playing)}</strong>jugando</div>
          <div><strong>${formatNumber(s.visits)}</strong>visitas</div>
          <div><strong>${formatNumber(s.favorites)}</strong>favoritos</div>
        </div>` : ''}
        <div class="hero-actions" style="justify-content:flex-start">
          ${g.roblox_place_id && g.status === 'publicado' ? `<a class="btn btn-play" href="${robloxGameUrl(g.roblox_place_id)}" target="_blank" rel="noopener">Jugar en Roblox ↗</a>` : ''}
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
  countUp($('#statGames'), games.length);
  renderRelease();
  renderFeatured();
  renderGames();

  // Estadísticas en vivo de Roblox
  stats = await fetchRobloxStats(games.map((g) => g.roblox_place_id));
  const values = Object.values(stats);
  if (values.length) {
    const playing = values.reduce((a, s) => a + (s.playing || 0), 0);
    countUp($('#statPlaying'), playing);
    countUp($('#statVisits'), values.reduce((a, s) => a + (s.visits || 0), 0));
    if (playing > 0) $('#heroLive').textContent = `${formatNumber(playing)} jugando ahora`;
    renderFeatured();
    renderGames($('.chip.active').dataset.filter);
  } else {
    $('#statPlaying').textContent = '0';
    $('#statVisits').textContent = '0';
  }
}

// Aviso del próximo lanzamiento: el juego con la fecha de salida más cercana
function renderRelease() {
  const next = games
    .filter((g) => g.release_at && new Date(g.release_at) > new Date())
    .sort((a, b) => new Date(a.release_at) - new Date(b.release_at))[0];
  const box = $('#releaseBanner');
  if (!next) return box.classList.add('hidden');
  box.innerHTML = `
    <div><span class="kicker">Próximo lanzamiento</span><h3>${esc(next.title)}</h3>
      <p>${esc(next.short_description || 'Muy pronto en Roblox.')}</p></div>
    <div class="countdown" id="homeCountdown"></div>
    <a class="btn btn-primary" href="proximamente.html">Ver más</a>`;
  box.classList.remove('hidden');
  startCountdown($('#homeCountdown'), next.release_at, () => box.classList.add('hidden'));
}

async function loadTeam() {
  if (!sb) return;
  const { data } = await sb.from('team_members').select('*').order('sort_order').order('created_at');
  if (!data?.length) return;
  $('#teamGrid').innerHTML = data.map((m) => `
    <article class="member reveal">
      ${avatarHtml({ avatar_url: m.avatar_url, username: m.name }, 96)}
      <h3>${esc(m.name)}</h3>
      ${m.role_title ? `<div class="role">${esc(m.role_title)}</div>` : ''}
      ${m.bio ? `<p>${esc(m.bio)}</p>` : ''}
      ${m.roblox_username ? `<a class="small" href="https://www.roblox.com/search/users?keyword=${encodeURIComponent(m.roblox_username)}" target="_blank" rel="noopener">@${esc(m.roblox_username)} en Roblox</a>` : ''}
    </article>`).join('');
  $('#equipo').classList.remove('hidden');
  observeReveal();
}

async function loadPolls() {
  const n = await renderPolls($('#pollsList'), profile, (q) => q.is('game_id', null));
  if (n) $('#encuestas').classList.remove('hidden');
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
  if (data) countUp($('#statMembers'), data.members);
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
loadTeam();
loadPolls();
