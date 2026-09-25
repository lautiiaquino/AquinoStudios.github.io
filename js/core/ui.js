// Interfaz común: avisos, botones con carga, diálogos, validación de formularios y errores.
import { html, render } from './html.js';
import { $ } from './dom.js';

// ---------- Avisos (toasts) ----------
export function toast(message, type = 'ok') {
  let box = $('#toasts');
  if (!box) {
    box = Object.assign(document.createElement('div'), { id: 'toasts' });
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = Object.assign(document.createElement('div'), { className: `toast toast-${type}`, textContent: message });
  box.append(el);
  // Web Animations API: entra, espera y sale
  el.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.7,.1,1)' });
  setTimeout(() => {
    el.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 300, fill: 'forwards' })
      .finished.then(() => el.remove());
  }, 3600);
}

// ---------- Botón con estado de carga ----------
export async function busy(button, fn) {
  if (!button) return fn();
  const label = button.innerHTML;
  const width = button.offsetWidth;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.style.minWidth = `${width}px`;
  button.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.style.minWidth = '';
    button.innerHTML = label;
  }
}

// ---------- Mensajes dentro de un formulario (.msg) ----------
export function say(form, text, type = 'error') {
  const box = $('.msg', form);
  if (!box) return;
  render(box, text ? html`<div class="form-msg ${type}" role="${type === 'error' ? 'alert' : 'status'}">${text}</div>` : '');
}

// ---------- Validación con la Constraint Validation API ----------
// Usa los atributos del HTML (required, pattern, minlength, type="email"...) y data-msg
// para el texto del error. `checks` agrega reglas propias: { campo: (valor, datos) => 'error' | '' }.
export function validate(form, checks = {}) {
  const data = {};
  for (const [k, v] of new FormData(form)) data[k] = typeof v === 'string' ? v.trim() : v;
  const fields = [...form.elements].filter((el) => el.name && el.willValidate);
  for (const el of fields) {
    el.setCustomValidity('');
    const custom = checks[el.name]?.(data[el.name] ?? '', data);
    if (custom) el.setCustomValidity(custom);
  }
  const bad = fields.find((el) => !el.checkValidity());
  if (!bad) return { ok: true, data };
  bad.setAttribute('aria-invalid', 'true');
  bad.focus();
  const message = bad.validity.customError ? bad.validationMessage : bad.dataset.msg || bad.validationMessage;
  return { ok: false, data, message };
}

// Al escribir se limpia la marca de error
document.addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));

// ---------- Diálogo de confirmación / pregunta (reemplaza confirm() y prompt()) ----------
let dialog;
export function ask(message, { ok = 'Confirmar', cancel = 'Cancelar', danger = false, input = null } = {}) {
  dialog ??= document.body.appendChild(document.createElement('dialog'));
  dialog.className = 'ask';
  render(dialog, html`
    <form method="dialog" class="dialog-body form">
      <p class="ask-text">${message}</p>
      ${input ? html`<input name="value" maxlength="${input.maxlength ?? 200}" placeholder="${input.placeholder ?? ''}" value="${input.value ?? ''}">` : ''}
      <!-- "Confirmar" va primero en el HTML para que Enter lo active; se ve a la derecha por row-reverse -->
      <div class="dialog-foot" style="flex-direction:row-reverse;justify-content:flex-start">
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok">${ok}</button>
        <button class="btn btn-ghost" value="cancel" formnovalidate>${cancel}</button>
      </div>
    </form>`);
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      if (dialog.returnValue !== 'ok') return resolve(input ? null : false);
      resolve(input ? dialog.querySelector('[name=value]').value.trim() : true);
    }, { once: true });
    dialog.returnValue = '';
    dialog.showModal();
    (dialog.querySelector('[name=value]') || dialog.querySelector('[value=ok]')).focus();
  });
}

// ---------- Errores de Supabase en castellano ----------
const ERRORS = [
  ['invalid login credentials', 'Email o contraseña incorrectos.'],
  ['email not confirmed', 'Tenés que confirmar tu email antes de entrar. Revisá tu bandeja de entrada.'],
  ['user already registered', 'Ya existe una cuenta con ese email.'],
  ['password should be at least', 'La contraseña es demasiado corta.'],
  [/rate limit|too many/, 'Demasiados intentos. Esperá un momento y probá de nuevo.'],
  [/duplicate key.*username/, 'Ese nombre de usuario ya está en uso.'],
  [/duplicate key.*slug/, 'Ya existe un juego con ese identificador (slug).'],
  [/duplicate key.*banned_words/, 'Esa palabra ya está en la lista.'],
  ['palabras no permitidas', 'Tu mensaje tiene palabras no permitidas.'],
  ['violates check constraint', 'Algún dato no tiene el formato correcto.'],
  ['row-level security', 'No tenés permiso para hacer esto (si tu cuenta está suspendida, no podés participar).'],
  [/maximum allowed size|payload too large/, 'La imagen pesa demasiado (máximo 5 MB).'],
  ['mime type', 'Formato de imagen no permitido (usá PNG, JPG, WEBP o GIF).'],
  [/failed to fetch|network|load failed/, 'Error de conexión. Revisá tu internet.'],
];
export function errorMsg(err) {
  const m = String(err?.message || err || '').toLowerCase();
  const hit = ERRORS.find(([k]) => (k instanceof RegExp ? k.test(m) : m.includes(k)));
  return hit ? hit[1] : err?.message || 'Ocurrió un error inesperado.';
}
