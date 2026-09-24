import {
  sb, $, $$, esc, safeUrl, formatDate, timeAgo, STATUS, avatarHtml, renderLayout, requireAuth,
  toast, errorMsg, withLoading,
} from './common.js';

await renderLayout();
const me = await requireAuth({ admin: true });
if (!me) throw new Error('sin permiso');
$('#page').classList.remove('hidden');

const show = (form, text) => ($('.msg', form).innerHTML = text ? `<div class="form-msg error">${esc(text)}</div>` : '');
$$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------- Secciones ----------
const loaders = { juegos: loadGames, noticias: loadNews, usuarios: loadUsers, mensajes: loadMessages };
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
// JUEGOS
// =====================================================================
let games = [];
let editingGame = null;

async function loadGames() {
  const { data, error } = await sb.from('games').select('*').order('sort_order').order('created_at', { ascending: false });
  if (error) return toast(errorMsg(error), 'error');
  games = data;
  $('#gamesBody').innerHTML = games.length ? games.map((g) => `
    <tr>
      <td>${safeUrl(g.thumbnail_url) ? `<img class="thumb-sm" src="${esc(g.thumbnail_url)}" alt="">` : '<div class="thumb-sm"></div>'}</td>
      <td><a href="juego.html?slug=${encodeURIComponent(g.slug)}" target="_blank">${esc(g.title)}</a>${g.featured ? ' ⭐' : ''}</td>
      <td><span class="badge ${STATUS[g.status].cls}">${STATUS[g.status].label}</span></td>
      <td>${esc(g.roblox_place_id ?? '—')}</td>
      <td>${g.sort_order}</td>
      <td><div class="actions">
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
  $('#gThumb').value = game?.thumbnail_url ?? '';
  $('#gShort').value = game?.short_description ?? '';
  $('#gDesc').value = game?.description ?? '';
  $('#gFeatured').checked = game?.featured ?? false;
  show($('#gameForm'), '');
  $('#gameDialog').showModal();
}
$('#newGame').addEventListener('click', () => openGameDialog());

$('#gamesBody').addEventListener('click', async (e) => {
  const { edit, del } = e.target.dataset;
  if (edit) openGameDialog(games.find((g) => g.id == edit));
  if (del) {
    const g = games.find((x) => x.id == del);
    if (!confirm(`¿Borrar "${g.title}"? También se borran sus comentarios y favoritos.`)) return;
    const { error } = await sb.from('games').delete().eq('id', del);
    if (error) return toast(errorMsg(error), 'error');
    toast('Juego borrado');
    loadGames();
  }
});

$('#gameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const place = $('#gPlace').value.trim();
  const thumb = $('#gThumb').value.trim();
  const row = {
    title: $('#gTitle').value.trim(),
    slug: $('#gSlug').value.trim(),
    status: $('#gStatus').value,
    genre: $('#gGenre').value.trim() || null,
    roblox_place_id: place ? Number(place) : null,
    sort_order: parseInt($('#gOrder').value, 10) || 0,
    thumbnail_url: thumb || null,
    short_description: $('#gShort').value.trim() || null,
    description: $('#gDesc').value.trim() || null,
    featured: $('#gFeatured').checked,
  };
  if (!row.title) return show(form, 'El título es obligatorio.');
  if (!/^[a-z0-9-]{1,80}$/.test(row.slug)) return show(form, 'El identificador solo puede tener minúsculas, números y guiones.');
  if (place && !/^\d{1,18}$/.test(place)) return show(form, 'El Place ID tiene que ser un número.');
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
  });
});

// =====================================================================
// NOTICIAS
// =====================================================================
let news = [];
let editingNews = null;

async function loadNews() {
  const [{ data, error }, { data: g }] = await Promise.all([
    sb.from('news').select('*, games(title)').order('created_at', { ascending: false }),
    sb.from('games').select('id, title').order('title'),
  ]);
  if (error) return toast(errorMsg(error), 'error');
  news = data;
  $('#nGame').innerHTML = '<option value="">— Ninguno —</option>' + (g || []).map((x) => `<option value="${x.id}">${esc(x.title)}</option>`).join('');
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
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px">${avatarHtml(u, 32)}<span>${esc(u.username)}</span></div></td>
      <td>${esc(u.roblox_username ?? '—')}</td>
      <td>${u.role === 'admin' ? '<span class="badge badge-accent">Admin</span>' : '<span class="muted">Usuario</span>'}</td>
      <td class="muted">${formatDate(u.created_at)}</td>
      <td><div class="actions">${u.id === me.id ? '<span class="muted small">Vos</span>'
        : `<button class="btn btn-sm btn-ghost" data-role="${u.id}">${u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>`}</div></td>
    </tr>`).join('') : '<tr><td colspan="5" class="muted center">Sin resultados.</td></tr>';
}
$('#userSearch').addEventListener('input', renderUsers);

$('#usersBody').addEventListener('click', async (e) => {
  const id = e.target.dataset.role;
  if (!id) return;
  const u = users.find((x) => x.id === id);
  const role = u.role === 'admin' ? 'user' : 'admin';
  if (!confirm(role === 'admin' ? `¿Darle permisos de admin a ${u.username}? Va a poder editar todo el sitio.` : `¿Quitarle el admin a ${u.username}?`)) return;
  const { error } = await sb.from('profiles').update({ role }).eq('id', id);
  if (error) return toast(errorMsg(error), 'error');
  u.role = role;
  renderUsers();
  toast('Rol actualizado');
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
const initial = location.hash.slice(1);
openSection(loaders[initial] ? initial : 'juegos');
refreshUnread();
