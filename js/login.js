import { sb, $, $$, esc, renderLayout, errorMsg, withLoading, getSession } from './common.js';
import { AUTH_PROVIDERS } from './config.js';

await renderLayout();

const params = new URLSearchParams(location.search);
// Solo se permite volver a páginas internas del sitio
const next = /^[a-z]+\.html(\?[^\s]*)?$/i.test(params.get('next') || '') ? params.get('next') : 'cuenta.html';

if (await getSession()) location.replace(next);

const show = (msgEl, text, type = 'error') => (msgEl.innerHTML = text ? `<div class="form-msg ${type}">${esc(text)}</div>` : '');

const SIDE = {
  login: ['¡Hola de nuevo!', 'Entrá a tu cuenta de Aquino Studios para seguir donde lo dejaste.'],
  register: ['Sumate a la comunidad', 'Creá tu cuenta gratis en menos de un minuto.'],
  forgot: ['¿Te olvidaste?', 'No pasa nada: te ayudamos a recuperar tu cuenta.'],
};

function openPanel(name) {
  $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('.tabs').classList.toggle('hidden', name === 'forgot');
  $('#oauth').classList.toggle('hidden', name === 'forgot' || !OAUTH.length);
  $('#oauthDivider').classList.toggle('hidden', name === 'forgot' || !OAUTH.length);
  [$('#sideTitle').textContent, $('#sideText').textContent] = SIDE[name];
  $$('.msg').forEach((m) => (m.innerHTML = ''));
  $(`[data-panel="${name}"] input`)?.focus();
}

// ---------- Google / Discord (opcional, se activa en js/config.js) ----------
const PROVIDERS = {
  google: ['Continuar con Google', '<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>'],
  discord: ['Continuar con Discord', '<svg viewBox="0 0 24 24"><path fill="#5865F2" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4-2 1 1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.8zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>'],
};
const OAUTH = sb ? AUTH_PROVIDERS.filter((p) => PROVIDERS[p]) : [];
$('#oauth').innerHTML = OAUTH.map((p) =>
  `<button type="button" class="btn btn-oauth btn-block" data-provider="${p}">${PROVIDERS[p][1]} ${PROVIDERS[p][0]}</button>`).join('');
$('#oauth').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-provider]');
  if (!btn) return;
  await withLoading(btn, async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: btn.dataset.provider,
      options: { redirectTo: new URL(next, location.href).href },
    });
    if (error) show($('.msg', $('[data-panel]:not(.hidden)')), errorMsg(error));
  });
});
$$('.tab').forEach((t) => t.addEventListener('click', () => openPanel(t.dataset.tab)));
$$('[data-go]').forEach((b) => b.addEventListener('click', () => openPanel(b.dataset.go)));
openPanel(params.get('tab') === 'register' ? 'register' : 'login');

$$('.pw-toggle').forEach((btn) => btn.addEventListener('click', () => {
  const input = btn.previousElementSibling;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  btn.textContent = visible ? 'Ver' : 'Ocultar';
}));

// Medidor de seguridad de la contraseña
$('#rPass').addEventListener('input', (e) => {
  const v = e.target.value;
  let score = 0;
  if (v.length >= 8) score++;
  if (v.length >= 12) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const levels = [['0%', 'var(--red)', 'Mínimo 8 caracteres.'], ['25%', 'var(--red)', 'Muy débil'], ['45%', 'var(--amber)', 'Débil'],
    ['65%', 'var(--amber)', 'Aceptable'], ['85%', 'var(--green)', 'Buena'], ['100%', 'var(--green)', 'Muy segura']];
  const [w, c, t] = levels[v ? score : 0];
  Object.assign($('#pwBar').style, { width: w, background: c });
  $('#pwHint').textContent = t;
});

if (!sb) $$('form button[type=submit]').forEach((b) => (b.disabled = true));

// ---------- Iniciar sesión ----------
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('.msg', e.target);
  const email = $('#lEmail').value.trim();
  const password = $('#lPass').value;
  if (!email || !password) return show(msg, 'Completá email y contraseña.');

  await withLoading($('button[type=submit]', e.target), async () => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return show(msg, errorMsg(error));
    location.replace(next);
  });
});

// ---------- Registro ----------
$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('.msg', e.target);
  const username = $('#rUser').value.trim();
  const email = $('#rEmail').value.trim();
  const password = $('#rPass').value;

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return show(msg, 'El nombre de usuario debe tener entre 3 y 20 caracteres (letras, números o _).');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return show(msg, 'El email no es válido.');
  if (password.length < 8) return show(msg, 'La contraseña debe tener al menos 8 caracteres.');
  if (password !== $('#rPass2').value) return show(msg, 'Las contraseñas no coinciden.');
  if (!$('#rTerms').checked) return show(msg, 'Tenés que aceptar las reglas de la comunidad.');

  await withLoading($('button[type=submit]', e.target), async () => {
    const { data: free, error: rpcError } = await sb.rpc('username_available', { name: username });
    if (rpcError) return show(msg, errorMsg(rpcError));
    if (!free) return show(msg, 'Ese nombre de usuario ya está en uso.');

    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { username }, emailRedirectTo: new URL('cuenta.html', location.href).href },
    });
    if (error) return show(msg, errorMsg(error));

    // Si la confirmación de email está desactivada, ya hay sesión
    if (data.session) return location.replace(next);
    // Supabase devuelve un usuario sin identidades si el email ya estaba registrado
    if (data.user && data.user.identities?.length === 0) return show(msg, 'Ya existe una cuenta con ese email.');
    e.target.reset();
    show(msg, `¡Cuenta creada! Te mandamos un email a ${email} para confirmarla. Después podés iniciar sesión.`, 'success');
  });
});

// ---------- Recuperar contraseña ----------
$('#forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('.msg', e.target);
  const email = $('#fEmail').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return show(msg, 'Ingresá un email válido.');

  await withLoading($('button[type=submit]', e.target), async () => {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL('cuenta.html?reset=1', location.href).href });
    if (error) return show(msg, errorMsg(error));
    show(msg, 'Si existe una cuenta con ese email, te llegará un enlace para cambiar la contraseña.', 'success');
  });
});
