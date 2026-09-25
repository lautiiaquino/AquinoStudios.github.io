// Fondo interactivo del hero dibujado con <canvas>:
// una grilla de "píxeles" que se encienden con el color de acento alrededor del cursor
// y una onda suave que recorre la pantalla. Se pausa sola cuando no se ve.
import { reducedMotion } from './dom.js';

export function heroCanvas(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'hero-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  host.classList.add('has-canvas');
  const ctx = canvas.getContext('2d');

  const GAP = 34;
  let w = 0, h = 0, dpr = 1, cols = 0, rows = 0;
  let energy = new Float32Array(0);
  let colors = {};
  const pointer = { x: -9999, y: -9999, active: false };
  let running = false, visible = true, raf = 0, t0 = performance.now();

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    colors = { accent: cs.getPropertyValue('--accent').trim() || '#ff5a1f', dim: cs.getPropertyValue('--line').trim() || 'rgba(255,255,255,.12)' };
  };

  const resize = () => {
    const r = host.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / GAP) + 1;
    rows = Math.ceil(h / GAP) + 1;
    energy = new Float32Array(cols * rows);
    if (!running) draw(performance.now());
  };

  function draw(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    const radius = 170;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        const x = i * GAP, y = j * GAP;
        // Energía por cercanía al cursor (sube rápido, baja lento)
        if (pointer.active) {
          const d = Math.hypot(x - pointer.x, y - pointer.y);
          if (d < radius) energy[k] = Math.max(energy[k], 1 - d / radius);
        }
        energy[k] *= 0.94;
        // Onda diagonal de fondo
        const wave = (Math.sin(i * 0.35 + j * 0.2 - t * 1.4) + 1) / 2;
        const e = energy[k];
        const size = 1.6 + wave * 0.9 + e * 5;
        if (e > 0.04) {
          ctx.globalAlpha = Math.min(1, 0.25 + e);
          ctx.fillStyle = colors.accent;
        } else {
          ctx.globalAlpha = 0.35 + wave * 0.45;
          ctx.fillStyle = colors.dim;
        }
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  const loop = (now) => {
    draw(now);
    raf = running ? requestAnimationFrame(loop) : 0;
  };
  const start = () => { if (!running && visible && !document.hidden && !reducedMotion()) { running = true; raf = requestAnimationFrame(loop); } };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  host.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.active = true;
  }, { passive: true });
  host.addEventListener('pointerleave', () => { pointer.active = false; });

  new ResizeObserver(resize).observe(host);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(host);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  new MutationObserver(() => { readColors(); if (!running) draw(performance.now()); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  readColors();
  resize();
  start();
}
