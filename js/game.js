import {
  sb, $, esc, safeUrl, formatNumber, formatDate, timeAgo, STATUS, robloxGameUrl, initials, avatarHtml,
  renderLayout, toast, errorMsg, withLoading, fetchRobloxStats, thumbStyle,
} from './common.js';

const profile = await renderLayout('games');
const slug = new URLSearchParams(location.search).get('slug');
const page = $('#page');

function notFound(text = 'No encontramos este juego.') {
  page.innerHTML = `<div class="container" style="padding:80px 0"><div class="empty"><h2>😕</h2><p>${esc(text)}</p><a class="btn btn-primary" href="index.html#juegos">Ver todos los juegos</a></div></div>`;
}

if (!sb) notFound('El sitio todavía no está configurado.');
else if (!slug) notFound();
else {
  const { data: game } = await sb.from('games').select('*').eq('slug', slug).maybeSingle();
  if (!game) notFound();
  else await renderGame(game);
}

async function renderGame(game) {
  document.title = `${game.title} — Aquino Studios`;
  const st = STATUS[game.status] || STATUS.publicado;
  const canPlay = game.roblox_place_id && game.status === 'publicado';

  page.innerHTML = `
    <div class="game-hero">
      <div class="game-hero-bg" ${thumbStyle(game)}></div>
      <div class="container">
        <div class="game-hero-img" id="heroImg" ${thumbStyle(game)}>${safeUrl(game.thumbnail_url) ? '' : `<div class="thumb-placeholder" id="heroPh">${initials(game.title)}</div>`}</div>
        <div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <span class="badge ${st.cls}">${st.label}</span>
            ${game.genre ? `<span class="badge badge-accent">${esc(game.genre)}</span>` : ''}
          </div>
          <h1>${esc(game.title)}</h1>
          <p class="muted">${esc(game.short_description || '')}</p>
          <div class="game-actions">
            ${canPlay ? `<a class="btn btn-play" href="${robloxGameUrl(game.roblox_place_id)}" target="_blank" rel="noopener">▶ Jugar en Roblox</a>` : ''}
            <button class="btn btn-ghost fav-btn" id="favBtn">♡ Favorito</button>
            <button class="btn btn-ghost" id="shareBtn">Compartir</button>
          </div>
          <div class="stat-row hidden" id="statRow"></div>
        </div>
      </div>
    </div>

    <div class="container" style="padding:40px 0 80px">
      <div class="two-col">
        <div class="card">
          <h2>Comentarios <span class="muted" id="commentCount"></span></h2>
          <div id="commentFormWrap"></div>
          <div id="comments"><div class="skeleton" style="height:80px;margin-top:16px"></div></div>
        </div>
        <aside class="card">
          <h3>Sobre el juego</h3>
          <div class="prose">${esc(game.description || 'Sin descripción todavía.')}</div>
          <p class="muted small" style="margin-top:16px">Agregado el ${formatDate(game.created_at)}</p>
          <div id="gameNews"></div>
        </aside>
      </div>
    </div>`;

  // Estadísticas en vivo
  if (game.roblox_place_id) {
    fetchRobloxStats([game.roblox_place_id]).then((all) => {
      const s = all[game.roblox_place_id];
      if (!s) return;
      if (!safeUrl(game.thumbnail_url) && safeUrl(s.icon)) {
        $('#heroImg').style.backgroundImage = `url('${s.icon}')`;
        $('.game-hero-bg').style.backgroundImage = `url('${s.icon}')`;
        $('#heroPh')?.remove();
      }
      const votes = s.upVotes + s.downVotes;
      const rating = votes ? Math.round((s.upVotes / votes) * 100) + '%' : '–';
      $('#statRow').innerHTML = [
        [formatNumber(s.playing), 'Jugando'], [formatNumber(s.visits), 'Visitas'],
        [formatNumber(s.favorites), 'Favoritos'], [rating, 'Me gusta'],
      ].map(([v, l]) => `<div class="stat"><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`).join('');
      $('#statRow').classList.remove('hidden');
    });
  }

  // Compartir
  $('#shareBtn').addEventListener('click', async () => {
    const data = { title: game.title, url: location.href };
    if (navigator.share) return navigator.share(data).catch(() => {});
    await navigator.clipboard.writeText(location.href);
    toast('Enlace copiado');
  });

  // Favoritos
  const favBtn = $('#favBtn');
  let isFav = false;
  const paintFav = () => {
    favBtn.classList.toggle('on', isFav);
    favBtn.textContent = isFav ? '♥ En favoritos' : '♡ Favorito';
  };
  if (profile) {
    const { data } = await sb.from('favorites').select('game_id').eq('user_id', profile.id).eq('game_id', game.id).maybeSingle();
    isFav = !!data;
    paintFav();
  }
  favBtn.addEventListener('click', async () => {
    if (!profile) return (location.href = `login.html?next=${encodeURIComponent('juego.html' + location.search)}`);
    await withLoading(favBtn, async () => {
      const q = isFav
        ? sb.from('favorites').delete().eq('user_id', profile.id).eq('game_id', game.id)
        : sb.from('favorites').insert({ user_id: profile.id, game_id: game.id });
      const { error } = await q;
      if (error) return toast(errorMsg(error), 'error');
      isFav = !isFav;
      toast(isFav ? 'Agregado a favoritos' : 'Quitado de favoritos');
    });
    paintFav();
  });

  // Formulario de comentario
  $('#commentFormWrap').innerHTML = profile
    ? `<form id="commentForm" class="form" style="margin:12px 0 8px">
        <textarea id="commentText" maxlength="500" placeholder="¿Qué te pareció el juego?" style="min-height:80px" required></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="muted small" id="charCount">0/500</span>
          <button class="btn btn-primary btn-sm" type="submit">Comentar</button>
        </div>
      </form>`
    : `<p class="muted"><a href="login.html?next=${encodeURIComponent('juego.html' + location.search)}">Iniciá sesión</a> para comentar.</p>`;

  if (profile) {
    $('#commentText').addEventListener('input', (e) => ($('#charCount').textContent = `${e.target.value.length}/500`));
    $('#commentForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = $('#commentText').value.trim();
      if (!body) return;
      await withLoading($('button', e.target), async () => {
        const { error } = await sb.from('comments').insert({ game_id: game.id, user_id: profile.id, body });
        if (error) return toast(errorMsg(error), 'error');
        $('#commentText').value = '';
        $('#charCount').textContent = '0/500';
        toast('Comentario publicado');
        loadComments();
      });
    });
  }

  async function loadComments() {
    const { data, error } = await sb.from('comments')
      .select('id, body, created_at, user_id, profiles(username, avatar_url, role)')
      .eq('game_id', game.id).order('created_at', { ascending: false }).limit(100);
    if (error) return ($('#comments').innerHTML = `<p class="muted">${esc(errorMsg(error))}</p>`);
    $('#commentCount').textContent = data.length ? `(${data.length})` : '';
    $('#comments').innerHTML = data.length
      ? data.map((c) => `
        <div class="comment">
          ${avatarHtml(c.profiles, 40)}
          <div class="comment-body">
            <div class="comment-head">
              <strong>${esc(c.profiles?.username || 'Usuario')}</strong>
              ${c.profiles?.role === 'admin' ? '<span class="badge badge-accent">Staff</span>' : ''}
              <span class="muted small" title="${esc(new Date(c.created_at).toLocaleString('es-AR'))}">${timeAgo(c.created_at)}</span>
              ${profile && (profile.id === c.user_id || profile.role === 'admin') ? `<button class="link-btn" data-del="${c.id}">Borrar</button>` : ''}
            </div>
            <p>${esc(c.body)}</p>
          </div>
        </div>`).join('')
      : '<p class="muted" style="margin-top:12px">Todavía no hay comentarios. ¡Sé el primero!</p>';
  }

  $('#comments').addEventListener('click', async (e) => {
    const id = e.target.dataset?.del;
    if (!id || !confirm('¿Borrar este comentario?')) return;
    const { error } = await sb.from('comments').delete().eq('id', id);
    if (error) return toast(errorMsg(error), 'error');
    toast('Comentario borrado');
    loadComments();
  });

  loadComments();

  // Noticias del juego
  const { data: news } = await sb.from('news').select('title, created_at').eq('game_id', game.id).eq('published', true)
    .order('created_at', { ascending: false }).limit(5);
  if (news?.length) {
    $('#gameNews').innerHTML = `<h3 style="margin-top:24px">Novedades</h3>` +
      news.map((n) => `<p style="margin:0 0 10px"><span class="news-date">${formatDate(n.created_at)}</span><br>${esc(n.title)}</p>`).join('');
  }
}
