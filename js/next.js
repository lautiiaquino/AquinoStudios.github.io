import {
  sb, $, esc, safeUrl, initials, STATUS, robloxGameUrl, renderLayout, toast, errorMsg, withLoading,
  thumbStyle, fetchRobloxStats, startCountdown, formatDateTime, youtubeEmbedHtml,
} from './common.js';

const profile = await renderLayout('next');
const page = $('#page');

function empty(text) {
  page.innerHTML = `<div class="container launch"><div class="empty"><h2>🛠️</h2><p>${esc(text)}</p>
    <a class="btn btn-primary" href="index.html#juegos">Ver nuestros juegos</a></div></div>`;
}

if (!sb) {
  empty('El sitio todavía no está configurado.');
} else {
  const { data: games } = await sb.from('games').select('*').in('status', ['proximamente', 'en_desarrollo'])
    .order('sort_order').order('created_at', { ascending: false });
  const now = new Date();
  // Primero el lanzamiento con fecha más cercana; si no hay fechas, el primer juego en camino.
  const game = (games || []).filter((g) => g.release_at && new Date(g.release_at) > now)
    .sort((a, b) => new Date(a.release_at) - new Date(b.release_at))[0] || (games || [])[0];
  if (!game) empty('Por ahora no hay lanzamientos anunciados. ¡Seguí atento a las noticias!');
  else render(game);
}

async function render(game) {
  document.title = `${game.title} — Próximo lanzamiento`;
  const st = STATUS[game.status] || STATUS.publicado;
  const hasDate = game.release_at && new Date(game.release_at) > new Date();

  page.innerHTML = `
    <div class="container launch">
      <span class="kicker">🚀 Próximo lanzamiento</span>
      <h1>${esc(game.title)}</h1>
      <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
        <span class="badge ${st.cls}">${st.label}</span>
        ${game.genre ? `<span class="badge badge-accent">${esc(game.genre)}</span>` : ''}
      </div>
      <div class="game-hero-img" id="launchImg" ${thumbStyle(game)}>${safeUrl(game.thumbnail_url) ? '' : `<div class="thumb-placeholder" id="launchPh">${initials(game.title)}</div>`}</div>
      <div id="whenBox">
        ${hasDate
          ? `<p class="muted" style="margin-bottom:12px">Sale el <strong>${formatDateTime(game.release_at)}</strong></p>
             <div class="countdown countdown-lg" id="bigCountdown"></div>`
          : '<p class="muted" style="margin-bottom:28px">Todavía sin fecha de salida. ¡Muy pronto!</p>'}
      </div>
      <p class="muted" style="max-width:620px;margin:0 auto 28px">${esc(game.short_description || '')}</p>
      <div class="hero-actions" style="justify-content:center">
        <button class="btn btn-primary" id="notifyBtn">🔔 Avisame cuando salga</button>
        <a class="btn btn-ghost" href="juego.html?slug=${encodeURIComponent(game.slug)}">Ver página del juego</a>
      </div>
      ${game.youtube_id ? `<div style="max-width:820px;margin:48px auto 0">${youtubeEmbedHtml(game.youtube_id)}</div>` : ''}
    </div>`;

  if (hasDate) {
    startCountdown($('#bigCountdown'), game.release_at, () => {
      $('#whenBox').innerHTML = `<h2 style="margin-bottom:24px">🎉 ¡Ya salió!</h2>
        ${game.roblox_place_id ? `<a class="btn btn-play" href="${robloxGameUrl(game.roblox_place_id)}" target="_blank" rel="noopener" style="margin-bottom:28px">▶ Jugar en Roblox</a>` : ''}`;
    });
  }

  if (!safeUrl(game.thumbnail_url) && game.roblox_place_id) {
    const s = (await fetchRobloxStats([game.roblox_place_id]))[game.roblox_place_id];
    if (safeUrl(s?.icon)) { $('#launchImg').style.backgroundImage = `url('${s.icon}')`; $('#launchPh')?.remove(); }
  }

  // "Avisame" = agregar a favoritos (así aparece en Mi cuenta y se entera de las novedades)
  const btn = $('#notifyBtn');
  let on = false;
  const paint = () => { btn.textContent = on ? '✓ Te vamos a avisar' : '🔔 Avisame cuando salga'; btn.classList.toggle('btn-ghost', on); btn.classList.toggle('btn-primary', !on); };
  if (profile) {
    const { data } = await sb.from('favorites').select('game_id').eq('user_id', profile.id).eq('game_id', game.id).maybeSingle();
    on = !!data;
    paint();
  }
  btn.addEventListener('click', async () => {
    if (!profile) return (location.href = 'login.html?next=proximamente.html');
    await withLoading(btn, async () => {
      const { error } = on
        ? await sb.from('favorites').delete().eq('user_id', profile.id).eq('game_id', game.id)
        : await sb.from('favorites').insert({ user_id: profile.id, game_id: game.id });
      if (error) return toast(errorMsg(error), 'error');
      on = !on;
      toast(on ? 'Lo agregamos a tus favoritos' : 'Listo, ya no te avisamos');
    });
    paint();
  });
}
