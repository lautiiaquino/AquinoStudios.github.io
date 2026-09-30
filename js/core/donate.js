// Ventana de donación con varios métodos de pago.
// - Automáticos (Mercado Pago, PayPal, Stripe): los crea la Edge Function "donate" y se confirman solos.
// - Manuales (transferencia, cripto, Robux): se muestran los datos y la persona avisa que donó;
//   la donación queda "por confirmar" hasta que el admin la revisa en el panel.
// - Links (Cafecito, Ko-fi, Patreon, etc.): abren la plataforma en otra pestaña.
// Qué métodos aparecen se decide en js/config.js → DONATIONS.
import { html, raw, render, safeUrl } from './html.js';
import { $, $$, on, transition } from './dom.js';
import { sb } from './supabase.js';
import { busy, say, toast, errorMsg } from './ui.js';
import * as CONFIG from '../config.js';
import * as fmt from './format.js';

// Si el config.js es de una versión vieja y no tiene DONATIONS, el botón simplemente no aparece
const D = CONFIG.DONATIONS ?? {};

export const HEART = raw('<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>');
const LOCK = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>');
const COPY = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>');
const BACK = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>');
const OUT = raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>');

const svgIco = (d) => raw(`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
const I = {
  card: svgIco('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>'),
  bank: svgIco('<path d="M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
  cup: svgIco('<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"/>'),
};

// Métodos de pago automático (moneda, límites y cómo se ve cada uno)
const AUTO = {
  mercadopago: { name: 'Mercado Pago', sub: 'Pesos argentinos', tag: 'MP', color: '#009ee3', currency: 'ARS', min: 100, max: 1_000_000,
    accepts: ['Crédito', 'Débito', 'Dinero en cuenta', 'Rapipago', 'Pago Fácil'] },
  paypal: { name: 'PayPal', sub: 'Dólares', tag: 'PP', color: '#0070e0', currency: 'USD', min: 1, max: 1000, accepts: ['Cuenta PayPal', 'Tarjeta'] },
  stripe: { name: 'Tarjeta internacional', sub: 'Dólares', tag: I.card, color: '#635bff', currency: 'USD', min: 1, max: 1000,
    accepts: ['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'Google Pay'] },
};
const LINKS = {
  cafecito: ['Cafecito', I.cup, '#8b5a2b', 'Invitame un cafecito (Argentina)'],
  paypalme: ['PayPal.me', 'PP', '#0070e0', 'Enviá desde tu cuenta PayPal'],
  paypal: ['PayPal.me', 'PP', '#0070e0', 'Enviá desde tu cuenta PayPal'], // nombre viejo en config.js
  kofi: ['Ko-fi', 'K', '#29abe0', 'Donación única o mensual'],
  patreon: ['Patreon', 'P', '#f96854', 'Apoyo mensual con recompensas'],
  buymeacoffee: ['Buy Me a Coffee', I.cup, '#ffdd00', 'Donación rápida con tarjeta'],
  lemon: ['Lemon Cash', 'L', '#00f0a0', 'Pesos o cripto desde Lemon'],
  uala: ['Ualá', 'U', '#3564fd', 'Link de cobro de Ualá'],
};

const filled = (v) => typeof v === 'string' && v.trim() !== '';
const money = (n, currency) => (currency === 'ARS' ? `$${fmt.fullNumber(n)}` : currency === 'USD' ? `US$${fmt.fullNumber(n)}` : `${fmt.fullNumber(n)} ${currency === 'ROBUX' ? 'R$' : currency}`);

function methods() {
  const auto = Object.keys(AUTO).filter((k) => D[k] === true);
  const transfer = D.transfer && (filled(D.transfer.alias) || filled(D.transfer.cvu));
  const cryptos = Object.entries(D.crypto ?? {}).filter(([, v]) => filled(v));
  const crypto = cryptos.length || filled(D.binance);
  const robux = safeUrl(D.robux) ? D.robux : null;
  // PayPal.me: se acepta arriba en DONATIONS.paypalme o (versión vieja) dentro de links
  const pm = [D.paypalme, D.links?.paypalme, D.links?.paypal].find((u) => safeUrl(u) && /paypal\.(me|com\/paypalme)\//i.test(u));
  const paypalme = pm ? pm.trim().replace(/\/+$/, '') : null;
  const links = Object.entries(D.links ?? {}).filter(([k, url]) => LINKS[k] && safeUrl(url) && !(paypalme && (k === 'paypalme' || k === 'paypal')));
  // Payoneer: link de solicitud de pago y/o email de la cuenta
  const po = D.payoneer ?? {};
  const payoneer = (safeUrl(po.link) && /payoneer\.com/i.test(po.link)) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(po.email ?? '')
    ? { link: safeUrl(po.link) && /payoneer\.com/i.test(po.link) ? po.link.trim() : null, email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(po.email ?? '') ? po.email.trim() : null }
    : null;
  return { auto, transfer, cryptos, crypto, robux, paypalme, payoneer, links };
}

export const donationsOn = () => {
  if (!D.enabled) return false;
  const m = methods();
  return Boolean(m.auto.length || m.transfer || m.crypto || m.robux || m.paypalme || m.payoneer || m.links.length);
};

// Muro de donadores + meta del mes (se pide una sola vez por página)
let wallPromise;
export const donationWall = () => (wallPromise ??= sb ? sb.rpc('donation_wall').then((r) => r.data ?? null, () => null) : Promise.resolve(null));

export function goalBar(w) {
  if (!w?.goal?.amount) return '';
  const pct = Math.min(100, Math.round((w.month_total / w.goal.amount) * 100));
  return html`
    <div class="goal">
      <div class="goal-top"><b>Meta del mes</b><span>${money(w.month_total, 'ARS')} de ${money(w.goal.amount, 'ARS')}</span></div>
      <div class="goal-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Meta del mes: ${pct}%"><span style="--p:${pct}%"></span></div>
      <div class="goal-foot"><span>${w.goal.label ?? ''}</span><span>${pct}%</span></div>
    </div>`;
}

// Chips con lo que acepta cada método (tarjetas, billeteras, etc.)
const chips = (list) => (list?.length ? html`<span class="pay-chips">${list.map((c) => html`<span>${c}</span>`)}</span>` : '');
const tileInner = (tag, color, name, sub, accepts) => html`
  <span class="pay-ico" style="--c:${color}">${tag}</span>
  <span class="pay-txt"><b>${name}</b><small>${sub}</small>${chips(accepts)}</span>`;
const tile = (method, tag, color, name, sub, accepts) => html`<button type="button" class="pay-opt" data-method="${method}">${tileInner(tag, color, name, sub, accepts)}</button>`;
const linkTile = (url, tag, color, name, sub) => html`<a class="pay-opt" href="${url}" target="_blank" rel="noopener">${tileInner(tag, color, name, sub)}<span class="pay-out">${OUT}</span></a>`;

function pickView(m) {
  return html`
    <div class="pay-view" data-view="pick">
      ${m.auto.length ? html`<p class="pay-group">Pago automático</p>
        <div class="pay-grid">${m.auto.map((k) => tile(k, AUTO[k].tag, AUTO[k].color, AUTO[k].name, AUTO[k].sub, AUTO[k].accepts))}</div>` : ''}
      ${m.transfer || m.crypto || m.robux || m.paypalme || m.payoneer ? html`<p class="pay-group">Otras formas</p>
        <div class="pay-grid">
          ${m.paypalme ? tile('paypalme', 'PP', '#0070e0', 'PayPal', 'Dólares', ['Cuenta PayPal', 'Tarjeta']) : ''}
          ${m.payoneer ? tile('payoneer', 'P', '#ff4800', 'Payoneer', 'Dólares', ['Tarjeta', 'Transferencia', 'Saldo Payoneer']) : ''}
          ${m.transfer ? tile('transferencia', I.bank, '#16a34a', 'Transferencia', 'Pesos argentinos, con alias o CVU', ['Cualquier banco', 'Mercado Pago', 'Ualá', 'Brubank']) : ''}
          ${m.crypto ? tile('cripto', '₿', '#f7931a', 'Cripto', 'Desde cualquier billetera o exchange', [...m.cryptos.map(([n]) => n.replace(/ \(.*\)$/, '')), ...(filled(D.binance) ? ['Binance Pay'] : [])].filter((v, i, a) => a.indexOf(v) === i)) : ''}
          ${m.robux ? tile('robux', 'R$', '#00b06f', 'Robux', 'Comprando el pase de donación en Roblox', ['Tu cuenta de Roblox']) : ''}
        </div>` : ''}
      ${m.links.length ? html`<p class="pay-group">Plataformas</p>
        <div class="pay-grid">${m.links.map(([k, url]) => { const [name, tag, color, sub] = LINKS[k]; return linkTile(url, tag, color, name, sub); })}</div>` : ''}
    </div>`;
}

const backBtn = html`<button type="button" class="link-btn pay-back" data-back>${BACK} Otros métodos</button>`;
const showName = html`<label class="check small"><input type="checkbox" name="show_name" checked> <span>Mostrar mi nombre en el muro de donadores</span></label>`;

function autoView(key) {
  const c = AUTO[key];
  const list = D.amounts?.[c.currency] ?? (Array.isArray(D.amounts) && c.currency === 'ARS' ? D.amounts : c.currency === 'ARS' ? [500, 1000, 2500, 5000] : [2, 5, 10, 20]);
  return html`
    <form class="pay-view form hidden" data-view="${key}" data-currency="${c.currency}" novalidate>
      ${backBtn}
      <div class="pay-title"><span class="pay-ico" style="--c:${c.color}">${c.tag}</span><div><b>${c.name}</b><small>${c.sub}</small></div></div>
      <fieldset class="amounts"><legend class="sr-only">Monto</legend>
        ${list.map((a, i) => html`<label><input type="radio" name="preset" value="${a}" ${i === 1 ? raw('checked') : ''}><span>${money(a, c.currency)}</span></label>`)}
      </fieldset>
      <div class="field">
        <label for="other-${key}">Otro monto (${c.currency})</label>
        <div class="money" data-sym="${c.currency === 'ARS' ? '$' : 'US$'}"><input id="other-${key}" name="other" type="number" inputmode="decimal" min="${c.min}" max="${c.max}" step="${c.currency === 'ARS' ? 1 : 0.5}" placeholder="Ej: ${c.currency === 'ARS' ? 1500 : 7}"></div>
      </div>
      <div class="field">
        <label for="msg-${key}">Mensaje (opcional)</label>
        <textarea id="msg-${key}" name="message" maxlength="200" rows="2" style="min-height:64px" placeholder="¡Sigan así!"></textarea>
      </div>
      ${showName}
      <div class="msg"></div>
      <button class="btn btn-block btn-pay" style="--pay:${c.color}" type="submit">Donar <output name="total"></output> con ${c.name}</button>
      <p class="donate-safe">${LOCK} Pagás en ${c.name}. Nosotros nunca vemos tu tarjeta.</p>
    </form>`;
}

// QR de una billetera: una imagen del sitio (img/...) o un link https
const qrSrc = (name) => { const u = D.cryptoQr?.[name]; return typeof u === 'string' && /^img\/[\w.-]+$/.test(u) ? u : safeUrl(u); };

const copyRow = (label, value) => html`
  <div class="copy-row"><div><small>${label}</small><code>${value}</code></div>
    <button type="button" class="btn btn-sm btn-ghost" data-copy="${value}" aria-label="Copiar ${label}">${COPY} Copiar</button></div>`;

function reportForm(provider, currency, amountLabel, placeholder, open = false) {
  return html`
    <details class="report-box" ${open ? raw('open') : ''}>
      <summary>Ya doné, quiero avisar</summary>
      <form class="form" data-report="${provider}" data-currency="${currency}" novalidate>
        <div class="field"><label for="rep-${provider}">${amountLabel}</label>
          <input id="rep-${provider}" name="amount" type="number" inputmode="decimal" min="0.01" step="any" placeholder="${placeholder}" required data-msg="Escribí cuánto donaste."></div>
        <div class="field"><label for="repmsg-${provider}">Mensaje (opcional)</label>
          <input id="repmsg-${provider}" name="message" maxlength="200" placeholder="Ej: te transferí desde la cuenta de Juan"></div>
        ${showName}
        <div class="msg"></div>
        <button class="btn btn-primary btn-block" type="submit">Avisar mi donación</button>
        <p class="donate-safe">La revisamos a mano y aparece en el muro cuando la confirmamos.</p>
      </form>
    </details>`;
}

function manualViews(m) {
  const t = D.transfer ?? {};
  const usd = D.amounts?.USD ?? [2, 5, 10, 20];
  return html`
    ${m.payoneer ? html`<div class="pay-view hidden" data-view="payoneer">
      ${backBtn}
      <div class="pay-title"><span class="pay-ico" style="--c:#ff4800">P</span><div><b>Payoneer</b><small>Tarjeta, transferencia bancaria o saldo de Payoneer, en dólares</small></div></div>
      ${m.payoneer.link ? html`
        <a class="btn btn-block btn-pay" style="--pay:#ff4800" id="poGo" href="${m.payoneer.link}" target="_blank" rel="noopener">Pagar con Payoneer ${OUT}</a>
        <p class="muted small" style="margin:0">Se abre la página de pago segura de Payoneer. Podés pagar con tarjeta o transferencia, aunque no tengas cuenta.</p>` : ''}
      ${m.payoneer.email ? html`
        <div class="copy-list">${copyRow('Email de Payoneer', m.payoneer.email)}</div>
        <p class="muted small" style="margin:0">¿Tenés cuenta de Payoneer? Andá a <b>Pagar → Hacer un pago</b> y mandá a este email (sin comisión entre cuentas Payoneer).</p>` : ''}
      ${reportForm('payoneer', 'USD', 'Monto enviado (USD)', 'Ej: 10')}
    </div>` : ''}
    ${m.paypalme ? html`<div class="pay-view hidden" data-view="paypalme">
      ${backBtn}
      <div class="pay-title"><span class="pay-ico" style="--c:#0070e0">PP</span><div><b>PayPal</b><small>Se abre PayPal con el monto ya cargado</small></div></div>
      <fieldset class="amounts" id="ppAmounts"><legend class="sr-only">Monto</legend>
        ${usd.map((a, i) => html`<label><input type="radio" name="pp" value="${a}" ${i === 1 ? raw('checked') : ''}><span>${money(a, 'USD')}</span></label>`)}
      </fieldset>
      <div class="field">
        <label for="ppOther">Otro monto (USD)</label>
        <div class="money" data-sym="US$"><input id="ppOther" type="number" inputmode="decimal" min="1" max="10000" step="0.5" placeholder="Ej: 7"></div>
      </div>
      <a class="btn btn-block btn-pay" style="--pay:#0070e0" id="ppGo" href="${m.paypalme}" target="_blank" rel="noopener">Donar <output id="ppTotal"></output> con PayPal ${OUT}</a>
      <p class="donate-safe">${LOCK} Pagás en PayPal. Nosotros nunca vemos tu tarjeta.</p>
      ${reportForm('paypal', 'USD', 'Monto enviado (USD)', 'Ej: 5')}
    </div>` : ''}
    ${m.transfer ? html`<div class="pay-view hidden" data-view="transferencia">
      ${backBtn}
      <div class="pay-title"><span class="pay-ico" style="--c:#16a34a">${I.bank}</span><div><b>Transferencia</b><small>Desde cualquier banco o billetera virtual</small></div></div>
      <div class="copy-list">
        ${filled(t.alias) ? copyRow('Alias', t.alias) : ''}
        ${filled(t.cvu) ? copyRow('CVU / CBU', t.cvu) : ''}
        ${filled(t.holder) ? html`<div class="copy-row"><div><small>Titular</small><span>${t.holder}</span></div></div>` : ''}
        ${filled(t.bank) ? html`<div class="copy-row"><div><small>Banco / billetera</small><span>${t.bank}</span></div></div>` : ''}
      </div>
      ${reportForm('transferencia', 'ARS', 'Monto transferido (ARS)', 'Ej: 2000')}
    </div>` : ''}
    ${m.crypto ? html`<div class="pay-view hidden" data-view="cripto">
      ${backBtn}
      <div class="pay-title"><span class="pay-ico" style="--c:#f7931a">₿</span><div><b>Cripto</b><small>Revisá bien la red antes de enviar</small></div></div>
      <div class="copy-list">
        ${m.cryptos.map(([name, addr]) => html`${copyRow(name, addr)}${qrSrc(name) ? html`<img class="crypto-qr" src="${qrSrc(name)}" alt="Código QR de ${name}" width="180" height="180">` : ''}`)}
        ${filled(D.binance) ? copyRow('Binance Pay ID', D.binance) : ''}
      </div>
      <p class="notice small" style="margin:12px 0 0">Enviá solo por la red indicada. Si mandás por otra red, los fondos se pierden.</p>
      ${reportForm('cripto', 'USDT', 'Monto enviado (en USDT o su equivalente)', 'Ej: 5')}
    </div>` : ''}
    ${m.robux ? html`<div class="pay-view hidden" data-view="robux">
      ${backBtn}
      <div class="pay-title"><span class="pay-ico" style="--c:#00b06f">R$</span><div><b>Robux</b><small>Donación con tu cuenta de Roblox</small></div></div>
      <ol class="steps">
        <li>Tocá el botón y se abre el pase de donación en Roblox.</li>
        <li>Compralo con tus Robux (Roblox se queda con una parte).</li>
        <li>Avisanos abajo para aparecer en el muro de donadores.</li>
      </ol>
      <a class="btn btn-block btn-pay" style="--pay:#00b06f" href="${m.robux}" target="_blank" rel="noopener">Abrir el pase en Roblox ${OUT}</a>
      ${reportForm('robux', 'ROBUX', 'Robux donados', 'Ej: 100')}
    </div>` : ''}`;
}

let dialog;
function show(view) {
  return transition(() => {
    $$('.pay-view', dialog).forEach((v) => v.classList.toggle('hidden', v.dataset.view !== view));
    $('.pay-view:not(.hidden) input:not([type=radio]):not([type=checkbox])', dialog)?.focus({ preventScroll: true });
  });
}

function build() {
  const m = methods();
  dialog = document.body.appendChild(document.createElement('dialog'));
  dialog.className = 'donate';
  dialog.setAttribute('aria-labelledby', 'donateTitle');
  render(dialog, html`
    <div class="donate-head">
      <button class="x-btn" type="button" data-close aria-label="Cerrar">×</button>
      <div class="donate-heart">${HEART}</div>
      <h3 id="donateTitle">Apoyá a Aquino Studios</h3>
      <p>Si te gustan nuestros juegos, podés donar lo que quieras. Todo va a hacer mejores juegos.</p>
      <div id="donateGoal"></div>
    </div>
    <div class="dialog-body">
      ${pickView(m)}
      ${m.auto.map((k) => autoView(k))}
      ${manualViews(m)}
    </div>`);

  donationWall().then((w) => render($('#donateGoal', dialog), goalBar(w)));

  // Si hay un solo método automático y nada más, se abre directo
  const only = m.auto.length === 1 && !m.transfer && !m.crypto && !m.robux && !m.paypalme && !m.payoneer && !m.links.length;
  if (only) show(m.auto[0]);

  on(dialog, 'click', '[data-close]', () => dialog.close());
  dialog.addEventListener('click', (e) => e.target === dialog && dialog.close()); // clic afuera
  on(dialog, 'click', '[data-method]', (e, b) => show(b.dataset.method));
  on(dialog, 'click', '[data-back]', () => show('pick'));
  if (only) $$('[data-back]', dialog).forEach((b) => b.remove());
  on(dialog, 'click', '[data-copy]', async (e, b) => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copiado'); } catch { toast('No se pudo copiar', 'error'); }
  });

  // ---- Formularios de pago automático ----
  for (const form of $$('form[data-currency]:not([data-report])', dialog)) {
    const key = form.dataset.view;
    const c = AUTO[key];
    const amount = () => Number(form.elements.other.value) || Number(form.elements.preset?.value) || 0;
    const paint = () => (form.elements.total.value = amount() ? money(amount(), c.currency) : '');
    // Si escribís un monto se desmarcan los botones; si tocás un botón se borra el monto escrito
    form.addEventListener('input', (e) => {
      if (e.target.name === 'other' && e.target.value) $$('[name=preset]', form).forEach((r) => (r.checked = false));
      if (e.target.name === 'preset') form.elements.other.value = '';
      paint();
    });
    paint();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = amount();
      if (value < c.min || value > c.max) return say(form, `Elegí un monto entre ${money(c.min, c.currency)} y ${money(c.max, c.currency)}.`);
      if (!sb) return say(form, 'El sitio todavía no está configurado.');
      await busy(form.querySelector('[type=submit]'), async () => {
        const { data, error } = await sb.functions.invoke('donate', {
          body: { provider: key, amount: value, message: form.elements.message.value, show_name: form.elements.show_name.checked },
        });
        if (error || !data?.url) {
          let msg = 'Este método de pago todavía no está activado.';
          try { msg = (await error?.context?.json?.())?.error ?? msg; } catch { /* sin detalle */ }
          return say(form, msg);
        }
        say(form, `Te llevamos a ${c.name}…`, 'success');
        location.href = data.url;
      });
    });
  }

  // ---- Payoneer: al abrir el pago se despliega el "Ya doné, quiero avisar"
  $('#poGo', dialog)?.addEventListener('click', () => { $('[data-view="payoneer"] .report-box', dialog).open = true; });

  // ---- PayPal.me: el link lleva el monto (paypal.me/usuario/5USD) ----
  if (m.paypalme) {
    const view = $('[data-view="paypalme"]', dialog);
    const amount = () => Number($('#ppOther', view).value) || Number($('[name=pp]:checked', view)?.value) || 0;
    const paint = () => {
      const a = amount();
      $('#ppGo', view).href = a > 0 ? `${m.paypalme}/${a}USD` : m.paypalme;
      $('#ppTotal', view).value = a > 0 ? money(a, 'USD') : '';
      const rep = $('form[data-report] [name=amount]', view);
      if (rep && a > 0) rep.value = a; // así el aviso ya tiene el monto
    };
    view.addEventListener('input', (e) => {
      if (e.target.id === 'ppOther' && e.target.value) $$('[name=pp]', view).forEach((r) => (r.checked = false));
      if (e.target.name === 'pp') $('#ppOther', view).value = '';
      if (e.target.closest('#ppAmounts') || e.target.id === 'ppOther') paint();
    });
    // Después de ir a PayPal, se abre solo el "Ya doné, quiero avisar"
    $('#ppGo', view).addEventListener('click', () => { $('.report-box', view).open = true; });
    paint();
  }

  // ---- "Ya doné, quiero avisar" (transferencia, cripto, Robux, PayPal.me) ----
  on(dialog, 'submit', 'form[data-report]', async (e, form) => {
    e.preventDefault();
    const amount = Number(form.elements.amount.value);
    if (!(amount > 0) || amount > 1_000_000) return say(form, 'Escribí cuánto donaste.');
    await busy(form.querySelector('[type=submit]'), async () => {
      const { error } = await sb.rpc('report_manual_donation', {
        p_provider: form.dataset.report, p_amount: amount, p_currency: form.dataset.currency,
        p_message: form.elements.message.value, p_show_name: form.elements.show_name.checked,
      });
      if (error) return say(form, errorMsg(error));
      form.reset();
      say(form, '¡Gracias! Vamos a confirmar tu donación en cuanto la veamos. 💙', 'success');
    });
  });
}

export function openDonate(method) {
  if (!dialog) build();
  $$('form', dialog).forEach((f) => say(f, ''));
  if (method && $(`[data-view="${method}"]`, dialog)) show(method);
  dialog.showModal();
}

// Al volver de pagar: index.html?donacion=aprobada|pendiente|fallida|confirmar&metodo=...
export async function donationReturn() {
  const url = new URL(location.href);
  const state = url.searchParams.get('donacion');
  if (!state) return;
  const method = url.searchParams.get('metodo');
  const ref = method === 'paypal' ? url.searchParams.get('token') : method === 'stripe' ? url.searchParams.get('session_id') : null;
  ['donacion', 'metodo', 'token', 'PayerID', 'session_id', 'collection_id', 'collection_status', 'payment_id', 'status', 'external_reference',
    'payment_type', 'merchant_order_id', 'preference_id', 'site_id', 'processing_mode', 'merchant_account_id'].forEach((k) => url.searchParams.delete(k));
  history.replaceState(null, '', url);

  let result = state;
  // PayPal y Stripe: se confirma el pago preguntándole al proveedor (desde la Edge Function)
  if (state === 'confirmar' && ref && sb) {
    toast('Confirmando tu pago…');
    const { data, error } = await sb.functions.invoke('donate-confirm', { body: { provider: method, ref } });
    result = error ? 'pendiente' : data?.status ?? 'pendiente';
  }
  if (result === 'aprobada') {
    toast('¡Gracias por tu donación! 💙');
    const { confetti } = await import('./confetti.js');
    confetti();
  } else if (result === 'pendiente' || result === 'confirmar') {
    toast('Tu pago está pendiente. Cuando se apruebe, queda registrado.');
  } else {
    toast('El pago no se completó. No se te cobró nada.', 'error');
  }
}
