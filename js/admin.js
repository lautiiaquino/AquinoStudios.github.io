import './core/components.js';
import { html, render, safeUrl } from './core/html.js';
import { $, $$, on, transition, download } from './core/dom.js';
import { sb } from './core/supabase.js';
import { requireAuth } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { uploadImage } from './core/images.js';
import { toast, busy, say, ask, errorMsg } from './core/ui.js';
import { REPORT_STATUS, REPORT_KIND, avatar, statusBadge, gameUrl, youtubeId } from './core/view.js';
import * as fmt from './core/format.js';

await renderLayout();
const me = await requireAuth({ admin: true });
if (!me) throw new Error('sin permiso');
$('#page').classList.remove('hidden');

// ---------- Utilidades del panel ----------
on(document, 'click', '[data-close]', (e, b) => b.closest('dialog').close());

// <input type="datetime-local"> usa hora local sin zona; la base guarda UTC.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const val = (id) => $(`#${id}`).value.trim();
const emptyRow = (cols, text) => html`<tr><td colspan="${cols}" class="muted center">${text}</td></tr>`;

// CSV para abrir en Excel / Google Sheets (con BOM para que respete las tildes)
function exportCsv(filename, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  download(filename, '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}

// Todas las zonas <image-drop> suben a Supabase Storage (comprimiendo antes)
$$('image-drop').forEach((drop) => { drop.uploader = (file) => uploadImage(file, drop.getAttribute('folder') ?? 'otros'); });
document.addEventListener('uploaded', (e) => e.target.id !== 'mediaDrop' && toast('Imagen subida'));
document.addEventListener('uploaderror', (e) => toast(errorMsg(e.detail), 'error'));

// Lista de juegos para los <select>
let gameOptions = [];
async function loadGameOptions() {
  const { data } = await sb.from('games').select('id, title').order('title');
  gameOptions = data ?? [];
}
const gameSelect = (emptyLabel) => html`<option value="">${emptyLabel}</option>${gameOptions.map((g) => html`<option value="${g.id}">${g.title}</option>`)}`;

// ---------- Secciones por #hash (el botón "atrás" funciona) ----------
const loaders = {
  stats: loadStats, juegos: loadGames, noticias: loadNews, encuestas: loadPolls, reportes: loadReports,
  comentarios: loadComments, usuarios: loadUsers, equipo: loadTeam, mensajes: loadMessages,
};
function route() {
  const name = loaders[location.hash.slice(1)] ? location.hash.slice(1) : 'stats';
  transition(() => {
    $$('#sideNav a').forEach((a) => { a.classList.toggle('active', a.dataset.sec === name); a.toggleAttribute('aria-current', a.dataset.sec === name); });
    $$('section[data-sec]').forEach((s) => s.classList.toggle('hidden', s.dataset.sec !== name));
  });
  loaders[name]();
}
addEventListener('hashchange', route);

// Tecla "/" para ir al buscador de la sección
addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.target.matches('input, textarea, select') || $('dialog[open]')) return;
  const search = $('section[data-sec]:not(.hidden) input[type=search]');
  if (search) { e.preventDefault(); search.focus(); }
});

// =====================================================================
// ESTADÍSTICAS
// =====================================================================
async function loadStats() {
  const { data, error } = await sb.rpc('admin_stats');
  if (error) {
    return render($('#statTiles'), html`<div class="empty" style="grid-column:1/-1">${errorMsg(error)}<br><span class="small">¿Ejecutaste el archivo <code>supabase/schema.sql</code> actualizado?</span></div>`);
  }
  const t = data.totals;
  render($('#statTiles'), [
    [t.members, 'Miembros'], [t.new_7d, 'Nuevos (7 días)'], [t.comments, 'Comentarios'], [t.favorites, 'Favoritos'],
    [t.votes, 'Votos'], [t.suggestions_open, 'Reportes abiertos'], [t.banned, 'Suspendidos'],
  ].map(([v, l]) => html`<div class="stat"><count-up class="stat-value" value="${v}"></count-up><div class="stat-label">${l}</div></div>`));

  // Registros por día: una sola serie, con tooltip propio y vista de tabla
  const days = data.signups;
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, d) => a + d.count, 0);
  const label = (d) => fmt.dayMonth(`${d.day}T00:00`);
  $('#signupChart').setAttribute('aria-label', `Registros por día en los últimos 30 días: ${total} en total`);
  render($('#signupChart'), days.map((d) => html`
    <div style="height:${(d.count / max) * 100}%" data-tip="${label(d)}: ${fmt.plural(d.count, 'registro', 'registros')}"></div>`));
  render($('#signupAxis'), html`<span>${label(days[0])}</span><span>Total: ${total} · Máx: ${max}</span><span>${label(days.at(-1))}</span>`);
  const withData = days.filter((d) => d.count).reverse();
  render($('#signupTable'), html`<table><thead><tr><th>Día</th><th>Registros</th></tr></thead><tbody>
    ${withData.length ? withData.map((d) => html`<tr><td>${label(d)}</td><td>${d.count}</td></tr>`) : emptyRow(2, 'Sin registros en este período.')}</tbody></table>`);

  const bars = (el, rows, unit) => {
    const top = Math.max(1, ...rows.map((r) => r.count));
    render(el, rows.length ? rows.map((r) => html`
      <div class="bar-row" data-tip="${r.title}: ${fmt.plural(r.count, unit[0], unit[1])}">
        <span class="label">${r.title}</span>
        <div class="bar-track"><span style="width:${(r.count / top) * 100}%"></span></div>
        <span class="val">${r.count}</span>
      </div>`) : html`<p class="muted">Todavía no hay datos.</p>`);
  };
  bars($('#topFavs'), data.top_favorites, ['favorito', 'favoritos']);
  bars($('#topComments'), data.top_comments, ['comentario', 'comentarios']);
}
$('#refreshStats').addEventListener('click', loadStats);

// Tooltip que sigue al mouse para los gráficos
const tip = Object.assign(document.createElement('div'), { className: 'chart-tip', role: 'tooltip' });
document.body.append(tip);
on(document, 'pointerover', '[data-tip]', (e, el) => { tip.textContent = el.dataset.tip; tip.classList.add('on'); });
on(document, 'pointerout', '[data-tip]', () => tip.classList.remove('on'));
document.addEventListener('pointermove', (e) => {
  if (!tip.classList.contains('on')) return;
  tip.style.transform = `translate(${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)}px, ${e.clientY - 36}px)`;
}, { passive: true });

// =====================================================================
// JUEGOS
// =====================================================================
let games = [];
let editingGame = null;

async function loadGames() {
  const { data, error } = await sb.from('games').select('*').order('sort_order').order('created_at', { ascending: false });
  if (error) return toast(errorMsg(error), 'error');
  games = data;
  const now = new Date();
  render($('#gamesBody'), games.length ? games.map((g) => html`
    <tr>
      <td>${safeUrl(g.thumbnail_url) ? html`<img class="thumb-sm" src="${g.thumbnail_url}" alt="" loading="lazy">` : html`<div class="thumb-sm"></div>`}</td>
      <td><a href="${gameUrl(g.slug)}" target="_blank">${g.title}</a>
        ${g.featured ? html` <span class="badge badge-accent">Destacado</span>` : ''}${g.youtube_id ? html` <span class="badge">Video</span>` : ''}</td>
      <td>${statusBadge(g.status)}</td>
      <td class="muted small">${g.release_at ? `${new Date(g.release_at) > now ? 'Sale: ' : ''}${fmt.date(g.release_at)}` : '—'}</td>
      <td>${g.sort_order}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" data-content="${g.id}">Galería y cambios</button>
        <button class="btn btn-sm btn-ghost" data-edit="${g.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del="${g.id}">Borrar</button>
      </div></td>
    </tr>`) : emptyRow(6, 'No hay juegos. Creá el primero.'));
}

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
$('#gTitle').addEventListener('input', (e) => { if (!editingGame) $('#gSlug').value = slugify(e.target.value); });

function openGameDialog(game = null) {
  editingGame = game;
  $('#gameDialogTitle').textContent = game ? 'Editar juego' : 'Nuevo juego';
  const set = { gTitle: game?.title, gSlug: game?.slug, gStatus: game?.status ?? 'publicado', gGenre: game?.genre, gPlace: game?.roblox_place_id,
    gOrder: game?.sort_order ?? 0, gRelease: toLocalInput(game?.release_at), gYoutube: game?.youtube_id ? `https://youtu.be/${game.youtube_id}` : '',
    gThumb: game?.thumbnail_url, gShort: game?.short_description, gDesc: game?.description };
  for (const [id, v] of Object.entries(set)) $(`#${id}`).value = v ?? '';
  $('#gThumb').dispatchEvent(new Event('input'));
  $('#gFeatured').checked = game?.featured ?? false;
  say($('#gameForm'), '');
  $('#gameDialog').showModal();
}
$('#newGame').addEventListener('click', () => openGameDialog());
on($('#gamesBody'), 'click', '[data-edit]', (e, b) => openGameDialog(games.find((g) => g.id == b.dataset.edit)));
on($('#gamesBody'), 'click', '[data-content]', (e, b) => openContentDialog(games.find((g) => g.id == b.dataset.content)));
on($('#gamesBody'), 'click', '[data-del]', async (e, b) => {
  const g = games.find((x) => x.id == b.dataset.del);
  if (!(await ask(`¿Borrar "${g.title}"? También se borran sus comentarios, favoritos, galería, cambios y encuestas.`, { ok: 'Borrar', danger: true }))) return;
  const { error } = await sb.from('games').delete().eq('id', g.id);
  if (error) return toast(errorMsg(error), 'error');
  toast('Juego borrado');
  loadGames();
  loadGameOptions();
});

$('#gameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const place = val('gPlace');
  const thumb = val('gThumb');
  const yt = val('gYoutube');
  const row = {
    title: val('gTitle'), slug: val('gSlug'), status: $('#gStatus').value, genre: val('gGenre') || null,
    roblox_place_id: place ? Number(place) : null, sort_order: parseInt($('#gOrder').value, 10) || 0,
    release_at: fromLocalInput($('#gRelease').value), youtube_id: yt ? youtubeId(yt) : null, thumbnail_url: thumb || null,
    short_description: val('gShort') || null, description: val('gDesc') || null, featured: $('#gFeatured').checked,
  };
  if (!row.title) return say(form, 'El título es obligatorio.');
  if (!/^[a-z0-9-]{1,80}$/.test(row.slug)) return say(form, 'El identificador solo puede tener minúsculas, números y guiones.');
  if (place && !/^\d{1,18}$/.test(place)) return say(form, 'El Place ID tiene que ser un número.');
  if (yt && !row.youtube_id) return say(form, 'No reconozco ese link de YouTube. Pegá el link del video (youtube.com/watch?v=... o youtu.be/...).');
  if (thumb && !safeUrl(thumb)) return say(form, 'La URL de la imagen tiene que empezar con https://');

  await busy(form.querySelector('[type=submit]'), async () => {
    // Solo puede haber un juego destacado
    if (row.featured) await sb.from('games').update({ featured: false }).eq('featured', true).neq('id', editingGame?.id ?? -1);
    const { error } = editingGame
      ? await sb.from('games').update(row).eq('id', editingGame.id)
      : await sb.from('games').insert(row);
    if (error) return say(form, errorMsg(error));
    $('#gameDialog').close();
    toast(editingGame ? 'Juego actualizado' : 'Juego creado');
    loadGames();
    loadGameOptions();
  });
});

// ---------- Galería (con orden por arrastrar y soltar) y registro de cambios ----------
let contentGame = null;
let media = [];
let updates = [];
let editingUpdate = null;

function openContentPanel(name) {
  transition(() => {
    $$('[data-ctab]').forEach((t) => { t.classList.toggle('active', t.dataset.ctab === name); t.setAttribute('aria-selected', t.dataset.ctab === name); });
    $$('[data-cpanel]').forEach((p) => p.classList.toggle('hidden', p.dataset.cpanel !== name));
  });
}
on(document, 'click', '[data-ctab]', (e, t) => openContentPanel(t.dataset.ctab));

function openContentDialog(game) {
  contentGame = game;
  $('#contentTitle').textContent = game.title;
  openContentPanel('galeria');
  resetUpdateForm();
  say($('#mediaForm'), '');
  $('#mediaDrop').setAttribute('folder', `galeria/${game.id}`);
  loadMedia();
  loadUpdates();
  $('#contentDialog').showModal();
}

async function loadMedia() {
  const { data, error } = await sb.from('game_media').select('*').eq('game_id', contentGame.id).order('sort_order').order('id');
  if (error) return render($('#mediaGrid'), html`<p class="muted">${errorMsg(error)}</p>`);
  media = data;
  render($('#mediaGrid'), media.length ? media.map((m) => html`
    <figure draggable="true" data-id="${m.id}" title="${m.caption ?? ''}">
      <img src="${safeUrl(m.url)}" alt="${m.caption ?? ''}" loading="lazy" draggable="false">
      <button class="btn btn-sm btn-danger" type="button" data-del-media="${m.id}" aria-label="Borrar imagen">✕</button>
    </figure>`) : html`<p class="muted" style="grid-column:1/-1">Todavía no hay imágenes en la galería.</p>`);
}

async function addMedia(urls) {
  const caption = val('mCaption') || null;
  const base = media.length;
  const { error } = await sb.from('game_media').insert(urls.map((url, i) => ({ game_id: contentGame.id, url, caption, sort_order: base + i })));
  if (error) throw error;
}

$('#mediaDrop').addEventListener('uploaded', async (e) => {
  try {
    await addMedia(e.detail.urls);
    $('#mCaption').value = '';
    toast(e.detail.urls.length > 1 ? 'Imágenes agregadas' : 'Imagen agregada');
    loadMedia();
  } catch (err) {
    say($('#mediaForm'), errorMsg(err));
  }
});

$('#mediaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const url = val('mUrl');
  if (!safeUrl(url)) return say(form, 'Pegá un link que empiece con https:// o soltá imágenes en la zona de arriba.');
  await busy(form.querySelector('[type=submit]'), async () => {
    try { await addMedia([url]); } catch (err) { return say(form, errorMsg(err)); }
    form.reset();
    say(form, '');
    toast('Imagen agregada');
    loadMedia();
  });
});

on($('#mediaGrid'), 'click', '[data-del-media]', async (e, b) => {
  if (!(await ask('¿Sacar esta imagen de la galería?', { ok: 'Sacar', danger: true }))) return;
  const { error } = await sb.from('game_media').delete().eq('id', b.dataset.delMedia);
  if (error) return toast(errorMsg(error), 'error');
  loadMedia();
});

// Reordenar con Drag and Drop de HTML5
let dragged = null;
on($('#mediaGrid'), 'dragstart', 'figure', (e, fig) => { dragged = fig; fig.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
on($('#mediaGrid'), 'dragend', 'figure', (e, fig) => { fig.classList.remove('dragging'); dragged = null; });
on($('#mediaGrid'), 'dragover', 'figure', (e, fig) => {
  if (!dragged || fig === dragged) return;
  e.preventDefault();
  const r = fig.getBoundingClientRect();
  fig.parentNode.insertBefore(dragged, e.clientX < r.left + r.width / 2 ? fig : fig.nextSibling);
});
on($('#mediaGrid'), 'drop', 'figure', async (e) => {
  e.preventDefault();
  const order = $$('#mediaGrid figure').map((f) => Number(f.dataset.id));
  const changed = order.map((id, i) => ({ id, i })).filter(({ id, i }) => media.find((m) => m.id === id)?.sort_order !== i);
  if (!changed.length) return;
  const results = await Promise.all(changed.map(({ id, i }) => sb.from('game_media').update({ sort_order: i }).eq('id', id)));
  const failed = results.find((r) => r.error);
  if (failed) return toast(errorMsg(failed.error), 'error');
  toast('Orden guardado');
  loadMedia();
});

async function loadUpdates() {
  const { data, error } = await sb.from('game_updates').select('*').eq('game_id', contentGame.id).order('created_at', { ascending: false });
  if (error) return render($('#updatesList'), html`<p class="muted">${errorMsg(error)}</p>`);
  updates = data;
  render($('#updatesList'), updates.length ? updates.map((u) => html`
    <div class="log-item">
      <h4>${u.version ? html`<span class="ver">${u.version}</span>` : ''}${u.title}</h4>
      <span class="muted small">${fmt.date(u.created_at)}</span>
      ${u.body ? html`<p>${u.body}</p>` : ''}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-sm btn-ghost" data-edit-update="${u.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del-update="${u.id}">Borrar</button>
      </div>
    </div>`) : html`<p class="muted">Todavía no hay cambios publicados para este juego.</p>`);
}

function resetUpdateForm() {
  editingUpdate = null;
  $('#updateForm').reset();
  say($('#updateForm'), '');
  $('#uSubmit').textContent = 'Publicar cambio';
  $('#uCancel').classList.add('hidden');
}
$('#uCancel').addEventListener('click', resetUpdateForm);
on($('#updatesList'), 'click', '[data-edit-update]', (e, b) => {
  editingUpdate = updates.find((u) => u.id == b.dataset.editUpdate);
  $('#uVersion').value = editingUpdate.version ?? '';
  $('#uTitle').value = editingUpdate.title;
  $('#uBody').value = editingUpdate.body ?? '';
  $('#uSubmit').textContent = 'Guardar cambios';
  $('#uCancel').classList.remove('hidden');
  $('#uTitle').focus();
});
on($('#updatesList'), 'click', '[data-del-update]', async (e, b) => {
  if (!(await ask('¿Borrar esta entrada del registro de cambios?', { ok: 'Borrar', danger: true }))) return;
  const { error } = await sb.from('game_updates').delete().eq('id', b.dataset.delUpdate);
  if (error) return toast(errorMsg(error), 'error');
  if (editingUpdate?.id == b.dataset.delUpdate) resetUpdateForm();
  loadUpdates();
});

$('#updateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const row = { version: val('uVersion') || null, title: val('uTitle'), body: val('uBody') || null };
  if (!row.title) return say(form, 'El título es obligatorio.');
  await busy($('#uSubmit'), async () => {
    const { error } = editingUpdate
      ? await sb.from('game_updates').update(row).eq('id', editingUpdate.id)
      : await sb.from('game_updates').insert({ ...row, game_id: contentGame.id });
    if (error) return say(form, errorMsg(error));
    toast(editingUpdate ? 'Cambio actualizado' : 'Cambio publicado');
    resetUpdateForm();
    loadUpdates();
  });
});

// =====================================================================
// NOTICIAS
// =====================================================================
let news = [];
let editingNews = null;

async function loadNews() {
  const { data, error } = await sb.from('news').select('*, games(title)').order('created_at', { ascending: false });
  if (error) return toast(errorMsg(error), 'error');
  news = data;
  render($('#nGame'), gameSelect('— Ninguno —'));
  render($('#newsBody'), news.length ? news.map((n) => html`
    <tr>
      <td>${n.title}</td>
      <td>${n.games?.title ?? '—'}</td>
      <td>${n.published ? html`<span class="badge badge-green">Publicada</span>` : html`<span class="badge badge-amber">Borrador</span>`}</td>
      <td class="muted">${fmt.date(n.created_at)}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" data-edit="${n.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del="${n.id}">Borrar</button>
      </div></td>
    </tr>`) : emptyRow(5, 'No hay noticias.'));
}

function openNewsDialog(n = null) {
  editingNews = n;
  $('#newsDialogTitle').textContent = n ? 'Editar noticia' : 'Nueva noticia';
  $('#nTitle').value = n?.title ?? '';
  $('#nBody').value = n?.body ?? '';
  $('#nGame').value = n?.game_id ?? '';
  $('#nImage').value = n?.image_url ?? '';
  $('#nImage').dispatchEvent(new Event('input'));
  $('#nPublished').checked = n?.published ?? true;
  say($('#newsForm'), '');
  $('#newsDialog').showModal();
}
$('#newNews').addEventListener('click', () => openNewsDialog());
on($('#newsBody'), 'click', '[data-edit]', (e, b) => openNewsDialog(news.find((n) => n.id == b.dataset.edit)));
on($('#newsBody'), 'click', '[data-del]', async (e, b) => {
  if (!(await ask('¿Borrar esta noticia?', { ok: 'Borrar', danger: true }))) return;
  const { error } = await sb.from('news').delete().eq('id', b.dataset.del);
  if (error) return toast(errorMsg(error), 'error');
  toast('Noticia borrada');
  loadNews();
});

$('#newsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const image = val('nImage');
  const row = { title: val('nTitle'), body: val('nBody'), game_id: $('#nGame').value ? Number($('#nGame').value) : null,
    image_url: image || null, published: $('#nPublished').checked };
  if (!row.title || !row.body) return say(form, 'Título y contenido son obligatorios.');
  if (image && !safeUrl(image)) return say(form, 'La URL de la imagen tiene que empezar con https://');
  await busy(form.querySelector('[type=submit]'), async () => {
    const { error } = editingNews
      ? await sb.from('news').update(row).eq('id', editingNews.id)
      : await sb.from('news').insert({ ...row, author_id: me.id });
    if (error) return say(form, errorMsg(error));
    $('#newsDialog').close();
    toast(editingNews ? 'Noticia actualizada' : 'Noticia publicada');
    loadNews();
  });
});

// =====================================================================
// ENCUESTAS
// =====================================================================
let polls = [];
let editingPoll = null;

async function loadPolls() {
  const { data, error } = await sb.from('polls').select('*, games(title), poll_options(id, label, sort_order)').order('created_at', { ascending: false });
  if (error) return toast(errorMsg(error), 'error');
  polls = data;
  const { data: counts } = polls.length ? await sb.rpc('poll_counts', { ids: polls.map((p) => p.id) }) : { data: [] };
  const byOption = new Map((counts ?? []).map((c) => [c.option_id, Number(c.votes)]));
  const now = new Date();
  render($('#pollsBody'), polls.length ? polls.map((p) => {
    const opts = [...p.poll_options].sort((a, b) => a.sort_order - b.sort_order);
    const total = opts.reduce((a, o) => a + (byOption.get(o.id) ?? 0), 0);
    const closed = !p.active || (p.closes_at && new Date(p.closes_at) <= now);
    return html`
      <tr>
        <td><strong>${p.question}</strong><div class="muted small">${opts.map((o, i) => html`${i ? ' · ' : ''}${o.label}: ${byOption.get(o.id) ?? 0}`)}</div></td>
        <td>${p.games?.title ?? 'Inicio'}</td>
        <td>${total}</td>
        <td>${closed ? html`<span class="badge">Cerrada</span>` : html`<span class="badge badge-green">Abierta</span>`}</td>
        <td><div class="actions">
          <button class="btn btn-sm btn-ghost" data-toggle="${p.id}">${p.active ? 'Cerrar' : 'Abrir'}</button>
          <button class="btn btn-sm btn-ghost" data-edit="${p.id}">Editar</button>
          <button class="btn btn-sm btn-danger" data-del="${p.id}">Borrar</button>
        </div></td>
      </tr>`;
  }) : emptyRow(5, 'No hay encuestas. Creá la primera.'));
}

function openPollDialog(p = null) {
  editingPoll = p;
  $('#pollDialogTitle').textContent = p ? 'Editar encuesta' : 'Nueva encuesta';
  render($('#pGame'), gameSelect('En el inicio (general)'));
  $('#pQuestion').value = p?.question ?? '';
  $('#pOptions').value = p ? [...p.poll_options].sort((a, b) => a.sort_order - b.sort_order).map((o) => o.label).join('\n') : '';
  $('#pOptions').disabled = !!p;
  $('#pOptionsHint').textContent = p ? 'Las opciones no se pueden cambiar después de crear la encuesta (para no mezclar votos). Si querés otras, creá una nueva.' : '';
  $('#pGame').value = p?.game_id ?? '';
  $('#pCloses').value = toLocalInput(p?.closes_at);
  $('#pActive').checked = p?.active ?? true;
  say($('#pollForm'), '');
  $('#pollDialog').showModal();
}
$('#newPoll').addEventListener('click', () => openPollDialog());
on($('#pollsBody'), 'click', '[data-edit]', (e, b) => openPollDialog(polls.find((p) => p.id == b.dataset.edit)));
on($('#pollsBody'), 'click', '[data-toggle]', async (e, b) => {
  const p = polls.find((x) => x.id == b.dataset.toggle);
  const { error } = await sb.from('polls').update({ active: !p.active }).eq('id', p.id);
  if (error) return toast(errorMsg(error), 'error');
  toast(p.active ? 'Encuesta cerrada' : 'Encuesta abierta');
  loadPolls();
});
on($('#pollsBody'), 'click', '[data-del]', async (e, b) => {
  if (!(await ask('¿Borrar esta encuesta y todos sus votos?', { ok: 'Borrar', danger: true }))) return;
  const { error } = await sb.from('polls').delete().eq('id', b.dataset.del);
  if (error) return toast(errorMsg(error), 'error');
  toast('Encuesta borrada');
  loadPolls();
});

$('#pollForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const row = { question: val('pQuestion'), game_id: $('#pGame').value ? Number($('#pGame').value) : null,
    closes_at: fromLocalInput($('#pCloses').value), active: $('#pActive').checked };
  const options = [...new Set($('#pOptions').value.split('\n').map((s) => s.trim()).filter(Boolean))];
  if (!row.question) return say(form, 'Escribí la pregunta.');
  if (!editingPoll && (options.length < 2 || options.length > 8)) return say(form, 'Poné entre 2 y 8 opciones, una por línea.');
  if (options.some((o) => o.length > 100)) return say(form, 'Cada opción puede tener hasta 100 caracteres.');
  await busy(form.querySelector('[type=submit]'), async () => {
    if (editingPoll) {
      const { error } = await sb.from('polls').update(row).eq('id', editingPoll.id);
      if (error) return say(form, errorMsg(error));
    } else {
      const { data, error } = await sb.from('polls').insert(row).select('id').single();
      if (error) return say(form, errorMsg(error));
      const { error: optError } = await sb.from('poll_options').insert(options.map((label, i) => ({ poll_id: data.id, label, sort_order: i })));
      if (optError) { await sb.from('polls').delete().eq('id', data.id); return say(form, errorMsg(optError)); }
    }
    $('#pollDialog').close();
    toast(editingPoll ? 'Encuesta actualizada' : 'Encuesta creada');
    loadPolls();
  });
});

// =====================================================================
// SUGERENCIAS Y BUGS
// =====================================================================
let reports = [];
async function refreshReportsBadge() {
  const { count } = await sb.from('suggestions').select('id', { count: 'exact', head: true }).eq('status', 'nueva');
  render($('#reportsBadge'), count ? html`<span class="badge badge-accent">${count}</span>` : '');
}

async function loadReports() {
  if (!$('#repGame').options.length) render($('#repGame'), gameSelect('Todos los juegos'));
  let q = sb.from('suggestions').select('*, games(title, slug), profiles(username, avatar_url)').order('created_at', { ascending: false }).limit(200);
  const kind = $('#repKind').value;
  const status = $('#repStatus').value;
  const game = $('#repGame').value;
  if (kind) q = q.eq('kind', kind);
  if (status === 'abiertos') q = q.in('status', ['nueva', 'en_revision', 'planeada']);
  else if (status) q = q.eq('status', status);
  if (game) q = q.eq('game_id', game);
  const { data, error } = await q;
  if (error) return render($('#reportsList'), html`<div class="empty">${errorMsg(error)}</div>`);
  reports = data;
  render($('#reportsList'), data.length ? data.map((r) => html`
    <article class="report">
      <div class="report-head">
        <strong>${REPORT_KIND[r.kind]}: ${r.title}</strong>
        <span class="muted small">por ${r.profiles?.username ?? '—'} · ${r.games ? `${r.games.title} · ` : ''}${fmt.ago(r.created_at)}</span>
      </div>
      <p>${r.body}</p>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
        <select data-status="${r.id}" style="width:auto" aria-label="Estado">
          ${Object.entries(REPORT_STATUS).map(([k, v]) => html`<option value="${k}" ${k === r.status ? html`selected` : ''}>${v.label}</option>`)}
        </select>
        <button class="btn btn-sm btn-danger" data-del="${r.id}">Borrar</button>
      </div>
    </article>`) : html`<div class="empty">No hay reportes con estos filtros.</div>`);
  refreshReportsBadge();
}
['#repKind', '#repStatus', '#repGame'].forEach((s) => $(s).addEventListener('change', loadReports));
on($('#reportsList'), 'change', '[data-status]', async (e, sel) => {
  const { error } = await sb.from('suggestions').update({ status: sel.value }).eq('id', sel.dataset.status);
  if (error) return toast(errorMsg(error), 'error');
  toast(`Estado: ${REPORT_STATUS[sel.value].label}`);
  refreshReportsBadge();
});
on($('#reportsList'), 'click', '[data-del]', async (e, b) => {
  if (!(await ask('¿Borrar este reporte?', { ok: 'Borrar', danger: true }))) return;
  const { error } = await sb.from('suggestions').delete().eq('id', b.dataset.del);
  if (error) return toast(errorMsg(error), 'error');
  loadReports();
});
$('#exportReports').addEventListener('click', () => exportCsv('reportes.csv', [
  ['Tipo', 'Título', 'Detalle', 'Estado', 'Juego', 'Usuario', 'Fecha'],
  ...reports.map((r) => [REPORT_KIND[r.kind], r.title, r.body, REPORT_STATUS[r.status]?.label, r.games?.title, r.profiles?.username, r.created_at]),
]));

// =====================================================================
// COMENTARIOS Y PALABRAS PROHIBIDAS
// =====================================================================
let comments = [];

async function loadComments() {
  loadWords();
  const { data, error } = await sb.from('comments')
    .select('id, body, hidden, created_at, user_id, games(title, slug), profiles(username, avatar_url, banned)')
    .order('created_at', { ascending: false }).limit(300);
  if (error) return toast(errorMsg(error), 'error');
  comments = data;
  renderComments();
}

function renderComments() {
  const q = $('#commentSearch').value.trim().toLowerCase();
  const onlyHidden = $('#onlyHidden').checked;
  const list = comments.filter((c) => (!onlyHidden || c.hidden)
    && (!q || c.body.toLowerCase().includes(q) || (c.profiles?.username ?? '').toLowerCase().includes(q)));
  render($('#commentsBody'), list.length ? list.map((c) => html`
    <tr class="${c.hidden ? 'is-muted' : ''}">
      <td><div style="display:flex;align-items:center;gap:8px">${avatar(c.profiles, 28)}<span>${c.profiles?.username ?? '—'}</span>${c.profiles?.banned ? html` <span class="badge badge-amber">Suspendido</span>` : ''}</div></td>
      <td style="max-width:360px;overflow-wrap:anywhere">${c.body}${c.hidden ? html` <span class="badge badge-amber">Oculto</span>` : ''}</td>
      <td>${c.games ? html`<a href="${gameUrl(c.games.slug)}#c${c.id}" target="_blank">${c.games.title}</a>` : '—'}</td>
      <td class="muted small">${fmt.ago(c.created_at)}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" data-hide="${c.id}">${c.hidden ? 'Mostrar' : 'Ocultar'}</button>
        <button class="btn btn-sm btn-danger" data-del="${c.id}">Borrar</button>
      </div></td>
    </tr>`) : emptyRow(5, 'No hay comentarios.'));
}
$('#commentSearch').addEventListener('input', renderComments);
$('#onlyHidden').addEventListener('change', renderComments);
on($('#commentsBody'), 'click', '[data-hide]', async (e, b) => {
  const c = comments.find((x) => x.id == b.dataset.hide);
  const { error } = await sb.from('comments').update({ hidden: !c.hidden }).eq('id', c.id);
  if (error) return toast(errorMsg(error), 'error');
  c.hidden = !c.hidden;
  renderComments();
  toast(c.hidden ? 'Comentario oculto' : 'Comentario visible');
});
on($('#commentsBody'), 'click', '[data-del]', async (e, b) => {
  if (!(await ask('¿Borrar este comentario?', { ok: 'Borrar', danger: true }))) return;
  const { error } = await sb.from('comments').delete().eq('id', b.dataset.del);
  if (error) return toast(errorMsg(error), 'error');
  comments = comments.filter((x) => x.id != b.dataset.del);
  renderComments();
  toast('Comentario borrado');
});

async function loadWords() {
  const { data, error } = await sb.from('banned_words').select('word').order('word');
  if (error) return render($('#wordList'), html`<span class="muted small">${errorMsg(error)}</span>`);
  render($('#wordList'), data.length
    ? data.map((w) => html`<span class="tag">${w.word}<button type="button" data-word="${w.word}" aria-label="Quitar ${w.word}">×</button></span>`)
    : html`<span class="muted small">No hay palabras en la lista.</span>`);
}
$('#wordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  // Se pueden pegar varias a la vez, separadas por coma o espacio
  const words = [...new Set(val('newWord').toLowerCase().split(/[\s,;]+/).filter(Boolean))];
  const bad = words.find((w) => !/^[a-z0-9áéíóúñü]{2,40}$/.test(w));
  if (!words.length || bad) return toast(bad ? `"${bad}" no es válida: de 2 a 40 letras o números.` : 'Escribí una palabra.', 'error');
  const { error } = await sb.from('banned_words').upsert(words.map((word) => ({ word })), { onConflict: 'word', ignoreDuplicates: true });
  if (error) return toast(errorMsg(error), 'error');
  $('#newWord').value = '';
  toast(words.length > 1 ? `${words.length} palabras agregadas` : 'Palabra agregada');
  loadWords();
});
on($('#wordList'), 'click', '[data-word]', async (e, b) => {
  const { error } = await sb.from('banned_words').delete().eq('word', b.dataset.word);
  if (error) return toast(errorMsg(error), 'error');
  loadWords();
});

// =====================================================================
// USUARIOS
// =====================================================================
let users = [];

async function loadUsers() {
  const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) return toast(errorMsg(error), 'error');
  users = data;
  renderUsers();
}

function renderUsers() {
  const q = $('#userSearch').value.trim().toLowerCase();
  const list = users.filter((u) => !q || u.username.toLowerCase().includes(q) || (u.roblox_username ?? '').toLowerCase().includes(q));
  render($('#usersBody'), list.length ? list.map((u) => html`
    <tr class="${u.banned ? 'is-muted' : ''}">
      <td><div style="display:flex;align-items:center;gap:10px">${avatar(u, 32)}<span>${u.username}</span></div></td>
      <td>${u.roblox_username ?? '—'}</td>
      <td>${u.role === 'admin' ? html`<span class="badge badge-accent">Admin</span>` : html`<span class="muted">Usuario</span>`}</td>
      <td>${u.banned ? html`<span class="badge badge-amber" title="${u.banned_reason ?? ''}">Suspendido</span>` : html`<span class="muted">Activo</span>`}</td>
      <td class="muted">${fmt.date(u.created_at)}</td>
      <td><div class="actions">${u.id === me.id ? html`<span class="muted small">Vos</span>` : html`
        ${u.role !== 'admin' ? html`<button class="btn btn-sm ${u.banned ? 'btn-ghost' : 'btn-danger'}" data-ban="${u.id}">${u.banned ? 'Reactivar' : 'Suspender'}</button>` : ''}
        ${!u.banned ? html`<button class="btn btn-sm btn-ghost" data-role="${u.id}">${u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>` : ''}`}
      </div></td>
    </tr>`) : emptyRow(6, 'Sin resultados.'));
}
$('#userSearch').addEventListener('input', renderUsers);

on($('#usersBody'), 'click', '[data-role]', async (e, b) => {
  const u = users.find((x) => x.id === b.dataset.role);
  const role = u.role === 'admin' ? 'user' : 'admin';
  const sure = await ask(role === 'admin' ? `¿Darle permisos de admin a ${u.username}? Va a poder editar todo el sitio.` : `¿Quitarle el admin a ${u.username}?`,
    { ok: role === 'admin' ? 'Hacer admin' : 'Quitar admin', danger: role === 'admin' });
  if (!sure) return;
  const { error } = await sb.from('profiles').update({ role }).eq('id', u.id);
  if (error) return toast(errorMsg(error), 'error');
  u.role = role;
  renderUsers();
  toast('Rol actualizado');
});
on($('#usersBody'), 'click', '[data-ban]', async (e, b) => {
  const u = users.find((x) => x.id === b.dataset.ban);
  let changes;
  if (u.banned) {
    if (!(await ask(`¿Reactivar la cuenta de ${u.username}?`, { ok: 'Reactivar' }))) return;
    changes = { banned: false, banned_reason: null };
  } else {
    const reason = await ask(`¿Por qué suspendés a ${u.username}? Lo va a ver en su cuenta (podés dejarlo vacío).`,
      { ok: 'Suspender', danger: true, input: { placeholder: 'Ej: spam, insultos...', maxlength: 200 } });
    if (reason === null) return;
    changes = { banned: true, banned_reason: reason || null };
  }
  const { error } = await sb.from('profiles').update(changes).eq('id', u.id);
  if (error) return toast(errorMsg(error), 'error');
  Object.assign(u, changes);
  renderUsers();
  toast(u.banned ? 'Usuario suspendido' : 'Usuario reactivado');
});
$('#exportUsers').addEventListener('click', () => exportCsv('usuarios.csv', [
  ['Usuario', 'Roblox', 'Rol', 'Estado', 'Motivo', 'Registro'],
  ...users.map((u) => [u.username, u.roblox_username, u.role, u.banned ? 'Suspendido' : 'Activo', u.banned_reason, u.created_at]),
]));

// =====================================================================
// EQUIPO
// =====================================================================
let team = [];
let editingMember = null;

async function loadTeam() {
  const { data, error } = await sb.from('team_members').select('*').order('sort_order').order('created_at');
  if (error) return toast(errorMsg(error), 'error');
  team = data;
  render($('#teamBody'), team.length ? team.map((m) => html`
    <tr>
      <td>${avatar({ avatar_url: m.avatar_url, username: m.name }, 36)}</td>
      <td>${m.name}</td>
      <td>${m.role_title ?? '—'}</td>
      <td>${m.roblox_username ?? '—'}</td>
      <td>${m.sort_order}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" data-edit="${m.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del="${m.id}">Borrar</button>
      </div></td>
    </tr>`) : emptyRow(6, 'Todavía no agregaste miembros. La sección del inicio queda oculta hasta que agregues el primero.'));
}

function openMemberDialog(m = null) {
  editingMember = m;
  $('#memberDialogTitle').textContent = m ? 'Editar miembro' : 'Nuevo miembro';
  $('#tName').value = m?.name ?? '';
  $('#tRole').value = m?.role_title ?? '';
  $('#tRoblox').value = m?.roblox_username ?? '';
  $('#tOrder').value = m?.sort_order ?? 0;
  $('#tAvatar').value = m?.avatar_url ?? '';
  $('#tAvatar').dispatchEvent(new Event('input'));
  $('#tBio').value = m?.bio ?? '';
  say($('#memberForm'), '');
  $('#memberDialog').showModal();
}
$('#newMember').addEventListener('click', () => openMemberDialog());
on($('#teamBody'), 'click', '[data-edit]', (e, b) => openMemberDialog(team.find((m) => m.id == b.dataset.edit)));
on($('#teamBody'), 'click', '[data-del]', async (e, b) => {
  if (!(await ask('¿Sacar a esta persona del equipo?', { ok: 'Sacar', danger: true }))) return;
  const { error } = await sb.from('team_members').delete().eq('id', b.dataset.del);
  if (error) return toast(errorMsg(error), 'error');
  loadTeam();
});

$('#memberForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const row = { name: val('tName'), role_title: val('tRole') || null, roblox_username: val('tRoblox') || null,
    sort_order: parseInt($('#tOrder').value, 10) || 0, avatar_url: val('tAvatar') || null, bio: val('tBio') || null };
  if (!row.name) return say(form, 'El nombre es obligatorio.');
  if (row.roblox_username && !/^[A-Za-z0-9_]{3,20}$/.test(row.roblox_username)) return say(form, 'Usuario de Roblox inválido.');
  if (row.avatar_url && !safeUrl(row.avatar_url)) return say(form, 'La foto tiene que ser un link https:// (o subila en la zona de abajo).');
  await busy(form.querySelector('[type=submit]'), async () => {
    const { error } = editingMember
      ? await sb.from('team_members').update(row).eq('id', editingMember.id)
      : await sb.from('team_members').insert(row);
    if (error) return say(form, errorMsg(error));
    $('#memberDialog').close();
    toast('Equipo actualizado');
    loadTeam();
  });
});

// =====================================================================
// MENSAJES
// =====================================================================
async function refreshUnread() {
  const { count } = await sb.from('contact_messages').select('id', { count: 'exact', head: true }).eq('is_read', false);
  render($('#unreadBadge'), count ? html`<span class="badge badge-accent">${count}</span>` : '');
}

async function loadMessages() {
  const { data, error } = await sb.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return toast(errorMsg(error), 'error');
  render($('#messagesList'), data.length ? data.map((m) => html`
    <article class="card" style="margin-bottom:14px;${m.is_read ? '' : 'border-color:var(--accent)'}">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><strong>${m.name}</strong> · <a href="mailto:${m.email}">${m.email}</a>${m.is_read ? '' : html` <span class="badge badge-accent">Nuevo</span>`}</div>
        <time class="muted small" datetime="${m.created_at}" title="${fmt.dateTime(m.created_at)}">${fmt.ago(m.created_at)}</time>
      </div>
      <p class="prose" style="margin:12px 0">${m.message}</p>
      <div class="actions" style="display:flex;gap:6px;flex-wrap:wrap">
        <a class="btn btn-sm btn-ghost" href="mailto:${m.email}?subject=${encodeURIComponent('Re: Aquino Studios')}">Responder</a>
        <button class="btn btn-sm btn-ghost" data-copy="${m.email}">Copiar email</button>
        <button class="btn btn-sm btn-ghost" data-read="${m.id}" data-val="${!m.is_read}">${m.is_read ? 'Marcar no leído' : 'Marcar leído'}</button>
        <button class="btn btn-sm btn-danger" data-del="${m.id}">Borrar</button>
      </div>
    </article>`) : html`<div class="empty">No hay mensajes.</div>`);
  refreshUnread();
}
on($('#messagesList'), 'click', '[data-copy]', async (e, b) => { await navigator.clipboard.writeText(b.dataset.copy); toast('Email copiado'); });
on($('#messagesList'), 'click', '[data-read]', async (e, b) => {
  const { error } = await sb.from('contact_messages').update({ is_read: b.dataset.val === 'true' }).eq('id', b.dataset.read);
  if (error) return toast(errorMsg(error), 'error');
  loadMessages();
});
on($('#messagesList'), 'click', '[data-del]', async (e, b) => {
  if (!(await ask('¿Borrar este mensaje?', { ok: 'Borrar', danger: true }))) return;
  const { error } = await sb.from('contact_messages').delete().eq('id', b.dataset.del);
  if (error) return toast(errorMsg(error), 'error');
  toast('Mensaje borrado');
  loadMessages();
});

// ---------- Inicio ----------
await loadGameOptions();
route();
refreshUnread();
refreshReportsBadge();
