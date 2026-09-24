import {
  sb, $, $$, esc, safeUrl, formatDate, avatarHtml, renderLayout, requireAuth, getProfile,
  toast, errorMsg, withLoading, fetchRobloxStats, gameCardHtml,
} from './common.js';

let recovery = new URLSearchParams(location.search).get('reset') === '1';
sb?.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') { recovery = true; openSection('seguridad'); }
});

await renderLayout();
let profile = await requireAuth();
if (!profile) throw new Error('sin sesión');

const user = (await sb.auth.getUser()).data.user;
$('#page').classList.remove('hidden');
const show = (el, text, type = 'error') => ($('.msg', el).innerHTML = text ? `<div class="form-msg ${type}">${esc(text)}</div>` : '');

function paintHeader() {
  $('#bigAvatar').innerHTML = avatarHtml(profile, 84);
  $('#pName').textContent = profile.username;
  $('#pMeta').innerHTML = `${profile.role === 'admin' ? '<span class="badge badge-accent">Admin</span> · ' : ''}` +
    `${esc(user.email)} · Miembro desde ${formatDate(profile.created_at)}` +
    (profile.roblox_username ? ` · Roblox: <a href="https://www.roblox.com/search/users?keyword=${encodeURIComponent(profile.roblox_username)}" target="_blank" rel="noopener">@${esc(profile.roblox_username)}</a>` : '');
}
paintHeader();

// ---------- Navegación entre secciones ----------
function openSection(name) {
  $$('#sideNav button').forEach((b) => b.classList.toggle('active', b.dataset.sec === name));
  $$('section[data-sec]').forEach((s) => s.classList.toggle('hidden', s.dataset.sec !== name));
  if (name === 'favoritos') loadFavorites();
  history.replaceState(null, '', `#${name}`);
}
$('#sideNav').addEventListener('click', (e) => e.target.dataset.sec && openSection(e.target.dataset.sec));
if (recovery) {
  openSection('seguridad');
  show($('#passForm'), 'Elegí tu nueva contraseña.', 'success');
  $('#nPass').focus();
} else if (['favoritos', 'seguridad'].includes(location.hash.slice(1))) {
  openSection(location.hash.slice(1));
}

// ---------- Perfil ----------
$('#fUser').value = profile.username;
$('#fRoblox').value = profile.roblox_username || '';
$('#fAvatar').value = profile.avatar_url || '';
$('#fBio').value = profile.bio || '';

$('#profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const username = $('#fUser').value.trim();
  const roblox = $('#fRoblox').value.trim();
  const avatar = $('#fAvatar').value.trim();
  const bio = $('#fBio').value.trim();

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return show(form, 'Nombre de usuario inválido.');
  if (roblox && !/^[A-Za-z0-9_]{3,20}$/.test(roblox)) return show(form, 'Usuario de Roblox inválido.');
  if (avatar && !safeUrl(avatar)) return show(form, 'La URL de la foto tiene que empezar con https://');

  await withLoading($('button[type=submit]', form), async () => {
    if (username.toLowerCase() !== profile.username.toLowerCase()) {
      const { data: free } = await sb.rpc('username_available', { name: username });
      if (!free) return show(form, 'Ese nombre de usuario ya está en uso.');
    }
    const { error } = await sb.from('profiles').update({
      username, roblox_username: roblox || null, avatar_url: avatar || null, bio: bio || null,
    }).eq('id', profile.id);
    if (error) return show(form, errorMsg(error));
    profile = await getProfile(true);
    paintHeader();
    show(form, '');
    toast('Perfil actualizado');
    const navName = $('.user-btn span');
    if (navName) navName.textContent = profile.username;
  });
});

// ---------- Favoritos ----------
async function loadFavorites() {
  const grid = $('#favGrid');
  grid.innerHTML = '<div class="skeleton" style="height:280px"></div>';
  const { data, error } = await sb.from('favorites').select('games(*)').eq('user_id', profile.id).order('created_at', { ascending: false });
  if (error) return (grid.innerHTML = `<div class="empty">${esc(errorMsg(error))}</div>`);
  const games = data.map((f) => f.games).filter(Boolean);
  if (!games.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No tenés favoritos todavía. <a href="index.html#juegos">Explorá los juegos</a> y tocá ♡.</div>';
    return;
  }
  grid.innerHTML = games.map((g) => gameCardHtml(g)).join('');
  const stats = await fetchRobloxStats(games.map((g) => g.roblox_place_id));
  if (Object.keys(stats).length) grid.innerHTML = games.map((g) => gameCardHtml(g, stats[g.roblox_place_id])).join('');
}

// ---------- Seguridad ----------
$('#passForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const password = $('#nPass').value;
  if (password.length < 8) return show(form, 'La contraseña debe tener al menos 8 caracteres.');
  if (password !== $('#nPass2').value) return show(form, 'Las contraseñas no coinciden.');
  await withLoading($('button[type=submit]', form), async () => {
    const { error } = await sb.auth.updateUser({ password });
    if (error) return show(form, errorMsg(error));
    form.reset();
    show(form, 'Contraseña actualizada correctamente.', 'success');
    if (recovery) history.replaceState(null, '', 'cuenta.html');
  });
});

$('#emailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const email = $('#nEmail').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return show(form, 'Email inválido.');
  await withLoading($('button[type=submit]', form), async () => {
    const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: new URL('cuenta.html', location.href).href });
    if (error) return show(form, errorMsg(error));
    form.reset();
    show(form, 'Te enviamos un email de confirmación a la nueva dirección (y a la anterior). El cambio se aplica cuando lo confirmes.', 'success');
  });
});

$('#logoutAll').addEventListener('click', async () => {
  if (!confirm('¿Cerrar sesión en todos los dispositivos?')) return;
  await sb.auth.signOut({ scope: 'global' });
  location.href = 'login.html';
});
