// Ventana de donación: elegís el monto y te lleva a pagar con Mercado Pago.
// El pago lo crea la Edge Function "donate" (supabase/functions/donate), que es la única
// que conoce el Access Token de Mercado Pago. Acá solo se muestra el formulario.
import { html, raw, render, safeUrl } from './html.js';
import { $, on } from './dom.js';
import { sb } from './supabase.js';
import { busy, say, toast } from './ui.js';
import * as CONFIG from '../config.js';

// Si el config.js es de una versión vieja y no tiene DONATIONS, el botón simplemente no aparece
const DONATIONS = CONFIG.DONATIONS ?? {};
import * as fmt from './format.js';

export const HEART = raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>');
const LOCK = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>');
const MIN = 100;
const MAX = 1_000_000;
const OTHER = { cafecito: 'Cafecito', paypal: 'PayPal', kofi: 'Ko-fi' };

export const donationsOn = () => Boolean(DONATIONS?.enabled);

let dialog;
function build() {
  dialog = document.body.appendChild(document.createElement('dialog'));
  dialog.className = 'donate';
  dialog.setAttribute('aria-labelledby', 'donateTitle');
  const amounts = DONATIONS.amounts?.length ? DONATIONS.amounts : [500, 1000, 2500, 5000];
  const links = Object.entries(DONATIONS.links ?? {}).filter(([k, url]) => OTHER[k] && safeUrl(url));
  render(dialog, html`
    <div class="donate-head">
      <button class="x-btn" type="button" data-close aria-label="Cerrar">×</button>
      <div class="donate-heart">${HEART}</div>
      <h3 id="donateTitle">Apoyá a Aquino Studios</h3>
      <p>Si te gustan nuestros juegos, podés donar lo que quieras. Todo va a hacer mejores juegos.</p>
    </div>
    <form class="dialog-body form" id="donateForm" novalidate>
      <fieldset class="amounts" style="border:0;padding:0;margin:0">
        <legend class="sr-only">Monto</legend>
        ${amounts.map((a, i) => html`<label><input type="radio" name="preset" value="${a}" ${i === 1 ? raw('checked') : ''}><span>$${fmt.fullNumber(a)}</span></label>`)}
      </fieldset>
      <div class="field">
        <label for="donateOther">Otro monto (ARS)</label>
        <div class="money"><input id="donateOther" name="other" type="number" inputmode="numeric" min="${MIN}" max="${MAX}" step="1" placeholder="Ej: 1500"></div>
      </div>
      <div class="field">
        <label for="donateMsg">Mensaje (opcional)</label>
        <textarea id="donateMsg" name="message" maxlength="200" rows="2" style="min-height:70px" placeholder="¡Sigan así!"></textarea>
      </div>
      <div class="msg"></div>
      <button class="btn btn-mp btn-block" type="submit">Donar <output id="donateTotal"></output> con Mercado Pago</button>
      ${links.length ? html`<div class="divider">o también por</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          ${links.map(([k, url]) => html`<a class="btn btn-sm btn-ghost" href="${url}" target="_blank" rel="noopener">${OTHER[k]}</a>`)}
        </div>` : ''}
      <p class="donate-safe">${LOCK} El pago se hace en Mercado Pago. Nosotros nunca vemos tu tarjeta.</p>
    </form>`);

  const form = $('#donateForm', dialog);
  const amount = () => Math.round(Number(form.elements.other.value) || Number(form.elements.preset.value) || 0);
  const paint = () => ($('#donateTotal', dialog).value = amount() ? `$${fmt.fullNumber(amount())}` : '');
  // Si escribís un monto, se desmarcan los botones; si tocás un botón, se borra el monto escrito
  form.addEventListener('input', (e) => {
    if (e.target.name === 'other' && e.target.value) form.querySelectorAll('[name=preset]').forEach((r) => (r.checked = false));
    if (e.target.name === 'preset') form.elements.other.value = '';
    paint();
  });
  paint();
  on(dialog, 'click', '[data-close]', () => dialog.close());
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close()); // clic afuera

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = amount();
    if (value < MIN || value > MAX) return say(form, `Elegí un monto entre $${fmt.fullNumber(MIN)} y $${fmt.fullNumber(MAX)}.`);
    if (!sb) return say(form, 'El sitio todavía no está configurado.');
    await busy(form.querySelector('[type=submit]'), async () => {
      const { data, error } = await sb.functions.invoke('donate', { body: { amount: value, message: form.elements.message.value } });
      if (error || !data?.url) {
        let msg = 'Las donaciones todavía no están activadas.';
        try { msg = (await error?.context?.json?.())?.error ?? msg; } catch { /* sin detalle */ }
        return say(form, msg);
      }
      say(form, 'Te llevamos a Mercado Pago…', 'success');
      location.href = data.url;
    });
  });
}

export function openDonate() {
  if (!dialog) build();
  say($('#donateForm', dialog), '');
  dialog.showModal();
}

// Al volver de Mercado Pago: index.html?donacion=aprobada | pendiente | fallida
export async function donationReturn() {
  const url = new URL(location.href);
  const state = url.searchParams.get('donacion');
  if (!state) return;
  url.searchParams.delete('donacion');
  ['collection_id', 'collection_status', 'payment_id', 'status', 'external_reference', 'payment_type', 'merchant_order_id', 'preference_id', 'site_id', 'processing_mode', 'merchant_account_id']
    .forEach((k) => url.searchParams.delete(k));
  history.replaceState(null, '', url);
  if (state === 'aprobada') {
    toast('¡Gracias por tu donación! 💙');
    const { confetti } = await import('./confetti.js');
    confetti();
  } else if (state === 'pendiente') {
    toast('Tu pago está pendiente. Cuando Mercado Pago lo apruebe, queda registrado.');
  } else {
    toast('El pago no se completó. No se te cobró nada.', 'error');
  }
}
