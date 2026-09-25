import './core/components.js';
import { html, render, safeUrl, cssUrl } from './core/html.js';
import { $, $$, on, download } from './core/dom.js';
import { sb } from './core/supabase.js';
import { loginUrl } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { mountPolls } from './core/polls.js';
import { toast, busy, say, validate, ask, errorMsg } from './core/ui.js';
import {
  statusBadge, avatar, robloxGameUrl, gameImage, bgStyle, placeholder, fetchRobloxStats, bannedNotice, releaseIcs, REPORT_KIND,
} from './core/view.js';
import * as fmt from './core/format.js';

const profile = await renderLayout('games');
const page = $('#page');
const slug = new URLSearchParams(location.search).get('slug');
const isAdmin = profile?.role === 'admin';
const canParticipate = profile && !profile.banned;

const notFound = (text = 'No encontramos este juego.') => render(page, html`
  <div class="container launch"><div class="empty"><h2>404</h2><p>${text}</p>
    <a class="btn btn-primary" href="index.html#juegos">Ver todos los juegos</a></div></div>`);

if (!sb) notFound('El sitio todavía no está configurado.');
else if (!slug) notFound();
else {
  const { data: game } = await sb.from('games').select('*').eq('slug', slug).maybeSingle();
  game ? renderGame(game) : notFound();
}

function renderGame(game) {
  document.title = `${game.title} — Aquino Studios`;
  const img = gameImage(game);
  const upcoming = game.release_at && new Date(game.release_at) > new Date();
  const canPlay = game.roblox_place_id && game.status === 'publicado';

  render(page, html`
    <div class="game-hero">
      <div class="game-hero-bg" style="${bgStyle(img)}"></div>
      <div class="container">
        <div class="game-hero-img" id="heroImg" style="${bgStyle(img)}">${img ? '' : placeholder(game, 'heroPh')}</div>
        <div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            ${statusBadge(game.status)}
            ${game.genre ? html`<span class="badge badge-accent">${game.genre}</span>` : ''}
          </div>
          <h1>${game.title}</h1>
          <p class="muted">${game.short_description ?? ''}</p>
          <div class="game-actions">
            ${canPlay ? html`<a class="btn btn-play" href="${robloxGameUrl(game.roblox_place_id)}" target="_blank" rel="noopener">Jugar en Roblox ↗</a>` : ''}
            <button class="btn btn-ghost fav-btn" id="favBtn" type="button" aria-pressed="false">+ Favoritos</button>
            <button class="btn btn-ghost" id="shareBtn" type="button">Compartir</button>
          </div>
          ${upcoming ? html`
            <div style="margin-top:26px" id="releaseBox">
              <p class="mono muted" style="margin-bottom:10px">Sale el <time datetime="${game.release_at}">${fmt.dateTime(game.release_at)}</time></p>
              <count-down to="${game.release_at}"></count-down>
              <button class="link-btn" id="icsBtn" type="button" style="margin-top:12px">+ Agregar a mi calendario</button>
            </div>` : ''}
          <div class="stat-row hidden" id="statRow"></div>
        </div>
      </div>
    </div>

    <div class="container" style="padding:40px 0 80px">
      <div class="two-col">
        <div class="stack">
          ${game.youtube_id ? html`<lite-youtube videoid="${game.youtube_id}"></lite-youtube>` : ''}
          <section class="card hidden" id="galleryCard" aria-labelledby="galTitle" style="padding:28px">
            <h2 id="galTitle">Galería</h2>
            <div class="gallery" id="gallery"></div>
          </section>
          <section class="card" aria-labelledby="comTitle" style="padding:28px">
            <h2 id="comTitle">Comentarios <span class="muted" id="commentCount"></span> <span class="live-dot hidden" id="liveDot" title="Se actualiza en vivo">en vivo</span></h2>
            <div id="commentFormWrap"></div>
            <div id="comments" aria-live="polite"><div class="skeleton" style="height:80px;margin-top:16px"></div></div>
          </section>
        </div>
        <div class="stack">
          <aside class="card">
            <h3>Sobre el juego</h3>
            <div class="prose">${game.description || 'Sin descripción todavía.'}</div>
            <p class="muted small" style="margin-top:16px">Agregado el ${fmt.date(game.created_at)}</p>
            <div id="gameNews"></div>
          </aside>
          <div class="polls hidden" id="gamePolls" style="grid-template-columns:1fr"></div>
          <aside class="card hidden" id="changelogCard">
            <h3>Registro de cambios</h3>
            <div class="changelog" id="changelog"></div>
          </aside>
          <aside class="card">
            <h3>¿Una idea o un bug?</h3>
            <div id="reportWrap"></div>
          </aside>
        </div>
      </div>
    </div>

    <dialog class="lightbox" id="lightbox" aria-label="Galería">
      <div class="lightbox-bar"><span id="lbCaption"></span>
        <span style="display:flex;gap:6px">
          <button class="x-btn" data-step="-1" aria-label="Anterior">‹</button>
          <button class="x-btn" data-step="1" aria-label="Siguiente">›</button>
          <button class="x-btn" data-close aria-label="Cerrar">×</button>
        </span>
      </div>
      <img id="lbImg" alt="">
    </dialog>`);

  $('#releaseBox count-down')?.addEventListener('end', () => $('#releaseBox').remove());
  $('#icsBtn')?.addEventListener('click', () => {
    download(`${game.slug}-lanzamiento.ics`, releaseIcs(game, location.href), 'text/calendar');
    toast('Abrí el archivo para agregarlo a tu calendario');
  });

  setupStats(game);
  setupShare(game);
  setupFavorite(game);
  setupComments(game);
  setupReport(game);
  loadGallery(game);
  loadChangelog(game);
  loadNews(game);
  mountPolls($('#gamePolls'), { profile, filter: (q) => q.eq('game_id', game.id) })
    .then((n) => n && $('#gamePolls').classList.remove('hidden'));
}

// ---------- Estadísticas de Roblox ----------
async function setupStats(game) {
  if (!game.roblox_place_id) return;
  const s = (await fetchRobloxStats([game.roblox_place_id]))[game.roblox_place_id];
  if (!s) return;
  if (!safeUrl(game.thumbnail_url) && safeUrl(s.icon)) {
    $('#heroImg').style.backgroundImage = $('.game-hero-bg').style.backgroundImage = cssUrl(s.icon);
    $('#heroPh')?.remove();
  }
  const votes = s.upVotes + s.downVotes;
  render($('#statRow'), [
    [fmt.number(s.playing), 'Jugando'], [fmt.number(s.visits), 'Visitas'],
    [fmt.number(s.favorites), 'Favoritos'], [votes ? `${Math.round((s.upVotes / votes) * 100)}%` : '–', 'Me gusta'],
  ].map(([v, l]) => html`<div class="stat"><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`));
  $('#statRow').classList.remove('hidden');
}

// ---------- Compartir (Web Share API, o copiar el enlace) ----------
function setupShare(game) {
  $('#shareBtn').addEventListener('click', async () => {
    const data = { title: game.title, text: game.short_description ?? '', url: location.href };
    if (navigator.canShare?.(data)) return navigator.share(data).catch(() => {});
    await navigator.clipboard.writeText(location.href);
    toast('Enlace copiado');
  });
}

// ---------- Favoritos (optimista) ----------
async function setupFavorite(game) {
  const btn = $('#favBtn');
  let fav = false;
  const paint = () => {
    btn.classList.toggle('on', fav);
    btn.setAttribute('aria-pressed', fav);
    btn.textContent = fav ? '✓ En favoritos' : '+ Favoritos';
  };
  if (profile) {
    const { data } = await sb.from('favorites').select('game_id').eq('user_id', profile.id).eq('game_id', game.id).maybeSingle();
    fav = !!data;
    paint();
  }
  btn.addEventListener('click', async () => {
    if (!profile) return location.assign(loginUrl());
    fav = !fav;
    paint();
    const { error } = fav
      ? await sb.from('favorites').insert({ user_id: profile.id, game_id: game.id })
      : await sb.from('favorites').delete().eq('user_id', profile.id).eq('game_id', game.id);
    if (error) { fav = !fav; paint(); return toast(errorMsg(error), 'error'); }
    toast(fav ? 'Agregado a favoritos' : 'Quitado de favoritos');
  });
}

// ---------- Comentarios (con actualización en tiempo real) ----------
function setupComments(game) {
  const wrap = $('#commentFormWrap');
  if (profile?.banned) render(wrap, html`<div style="margin:12px 0">${bannedNotice(profile)}</div>`);
  else if (!profile) render(wrap, html`<p class="muted"><a href="${loginUrl()}">Iniciá sesión</a> para comentar.</p>`);
  else {
    render(wrap, html`
      <form id="commentForm" class="form" style="margin:12px 0 8px" novalidate>
        <textarea name="body" maxlength="500" placeholder="¿Qué te pareció el juego?" style="min-height:80px" required data-msg="Escribí algo antes de comentar." aria-label="Tu comentario"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <output class="mono muted" name="count">0/500</output>
          <button class="btn btn-primary btn-sm" type="submit">Comentar</button>
        </div>
        <div class="msg"></div>
      </form>`);
    const form = $('#commentForm');
    const { body, count } = form.elements;
    body.addEventListener('input', () => (count.value = `${body.value.length}/500`));
    // Ctrl+Enter para publicar
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { ok, data, message } = validate(form);
      if (!ok) return say(form, message);
      await busy(form.querySelector('[type=submit]'), async () => {
        const { error } = await sb.from('comments').insert({ game_id: game.id, user_id: profile.id, body: data.body });
        if (error) return say(form, errorMsg(error));
        form.reset();
        count.value = '0/500';
        say(form, '');
        toast('Comentario publicado');
        loadComments();
      });
    });
  }

  let loading = null;
  async function loadComments() {
    loading ??= (async () => {
      const { data, error } = await sb.from('comments')
        .select('id, body, created_at, user_id, hidden, profiles(username, avatar_url, role)')
        .eq('game_id', game.id).order('created_at', { ascending: false }).limit(100);
      loading = null;
      if (error) return render($('#comments'), html`<p class="muted">${errorMsg(error)}</p>`);
      $('#commentCount').textContent = data.length ? `(${data.length})` : '';
      render($('#comments'), data.length ? data.map((c) => html`
        <article class="comment" id="c${c.id}">
          ${avatar(c.profiles, 40)}
          <div class="comment-body">
            <div class="comment-head">
              <strong>${c.profiles?.username ?? 'Usuario'}</strong>
              ${c.profiles?.role === 'admin' ? html`<span class="badge badge-accent">Staff</span>` : ''}
              <time class="muted small" datetime="${c.created_at}" title="${fmt.dateTime(c.created_at)}">${fmt.ago(c.created_at)}</time>
              ${c.hidden ? html`<span class="badge badge-amber">Oculto</span>` : ''}
              ${isAdmin ? html`<button class="link-btn" data-hide="${c.id}" data-val="${!c.hidden}">${c.hidden ? 'Mostrar' : 'Ocultar'}</button>` : ''}
              ${profile && (profile.id === c.user_id || isAdmin) ? html`<button class="link-btn" data-del="${c.id}" style="margin-left:${isAdmin ? '0' : 'auto'}">Borrar</button>` : ''}
            </div>
            <p class="${c.hidden ? 'muted' : ''}">${c.body}</p>
            ${c.hidden && profile?.id === c.user_id && !isAdmin ? html`<p class="small muted">Un moderador ocultó este comentario. Solo vos lo ves.</p>` : ''}
          </div>
        </article>`) : html`<p class="muted" style="margin-top:12px">Todavía no hay comentarios. ¡Sé el primero!</p>`);
    })();
    return loading;
  }

  on($('#comments'), 'click', '[data-hide]', async (e, btn) => {
    const hidden = btn.dataset.val === 'true';
    const { error } = await sb.from('comments').update({ hidden }).eq('id', btn.dataset.hide);
    if (error) return toast(errorMsg(error), 'error');
    toast(hidden ? 'Comentario oculto' : 'Comentario visible');
    loadComments();
  });
  on($('#comments'), 'click', '[data-del]', async (e, btn) => {
    if (!(await ask('¿Borrar este comentario?', { ok: 'Borrar', danger: true }))) return;
    const { error } = await sb.from('comments').delete().eq('id', btn.dataset.del);
    if (error) return toast(errorMsg(error), 'error');
    toast('Comentario borrado');
    loadComments();
  });

  loadComments();

  // Tiempo real: los comentarios nuevos de otras personas aparecen sin recargar
  if (sb.channel) {
    const channel = sb.channel(`comments-${game.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `game_id=eq.${game.id}` }, () => loadComments())
      .subscribe((status) => $('#liveDot').classList.toggle('hidden', status !== 'SUBSCRIBED'));
    addEventListener('pagehide', () => sb.removeChannel(channel), { once: true });
  }
}

// ---------- Galería con visor (teclado, flechas y deslizar con el dedo) ----------
async function loadGallery(game) {
  const { data } = await sb.from('game_media').select('*').eq('game_id', game.id).order('sort_order').order('id');
  const items = (data ?? []).filter((m) => safeUrl(m.url));
  if (!items.length) return;
  render($('#gallery'), items.map((m, i) => html`
    <button type="button" data-i="${i}" aria-label="Ver imagen ${i + 1} de ${items.length}"><img src="${m.url}" alt="${m.caption ?? ''}" loading="lazy" decoding="async"></button>`));
  $('#galleryCard').classList.remove('hidden');

  const lb = $('#lightbox');
  let index = 0;
  const show = (i) => {
    index = (i + items.length) % items.length;
    const m = items[index];
    Object.assign($('#lbImg'), { src: m.url, alt: m.caption ?? '' });
    $('#lbCaption').textContent = `${index + 1} / ${items.length}${m.caption ? ` — ${m.caption}` : ''}`;
  };
  on($('#gallery'), 'click', '[data-i]', (e, b) => { show(Number(b.dataset.i)); lb.showModal(); });
  on(lb, 'click', '[data-step]', (e, b) => show(index + Number(b.dataset.step)));
  on(lb, 'click', '[data-close]', () => lb.close());
  lb.addEventListener('click', (e) => e.target === lb && lb.close());
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  });
  let startX = null;
  lb.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  lb.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
  if (items.length < 2) $$('[data-step]', lb).forEach((b) => b.remove());
}

// ---------- Registro de cambios ----------
async function loadChangelog(game) {
  const { data } = await sb.from('game_updates').select('*').eq('game_id', game.id).order('created_at', { ascending: false }).limit(20);
  if (!data?.length) return;
  render($('#changelog'), data.map((u) => html`
    <div class="log-item">
      <h4>${u.version ? html`<span class="ver">${u.version}</span>` : ''}${u.title}</h4>
      <time class="muted small" datetime="${u.created_at}">${fmt.date(u.created_at)}</time>
      ${u.body ? html`<p>${u.body}</p>` : ''}
    </div>`));
  $('#changelogCard').classList.remove('hidden');
}

// ---------- Noticias del juego ----------
async function loadNews(game) {
  const { data } = await sb.from('news').select('title, created_at').eq('game_id', game.id).eq('published', true)
    .order('created_at', { ascending: false }).limit(5);
  if (!data?.length) return;
  render($('#gameNews'), html`<h3 style="margin-top:24px">Novedades</h3>${data.map((n) => html`
    <p style="margin:0 0 10px"><time class="news-date" datetime="${n.created_at}">${fmt.date(n.created_at)}</time><br>${n.title}</p>`)}`);
}

// ---------- Sugerencias y reportes de bugs ----------
function setupReport(game) {
  const wrap = $('#reportWrap');
  if (!profile) return render(wrap, html`<p class="muted"><a href="${loginUrl()}">Iniciá sesión</a> para mandarnos una sugerencia o reportar un bug.</p>`);
  if (!canParticipate) return render(wrap, bannedNotice(profile));
  render(wrap, html`
    <form class="form" id="reportForm" novalidate>
      <div class="seg" role="radiogroup" aria-label="Tipo">
        <label><input type="radio" name="kind" value="sugerencia" checked><span>${REPORT_KIND.sugerencia}</span></label>
        <label><input type="radio" name="kind" value="bug"><span>${REPORT_KIND.bug}</span></label>
      </div>
      <div class="field"><label for="rTitle">Título</label><input id="rTitle" name="title" minlength="3" maxlength="120" required placeholder="Resumen en pocas palabras" data-msg="El título tiene que tener al menos 3 letras."></div>
      <div class="field"><label for="rBody">Detalle</label><textarea id="rBody" name="body" maxlength="2000" required style="min-height:90px" placeholder="Contanos más..." data-msg="Contanos el detalle."></textarea></div>
      <div class="msg"></div>
      <div><button class="btn btn-primary btn-sm" type="submit">Enviar</button></div>
      <p class="muted small" style="margin:0">Podés seguir el estado en <a href="cuenta.html#reportes">Mi cuenta</a>.</p>
    </form>`);
  const form = $('#reportForm');
  form.addEventListener('change', () => {
    form.elements.body.placeholder = form.elements.kind.value === 'bug' ? '¿Qué pasó? ¿Qué estabas haciendo? ¿En qué dispositivo?' : 'Contanos más...';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { ok, data, message } = validate(form);
    if (!ok) return say(form, message);
    await busy(form.querySelector('[type=submit]'), async () => {
      const { error } = await sb.from('suggestions').insert({ game_id: game.id, user_id: profile.id, ...data });
      if (error) return say(form, errorMsg(error));
      form.reset();
      say(form, '¡Gracias! Lo recibimos y lo vamos a revisar.', 'success');
    });
  });
}
