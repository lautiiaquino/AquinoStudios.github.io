// Interacciones de firma del sitio: un resplandor que sigue al mouse sobre tarjetas y
// botones, un leve "magnetismo" en los botones principales grandes, y una aparición
// escalonada (una tras otra) para los grupos de tarjetas. Se aplican solas a toda la
// página con los mismos selectores de siempre (.card, .game-card, .btn-primary...),
// así que no hace falta tocar el HTML de cada página.
// Respeta "reducir movimiento": con esa preferencia activada, no hace nada.
import { reducedMotion } from './dom.js';

const SPOTLIGHT = '.card, .game-card';
const MAGNETIC = '.btn-primary.btn-lg, .btn-play.btn-lg';

// ---------- Resplandor que sigue al mouse (spotlight) ----------
// Guarda la posición del mouse en --mx/--my (en %) sobre el elemento más cercano que
// matchee SPOTLIGHT; el brillo en sí lo dibuja el CSS con esas variables.
function spotlight() {
  let last = null;
  addEventListener('pointermove', (e) => {
    const el = e.target.closest?.(SPOTLIGHT);
    if (el !== last) { last?.classList.remove('is-spot'); last = el; el?.classList.add('is-spot'); }
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  }, { passive: true });
}

// ---------- Botones grandes: se "estiran" un poquito hacia el cursor ----------
function magnetic() {
  let active = null;
  addEventListener('pointermove', (e) => {
    const el = e.target.closest?.(MAGNETIC);
    if (el !== active) { active?.style.removeProperty('--pull'); active = el; }
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const py = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    el.style.setProperty('--pull', `${px * 4}px ${py * 4}px`);
  }, { passive: true });
}

export function initMotion() {
  if (reducedMotion()) return; // menos movimiento: se queda con el CSS de base, sin efectos extra
  spotlight();
  magnetic();
}
