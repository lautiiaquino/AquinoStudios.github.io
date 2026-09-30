import { html, render, safeUrl } from './core/html.js';
import { $, $$, transition, download } from './core/dom.js';
import { sb } from './core/supabase.js';
import { getProfile, getUser, requireAuth, signOut } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { toast, busy, say, validate, ask, errorMsg } from './core/ui.js';
import { avatar, profileUrl, gameCard, fetchRobloxStats, bannedNotice, robloxUserUrl, gameUrl, REPORT_STATUS, REPORT_KIND } from './core/view.js';
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
    ${profile.role === 'admin' ? html`<span class="badge badge-accent">Admin</span> · ` : ''}${profile.supporter ? html`<span class="badge badge-supporter">Donador</span> · ` : ''}${user.email}
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
const SECTIONS = { perfil: null, favoritos: loadFavorites, reportes: loadReports, donaciones: loadDonations, seguridad: null };
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
pf.elements.show_favorites.checked = !!profile.show_favorites;
$('#myProfileLink').href = profileUrl(profile.username);
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
    delete data.show_favorites; // es un checkbox: se toma aparte como true/false
    const changes = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || (k === 'username' ? v : null)]));
    changes.show_favorites = pf.elements.show_favorites.checked;
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

// ---------- Mis donaciones ----------
const METHOD = { mercadopago: 'Mercado Pago', paypal: 'PayPal', stripe: 'Tarjeta', payoneer: 'Payoneer', transferencia: 'Transferencia', cripto: 'Cripto', robux: 'Robux', otro: 'Otro' };
const DSTATUS = { aprobada: ['Aprobada', 'badge-green'], pendiente: ['Pendiente', 'badge-amber'], por_confirmar: ['Por confirmar', 'badge-amber'], rechazada: ['Rechazada', ''], cancelada: ['Cancelada', ''], reembolsada: ['Reembolsada', 'badge-accent'] };
const money = (n, c) => (c === 'ARS' || c === 'USD' ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: c, maximumFractionDigits: c === 'ARS' ? 0 : 2 }).format(n) : `${fmt.fullNumber(n)} ${c === 'ROBUX' ? 'R$' : c}`);
async function loadDonations() {
  const { data, error } = await sb.from('donations').select('*').eq('user_id', profile.id).order('created_at', { ascending: false });
  if (error) return render($('#myDonations'), html`<tr><td colspan="4" class="muted">${errorMsg(error)}</td></tr>`);
  render($('#myDonations'), data.length ? data.map((d) => {
    const [text, cls] = DSTATUS[d.status] ?? [d.status, ''];
    return html`<tr><td>${fmt.date(d.created_at)}</td><td>${METHOD[d.provider] ?? d.provider ?? 'Mercado Pago'}</td><td><b>${money(d.amount, d.currency)}</b></td><td><span class="badge ${cls}">${text}</span></td></tr>`;
  }) : html`<tr><td colspan="4" class="muted center">Todavía no donaste. Si querés apoyar al estudio, tocá "Donar". 💙</td></tr>`);
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

// ---------- Descargar mis datos (derecho de acceso) ----------
$('#exportData').addEventListener('click', (e) => busy(e.currentTarget, async () => {
  const q = (table, cols = '*') => sb.from(table).select(cols).eq('user_id', profile.id);
  const [favoritos, comentarios, votos, reportes, mensajes, donaciones, visitas, chat] = await Promise.all([
    q('favorites', 'created_at, games(title)'), q('comments', 'body, created_at, games(title)'),
    q('poll_votes', 'created_at, polls(question), poll_options(label)'), q('suggestions', 'kind, title, body, status, created_at'),
    q('contact_messages', 'name, email, message, created_at'),
    q('donations', 'amount, currency, provider, message, status, show_name, mp_payment_id, created_at, paid_at'), q('visits', 'path, created_at'),
    q('chat_messages', 'body, created_at'),
  ]);
  const data = {
    exportado: new Date().toISOString(),
    cuenta: { email: user.email, creada: user.created_at },
    perfil: profile,
    favoritos: favoritos.data ?? [], comentarios: comentarios.data ?? [], votos: votos.data ?? [],
    reportes: reportes.data ?? [], mensajes_de_contacto: mensajes.data ?? [],
    donaciones: donaciones.data ?? [], visitas: visitas.data ?? [], chat: chat.data ?? [],
  };
  download(`aquino-studios-mis-datos-${profile.username}.json`, JSON.stringify(data, null, 2), 'application/json');
  toast('Listo, se descargó el archivo');
}));

// ---------- Borrar mi cuenta (derecho de supresión) ----------
$('#deleteAccount').addEventListener('click', async (e) => {
  const typed = await ask(`Esto borra tu cuenta y todo lo tuyo para siempre. Para confirmar, escribí tu nombre de usuario: ${profile.username}`,
    { ok: 'Borrar para siempre', danger: true, input: { placeholder: profile.username } });
  if (typed === null) return;
  if (typed !== profile.username) return toast('El nombre no coincide. No se borró nada.', 'error');
  await busy(e.currentTarget, async () => {
    const { error } = await sb.rpc('delete_my_account');
    if (error) return toast(errorMsg(error), 'error');
    await sb.auth.signOut().catch(() => {});
    location.replace('index.html?cuenta=borrada');
  });
});
