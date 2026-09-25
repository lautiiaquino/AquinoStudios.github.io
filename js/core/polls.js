// Encuestas: dibujo, voto optimista (se ve al instante) y resultados que se actualizan solos.
import { html, render } from './html.js';
import { on } from './dom.js';
import { sb } from './supabase.js';
import { toast, errorMsg } from './ui.js';
import { loginUrl } from './session.js';
import * as fmt from './format.js';

const isOpen = (p) => p.active && (!p.closes_at || new Date(p.closes_at) > new Date());

function pollTemplate(p, votes, mine, profile) {
  const opts = [...p.poll_options].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const total = opts.reduce((a, o) => a + (votes.get(o.id) ?? 0), 0);
  const open = isOpen(p);
  const voted = mine.get(p.id);
  const results = voted || !open || !profile;
  const canVote = open && profile && !profile.banned;
  return html`
    <article class="poll" data-poll="${p.id}">
      <h3 id="poll-q-${p.id}">${p.question}</h3>
      <div class="poll-options" role="${canVote ? 'radiogroup' : 'list'}" aria-labelledby="poll-q-${p.id}">
        ${opts.map((o) => {
          const pct = total ? Math.round(((votes.get(o.id) ?? 0) / total) * 100) : 0;
          const body = html`
            ${results ? html`<span class="fill" style="width:${pct}%"></span>` : ''}
            <span>${voted === o.id ? '✓ ' : ''}${o.label}</span>
            ${results ? html`<span class="pct">${pct}%</span>` : ''}`;
          return canVote
            ? html`<button type="button" class="poll-option ${voted === o.id ? 'mine' : ''}" role="radio" aria-checked="${voted === o.id}" data-option="${o.id}">${body}</button>`
            : html`<div class="poll-option ${voted === o.id ? 'mine' : ''}" role="listitem">${body}</div>`;
        })}
      </div>
      <div class="poll-foot">
        <span>${fmt.plural(total, 'voto', 'votos')}</span>
        <span>${!open ? 'Encuesta cerrada'
          : !profile ? html`<a href="${loginUrl()}">Iniciá sesión</a> para votar`
          : profile.banned ? 'Tu cuenta está suspendida'
          : voted ? 'Podés cambiar tu voto'
          : p.closes_at ? `Cierra el ${fmt.date(p.closes_at)}` : 'Tocá una opción para votar'}</span>
      </div>
    </article>`;
}

// Devuelve cuántas encuestas se mostraron. `filter` recibe la consulta para filtrarla (inicio o un juego).
export async function mountPolls(container, { profile, filter }) {
  if (!sb) return 0;
  const { data: polls } = await filter(sb.from('polls').select('*, poll_options(id, label, sort_order)'))
    .order('created_at', { ascending: false }).limit(6);
  if (!polls?.length) return 0;

  const ids = polls.map((p) => p.id);
  let votes = new Map();
  let mine = new Map();
  const paint = () => render(container, polls.map((p) => pollTemplate(p, votes, mine, profile)));

  async function refresh() {
    const [{ data: counts }, { data: own }] = await Promise.all([
      sb.rpc('poll_counts', { ids }),
      profile ? sb.from('poll_votes').select('poll_id, option_id').in('poll_id', ids).eq('user_id', profile.id) : { data: [] },
    ]);
    votes = new Map((counts ?? []).map((c) => [c.option_id, Number(c.votes)]));
    mine = new Map((own ?? []).map((v) => [v.poll_id, v.option_id]));
    paint();
  }
  await refresh();

  // Resultados en vivo: se actualizan cada 20 s mientras la pestaña está visible
  let timer = setInterval(() => document.visibilityState === 'visible' && refresh(), 20_000);
  addEventListener('pagehide', () => clearInterval(timer), { once: true });

  on(container, 'click', '[data-option]', async (e, btn) => {
    const pollId = Number(btn.closest('[data-poll]').dataset.poll);
    const optionId = Number(btn.dataset.option);
    const previous = mine.get(pollId);
    if (previous === optionId) return;
    // Voto optimista: se muestra antes de que responda el servidor
    const snapshot = new Map(votes);
    if (previous) votes.set(previous, Math.max(0, (votes.get(previous) ?? 1) - 1));
    votes.set(optionId, (votes.get(optionId) ?? 0) + 1);
    mine.set(pollId, optionId);
    paint();
    const { error } = await sb.from('poll_votes').upsert(
      { poll_id: pollId, option_id: optionId, user_id: profile.id }, { onConflict: 'poll_id,user_id' });
    if (error) {
      votes = snapshot;
      previous ? mine.set(pollId, previous) : mine.delete(pollId);
      paint();
      return toast(errorMsg(error), 'error');
    }
    toast(previous ? 'Cambiaste tu voto' : '¡Voto registrado!');
  });
  return polls.length;
}
