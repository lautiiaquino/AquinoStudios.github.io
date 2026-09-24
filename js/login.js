import { sb, $, $$, esc, renderLayout, errorMsg, withLoading, getSession } from './common.js';

await renderLayout();

const params = new URLSearchParams(location.search);
// Solo se permite volver a páginas internas del sitio
const next = /^[a-z]+\.html(\?[^\s]*)?$/i.test(params.get('next') || '') ? params.get('next') : 'cuenta.html';

if (await getSession()) location.replace(next);

const show = (msgEl, text, type = 'error') => (msgEl.innerHTML = text ? `<div class="form-msg ${type}">${esc(text)}</div>` : '');

function openPanel(name) {
  $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('.tabs').classList.toggle('hidden', name === 'forgot');
  $$('.msg').forEach((m) => (m.innerHTML = ''));
  $(`[data-panel="${name}"] input`)?.focus();
}
$$('.tab').forEach((t) => t.addEventListener('click', () => openPanel(t.dataset.tab)));
$$('[data-go]').forEach((b) => b.addEventListener('click', () => openPanel(b.dataset.go)));
if (params.get('tab') === 'register') openPanel('register');

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
