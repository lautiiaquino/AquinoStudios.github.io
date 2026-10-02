import './core/components.js';
import { html, render, safeUrl, cssUrl } from './core/html.js';
import { $, $$, on, download, transition, memo } from './core/dom.js';
import { sb } from './core/supabase.js';
import { loginUrl } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { mountPolls } from './core/polls.js';
import { toast, busy, say, validate, ask, errorMsg } from './core/ui.js';
import {
  statusBadge, avatar, robloxGameUrl, gameImage, bgStyle, placeholder, fetchRobloxStats, bannedNotice, releaseIcs, REPORT_KIND,
  ICON, likePct, codeCard, profileUrl, fetchRobloxDetails, ROBUX, robloxPassUrl, robloxBadgeUrl, robloxServerUrl,
} from './core/view.js';
import * as fmt from './core/format.js';
import { mountLaunchReward } from './core/launch.js';

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
      <div class="game-hero-bg" style="${bgStyle(img)}" aria-hidden="true"></div>
      <div class="container">
        <div class="rbx-media">
          <div class="game-hero-img" id="heroImg" style="${bgStyle(img)}" aria-hidden="true">${img ? '' : placeholder(game, 'heroPh')}</div>
          <button class="rbx-nav prev hidden" type="button" data-slide="-1" aria-label="Imagen anterior">‹</button>
          <button class="rbx-nav next hidden" type="button" data-slide="1" aria-label="Imagen siguiente">›</button>
          <div class="rbx-dots" id="mediaDots"></div>
        </div>
        <div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            ${statusBadge(game.status)}
            ${game.genre ? html`<span class="badge badge-accent">${game.genre}</span>` : ''}
          </div>
          <h1 class="stroke-title">${game.title}</h1>
          <p class="by">Por <b id="creator">@Aquino Studios</b></p>
          <p class="muted">${game.short_description ?? ''}</p>
          <div class="game-actions">
            ${canPlay
              ? html`<a class="btn btn-play btn-lg btn-wide" href="${robloxGameUrl(game.roblox_place_id)}" target="_blank" rel="noopener">${ICON.play} Jugar</a>`
              : html`<span class="btn btn-lg btn-wide btn-disabled">${game.status === 'en_desarrollo' ? 'En desarrollo' : 'Próximamente'}</span>`}
            <button class="btn btn-ghost fav-btn" id="favBtn" type="button" aria-pressed="false">${ICON.star} Favorito</button>
            <button class="btn btn-ghost" id="shareBtn" type="button">Compartir</button>
          </div>
          <div class="votes hidden" id="votes"></div>
          ${upcoming ? html`
            <div style="margin-top:26px" id="releaseBox">
              <p class="muted small" style="margin-bottom:10px">Sale el <time datetime="${game.release_at}">${fmt.dateTime(game.release_at)}</time></p>
              <count-down to="${game.release_at}"></count-down>
              <button class="link-btn" id="icsBtn" type="button" style="margin-top:12px">+ Agregar a mi calendario</button>
            </div>
            <div id="launchReward" hidden></div>` : ''}
        </div>
      </div>
    </div>

    ${game.roblox_place_id ? html`
      <div class="container">
        <nav class="rbx-tabs" role="tablist" aria-label="Secciones del juego">
          <button role="tab" data-tab="info" aria-selected="true">Información</button>
          <button role="tab" data-tab="tienda" aria-selected="false">Tienda <span class="tab-count" id="countTienda"></span></button>
          <button role="tab" data-tab="servidores" aria-selected="false">Servidores <span class="tab-count" id="countServidores"></span></button>
          <button role="tab" data-tab="insignias" aria-selected="false">Insignias <span class="tab-count" id="countInsignias"></span></button>
        </nav>
      </div>
      <div class="container rbx-panel hidden" data-panel="tienda" role="tabpanel">
        <div class="panel-head"><div><h2>Tienda</h2><p class="muted">Pases del juego. Se compran con Robux adentro de Roblox.</p></div></div>
        <div class="store-grid" id="storeList"><div class="skeleton" style="height:220px"></div><div class="skeleton" style="height:220px"></div><div class="skeleton" style="height:220px"></div></div>
      </div>
      <div class="container rbx-panel hidden" data-panel="servidores" role="tabpanel">
        <div class="panel-head"><div><h2>Servidores</h2><p class="muted">Elegí un servidor y entrá directo.</p></div>
          <button class="btn btn-sm btn-ghost" id="refreshServers" type="button">Actualizar</button></div>
        <div class="server-list" id="serverList"><div class="skeleton" style="height:70px"></div><div class="skeleton" style="height:70px"></div></div>
      </div>
      <div class="container rbx-panel hidden" data-panel="insignias" role="tabpanel">
        <div class="panel-head"><div><h2>Insignias</h2><p class="muted">Logros que podés ganar jugando.</p></div></div>
        <div class="badge-list" id="badgeList"><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:90px"></div></div>
      </div>` : ''}

    <div class="container rbx-panel" data-panel="info" style="padding:28px 0 80px">
      <div class="rbx-stats hidden" id="statRow"></div>
      <div class="two-col">
        <div class="stack">
          ${game.youtube_id ? html`<lite-youtube videoid="${game.youtube_id}"></lite-youtube>` : ''}
          <section class="card hidden" id="galleryCard" aria-labelledby="galTitle" style="padding:28px">
            <h2 id="galTitle">Galería</h2>
            <div class="gallery" id="gallery"></div>
          </section>
          <section class="card hidden" id="recordsCard" aria-labelledby="recTitle" style="padding:28px">
            <div class="panel-head" style="margin-bottom:12px"><div><h2 id="recTitle" style="margin:0">Récords</h2>
              <p class="muted small" style="margin:4px 0 0">Datos que manda el juego en vivo desde Roblox.</p></div>
              <div class="chips" id="recSort" role="group" aria-label="Ordenar récords">
                <button class="chip active" type="button" data-sort="stage">Etapa</button>
                <button class="chip" type="button" data-sort="time">Tiempo</button>
                <button class="chip" type="button" data-sort="wins">Victorias</button>
              </div></div>
            <div class="rec-summary" id="recSummary"></div>
            <div class="table-wrap"><table class="rec-table">
              <thead><tr><th>#</th><th>Jugador</th><th>Etapa</th><th>Mejor tiempo</th><th>Victorias</th><th>Muertes</th></tr></thead>
              <tbody id="recList"></tbody></table></div>
            <p class="small muted" id="recMine" style="margin:10px 0 0"></p>
          </section>
          <section class="card" aria-labelledby="comTitle" style="padding:28px">
            <h2 id="comTitle">Comentarios <span class="muted" id="commentCount"></span> <span class="live-dot hidden" id="liveDot" title="Se actualiza solo">en vivo</span></h2>
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
          <aside class="card hidden" id="codesCard">
            <h3>Códigos</h3>
            <p class="muted small">Canjealos adentro del juego para ganar recompensas.</p>
            <div class="codes" id="gameCodes" style="grid-template-columns:1fr"></div>
          </aside>
          <div class="polls hidden" id="gamePolls" style="grid-template-columns:1fr"></div>
          <aside class="card hidden" id="changelogCard">
            <h3>Registro de cambios</h3>
            <div class="changelog" id="changelog"></div>
          </aside>
          <aside class="card">
            <h3>Sugerencias y bugs</h3>
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

  mountLaunchReward(game, $('#launchReward'), $('#releaseBox count-down'));
  $('#releaseBox count-down')?.addEventListener('end', () => $('#releaseBox').remove());
  $('#icsBtn')?.addEventListener('click', () => {
    download(`${game.slug}-lanzamiento.ics`, releaseIcs(game, location.href), 'text/calendar');
    toast('Abrí el archivo para agregarlo a tu calendario');
  });

  setupStats(game);
  setupTabs(game);
  setupShare(game);
  setupFavorite(game);
  setupComments(game);
  setupReport(game);
  loadGallery(game);
  loadChangelog(game);
  loadNews(game);
  loadCodes(game);
  loadRecords(game);
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
  if (s.creator) $('#creator').textContent = `@${s.creator}`;
  // Barra de votos (me gusta / no me gusta) como en Roblox
  const like = likePct(s);
  if (like !== null) {
    render($('#votes'), html`
      <span class="vote up" title="Me gusta">${ICON.thumb} ${fmt.number(s.upVotes)}</span>
      <div class="vote-bar" role="img" aria-label="${like}% de votos positivos"><span style="width:${like}%"></span></div>
      <span class="vote down" title="No me gusta">${ICON.thumb} ${fmt.number(s.downVotes)}</span>`);
    $('#votes').classList.remove('hidden');
  }
  const cells = [
    ['Activos', fmt.number(s.playing)], ['Favoritos', fmt.number(s.favorites)], ['Visitas', fmt.number(s.visits)],
    ['Creado', s.created ? fmt.date(s.created) : null], ['Actualizado', s.updated ? fmt.ago(s.updated) : null],
    ['Tamaño del servidor', s.maxPlayers ? `${s.maxPlayers} jugadores` : null], ['Género', s.genre && s.genre !== 'All' ? s.genre : game.genre],
    ['Me gusta', like === null ? null : `${like}%`],
  ].filter(([, v]) => v);
  render($('#statRow'), cells.map(([l, v]) => html`<div class="stat"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`));
  $('#statRow').classList.remove('hidden');
}

// ---------- Pestañas estilo Roblox: Información / Tienda / Servidores / Insignias ----------
const RARITY = [[90, 'Regalo'], [80, 'Pan comido'], [50, 'Fácil'], [30, 'Moderada'], [20, 'Desafiante'], [10, 'Difícil'], [5, 'Extrema'], [1, 'Demencial'], [0, 'Imposible']];
function setupTabs(game) {
  if (!game.roblox_place_id) return;
  let details;
  const load = (force = false) => {
    if (force) details = null;
    details ??= fetchRobloxDetails(game.roblox_place_id);
    return details;
  };
  const open = (name, { scroll = true } = {}) => {
    if (!['info', 'tienda', 'servidores', 'insignias'].includes(name)) name = 'info';
    transition(() => {
      $$('.rbx-tabs [data-tab]').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name));
      $$('.rbx-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
    });
    if (scroll) $('.rbx-tabs').scrollIntoView({ block: 'nearest' });
  };
  on($('.rbx-tabs'), 'click', '[data-tab]', (e, t) => {
    history.replaceState(null, '', t.dataset.tab === 'info' ? location.pathname + location.search : `#${t.dataset.tab}`);
    open(t.dataset.tab);
  });
  // Flechas del teclado entre pestañas
  $('.rbx-tabs').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = $$('.rbx-tabs [data-tab]');
    const i = tabs.indexOf(document.activeElement);
    tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].click();
    tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length].focus();
  });
  open(location.hash.slice(1), { scroll: false });

  const empty = (text) => html`<div class="empty" style="grid-column:1/-1">${text}</div>`;
  const paint = (d) => {
    if (!d) {
      const msg = empty('No pudimos traer los datos de Roblox ahora. Probá en un rato.');
      ['#storeList', '#serverList', '#badgeList'].forEach((sel) => render($(sel), msg));
      return;
    }
    // Carrusel de imágenes de Roblox en la portada
    mediaCarousel(game, d.images ?? []);
    // Tienda
    $('#countTienda').textContent = d.passes.length || '';
    render($('#storeList'), d.passes.length ? d.passes.map((p) => html`
      <a class="store-item" href="${robloxPassUrl(p.id)}" target="_blank" rel="noopener">
        <div class="store-icon">${safeUrl(p.icon) ? html`<img src="${p.icon}" alt="" loading="lazy">` : ROBUX}</div>
        <b>${p.name}</b>
        ${p.price != null ? html`<span class="price">${ROBUX} ${fmt.fullNumber(p.price)}</span>` : html`<span class="muted small">No está a la venta</span>`}
        <span class="btn btn-sm ${p.price != null ? 'btn-play' : 'btn-ghost'} btn-block">${p.price != null ? 'Comprar' : 'Ver'}</span>
      </a>`) : empty('Este juego todavía no tiene pases a la venta.'));
    // Servidores
    $('#countServidores').textContent = d.servers.length || '';
    render($('#serverList'), d.servers.length ? d.servers.map((sv, i) => html`
      <div class="server">
        <div class="server-info">
          <b>Servidor ${i + 1}</b>
          <span class="muted small">${sv.playing} de ${sv.maxPlayers} jugadores${sv.ping ? html` · ${sv.ping} ms` : ''}</span>
          <div class="server-bar"><span style="width:${sv.maxPlayers ? Math.round((sv.playing / sv.maxPlayers) * 100) : 0}%"></span></div>
        </div>
        ${sv.playing >= sv.maxPlayers
          ? html`<span class="btn btn-sm btn-disabled">Lleno</span>`
          : html`<a class="btn btn-sm btn-play" href="${robloxServerUrl(game.roblox_place_id, sv.id)}" target="_blank" rel="noopener">${ICON.play} Unirse</a>`}
      </div>`) : empty('No hay servidores abiertos ahora. ¡Tocá Jugar y abrí uno!'));
    // Insignias
    $('#countInsignias').textContent = d.badges.length || '';
    render($('#badgeList'), d.badges.length ? d.badges.map((b) => {
      const pct = b.rate == null ? null : b.rate <= 1 ? b.rate * 100 : b.rate;
      const rarity = pct == null ? null : RARITY.find(([min]) => pct >= min)[1];
      return html`
        <a class="badge-item" href="${robloxBadgeUrl(b.id)}" target="_blank" rel="noopener">
          <div class="badge-icon">${safeUrl(b.icon) ? html`<img src="${b.icon}" alt="" loading="lazy">` : ''}</div>
          <div class="badge-text">
            <b>${b.name}</b>
            ${b.description ? html`<p>${b.description}</p>` : ''}
          </div>
          <div class="badge-stats">
            ${rarity ? html`<span><small>Rareza</small><b>${pct < 0.1 ? '<0.1' : pct.toFixed(1)}% · ${rarity}</b></span>` : ''}
            <span><small>Ganada</small><b>${fmt.number(b.awarded)} veces</b></span>
          </div>
        </a>`;
    }) : empty('Este juego todavía no tiene insignias.'));
  };
  load().then(paint);
  $('#refreshServers').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    memo.set(`rdetails:${game.roblox_place_id}`, null);
    paint(await load(true));
    toast('Servidores actualizados');
  }));
}

// Carrusel de la portada del juego: imagen propia + capturas de Roblox (flechas, puntos, teclado y deslizar)
function mediaCarousel(game, robloxImages) {
  const own = gameImage(game);
  const slides = [...new Set([own, ...robloxImages].filter((u) => safeUrl(u)))];
  if (slides.length < 2) {
    if (!own && slides[0]) { $('#heroImg').style.backgroundImage = $('.game-hero-bg').style.backgroundImage = cssUrl(slides[0]); $('#heroPh')?.remove(); }
    return;
  }
  let i = 0;
  const show = (n) => {
    i = (n + slides.length) % slides.length;
    $('#heroImg').style.backgroundImage = cssUrl(slides[i]);
    $('#heroPh')?.remove();
    $$('#mediaDots button').forEach((d, k) => d.setAttribute('aria-current', k === i));
  };
  render($('#mediaDots'), slides.map((_, k) => html`<button type="button" data-dot="${k}" aria-label="Imagen ${k + 1}"></button>`));
  $$('.rbx-nav').forEach((b) => b.classList.remove('hidden'));
  on($('.rbx-media'), 'click', '[data-slide]', (e, b) => show(i + Number(b.dataset.slide)));
  on($('.rbx-media'), 'click', '[data-dot]', (e, b) => show(Number(b.dataset.dot)));
  let x0 = null;
  $('#heroImg').addEventListener('pointerdown', (e) => (x0 = e.clientX));
  $('#heroImg').addEventListener('pointerup', (e) => { if (x0 !== null && Math.abs(e.clientX - x0) > 40) show(i + (e.clientX < x0 ? 1 : -1)); x0 = null; });
  show(0);
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
    render(btn, html`${ICON.star} ${fav ? 'En favoritos' : 'Favorito'}`);
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
        .select('id, body, created_at, user_id, hidden, profiles(username, avatar_url, role, supporter, roblox_username)')
        .eq('game_id', game.id).order('created_at', { ascending: false }).limit(100);
      loading = null;
      if (error) return render($('#comments'), html`<p class="muted">${errorMsg(error)}</p>`);
      $('#commentCount').textContent = data.length ? `(${data.length})` : '';
      render($('#comments'), data.length ? data.map((c) => html`
        <article class="comment" id="c${c.id}">
          ${avatar(c.profiles, 40)}
          <div class="comment-body">
            <div class="comment-head">
              ${c.profiles?.username ? html`<a class="comment-author" href="${profileUrl(c.profiles.username)}">${c.profiles.username}</a>` : html`<strong>Usuario</strong>`}
              ${c.profiles?.role === 'admin' ? html`<span class="badge badge-accent">Staff</span>` : ''}
              ${c.profiles?.supporter ? html`<span class="badge badge-supporter" title="Apoyó al estudio con una donación">Donador</span>` : ''}
              <time class="muted small" datetime="${c.created_at}" title="${fmt.dateTime(c.created_at)}">${fmt.ago(c.created_at)}</time>
              ${c.hidden ? html`<span class="badge badge-amber">Oculto</span>` : ''}
              ${isAdmin ? html`<button class="link-btn" data-hide="${c.id}" data-val="${!c.hidden}">${c.hidden ? 'Mostrar' : 'Ocultar'}</button>` : ''}
              ${profile && (profile.id === c.user_id || isAdmin) ? html`<button class="link-btn" data-del="${c.id}" style="margin-left:${isAdmin ? '0' : 'auto'}">Borrar</button>` : ''}
            </div>
            <p class="${c.hidden ? 'muted' : ''}" translate="no">${c.body}</p>
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

// ---------- Récords (estadísticas que manda el juego de Roblox) ----------
async function loadRecords(game, sort = 'stage') {
  const SORTS = {
    stage: [['best_stage', false], ['best_time_ms', true]],
    time: [['best_time_ms', true]],
    wins: [['wins', false], ['best_stage', false]],
  };
  let q = sb.from('player_stats').select('roblox_user_id, roblox_username, display_name, best_stage, best_time_ms, wins, deaths, playtime_s').eq('game_id', game.id);
  if (sort === 'time') q = q.not('best_time_ms', 'is', null);
  for (const [col, asc] of SORTS[sort]) q = q.order(col, { ascending: asc, nullsFirst: false });
  const [{ data, error }, { data: sum }] = await Promise.all([q.limit(50), sort === 'stage' ? sb.rpc('player_stats_summary', { p_game_id: game.id }) : { data: null }]);
  if (error || (!data?.length && sort === 'stage')) return; // todavía no hay datos (o no se corrió el schema nuevo)
  const card = $('#recordsCard');
  const firstTime = card.classList.contains('hidden');
  card.classList.remove('hidden');
  if (sum) {
    render($('#recSummary'), [
      ['Jugadores', fmt.fullNumber(sum.players)], ['Victorias', fmt.fullNumber(sum.wins)],
      ['Muertes', fmt.fullNumber(sum.deaths)], ['Horas jugadas', fmt.fullNumber(Math.round(sum.playtime_s / 3600))],
    ].map(([k, v]) => html`<div><b>${v}</b><span>${k}</span></div>`));
  }
  const mine = profile?.roblox_username?.toLowerCase();
  render($('#recList'), data.length ? data.map((r, i) => html`
    <tr class="${r.roblox_username.toLowerCase() === mine ? 'is-me' : ''}">
      <td class="rec-pos">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
      <td><a class="rec-player" href="https://www.roblox.com/users/${r.roblox_user_id}/profile" target="_blank" rel="noopener">
        ${avatar({ username: r.roblox_username, roblox_username: r.roblox_username }, 28)}
        <span>${r.display_name && r.display_name !== r.roblox_username ? html`${r.display_name} <small class="muted">@${r.roblox_username}</small>` : r.roblox_username}</span></a></td>
      <td>${fmt.fullNumber(r.best_stage)}</td><td class="mono">${fmt.runTime(r.best_time_ms)}</td>
      <td>${fmt.fullNumber(r.wins)}</td><td>${fmt.fullNumber(r.deaths)}</td>
    </tr>`) : html`<tr><td colspan="6" class="muted">Todavía nadie terminó el juego. ¡Podés ser el primero!</td></tr>`);
  const inTop = mine && data.some((r) => r.roblox_username.toLowerCase() === mine);
  $('#recMine').textContent = profile && !profile.roblox_username
    ? 'Poné tu usuario de Roblox en Mi cuenta para que tu fila se resalte.'
    : mine && !inTop && sort === 'stage' ? 'Todavía no estás en el top 50. ¡Seguí jugando!' : '';
  if (firstTime) on($('#recSort'), 'click', '[data-sort]', (e, b) => {
    for (const c of $$('#recSort .chip')) c.classList.toggle('active', c === b);
    loadRecords(game, b.dataset.sort);
  });
}

// ---------- Códigos del juego ----------
async function loadCodes(game) {
  const { data } = await sb.from('game_codes').select('*').eq('game_id', game.id).eq('active', true).order('created_at', { ascending: false });
  const now = Date.now();
  const list = (data ?? []).filter((c) => !c.expires_at || new Date(c.expires_at) > now);
  if (!list.length) return;
  render($('#gameCodes'), list.map((c) => codeCard(c)));
  $('#codesCard').classList.remove('hidden');
  on($('#gameCodes'), 'click', '[data-code]', async (e, b) => {
    try { await navigator.clipboard.writeText(b.dataset.code); } catch { /* sin permiso */ }
    b.closest('.code-card').classList.add('copied');
    toast(`Código ${b.dataset.code} copiado`);
  });
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
