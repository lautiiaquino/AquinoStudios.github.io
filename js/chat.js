// Chat público de la comunidad (tiempo real con Supabase Realtime).
// - Los mensajes nuevos llegan solos; se ven los últimos y se pueden cargar los anteriores.
// - "En el chat ahora": quiénes tienen la página abierta (Presence).
// - @usuario resalta la mención y lleva al perfil.
// - El admin oculta o borra; cada uno puede borrar lo suyo. La base limita el spam
//   (6 mensajes cada 30 s), filtra palabras prohibidas y bloquea a los suspendidos.
import { html, render } from './core/html.js';
import { $, on } from './core/dom.js';
import { sb } from './core/supabase.js';
import { loginUrl } from './core/session.js';
import { renderLayout } from './core/layout.js';
import { toast, ask, errorMsg } from './core/ui.js';
import { avatar, profileUrl, bannedNotice } from './core/view.js';
import * as fmt from './core/format.js';

const PAGE = 50;
const MAX = 400;
const COLS = 'id, body, created_at, user_id, hidden, profiles(username, avatar_url, roblox_username, role, supporter)';

const profile = await renderLayout('chat');
const isAdmin = profile?.role === 'admin';
const page = $('#page');

render(page, html`
  <div class="container chat-page">
    <div class="section-head" style="margin-bottom:18px">
      <div><span class="eyebrow">Comunidad</span><h1 class="stroke-title" style="margin:6px 0 0">Chat</h1>
        <p class="muted" style="margin:6px 0 0">Hablá con otros jugadores, buscá equipo y hacé amigos. <span class="live-dot hidden" id="liveDot">en vivo</span></p></div>
    </div>
    <div class="chat-layout">
      <section class="card chat-box" aria-label="Mensajes">
        <div class="chat-scroll" id="chatScroll">
          <div id="olderWrap" class="chat-older"></div>
          <div id="chatList" role="log" aria-live="polite" aria-relevant="additions"><div class="skeleton" style="height:240px"></div></div>
        </div>
        <button class="chat-new hidden" id="newPill" type="button">Mensajes nuevos ↓</button>
        <div class="chat-compose" id="compose"></div>
      </section>
      <aside class="chat-side">
        <div class="card" style="padding:18px">
          <h3 style="margin:0 0 10px">En el chat ahora <span class="muted" id="onlineCount"></span></h3>
          <ul class="chat-online" id="onlineList"><li class="muted small">Conectando…</li></ul>
        </div>
        <div class="card" style="padding:18px">
          <h3 style="margin:0 0 8px">Reglas</h3>
          <ul class="chat-rules">
            <li>Respetá a todos. Nada de insultos, acoso ni discriminación.</li>
            <li><b>Nunca</b> compartas datos personales: dirección, teléfono, escuela, contraseñas o fotos.</li>
            <li>Nada de spam, estafas ni links raros. Nadie regala Robux.</li>
            <li>Si alguien te incomoda, avisá a un moderador desde <a href="index.html#contacto">Contacto</a>.</li>
          </ul>
        </div>
      </aside>
    </div>
  </div>`);

const list = $('#chatList');
const scroller = $('#chatScroll');
const people = new Map(); // user_id → perfil (para los mensajes que llegan en vivo)
let messages = [];

// ---------- Texto del mensaje con @menciones ----------
function body(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/@([A-Za-z0-9_]{3,20})\b/g)) {
    parts.push(text.slice(last, m.index));
    const mine = profile && m[1].toLowerCase() === profile.username.toLowerCase();
    parts.push(html`<a class="mention ${mine ? 'me' : ''}" href="${profileUrl(m[1])}">@${m[1]}</a>`);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

const mentions = (text) => !!profile && new RegExp(`@${profile.username}\\b`, 'i').test(text);

// Mensajes seguidos de la misma persona (en menos de 5 min) se agrupan
const joined = (a, b) => a && b && a.user_id === b.user_id && new Date(b.created_at) - new Date(a.created_at) < 300_000;

function messageView(m, prev) {
  const p = m.profiles ?? people.get(m.user_id);
  const mine = profile?.id === m.user_id;
  const cont = joined(prev, m);
  const mentionsMe = profile && !mine && mentions(m.body);
  return html`
    <article class="chat-msg ${cont ? 'cont' : ''} ${mine ? 'mine' : ''} ${mentionsMe ? 'mentioned' : ''} ${m.hidden ? 'is-hidden' : ''}" id="m${m.id}" data-id="${m.id}">
      <div class="chat-av">${cont ? '' : html`<a href="${p?.username ? profileUrl(p.username) : '#'}" tabindex="-1" aria-hidden="true">${avatar(p, 36)}</a>`}</div>
      <div class="chat-main">
        ${cont ? '' : html`<div class="chat-head">
          ${p?.username ? html`<a class="comment-author" href="${profileUrl(p.username)}">${p.username}</a>` : html`<b>Usuario</b>`}
          ${p?.role === 'admin' ? html`<span class="badge badge-accent">Staff</span>` : ''}
          ${p?.supporter ? html`<span class="badge badge-supporter" title="Apoyó al estudio con una donación">Donador</span>` : ''}
          <time class="muted small" datetime="${m.created_at}" title="${fmt.dateTime(m.created_at)}">${timeLabel(m.created_at)}</time>
        </div>`}
        <p translate="no">${body(m.body)}</p>
      </div>
      <div class="chat-tools">
        ${p?.username && profile && !mine ? html`<button class="link-btn" type="button" data-reply="${p.username}" title="Responder">↩</button>` : ''}
        ${m.hidden ? html`<span class="badge badge-amber">Oculto</span>` : ''}
        ${isAdmin ? html`<button class="link-btn" type="button" data-hide="${m.id}" data-val="${!m.hidden}">${m.hidden ? 'Mostrar' : 'Ocultar'}</button>` : ''}
        ${mine || isAdmin ? html`<button class="link-btn" type="button" data-del="${m.id}" aria-label="Borrar mensaje">Borrar</button>` : ''}
      </div>
    </article>`;
}

function timeLabel(iso) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : fmt.dateTime(iso);
}

const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
const toBottom = (smooth = false) => scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });

function paint({ keepOffset = false } = {}) {
  const fromBottom = scroller.scrollHeight - scroller.scrollTop;
  render(list, messages.length
    ? messages.map((m, i) => messageView(m, messages[i - 1]))
    : html`<div class="empty" style="margin:40px 0"><p>Todavía no hay mensajes. ¡Rompé el hielo! 👋</p></div>`);
  if (keepOffset) scroller.scrollTop = scroller.scrollHeight - fromBottom;
}

function remember(rows) {
  for (const m of rows) if (m.profiles) people.set(m.user_id, m.profiles);
}

// ---------- Carga inicial y mensajes anteriores ----------
async function load() {
  const { data, error } = await sb.from('chat_messages').select(COLS).order('id', { ascending: false }).limit(PAGE);
  if (error) return render(list, html`<p class="muted" style="padding:20px">${errorMsg(error)} — ¿ejecutaste el schema.sql nuevo?</p>`);
  messages = data.reverse();
  remember(messages);
  paint();
  toBottom();
  olderButton(data.length === PAGE);
}

function olderButton(more) {
  render($('#olderWrap'), more ? html`<button class="btn btn-sm btn-ghost" id="olderBtn" type="button">Ver mensajes anteriores</button>` : '');
}
on($('#olderWrap'), 'click', '#olderBtn', async (e, b) => {
  b.disabled = true;
  const { data, error } = await sb.from('chat_messages').select(COLS).lt('id', messages[0]?.id ?? 0).order('id', { ascending: false }).limit(PAGE);
  if (error) { b.disabled = false; return toast(errorMsg(error), 'error'); }
  remember(data);
  messages = [...data.reverse(), ...messages];
  paint({ keepOffset: true });
  olderButton(data.length === PAGE);
});

// ---------- Escribir ----------
const compose = $('#compose');
if (!profile) {
  render(compose, html`<p class="muted" style="margin:0"><a href="${loginUrl()}">Iniciá sesión</a> para escribir en el chat.</p>`);
} else if (profile.banned) {
  render(compose, bannedNotice(profile));
} else {
  render(compose, html`
    <form id="chatForm" class="chat-form" novalidate>
      <textarea name="body" rows="1" maxlength="${MAX}" placeholder="Escribí un mensaje… (@usuario para mencionar)" aria-label="Tu mensaje" enterkeyhint="send"></textarea>
      <button class="btn btn-primary" type="submit" aria-label="Enviar">Enviar</button>
      <output class="mono muted small" name="count"></output>
    </form>`);
  const form = $('#chatForm');
  const { body: input, count } = form.elements;
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
    count.value = input.value.length > MAX - 80 ? `${input.value.length}/${MAX}` : '';
  };
  input.addEventListener('input', grow);
  // Enter envía; Shift+Enter hace un salto de línea
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return input.focus();
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    const { data, error } = await sb.from('chat_messages').insert({ body: text, user_id: profile.id }).select(COLS).single();
    btn.disabled = false;
    if (error) return toast(errorMsg(error), 'error');
    input.value = '';
    grow();
    add(data);
    toBottom(true);
    input.focus();
  });
  on(list, 'click', '[data-reply]', (e, b) => {
    input.value = `@${b.dataset.reply} ${input.value}`.slice(0, MAX);
    grow();
    input.focus();
  });
}

// ---------- Moderación ----------
on(list, 'click', '[data-hide]', async (e, b) => {
  const hidden = b.dataset.val === 'true';
  const { error } = await sb.from('chat_messages').update({ hidden }).eq('id', b.dataset.hide);
  if (error) return toast(errorMsg(error), 'error');
  const m = messages.find((x) => x.id === Number(b.dataset.hide));
  if (m) m.hidden = hidden;
  paint({ keepOffset: true });
});
on(list, 'click', '[data-del]', async (e, b) => {
  if (!(await ask('¿Borrar este mensaje?', { ok: 'Borrar', danger: true }))) return;
  const { error } = await sb.from('chat_messages').delete().eq('id', b.dataset.del);
  if (error) return toast(errorMsg(error), 'error');
  drop(Number(b.dataset.del));
});

// ---------- Tiempo real ----------
function add(m) {
  if (messages.some((x) => x.id === m.id)) return;
  const stick = nearBottom();
  messages.push(m);
  messages.sort((a, b) => a.id - b.id);
  if (messages.length > 400) messages = messages.slice(-300);
  paint({ keepOffset: !stick });
  if (stick) toBottom(true);
  else $('#newPill').classList.remove('hidden');
}
function drop(id) {
  const before = messages.length;
  messages = messages.filter((m) => m.id !== id);
  if (messages.length !== before) paint({ keepOffset: true });
}
$('#newPill').addEventListener('click', () => toBottom(true));
scroller.addEventListener('scroll', () => { if (nearBottom()) $('#newPill').classList.add('hidden'); }, { passive: true });

async function incoming(row) {
  // El aviso en vivo no trae el perfil: se usa el que ya conocemos o se busca una vez
  if (!people.has(row.user_id)) {
    const { data } = await sb.from('profiles').select('username, avatar_url, roblox_username, role, supporter').eq('id', row.user_id).maybeSingle();
    if (data) people.set(row.user_id, data);
  }
  add({ ...row, profiles: people.get(row.user_id) });
  if (document.hidden && mentions(row.body)) {
    document.title = `(@) Chat — Aquino Studios`;
  }
}
addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'Chat — Aquino Studios'; });

function online(state) {
  const users = Object.values(state).map((metas) => metas[0]).filter((u) => u?.username)
    .sort((a, b) => a.username.localeCompare(b.username));
  $('#onlineCount').textContent = users.length ? `(${users.length})` : '';
  render($('#onlineList'), users.length ? users.map((u) => html`
    <li><a href="${profileUrl(u.username)}">${avatar(u, 28)} <span>${u.username}</span></a></li>`)
    : html`<li class="muted small">Nadie por ahora.</li>`);
}

await load();

if (sb.channel) {
  const channel = sb.channel('chat-room', { config: { presence: { key: profile?.id ?? `anon-${crypto.randomUUID()}` } } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, ({ new: row }) => incoming(row))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, ({ new: row }) => {
      const m = messages.find((x) => x.id === row.id);
      if (row.hidden && !isAdmin) return drop(row.id);
      if (m) { m.hidden = row.hidden; paint({ keepOffset: true }); } else if (!row.hidden) incoming(row);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, ({ old }) => old?.id && drop(old.id))
    .on('presence', { event: 'sync' }, () => online(channel.presenceState()))
    .subscribe((status) => {
      $('#liveDot').classList.toggle('hidden', status !== 'SUBSCRIBED');
      if (status === 'SUBSCRIBED' && profile) {
        channel.track({ username: profile.username, avatar_url: profile.avatar_url, roblox_username: profile.roblox_username });
      }
    });
  addEventListener('pagehide', () => sb.removeChannel(channel), { once: true });
}
