// Aviso y preferencias de cookies / almacenamiento.
// El sitio NO usa cookies de publicidad ni de estadísticas de terceros. Solo guarda lo esencial
// (la sesión, el tema y esta elección) y, si lo aceptás, carga contenido de terceros (videos de YouTube).
// La elección se guarda en localStorage ("consent") con la versión de la política: si la política
// cambia, se sube CONSENT_VERSION y el aviso vuelve a aparecer.
import { html, render } from './html.js';
import { $, on } from './dom.js';

export const CONSENT_VERSION = 1;
const KEY = 'consent';

export function getConsent() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    return c && c.v === CONSENT_VERSION ? c : null;
  } catch {
    return null;
  }
}

// ¿Se puede cargar contenido de terceros de este tipo? (hoy: 'youtube')
export const allows = (kind) => getConsent()?.[kind] !== false;

function save(choices) {
  const value = { v: CONSENT_VERSION, at: new Date().toISOString(), essential: true, ...choices };
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* sin almacenamiento: no se guarda */ }
  document.dispatchEvent(new CustomEvent('consentchange', { detail: value }));
  return value;
}

let banner;
export function showConsent({ expanded = false } = {}) {
  banner?.remove();
  const current = getConsent();
  banner = document.createElement('section');
  banner.className = 'consent';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-labelledby', 'consentTitle');
  banner.setAttribute('aria-live', 'polite');
  render(banner, html`
    <div class="consent-text">
      <b id="consentTitle">🍪 Cookies y privacidad</b>
      <p>Solo usamos lo necesario para que el sitio funcione (tu sesión y tus preferencias). <b>No usamos publicidad ni rastreadores.</b>
        <a href="cookies.html">Ver la política de cookies</a>.</p>
    </div>
    <form class="consent-prefs ${expanded ? '' : 'hidden'}" id="consentPrefs">
      <label class="check"><input type="checkbox" checked disabled> <span><b>Esenciales</b> — sesión, tema y esta elección. Siempre activas.</span></label>
      <label class="check"><input type="checkbox" name="youtube" ${current?.youtube === false ? '' : 'checked'}> <span><b>Contenido de terceros</b> — videos de YouTube dentro del sitio (modo sin cookies de YouTube, solo al tocar play).</span></label>
    </form>
    <div class="consent-actions">
      <button type="button" class="btn btn-sm btn-ghost" data-consent="config">${expanded ? 'Guardar elección' : 'Configurar'}</button>
      <button type="button" class="btn btn-sm btn-ghost" data-consent="essential">Solo esenciales</button>
      <button type="button" class="btn btn-sm btn-primary" data-consent="all">Aceptar</button>
    </div>`);
  document.body.append(banner);
  requestAnimationFrame(() => banner.classList.add('show'));

  on(banner, 'click', '[data-consent]', (e, b) => {
    const prefs = $('#consentPrefs', banner);
    if (b.dataset.consent === 'config' && prefs.classList.contains('hidden')) {
      prefs.classList.remove('hidden');
      b.textContent = 'Guardar elección';
      return;
    }
    const choice = b.dataset.consent === 'all' ? { youtube: true }
      : b.dataset.consent === 'essential' ? { youtube: false }
      : { youtube: prefs.elements.youtube.checked };
    save(choice);
    banner.classList.remove('show');
    setTimeout(() => banner?.remove(), 300);
  });
}

// Se llama una vez por página (desde layout.js)
export function initConsent() {
  // Cualquier botón o link con data-open-consent vuelve a abrir las preferencias (ej: en el pie)
  on(document, 'click', '[data-open-consent]', (e) => { e.preventDefault(); showConsent({ expanded: true }); });
  if (!getConsent()) setTimeout(() => showConsent(), 600);
}
