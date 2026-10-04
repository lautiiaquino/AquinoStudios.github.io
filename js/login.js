import { html, raw, render } from './core/html.js';
import { $, $$, on, transition } from './core/dom.js';
import { sb } from './core/supabase.js';
import { getSession } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { busy, say, validate, errorMsg } from './core/ui.js';
import { AUTH_PROVIDERS } from './config.js';
import { confetti } from './core/confetti.js';
import { captchaOn, mountCaptcha } from './core/captcha.js';

await renderLayout('', { bare: true });
$('#year').textContent = new Date().getFullYear();

const params = new URLSearchParams(location.search);
// Solo se permite volver a páginas internas del sitio
const next = /^[a-z0-9-]+\.html([?#][^\s]*)?$/i.test(params.get('next') ?? '') ? params.get('next') : 'index.html';
if (await getSession()) location.replace(next);

const SIDE = {
  login: ['Iniciar sesión', 'Iniciá sesión para comentar, votar y guardar favoritos.'],
  register: ['Crear cuenta', 'Es gratis y tarda un minuto.'],
  forgot: ['Recuperar cuenta', 'Te mandamos un link a tu email para cambiar la contraseña.'],
};

// ---------- Google / Discord (opcional, se activa en js/config.js) ----------
const PROVIDERS = {
  google: ['Continuar con Google', raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>')],
  discord: ['Continuar con Discord', raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#5865F2" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4-2 1 1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.8zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>')],
};
const OAUTH = sb ? AUTH_PROVIDERS.filter((p) => PROVIDERS[p]) : [];
render($('#oauth'), OAUTH.map((p) => html`<button type="button" class="btn btn-oauth btn-block" data-provider="${p}">${PROVIDERS[p][1]} ${PROVIDERS[p][0]}</button>`));
on($('#oauth'), 'click', '[data-provider]', (e, btn) => busy(btn, async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: btn.dataset.provider, options: { redirectTo: new URL(next, location.href).href } });
  if (error) say($('[data-panel]:not(.hidden)'), errorMsg(error));
}));

// ---------- Pestañas (con View Transitions y la URL actualizada) ----------
function openPanel(name, { focus = true } = {}) {
  return transition(() => {
    $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
    $$('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === name);
      t.setAttribute('aria-selected', t.dataset.tab === name);
    });
    $('.tabs').classList.toggle('hidden', name === 'forgot');
    render($('#authAlt'), name === 'login'
      ? html`¿No tenés una cuenta? <button type="button" class="link-btn" data-go="register">Creá una gratis</button>`
      : html`¿Ya tenés cuenta? <button type="button" class="link-btn" data-go="login">Iniciá sesión</button>`);
    ['#oauth', '#oauthDivider'].forEach((s) => $(s).classList.toggle('hidden', name === 'forgot' || !OAUTH.length));
    [$('#sideTitle').textContent, $('#sideText').textContent] = SIDE[name];
    $$('[data-panel]').forEach((f) => say(f, ''));
    const url = new URL(location.href);
    name === 'register' ? url.searchParams.set('tab', 'register') : url.searchParams.delete('tab');
    history.replaceState(null, '', url);
  }).then(() => focus && $(`[data-panel="${name}"] input`)?.focus());
}
on(document, 'click', '.tab', (e, t) => openPanel(t.dataset.tab));
on(document, 'click', '[data-go]', (e, b) => openPanel(b.dataset.go));
// Flechas del teclado entre pestañas (patrón accesible de tabs)
$('.tabs').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const tabs = $$('.tab');
  const i = tabs.indexOf(document.activeElement);
  const t = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
  t.focus();
  openPanel(t.dataset.tab, { focus: false });
});
openPanel(params.get('tab') === 'register' ? 'register' : 'login', { focus: false });

// ---------- Ver contraseña y aviso de Bloq Mayús ----------
const EYE = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>');
const EYE_OFF = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.7-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>');
on(document, 'click', '.pw-toggle', (e, btn) => {
  const input = btn.previousElementSibling;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  render(btn, show ? EYE_OFF : EYE);
  btn.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
});
for (const type of ['keydown', 'keyup']) {
  document.addEventListener(type, (e) => {
    if (e.target.type !== 'password' && !e.target.closest?.('.pw-wrap')) return;
    const caps = e.getModifierState?.('CapsLock');
    $('.caps', e.target.closest('.field'))?.classList.toggle('hidden', !caps);
  });
}

// ---------- Registro: seguridad de la contraseña con <meter> ----------
const reg = $('#registerForm');
reg.elements.password.addEventListener('input', (e) => {
  const v = e.target.value;
  const score = [v.length >= 8, v.length >= 12, /[A-Z]/.test(v) && /[a-z]/.test(v), /\d/.test(v), /[^A-Za-z0-9]/.test(v)].filter(Boolean).length;
  $('#pwMeter').value = v ? score : 0;
  $('#pwHint').textContent = v ? ['Muy débil', 'Muy débil', 'Débil', 'Aceptable', 'Buena', 'Muy segura'][score] : 'Mínimo 8 caracteres.';
});

// Disponibilidad del nombre de usuario mientras escribís (con espera y sin respuestas viejas)
let userCheck = 0;
let debounce;
reg.elements.username.addEventListener('input', (e) => {
  clearTimeout(debounce);
  const name = e.target.value.trim();
  const hint = $('#userHint');
  hint.className = 'hint';
  if (!/^[A-Za-z0-9_]{3,20}$/.test(name) || !sb) { hint.textContent = '3 a 20 caracteres: letras, números o guion bajo.'; return; }
  hint.textContent = 'Comprobando...';
  const id = ++userCheck;
  debounce = setTimeout(async () => {
    const { data: free } = await sb.rpc('username_available', { name });
    if (id !== userCheck) return;
    hint.textContent = free ? `"${name}" está libre` : `"${name}" ya está en uso`;
    hint.classList.add(free ? 'ok' : 'bad');
  }, 400);
});

if (!sb) $$('form [type=submit]').forEach((b) => (b.disabled = true));

// ---------- Verificación anti-bots (opcional) ----------
const captchas = new Map(); // formulario → widget
if (captchaOn()) {
  for (const form of $$('form[data-panel]')) {
    mountCaptcha($('[data-captcha]', form)).then((w) => w && captchas.set(form, w))
      .catch(() => say(form, 'No se pudo cargar la verificación. Recargá la página.'));
  }
}
// Devuelve el token, o null si falta (y avisa). Sin captcha activado devuelve undefined.
function captchaToken(form) {
  if (!captchaOn()) return undefined;
  const t = captchas.get(form)?.token();
  if (!t) say(form, 'Completá la verificación "No soy un robot".');
  return t || null;
}
const resetCaptcha = (form) => captchas.get(form)?.reset();

// ---------- Iniciar sesión ----------
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const { ok, data, message } = validate(form);
  if (!ok) return say(form, message);
  const captchaTokenValue = captchaToken(form);
  if (captchaTokenValue === null) return;
  await busy(form.querySelector('[type=submit]'), async () => {
    const { error } = await sb.auth.signInWithPassword({ email: data.email, password: form.elements.password.value, options: { captchaToken: captchaTokenValue } });
    resetCaptcha(form);
    if (error) return say(form, errorMsg(error));
    location.replace(next);
  });
});

// ---------- Registro ----------
reg.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { ok, data, message } = validate(reg, {
    password2: (v) => (v !== reg.elements.password.value ? 'Las contraseñas no coinciden.' : ''),
  });
  if (!ok) return say(reg, message);
  const captchaTokenValue = captchaToken(reg);
  if (captchaTokenValue === null) return;
  await busy(reg.querySelector('[type=submit]'), async () => {
    const { data: free, error: rpcError } = await sb.rpc('username_available', { name: data.username });
    if (rpcError) return say(reg, errorMsg(rpcError));
    if (!free) return say(reg, 'Ese nombre de usuario ya está en uso.');
    const { data: res, error } = await sb.auth.signUp({
      email: data.email,
      password: reg.elements.password.value,
      options: { data: { username: data.username }, emailRedirectTo: new URL('cuenta.html', location.href).href, captchaToken: captchaTokenValue },
    });
    resetCaptcha(reg);
    if (error) return say(reg, errorMsg(error));
    if (res.session) { confetti(); return setTimeout(() => location.replace(next), 900); } // confirmación de email desactivada
    if (res.user?.identities?.length === 0) return say(reg, 'Ya existe una cuenta con ese email.');
    reg.reset();
    $('#pwMeter').value = 0;
    confetti();
    say(reg, `¡Cuenta creada! Te mandamos un email a ${data.email} para confirmarla. Después podés iniciar sesión.`, 'success');
  });
});

// ---------- Recuperar contraseña ----------
$('#forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const { ok, data, message } = validate(form);
  if (!ok) return say(form, message);
  const captchaTokenValue = captchaToken(form);
  if (captchaTokenValue === null) return;
  await busy(form.querySelector('[type=submit]'), async () => {
    const { error } = await sb.auth.resetPasswordForEmail(data.email, { redirectTo: new URL('cuenta.html?reset=1', location.href).href, captchaToken: captchaTokenValue });
    resetCaptcha(form);
    if (error) return say(form, errorMsg(error));
    say(form, 'Si existe una cuenta con ese email, te va a llegar un enlace para cambiar la contraseña.', 'success');
  });
});
