import {
  sb, $, esc, safeUrl, formatNumber, formatDate, timeAgo, STATUS, robloxGameUrl, initials, avatarHtml,
  renderLayout, toast, errorMsg, withLoading, fetchRobloxStats, thumbStyle,
  youtubeEmbedHtml, startCountdown, formatDateTime, renderPolls, REPORT_KIND,
} from './common.js';

const profile = await renderLayout('games');
const slug = new URLSearchParams(location.search).get('slug');
const page = $('#page');

function notFound(text = 'No encontramos este juego.') {
  page.innerHTML = `<div class="container" style="padding:80px 0"><div class="empty"><h2>404</h2><p>${esc(text)}</p><a class="btn btn-primary" href="index.html#juegos">Ver todos los juegos</a></div></div>`;
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
            ${canPlay ? `<a class="btn btn-play" href="${robloxGameUrl(game.roblox_place_id)}" target="_blank" rel="noopener">Jugar en Roblox ↗</a>` : ''}
            <button class="btn btn-ghost fav-btn" id="favBtn">+ Favoritos</button>
            <button class="btn btn-ghost" id="shareBtn">Compartir</button>
          </div>
          ${game.release_at && new Date(game.release_at) > new Date() ? `
            <div style="margin-top:22px" id="releaseBox">
              <p class="muted small" style="margin-bottom:8px">Sale el ${formatDateTime(game.release_at)}</p>
              <div class="countdown" id="gameCountdown"></div>
            </div>` : ''}
          <div class="stat-row hidden" id="statRow"></div>
        </div>
      </div>
    </div>

    <div class="container" style="padding:40px 0 80px">
      <div class="two-col">
        <div class="stack">
          ${game.youtube_id ? `<div>${youtubeEmbedHtml(game.youtube_id)}</div>` : ''}
          <div class="card hidden" id="galleryCard">
            <h2>Galería</h2>
            <div class="gallery" id="gallery"></div>
          </div>
          <div class="card">
            <h2>Comentarios <span class="muted" id="commentCount"></span></h2>
            <div id="commentFormWrap"></div>
            <div id="comments"><div class="skeleton" style="height:80px;margin-top:16px"></div></div>
          </div>
        </div>
        <div class="stack">
          <aside class="card">
            <h3>Sobre el juego</h3>
            <div class="prose">${esc(game.description || 'Sin descripción todavía.')}</div>
            <p class="muted small" style="margin-top:16px">Agregado el ${formatDate(game.created_at)}</p>
            <div id="gameNews"></div>
          </aside>
          <div class="polls hidden" id="gamePolls" style="grid-template-columns:1fr"></div>
          <aside class="card hidden" id="changelogCard">
            <h3>Registro de cambios</h3>
            <div class="changelog" id="changelog"></div>
          </aside>
          <aside class="card" id="reportCard">
            <h3>¿Una idea o un bug?</h3>
            <div id="reportWrap"></div>
          </aside>
        </div>
      </div>
    </div>

    <dialog class="lightbox" id="lightbox">
      <div class="lightbox-bar"><span id="lbCaption"></span><button class="x-btn" data-close aria-label="Cerrar">×</button></div>
      <img id="lbImg" alt="">
    </dialog>`;

  if ($('#gameCountdown')) startCountdown($('#gameCountdown'), game.release_at, () => $('#releaseBox').remove());

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
    favBtn.textContent = isFav ? '✓ En favoritos' : '+ Favoritos';
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
  const banned = profile?.banned;
  const bannedNotice = `<div class="notice notice-danger" style="margin:12px 0">Tu cuenta está suspendida${profile?.banned_reason ? `: ${esc(profile.banned_reason)}` : ''}. No podés comentar ni participar.</div>`;
  $('#commentFormWrap').innerHTML = banned ? bannedNotice : profile
    ? `<form id="commentForm" class="form" style="margin:12px 0 8px">
        <textarea id="commentText" maxlength="500" placeholder="¿Qué te pareció el juego?" style="min-height:80px" required></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="muted small" id="charCount">0/500</span>
          <button class="btn btn-primary btn-sm" type="submit">Comentar</button>
        </div>
      </form>`
    : `<p class="muted"><a href="login.html?next=${encodeURIComponent('juego.html' + location.search)}">Iniciá sesión</a> para comentar.</p>`;

  if (profile && !banned) {
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
      .select('id, body, created_at, user_id, hidden, profiles(username, avatar_url, role)')
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
              ${c.hidden ? '<span class="badge badge-amber">Oculto</span>' : ''}
              ${profile?.role === 'admin' ? `<button class="link-btn" data-hide="${c.id}" data-val="${!c.hidden}">${c.hidden ? 'Mostrar' : 'Ocultar'}</button>` : ''}
              ${profile && (profile.id === c.user_id || profile.role === 'admin') ? `<button class="link-btn" data-del="${c.id}" style="margin-left:${profile?.role === 'admin' ? '0' : 'auto'}">Borrar</button>` : ''}
            </div>
            <p ${c.hidden ? 'class="muted"' : ''}>${esc(c.body)}</p>
            ${c.hidden && profile?.id === c.user_id && profile.role !== 'admin' ? '<p class="small muted">Un moderador ocultó este comentario. Solo vos lo ves.</p>' : ''}
          </div>
        </div>`).join('')
      : '<p class="muted" style="margin-top:12px">Todavía no hay comentarios. ¡Sé el primero!</p>';
  }

  $('#comments').addEventListener('click', async (e) => {
    const { hide, val } = e.target.dataset;
    if (hide) {
      const { error } = await sb.from('comments').update({ hidden: val === 'true' }).eq('id', hide);
      if (error) return toast(errorMsg(error), 'error');
      toast(val === 'true' ? 'Comentario oculto' : 'Comentario visible');
      return loadComments();
    }
    const id = e.target.dataset?.del;
    if (!id || !confirm('¿Borrar este comentario?')) return;
    const { error } = await sb.from('comments').delete().eq('id', id);
    if (error) return toast(errorMsg(error), 'error');
    toast('Comentario borrado');
    loadComments();
  });

  loadComments();
  loadGallery();
  loadChangelog();
  renderPolls($('#gamePolls'), profile, (q) => q.eq('game_id', game.id))
    .then((n) => n && $('#gamePolls').classList.remove('hidden'));
  setupReport();

  // Galería con visor
  async function loadGallery() {
    const { data } = await sb.from('game_media').select('*').eq('game_id', game.id).order('sort_order').order('id');
    const items = (data || []).filter((m) => safeUrl(m.url));
    if (!items.length) return;
    $('#gallery').innerHTML = items.map((m, i) => `
      <button type="button" data-i="${i}" aria-label="Ver imagen ${i + 1}"><img src="${esc(m.url)}" alt="${esc(m.caption || '')}" loading="lazy"></button>`).join('');
    $('#galleryCard').classList.remove('hidden');
    const lb = $('#lightbox');
    $('#gallery').addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const m = items[b.dataset.i];
      $('#lbImg').src = m.url;
      $('#lbImg').alt = m.caption || '';
      $('#lbCaption').textContent = m.caption || '';
      lb.showModal();
    });
    $('[data-close]', lb).addEventListener('click', () => lb.close());
    lb.addEventListener('click', (e) => e.target === lb && lb.close());
  }

  async function loadChangelog() {
    const { data } = await sb.from('game_updates').select('*').eq('game_id', game.id).order('created_at', { ascending: false }).limit(20);
    if (!data?.length) return;
    $('#changelog').innerHTML = data.map((u) => `
      <div class="log-item">
        <h4>${u.version ? `<span class="ver">${esc(u.version)}</span>` : ''}${esc(u.title)}</h4>
        <span class="muted small">${formatDate(u.created_at)}</span>
        ${u.body ? `<p>${esc(u.body)}</p>` : ''}
      </div>`).join('');
    $('#changelogCard').classList.remove('hidden');
  }

  // Sugerencias y reportes de bugs
  function setupReport() {
    const wrap = $('#reportWrap');
    const back = encodeURIComponent('juego.html' + location.search);
    if (!profile) return (wrap.innerHTML = `<p class="muted"><a href="login.html?next=${back}">Iniciá sesión</a> para mandarnos una sugerencia o reportar un bug.</p>`);
    if (banned) return (wrap.innerHTML = bannedNotice);
    wrap.innerHTML = `
      <form class="form" id="reportForm" novalidate>
        <div class="seg" role="radiogroup" aria-label="Tipo">
          <label><input type="radio" name="kind" value="sugerencia" checked><span>${REPORT_KIND.sugerencia}</span></label>
          <label><input type="radio" name="kind" value="bug"><span>${REPORT_KIND.bug}</span></label>
        </div>
        <div class="field"><label for="rTitle">Título</label><input id="rTitle" maxlength="120" placeholder="Resumen en pocas palabras"></div>
        <div class="field"><label for="rBody">Detalle</label><textarea id="rBody" maxlength="2000" style="min-height:90px" placeholder="Contanos más..."></textarea></div>
        <div class="msg"></div>
        <div><button class="btn btn-primary btn-sm" type="submit">Enviar</button></div>
        <p class="muted small" style="margin:0">Podés seguir el estado en <a href="cuenta.html#reportes">Mi cuenta</a>.</p>
      </form>`;
    const form = $('#reportForm');
    form.querySelectorAll('input[name=kind]').forEach((r) => r.addEventListener('change', () => {
      $('#rBody').placeholder = form.kind.value === 'bug' ? '¿Qué pasó? ¿Qué estabas haciendo? ¿En qué dispositivo?' : 'Contanos más...';
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('#rTitle').value.trim();
      const body = $('#rBody').value.trim();
      const msg = $('.msg', form);
      if (title.length < 3 || !body) return (msg.innerHTML = '<div class="form-msg error">Completá el título (mínimo 3 letras) y el detalle.</div>');
      await withLoading($('button[type=submit]', form), async () => {
        const { error } = await sb.from('suggestions').insert({ game_id: game.id, user_id: profile.id, kind: form.kind.value, title, body });
        if (error) return (msg.innerHTML = `<div class="form-msg error">${esc(errorMsg(error))}</div>`);
        form.reset();
        msg.innerHTML = '<div class="form-msg success">¡Gracias! Lo recibimos y lo vamos a revisar.</div>';
      });
    });
  }

  // Noticias del juego
  const { data: news } = await sb.from('news').select('title, created_at').eq('game_id', game.id).eq('published', true)
    .order('created_at', { ascending: false }).limit(5);
  if (news?.length) {
    $('#gameNews').innerHTML = `<h3 style="margin-top:24px">Novedades</h3>` +
      news.map((n) => `<p style="margin:0 0 10px"><span class="news-date">${formatDate(n.created_at)}</span><br>${esc(n.title)}</p>`).join('');
  }
}
