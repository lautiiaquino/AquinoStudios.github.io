// Confeti con <canvas>: para festejar un voto, una cuenta nueva, etc.
//   confetti()                         → desde el centro de arriba
//   confetti({ x: e.clientX, y: e.clientY })  → desde donde hiciste clic
import { reducedMotion } from './dom.js';

const COLORS = ['#ffcd1f', '#3aa8ff', '#52d35a', '#ff5fa2', '#8a5cff', '#ff8a1f', '#ffffff'];

export function confetti({ x = innerWidth / 2, y = innerHeight / 3, count = 120, spread = 1 } = {}) {
  if (reducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const parts = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9 * spread;
    const speed = 7 + Math.random() * 9;
    return {
      x, y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      shape: Math.random() < 0.3 ? 'circle' : 'rect',
    };
  });

  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of parts) {
      p.vy += 0.28;            // gravedad
      p.vx *= 0.985;           // resistencia del aire
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y < innerHeight + 30) alive++;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 3200);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      // El "flip" del papelito: se achica en un eje como si girara
      const flip = Math.cos(p.rot * 3);
      if (p.shape === 'circle') { ctx.beginPath(); ctx.ellipse(0, 0, p.w / 2, (p.w / 2) * Math.abs(flip), 0, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.w / 2, (-p.h / 2) * flip, p.w, p.h * flip);
      ctx.restore();
    }
    if (alive && t < 3400) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
