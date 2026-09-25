import { html, render, safeUrl } from './core/html.js';
import { $, $$, transition } from './core/dom.js';
import { sb } from './core/supabase.js';
import { getProfile, getUser, requireAuth, signOut } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { toast, busy, say, validate, ask, errorMsg } from './core/ui.js';
import { avatar, gameCard, fetchRobloxStats, bannedNotice, robloxUserUrl, gameUrl, REPORT_STATUS, REPORT_KIND } from './core/view.js';
import * as fmt from './core/format.js';

// El enlace de "recuperar contraseña" llega con ?reset=1 (o Supabase avisa con PASSWORD_RECOVERY)
let recovery = new URLSearchParams(location.search).get('reset') === '1';
sb?.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') { recovery = true; route('seguridad'); } });

await renderLayout();
let profile = await requireAuth();
if (!profile) throw new Error('sin sesión');
const user = await getUser();
$('#page').classList.remove('hidden');

// ---------- Encabezado del perfil ----------
function paintHeader() {
  render($('#bigAvatar'), avatar(profile, 84));
  $('#pName').textContent = profile.username;
  render($('#pMeta'), html`
    ${profile.role === 'admin' ? html`<span class="badge badge-accent">Admin</span> · ` : ''}${user.email}
    · Miembro desde ${fmt.date(profile.created_at)}
    ${profile.roblox_username ? html` · Roblox: <a href="${robloxUserUrl(profile.roblox_username)}" target="_blank" rel="noopener">@${profile.roblox_username}</a>` : ''}`);
  const navName = $('.user-btn span');
  if (navName) navName.textContent = profile.username;
}
paintHeader();
if (profile.banned) {
  render($('#bannedBox'), bannedNotice(profile));
  $('#bannedBox').classList.remove('hidden');
}

// ---------- Secciones con #hash (funciona el botón "atrás" del navegador) ----------
const SECTIONS = { perfil: null, favoritos: loadFavorites, reportes: loadReports, seguridad: null };
function route(name = location.hash.slice(1)) {
  if (!(name in SECTIONS)) name = 'perfil';
  transition(() => {
    $$('#sideNav a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.sec === name));
    $$('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.sec === name));
    $$('section[data-sec]').forEach((s) => s.classList.toggle('hidden', s.dataset.sec !== name));
  });
  SECTIONS[name]?.();
}
addEventListener('hashchange', () => route());
route(recovery ? 'seguridad' : undefined);
if (recovery) {
  say($('#passForm'), 'Elegí tu nueva contraseña.', 'success');
  $('#nPass').focus();
}

// ---------- Perfil ----------
const pf = $('#profileForm');
for (const k of ['username', 'roblox_username', 'avatar_url', 'bio']) pf.elements[k].value = profile[k] ?? '';
const bio = pf.elements.bio;
const countBio = () => ($('#bioCount').value = `${bio.value.length}/300`);
bio.addEventListener('input', countBio);
countBio();
// Vista previa de la foto mientras escribís la URL
pf.elements.avatar_url.addEventListener('input', (e) => render($('#bigAvatar'), avatar({ ...profile, avatar_url: safeUrl(e.target.value.trim()) }, 84)));

pf.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data, message } = validate(pf);
  if (!ok) return say(pf, message);
  await busy(pf.querySelector('[type=submit]'), async () => {
    if (data.username.toLowerCase() !== profile.username.toLowerCase()) {
      const { data: free } = await sb.rpc('username_available', { name: data.username });
      if (!free) return say(pf, 'Ese nombre de usuario ya está en uso.');
    }
    const changes = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || (k === 'username' ? v : null)]));
    const { error } = await sb.from('profiles').update(changes).eq('id', profile.id);
    if (error) return say(pf, errorMsg(error));
    profile = await getProfile({ force: true });
    paintHeader();
    say(pf, '');
    toast('Perfil actualizado');
  });
});

// ---------- Favoritos ----------
async function loadFavorites() {
  const grid = $('#favGrid');
  render(grid, html`<div class="skeleton" style="aspect-ratio:4/5"></div>`);
  const { data, error } = await sb.from('favorites').select('games(*)').eq('user_id', profile.id).order('created_at', { ascending: false });
  if (error) return render(grid, html`<div class="empty">${errorMsg(error)}</div>`);
  const games = data.map((f) => f.games).filter(Boolean);
  if (!games.length) return render(grid, html`<div class="empty" style="grid-column:1/-1">No tenés favoritos todavía. <a href="index.html#juegos">Explorá los juegos</a> y agregalos a favoritos.</div>`);
  render(grid, games.map((g) => gameCard(g)));
  const stats = await fetchRobloxStats(games.map((g) => g.roblox_place_id));
  if (Object.keys(stats).length) render(grid, games.map((g) => gameCard(g, stats[g.roblox_place_id])));
}

// ---------- Mis reportes ----------
async function loadReports() {
  const list = $('#reportsList');
  render(list, html`<div class="skeleton" style="height:100px"></div>`);
  const { data, error } = await sb.from('suggestions').select('*, games(title, slug)').eq('user_id', profile.id).order('created_at', { ascending: false });
  if (error) return render(list, html`<div class="empty">${errorMsg(error)}</div>`);
  render(list, data.length ? data.map((r) => {
    const st = REPORT_STATUS[r.status] ?? REPORT_STATUS.nueva;
    return html`
      <article class="report">
        <div class="report-head">
          <span class="badge ${st.cls}">${st.label}</span>
          <strong>${r.title}</strong>
          <span class="muted small">${REPORT_KIND[r.kind]} · ${r.games ? html`<a href="${gameUrl(r.games.slug)}">${r.games.title}</a> · ` : ''}${fmt.ago(r.created_at)}</span>
        </div>
        <p>${r.body}</p>
      </article>`;
  }) : html`<div class="empty">Todavía no mandaste sugerencias ni reportes. Podés hacerlo desde la página de cada juego.</div>`);
}

// ---------- Seguridad ----------
const pass = $('#passForm');
pass.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, message } = validate(pass, {
    password2: (v) => (v !== pass.elements.password.value ? 'Las contraseñas no coinciden.' : ''),
  });
  if (!ok) return say(pass, message);
  await busy(pass.querySelector('[type=submit]'), async () => {
    const { error } = await sb.auth.updateUser({ password: pass.elements.password.value });
    if (error) return say(pass, errorMsg(error));
    pass.reset();
    say(pass, 'Contraseña actualizada correctamente.', 'success');
    if (recovery) history.replaceState(null, '', 'cuenta.html#seguridad');
  });
});

const mail = $('#emailForm');
mail.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data, message } = validate(mail, { email: (v) => (v.toLowerCase() === user.email?.toLowerCase() ? 'Ese ya es tu email actual.' : '') });
  if (!ok) return say(mail, message);
  await busy(mail.querySelector('[type=submit]'), async () => {
    const { error } = await sb.auth.updateUser({ email: data.email }, { emailRedirectTo: new URL('cuenta.html', location.href).href });
    if (error) return say(mail, errorMsg(error));
    mail.reset();
    say(mail, 'Te enviamos un email de confirmación a la nueva dirección (y a la anterior). El cambio se aplica cuando lo confirmes.', 'success');
  });
});

$('#logoutAll').addEventListener('click', async () => {
  if (await ask('¿Cerrar sesión en todos los dispositivos?', { ok: 'Cerrar sesión', danger: true })) signOut({ everywhere: true });
});
