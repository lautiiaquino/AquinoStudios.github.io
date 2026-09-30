// Código de lanzamiento: mientras el juego no salió se muestra la recompensa con el código
// tapado (la base NO lo entrega hasta la fecha de salida), y cuando la cuenta regresiva llega a
// cero se pide a la base y se revela con confeti.
//   mountLaunchReward(game, contenedor, <count-down>)
import { html, render } from './html.js';
import { on } from './dom.js';
import { sb } from './supabase.js';
import { toast } from './ui.js';
import { codeCard } from './view.js';
import { confetti } from './confetti.js';

const LOCK = html`<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z"/></svg>`;

// Recompensas de los códigos de lanzamiento que todavía están ocultos (sin el código)
export async function launchTeaser(gameId) {
  if (!sb) return null;
  const { data } = await sb.rpc('launch_teasers', { p_game_id: gameId ?? null });
  return gameId ? data?.[0] ?? null : data ?? [];
}

const upcoming = (game) => game.status !== 'publicado' && game.release_at && new Date(game.release_at) > Date.now();

export async function mountLaunchReward(game, box, countdown) {
  if (!box || !upcoming(game)) return;
  const teaser = await launchTeaser(game.id);
  if (!teaser) return;
  box.classList.add('launch-reward');
  render(box, html`
    <div class="lr-head"><span class="lr-gift" aria-hidden="true">🎁</span>
      <div><b>Código de lanzamiento</b>
        <small>${teaser.total > 1 ? `${teaser.total} códigos secretos` : 'Un código secreto'} · se revela cuando termine la cuenta regresiva</small></div>
    </div>
    <div class="lr-codes">
      ${teaser.rewards.map((r) => html`
        <div class="code-card lr-locked"><div><code aria-label="Código oculto">${LOCK} ••••••••</code><span class="reward">${r}</span></div></div>`)}
    </div>`);
  box.hidden = false;
  countdown?.addEventListener('end', () => reveal(game, box), { once: true });
}

// El reloj de la compu puede estar unos segundos adelantado: si la base todavía no lo
// entrega, se reintenta un par de veces.
async function reveal(game, box) {
  box.classList.add('lr-opening');
  for (const wait of [0, 1500, 3000, 6000, 12000, 25000]) {
    await new Promise((r) => setTimeout(r, wait));
    const { data } = await sb.from('game_codes').select('*').eq('game_id', game.id).eq('on_launch', true).eq('active', true);
    if (data?.length) {
      render(box.querySelector('.lr-codes'), data.map((c) => codeCard(c)));
      box.querySelector('.lr-head small').textContent = '¡Ya está! Copialo y canjealo adentro del juego';
      box.classList.replace('lr-opening', 'lr-open');
      const r = box.getBoundingClientRect();
      confetti({ x: r.left + r.width / 2, y: r.top + 30, count: 160 });
      on(box, 'click', '[data-code]', async (e, b) => {
        try { await navigator.clipboard.writeText(b.dataset.code); } catch { /* sin permiso */ }
        b.closest('.code-card').classList.add('copied');
        toast(`Código ${b.dataset.code} copiado`);
      });
      return;
    }
  }
  box.classList.remove('lr-opening');
  box.querySelector('.lr-head small').textContent = 'Recargá la página en un ratito para ver el código';
}
