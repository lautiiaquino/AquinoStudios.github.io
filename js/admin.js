import {
  sb, $, $$, esc, safeUrl, formatDate, formatNumber, timeAgo, STATUS, REPORT_STATUS, REPORT_KIND, avatarHtml,
  renderLayout, requireAuth, toast, errorMsg, withLoading, youtubeId,
} from './common.js';

await renderLayout();
const me = await requireAuth({ admin: true });
if (!me) throw new Error('sin permiso');
$('#page').classList.remove('hidden');

const show = (form, text, type = 'error') => ($('.msg', form).innerHTML = text ? `<div class="form-msg ${type}">${esc(text)}</div>` : '');
$$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// Fechas: <input type="datetime-local"> usa hora local sin zona; la base guarda UTC.
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

// Lista de juegos para los <select> (se recarga cuando cambian)
let gameOptions = [];
async function loadGameOptions() {
  const { data } = await sb.from('games').select('id, title').order('title');
  gameOptions = data || [];
}
const gameSelectHtml = (emptyLabel) =>
  `<option value="">${emptyLabel}</option>` + gameOptions.map((g) => `<option value="${g.id}">${esc(g.title)}</option>`).join('');

// ---------- Secciones ----------
const loaders = {
  stats: loadStats, juegos: loadGames, noticias: loadNews, encuestas: loadPolls, reportes: loadReports,
  comentarios: loadComments, usuarios: loadUsers, equipo: loadTeam, mensajes: loadMessages,
};
function openSection(name) {
  $$('#sideNav button').forEach((b) => b.classList.toggle('active', b.dataset.sec === name));
  $$('section[data-sec]').forEach((s) => s.classList.toggle('hidden', s.dataset.sec !== name));
  history.replaceState(null, '', `#${name}`);
  loaders[name]();
}
$('#sideNav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) openSection(b.dataset.sec);
});

// =====================================================================
// SUBIDA DE IMÁGENES (Supabase Storage, carpeta pública "media")
// =====================================================================
async function uploadImage(file, folder) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('mime type');
  if (file.size > 5 * 1024 * 1024) throw new Error('payload too large');
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('media').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}

// Cualquier <input type=file data-upload="idDelCampo"> sube la imagen y completa ese campo.
document.addEventListener('change', async (e) => {
  const input = e.target;
  if (!input.matches('input[type=file][data-upload]') || !input.files[0]) return;
  const label = input.closest('label');
  label.classList.add('disabled');
  const text = label.firstChild.textContent;
  label.firstChild.textContent = '⏳ Subiendo...';
  try {
    $(`#${input.dataset.upload}`).value = await uploadImage(input.files[0], input.dataset.folder);
    toast('Imagen subida');
  } catch (err) {
    toast(errorMsg(err), 'error');
  } finally {
    label.firstChild.textContent = text;
    label.classList.remove('disabled');
    input.value = '';
  }
});

// =====================================================================
// ESTADÍSTICAS
// =====================================================================
async function loadStats() {
  const { data, error } = await sb.rpc('admin_stats');
  if (error) {
    $('#statTiles').innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(errorMsg(error))}<br><span class="small">¿Ejecutaste el archivo <code>supabase/schema.sql</code> actualizado?</span></div>`;
    return;
  }
  const t = data.totals;
  $('#statTiles').innerHTML = [
    [t.members, 'Miembros'], [t.new_7d, 'Nuevos (7 días)'], [t.comments, 'Comentarios'], [t.favorites, 'Favoritos'],
    [t.votes, 'Votos'], [t.suggestions_open, 'Reportes abiertos'], [t.banned, 'Suspendidos'],
  ].map(([v, l]) => `<div class="stat"><div class="stat-value">${formatNumber(v)}</div><div class="stat-label">${l}</div></div>`).join('');

  // Registros por día: barras verticales de una sola serie, con tooltip y tabla
  const days = data.signups;
  const max = Math.max(1, ...days.map((d) => d.count));
  const label = (d) => new Date(d.day + 'T00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  const total = days.reduce((a, d) => a + d.count, 0);
  $('#signupChart').setAttribute('aria-label', `Registros por día en los últimos 30 días: ${total} en total`);
  $('#signupChart').innerHTML = days.map((d) =>
    `<div style="height:${(d.count / max) * 100}%" title="${label(d)}: ${d.count} ${d.count === 1 ? 'registro' : 'registros'}"></div>`).join('');
  $('#signupAxis').innerHTML = `<span>${label(days[0])}</span><span>Máx: ${max}</span><span>${label(days[days.length - 1])}</span>`;
  $('#signupTable').innerHTML = `<table><thead><tr><th>Día</th><th>Registros</th></tr></thead><tbody>${
    days.filter((d) => d.count).reverse().map((d) => `<tr><td>${label(d)}</td><td>${d.count}</td></tr>`).join('')
    || '<tr><td colspan="2" class="muted">Sin registros en este período.</td></tr>'}</tbody></table>`;

  const bars = (el, rows, unit) => {
    const top = Math.max(1, ...rows.map((r) => r.count));
    el.innerHTML = rows.length ? rows.map((r) => `
      <div class="bar-row" title="${esc(r.title)}: ${r.count} ${unit}">
        <span class="label">${esc(r.title)}</span>
        <div class="bar-track"><span style="width:${(r.count / top) * 100}%"></span></div>
        <span class="val">${r.count}</span>
      </div>`).join('') : '<p class="muted">Todavía no hay datos.</p>';
  };
  bars($('#topFavs'), data.top_favorites, 'favoritos');
  bars($('#topComments'), data.top_comments, 'comentarios');
}
$('#refreshStats').addEventListener('click', loadStats);

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
  $('#gamesBody').innerHTML = games.length ? games.map((g) => `
    <tr>
      <td>${safeUrl(g.thumbnail_url) ? `<img class="thumb-sm" src="${esc(g.thumbnail_url)}" alt="">` : '<div class="thumb-sm"></div>'}</td>
      <td><a href="juego.html?slug=${encodeURIComponent(g.slug)}" target="_blank">${esc(g.title)}</a>${g.featured ? ' ⭐' : ''}${g.youtube_id ? ' 🎬' : ''}</td>
      <td><span class="badge ${STATUS[g.status].cls}">${STATUS[g.status].label}</span></td>
      <td class="muted small">${g.release_at ? (new Date(g.release_at) > now ? '🚀 ' : '') + formatDate(g.release_at) : '—'}</td>
      <td>${g.sort_order}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" data-content="${g.id}">Galería y cambios</button>
        <button class="btn btn-sm btn-ghost" data-edit="${g.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del="${g.id}">Borrar</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="6" class="muted center">No hay juegos. Creá el primero.</td></tr>';
}

const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
$('#gTitle').addEventListener('input', (e) => { if (!editingGame) $('#gSlug').value = slugify(e.target.value); });

function openGameDialog(game = null) {
  editingGame = game;
  $('#gameDialogTitle').textContent = game ? 'Editar juego' : 'Nuevo juego';
  $('#gTitle').value = game?.title ?? '';
  $('#gSlug').value = game?.slug ?? '';
  $('#gStatus').value = game?.status ?? 'publicado';
  $('#gGenre').value = game?.genre ?? '';
  $('#gPlace').value = game?.roblox_place_id ?? '';
  $('#gOrder').value = game?.sort_order ?? 0;
  $('#gRelease').value = toLocalInput(game?.release_at);
  $('#gYoutube').value = game?.youtube_id ? `https://youtu.be/${game.youtube_id}` : '';
  $('#gThumb').value = game?.thumbnail_url ?? '';
  $('#gShort').value = game?.short_description ?? '';
  $('#gDesc').value = game?.description ?? '';
  $('#gFeatured').checked = game?.featured ?? false;
  show($('#gameForm'), '');
  $('#gameDialog').showModal();
}
$('#newGame').addEventListener('click', () => openGameDialog());

$('#gamesBody').addEventListener('click', async (e) => {
  const { edit, del, content } = e.target.dataset;
  if (edit) openGameDialog(games.find((g) => g.id == edit));
  if (content) openContentDialog(games.find((g) => g.id == content));
  if (del) {
    const g = games.find((x) => x.id == del);
    if (!confirm(`¿Borrar "${g.title}"? También se borran sus comentarios, favoritos, galería, cambios y encuestas.`)) return;
    const { error } = await sb.from('games').delete().eq('id', del);
    if (error) return toast(errorMsg(error), 'error');
    toast('Juego borrado');
    loadGames();
    loadGameOptions();
  }
});

$('#gameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const place = $('#gPlace').value.trim();
  const thumb = $('#gThumb').value.trim();
  const yt = $('#gYoutube').value.trim();
  const row = {
    title: $('#gTitle').value.trim(),
    slug: $('#gSlug').value.trim(),
    status: $('#gStatus').value,
    genre: $('#gGenre').value.trim() || null,
    roblox_place_id: place ? Number(place) : null,
    sort_order: parseInt($('#gOrder').value, 10) || 0,
    release_at: fromLocalInput($('#gRelease').value),
    youtube_id: yt ? youtubeId(yt) : null,
    thumbnail_url: thumb || null,
    short_description: $('#gShort').value.trim() || null,
    description: $('#gDesc').value.trim() || null,
    featured: $('#gFeatured').checked,
  };
  if (!row.title) return show(form, 'El título es obligatorio.');
  if (!/^[a-z0-9-]{1,80}$/.test(row.slug)) return show(form, 'El identificador solo puede tener minúsculas, números y guiones.');
  if (place && !/^\d{1,18}$/.test(place)) return show(form, 'El Place ID tiene que ser un número.');
  if (yt && !row.youtube_id) return show(form, 'No reconozco ese link de YouTube. Pegá el link del video (youtube.com/watch?v=... o youtu.be/...).');
  if (thumb && !safeUrl(thumb)) return show(form, 'La URL de la imagen tiene que empezar con https://');

  await withLoading($('button[type=submit]', form), async () => {
    // Solo puede haber un juego destacado
    if (row.featured) {
      await sb.from('games').update({ featured: false }).eq('featured', true).neq('id', editingGame?.id ?? -1);
    }
    const { error } = editingGame
      ? await sb.from('games').update(row).eq('id', editingGame.id)
      : await sb.from('games').insert(row);
    if (error) return show(form, errorMsg(error));
    $('#gameDialog').close();
    toast(editingGame ? 'Juego actualizado' : 'Juego creado');
    loadGames();
    loadGameOptions();
  });
});

// ---------- Galería y registro de cambios de un juego ----------
let contentGame = null;
let editingUpdate = null;

function openContentPanel(name) {
  $$('[data-ctab]').forEach((t) => t.classList.toggle('active', t.dataset.ctab === name));
  $$('[data-cpanel]').forEach((p) => p.classList.toggle('hidden', p.dataset.cpanel !== name));
}
$$('[data-ctab]').forEach((t) => t.addEventListener('click', () => openContentPanel(t.dataset.ctab)));

function openContentDialog(game) {
  contentGame = game;
  $('#contentTitle').textContent = game.title;
  openContentPanel('galeria');
  resetUpdateForm();
  show($('#mediaForm'), '');
  loadMedia();
  loadUpdates();
  $('#contentDialog').showModal();
}

async function loadMedia() {
  const { data, error } = await sb.from('game_media').select('*').eq('game_id', contentGame.id).order('sort_order').order('id');
  if (error) return ($('#mediaGrid').innerHTML = `<p class="muted">${esc(errorMsg(error))}</p>`);
  $('#mediaGrid').innerHTML = data.length ? data.map((m) => `
    <figure title="${esc(m.caption || '')}">
      <img src="${esc(safeUrl(m.url))}" alt="${esc(m.caption || '')}" loading="lazy">
      <button class="btn btn-sm btn-danger" data-del-media="${m.id}" aria-label="Borrar imagen">✕</button>
    </figure>`).join('') : '<p class="muted" style="grid-column:1/-1">Todavía no hay imágenes en la galería.</p>';
}

async function addMedia(urls) {
  const caption = $('#mCaption').value.trim() || null;
  const { error } = await sb.from('game_media').insert(urls.map((url, i) => ({ game_id: contentGame.id, url, caption, sort_order: Date.now() % 1e6 + i })));
  if (error) throw error;
}

$('#mFiles').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  const form = $('#mediaForm');
  show(form, `Subiendo ${files.length} ${files.length === 1 ? 'imagen' : 'imágenes'}...`, 'success');
  try {
    const urls = [];
    for (const f of files) urls.push(await uploadImage(f, `galeria/${contentGame.id}`));
    await addMedia(urls);
    show(form, '');
    $('#mCaption').value = '';
    toast('Imágenes agregadas');
    loadMedia();
  } catch (err) {
    show(form, errorMsg(err));
  }
});

$('#mediaForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const url = $('#mUrl').value.trim();
  if (!safeUrl(url)) return show(form, 'Pegá un link que empiece con https:// o usá el botón Subir.');
  await withLoading($('button[type=submit]', form), async () => {
    try {
      await addMedia([url]);
    } catch (err) {
      return show(form, errorMsg(err));
    }
    form.reset();
    show(form, '');
    toast('Imagen agregada');
    loadMedia();
  });
});

$('#mediaGrid').addEventListener('click', async (e) => {
  const id = e.target.dataset.delMedia;
  if (!id || !confirm('¿Sacar esta imagen de la galería?')) return;
  const { error } = await sb.from('game_media').delete().eq('id', id);
  if (error) return toast(errorMsg(error), 'error');
  loadMedia();
});

let updates = [];
async function loadUpdates() {
  const { data, error } = await sb.from('game_updates').select('*').eq('game_id', contentGame.id).order('created_at', { ascending: false });
  if (error) return ($('#updatesList').innerHTML = `<p class="muted">${esc(errorMsg(error))}</p>`);
  updates = data;
  $('#updatesList').innerHTML = data.length ? data.map((u) => `
    <div class="log-item">
      <h4>${u.version ? `<span class="ver">${esc(u.version)}</span>` : ''}${esc(u.title)}</h4>
      <span class="muted small">${formatDate(u.created_at)}</span>
      ${u.body ? `<p>${esc(u.body)}</p>` : ''}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn btn-sm btn-ghost" data-edit-update="${u.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del-update="${u.id}">Borrar</button>
      </div>
    </div>`).join('') : '<p class="muted">Todavía no hay cambios publicados para este juego.</p>';
}

function resetUpdateForm() {
  editingUpdate = null;
  $('#updateForm').reset();
  show($('#updateForm'), '');
  $('#uSubmit').textContent = 'Publicar cambio';
  $('#uCancel').classList.add('hidden');
}
$('#uCancel').addEventListener('click', resetUpdateForm);

$('#updatesList').addEventListener('click', async (e) => {
  const { editUpdate, delUpdate } = e.target.dataset;
  if (editUpdate) {
    editingUpdate = updates.find((u) => u.id == editUpdate);
    $('#uVersion').value = editingUpdate.version ?? '';
    $('#uTitle').value = editingUpdate.title;
    $('#uBody').value = editingUpdate.body ?? '';
    $('#uSubmit').textContent = 'Guardar cambios';
    $('#uCancel').classList.remove('hidden');
    $('#uTitle').focus();
  }
  if (delUpdate) {
    if (!confirm('¿Borrar esta entrada del registro de cambios?')) return;
    const { error } = await sb.from('game_updates').delete().eq('id', delUpdate);
    if (error) return toast(errorMsg(error), 'error');
    if (editingUpdate?.id == delUpdate) resetUpdateForm();
    loadUpdates();
  }
});

$('#updateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const row = { version: $('#uVersion').value.trim() || null, title: $('#uTitle').value.trim(), body: $('#uBody').value.trim() || null };
  if (!row.title) return show(form, 'El título es obligatorio.');
  await withLoading($('#uSubmit'), async () => {
    const { error } = editingUpdate
      ? await sb.from('game_updates').update(row).eq('id', editingUpdate.id)
      : await sb.from('game_updates').insert({ ...row, game_id: contentGame.id });
    if (error) return show(form, errorMsg(error));
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
  $('#nGame').innerHTML = gameSelectHtml('— Ninguno —');
  $('#newsBody').innerHTML = news.length ? news.map((n) => `
    <tr>
      <td>${esc(n.title)}</td>
      <td>${esc(n.games?.title ?? '—')}</td>
      <td>${n.published ? '<span class="badge badge-green">Publicada</span>' : '<span class="badge badge-amber">Borrador</span>'}</td>
      <td class="muted">${formatDate(n.created_at)}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" data-edit="${n.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del="${n.id}">Borrar</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="5" class="muted center">No hay noticias.</td></tr>';
}

function openNewsDialog(n = null) {
  editingNews = n;
  $('#newsDialogTitle').textContent = n ? 'Editar noticia' : 'Nueva noticia';
  $('#nTitle').value = n?.title ?? '';
  $('#nBody').value = n?.body ?? '';
  $('#nGame').value = n?.game_id ?? '';
  $('#nImage').value = n?.image_url ?? '';
  $('#nPublished').checked = n?.published ?? true;
  show($('#newsForm'), '');
  $('#newsDialog').showModal();
}
$('#newNews').addEventListener('click', () => openNewsDialog());

$('#newsBody').addEventListener('click', async (e) => {
  const { edit, del } = e.target.dataset;
  if (edit) openNewsDialog(news.find((n) => n.id == edit));
  if (del) {
    if (!confirm('¿Borrar esta noticia?')) return;
    const { error } = await sb.from('news').delete().eq('id', del);
    if (error) return toast(errorMsg(error), 'error');
    toast('Noticia borrada');
    loadNews();
  }
});

$('#newsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const image = $('#nImage').value.trim();
  const row = {
    title: $('#nTitle').value.trim(),
    body: $('#nBody').value.trim(),
    game_id: $('#nGame').value ? Number($('#nGame').value) : null,
    image_url: image || null,
    published: $('#nPublished').checked,
  };
  if (!row.title || !row.body) return show(form, 'Título y contenido son obligatorios.');
  if (image && !safeUrl(image)) return show(form, 'La URL de la imagen tiene que empezar con https://');

  await withLoading($('button[type=submit]', form), async () => {
    const { error } = editingNews
      ? await sb.from('news').update(row).eq('id', editingNews.id)
      : await sb.from('news').insert({ ...row, author_id: me.id });
    if (error) return show(form, errorMsg(error));
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
  const byOption = Object.fromEntries((counts || []).map((c) => [c.option_id, Number(c.votes)]));
  const now = new Date();
  $('#pollsBody').innerHTML = polls.length ? polls.map((p) => {
    const total = p.poll_options.reduce((a, o) => a + (byOption[o.id] || 0), 0);
    const closed = !p.active || (p.closes_at && new Date(p.closes_at) <= now);
    const summary = [...p.poll_options].sort((a, b) => a.sort_order - b.sort_order)
      .map((o) => `${esc(o.label)}: ${byOption[o.id] || 0}`).join(' · ');
    return `
      <tr>
        <td><strong>${esc(p.question)}</strong><div class="muted small">${summary}</div></td>
        <td>${p.games ? esc(p.games.title) : 'Inicio'}</td>
        <td>${total}</td>
        <td>${closed ? '<span class="badge">Cerrada</span>' : '<span class="badge badge-green">Abierta</span>'}</td>
        <td><div class="actions">
          <button class="btn btn-sm btn-ghost" data-toggle="${p.id}">${p.active ? 'Cerrar' : 'Abrir'}</button>
          <button class="btn btn-sm btn-ghost" data-edit="${p.id}">Editar</button>
          <button class="btn btn-sm btn-danger" data-del="${p.id}">Borrar</button>
        </div></td>
      </tr>`;
  }).join('') : '<tr><td colspan="5" class="muted center">No hay encuestas. Creá la primera.</td></tr>';
}

function openPollDialog(p = null) {
  editingPoll = p;
  $('#pollDialogTitle').textContent = p ? 'Editar encuesta' : 'Nueva encuesta';
  $('#pGame').innerHTML = gameSelectHtml('En el inicio (general)');
  $('#pQuestion').value = p?.question ?? '';
  $('#pOptions').value = p ? [...p.poll_options].sort((a, b) => a.sort_order - b.sort_order).map((o) => o.label).join('\n') : '';
  $('#pOptions').disabled = !!p;
  $('#pOptionsHint').textContent = p ? 'Las opciones no se pueden cambiar después de crear la encuesta (para no mezclar votos). Si querés otras, creá una nueva.' : '';
  $('#pGame').value = p?.game_id ?? '';
  $('#pCloses').value = toLocalInput(p?.closes_at);
  $('#pActive').checked = p?.active ?? true;
  show($('#pollForm'), '');
  $('#pollDialog').showModal();
}
$('#newPoll').addEventListener('click', () => openPollDialog());

$('#pollsBody').addEventListener('click', async (e) => {
  const { toggle, edit, del } = e.target.dataset;
  if (edit) openPollDialog(polls.find((p) => p.id == edit));
  if (toggle) {
    const p = polls.find((x) => x.id == toggle);
    const { error } = await sb.from('polls').update({ active: !p.active }).eq('id', toggle);
    if (error) return toast(errorMsg(error), 'error');
    toast(p.active ? 'Encuesta cerrada' : 'Encuesta abierta');
    loadPolls();
  }
  if (del) {
    if (!confirm('¿Borrar esta encuesta y todos sus votos?')) return;
    const { error } = await sb.from('polls').delete().eq('id', del);
    if (error) return toast(errorMsg(error), 'error');
    toast('Encuesta borrada');
    loadPolls();
  }
});

$('#pollForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const row = {
    question: $('#pQuestion').value.trim(),
    game_id: $('#pGame').value ? Number($('#pGame').value) : null,
    closes_at: fromLocalInput($('#pCloses').value),
    active: $('#pActive').checked,
  };
  const options = [...new Set($('#pOptions').value.split('\n').map((s) => s.trim()).filter(Boolean))];
  if (!row.question) return show(form, 'Escribí la pregunta.');
  if (!editingPoll && (options.length < 2 || options.length > 8)) return show(form, 'Poné entre 2 y 8 opciones, una por línea.');
  if (options.some((o) => o.length > 100)) return show(form, 'Cada opción puede tener hasta 100 caracteres.');

  await withLoading($('button[type=submit]', form), async () => {
    if (editingPoll) {
      const { error } = await sb.from('polls').update(row).eq('id', editingPoll.id);
      if (error) return show(form, errorMsg(error));
    } else {
      const { data, error } = await sb.from('polls').insert(row).select('id').single();
      if (error) return show(form, errorMsg(error));
      const { error: optError } = await sb.from('poll_options').insert(options.map((label, i) => ({ poll_id: data.id, label, sort_order: i })));
      if (optError) {
        await sb.from('polls').delete().eq('id', data.id);
        return show(form, errorMsg(optError));
      }
    }
    $('#pollDialog').close();
    toast(editingPoll ? 'Encuesta actualizada' : 'Encuesta creada');
    loadPolls();
  });
});

// =====================================================================
// SUGERENCIAS Y BUGS
// =====================================================================
async function refreshReportsBadge() {
  const { count } = await sb.from('suggestions').select('id', { count: 'exact', head: true }).eq('status', 'nueva');
  $('#reportsBadge').innerHTML = count ? `<span class="badge badge-accent">${count}</span>` : '';
}

async function loadReports() {
  if (!$('#repGame').options.length) $('#repGame').innerHTML = gameSelectHtml('Todos los juegos');
  let q = sb.from('suggestions').select('*, games(title, slug), profiles(username, avatar_url)').order('created_at', { ascending: false }).limit(200);
  const kind = $('#repKind').value;
  const status = $('#repStatus').value;
  const game = $('#repGame').value;
  if (kind) q = q.eq('kind', kind);
  if (status === 'abiertos') q = q.in('status', ['nueva', 'en_revision', 'planeada']);
  else if (status) q = q.eq('status', status);
  if (game) q = q.eq('game_id', game);
  const { data, error } = await q;
  if (error) return ($('#reportsList').innerHTML = `<div class="empty">${esc(errorMsg(error))}</div>`);
  $('#reportsList').innerHTML = data.length ? data.map((r) => `
    <div class="report">
      <div class="report-head">
        <strong>${REPORT_KIND[r.kind]}: ${esc(r.title)}</strong>
        <span class="muted small">por ${esc(r.profiles?.username ?? '—')} · ${r.games ? esc(r.games.title) + ' · ' : ''}${timeAgo(r.created_at)}</span>
      </div>
      <p>${esc(r.body)}</p>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center">
        <select data-status="${r.id}" style="width:auto">
          ${Object.entries(REPORT_STATUS).map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
        <button class="btn btn-sm btn-danger" data-del="${r.id}">Borrar</button>
      </div>
    </div>`).join('') : '<div class="empty">No hay reportes con estos filtros.</div>';
  refreshReportsBadge();
}
['#repKind', '#repStatus', '#repGame'].forEach((s) => $(s).addEventListener('change', loadReports));

$('#reportsList').addEventListener('change', async (e) => {
  const id = e.target.dataset.status;
  if (!id) return;
  const { error } = await sb.from('suggestions').update({ status: e.target.value }).eq('id', id);
  if (error) return toast(errorMsg(error), 'error');
  toast(`Estado: ${REPORT_STATUS[e.target.value].label}`);
  refreshReportsBadge();
});
$('#reportsList').addEventListener('click', async (e) => {
  const id = e.target.dataset.del;
  if (!id || !confirm('¿Borrar este reporte?')) return;
  const { error } = await sb.from('suggestions').delete().eq('id', id);
  if (error) return toast(errorMsg(error), 'error');
  loadReports();
});

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
    && (!q || c.body.toLowerCase().includes(q) || (c.profiles?.username || '').toLowerCase().includes(q)));
  $('#commentsBody').innerHTML = list.length ? list.map((c) => `
    <tr class="${c.hidden ? 'is-muted' : ''}">
      <td><div style="display:flex;align-items:center;gap:8px">${avatarHtml(c.profiles, 28)}<span>${esc(c.profiles?.username ?? '—')}</span>${c.profiles?.banned ? ' <span class="badge badge-amber">Suspendido</span>' : ''}</div></td>
      <td style="max-width:360px;overflow-wrap:anywhere">${esc(c.body)}${c.hidden ? ' <span class="badge badge-amber">Oculto</span>' : ''}</td>
      <td>${c.games ? `<a href="juego.html?slug=${encodeURIComponent(c.games.slug)}" target="_blank">${esc(c.games.title)}</a>` : '—'}</td>
      <td class="muted small">${timeAgo(c.created_at)}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" data-hide="${c.id}">${c.hidden ? 'Mostrar' : 'Ocultar'}</button>
        <button class="btn btn-sm btn-danger" data-del="${c.id}">Borrar</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="5" class="muted center">No hay comentarios.</td></tr>';
}
$('#commentSearch').addEventListener('input', renderComments);
$('#onlyHidden').addEventListener('change', renderComments);

$('#commentsBody').addEventListener('click', async (e) => {
  const { hide, del } = e.target.dataset;
  if (hide) {
    const c = comments.find((x) => x.id == hide);
    const { error } = await sb.from('comments').update({ hidden: !c.hidden }).eq('id', hide);
    if (error) return toast(errorMsg(error), 'error');
    c.hidden = !c.hidden;
    renderComments();
    toast(c.hidden ? 'Comentario oculto' : 'Comentario visible');
  }
  if (del) {
    if (!confirm('¿Borrar este comentario?')) return;
    const { error } = await sb.from('comments').delete().eq('id', del);
    if (error) return toast(errorMsg(error), 'error');
    comments = comments.filter((x) => x.id != del);
    renderComments();
    toast('Comentario borrado');
  }
});

async function loadWords() {
  const { data, error } = await sb.from('banned_words').select('word').order('word');
  if (error) return ($('#wordList').innerHTML = `<span class="muted small">${esc(errorMsg(error))}</span>`);
  $('#wordList').innerHTML = data.length
    ? data.map((w) => `<span class="tag">${esc(w.word)}<button type="button" data-word="${esc(w.word)}" aria-label="Quitar ${esc(w.word)}">×</button></span>`).join('')
    : '<span class="muted small">No hay palabras en la lista.</span>';
}

$('#wordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const word = $('#newWord').value.trim().toLowerCase();
  if (!/^[a-z0-9áéíóúñü]{2,40}$/.test(word)) return toast('Una sola palabra, de 2 a 40 letras o números, sin espacios.', 'error');
  const { error } = await sb.from('banned_words').insert({ word });
  if (error) return toast(errorMsg(error), 'error');
  $('#newWord').value = '';
  loadWords();
});
$('#wordList').addEventListener('click', async (e) => {
  const word = e.target.dataset.word;
  if (!word) return;
  const { error } = await sb.from('banned_words').delete().eq('word', word);
  if (error) return toast(errorMsg(error), 'error');
  loadWords();
});

// =====================================================================
// USUARIOS
// =====================================================================
let users = [];

async function loadUsers() {
  const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) return toast(errorMsg(error), 'error');
  users = data;
  renderUsers();
}

function renderUsers() {
  const q = $('#userSearch').value.trim().toLowerCase();
  const list = users.filter((u) => !q || u.username.toLowerCase().includes(q) || (u.roblox_username || '').toLowerCase().includes(q));
  $('#usersBody').innerHTML = list.length ? list.map((u) => `
    <tr class="${u.banned ? 'is-muted' : ''}">
      <td><div style="display:flex;align-items:center;gap:10px">${avatarHtml(u, 32)}<span>${esc(u.username)}</span></div></td>
      <td>${esc(u.roblox_username ?? '—')}</td>
      <td>${u.role === 'admin' ? '<span class="badge badge-accent">Admin</span>' : '<span class="muted">Usuario</span>'}</td>
      <td>${u.banned ? `<span class="badge badge-amber" title="${esc(u.banned_reason || '')}">Suspendido</span>` : '<span class="muted">Activo</span>'}</td>
      <td class="muted">${formatDate(u.created_at)}</td>
      <td><div class="actions">${u.id === me.id ? '<span class="muted small">Vos</span>' : `
        ${u.role !== 'admin' ? `<button class="btn btn-sm ${u.banned ? 'btn-ghost' : 'btn-danger'}" data-ban="${u.id}">${u.banned ? 'Reactivar' : 'Suspender'}</button>` : ''}
        ${!u.banned ? `<button class="btn btn-sm btn-ghost" data-role="${u.id}">${u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>` : ''}`}
      </div></td>
    </tr>`).join('') : '<tr><td colspan="6" class="muted center">Sin resultados.</td></tr>';
}
$('#userSearch').addEventListener('input', renderUsers);

$('#usersBody').addEventListener('click', async (e) => {
  const { role: roleId, ban: banId } = e.target.dataset;
  if (roleId) {
    const u = users.find((x) => x.id === roleId);
    const role = u.role === 'admin' ? 'user' : 'admin';
    if (!confirm(role === 'admin' ? `¿Darle permisos de admin a ${u.username}? Va a poder editar todo el sitio.` : `¿Quitarle el admin a ${u.username}?`)) return;
    const { error } = await sb.from('profiles').update({ role }).eq('id', roleId);
    if (error) return toast(errorMsg(error), 'error');
    u.role = role;
    renderUsers();
    toast('Rol actualizado');
  }
  if (banId) {
    const u = users.find((x) => x.id === banId);
    let changes;
    if (u.banned) {
      if (!confirm(`¿Reactivar la cuenta de ${u.username}?`)) return;
      changes = { banned: false, banned_reason: null };
    } else {
      const reason = prompt(`¿Por qué suspendés a ${u.username}? (lo va a ver en su cuenta; podés dejarlo vacío)`, '');
      if (reason === null) return;
      changes = { banned: true, banned_reason: reason.trim().slice(0, 200) || null };
    }
    const { error } = await sb.from('profiles').update(changes).eq('id', banId);
    if (error) return toast(errorMsg(error), 'error');
    Object.assign(u, changes);
    renderUsers();
    toast(u.banned ? 'Usuario suspendido' : 'Usuario reactivado');
  }
});

// =====================================================================
// EQUIPO
// =====================================================================
let team = [];
let editingMember = null;

async function loadTeam() {
  const { data, error } = await sb.from('team_members').select('*').order('sort_order').order('created_at');
  if (error) return toast(errorMsg(error), 'error');
  team = data;
  $('#teamBody').innerHTML = team.length ? team.map((m) => `
    <tr>
      <td>${avatarHtml({ avatar_url: m.avatar_url, username: m.name }, 36)}</td>
      <td>${esc(m.name)}</td>
      <td>${esc(m.role_title ?? '—')}</td>
      <td>${esc(m.roblox_username ?? '—')}</td>
      <td>${m.sort_order}</td>
      <td><div class="actions">
        <button class="btn btn-sm btn-ghost" data-edit="${m.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del="${m.id}">Borrar</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="6" class="muted center">Todavía no agregaste miembros. La sección del inicio queda oculta hasta que agregues el primero.</td></tr>';
}

function openMemberDialog(m = null) {
  editingMember = m;
  $('#memberDialogTitle').textContent = m ? 'Editar miembro' : 'Nuevo miembro';
  $('#tName').value = m?.name ?? '';
  $('#tRole').value = m?.role_title ?? '';
  $('#tRoblox').value = m?.roblox_username ?? '';
  $('#tOrder').value = m?.sort_order ?? 0;
  $('#tAvatar').value = m?.avatar_url ?? '';
  $('#tBio').value = m?.bio ?? '';
  show($('#memberForm'), '');
  $('#memberDialog').showModal();
}
$('#newMember').addEventListener('click', () => openMemberDialog());

$('#teamBody').addEventListener('click', async (e) => {
  const { edit, del } = e.target.dataset;
  if (edit) openMemberDialog(team.find((m) => m.id == edit));
  if (del) {
    if (!confirm('¿Sacar a esta persona del equipo?')) return;
    const { error } = await sb.from('team_members').delete().eq('id', del);
    if (error) return toast(errorMsg(error), 'error');
    loadTeam();
  }
});

$('#memberForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const row = {
    name: $('#tName').value.trim(),
    role_title: $('#tRole').value.trim() || null,
    roblox_username: $('#tRoblox').value.trim() || null,
    sort_order: parseInt($('#tOrder').value, 10) || 0,
    avatar_url: $('#tAvatar').value.trim() || null,
    bio: $('#tBio').value.trim() || null,
  };
  if (!row.name) return show(form, 'El nombre es obligatorio.');
  if (row.roblox_username && !/^[A-Za-z0-9_]{3,20}$/.test(row.roblox_username)) return show(form, 'Usuario de Roblox inválido.');
  if (row.avatar_url && !safeUrl(row.avatar_url)) return show(form, 'La foto tiene que ser un link https:// (o usá Subir).');
  await withLoading($('button[type=submit]', form), async () => {
    const { error } = editingMember
      ? await sb.from('team_members').update(row).eq('id', editingMember.id)
      : await sb.from('team_members').insert(row);
    if (error) return show(form, errorMsg(error));
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
  $('#unreadBadge').innerHTML = count ? `<span class="badge badge-accent">${count}</span>` : '';
}

async function loadMessages() {
  const { data, error } = await sb.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) return toast(errorMsg(error), 'error');
  $('#messagesList').innerHTML = data.length ? data.map((m) => `
    <div class="card" style="margin-bottom:14px;${m.is_read ? '' : 'border-color:var(--accent)'}">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div><strong>${esc(m.name)}</strong> · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>
          ${m.is_read ? '' : ' <span class="badge badge-accent">Nuevo</span>'}</div>
        <span class="muted small">${timeAgo(m.created_at)}</span>
      </div>
      <p class="prose" style="margin:12px 0">${esc(m.message)}</p>
      <div class="actions" style="display:flex;gap:6px">
        <a class="btn btn-sm btn-ghost" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: Aquino Studios')}">Responder</a>
        <button class="btn btn-sm btn-ghost" data-read="${m.id}" data-val="${!m.is_read}">${m.is_read ? 'Marcar no leído' : 'Marcar leído'}</button>
        <button class="btn btn-sm btn-danger" data-del="${m.id}">Borrar</button>
      </div>
    </div>`).join('') : '<div class="empty">No hay mensajes.</div>';
  refreshUnread();
}

$('#messagesList').addEventListener('click', async (e) => {
  const { read, val, del } = e.target.dataset;
  if (read) {
    const { error } = await sb.from('contact_messages').update({ is_read: val === 'true' }).eq('id', read);
    if (error) return toast(errorMsg(error), 'error');
    loadMessages();
  }
  if (del) {
    if (!confirm('¿Borrar este mensaje?')) return;
    const { error } = await sb.from('contact_messages').delete().eq('id', del);
    if (error) return toast(errorMsg(error), 'error');
    toast('Mensaje borrado');
    loadMessages();
  }
});

// ---------- Inicio ----------
await loadGameOptions();
const initial = location.hash.slice(1);
openSection(loaders[initial] ? initial : 'stats');
refreshUnread();
refreshReportsBadge();
