import { renderLayout } from './core/layout.js';

// ---------- Minijuego "Obby 404": saltá los bloques de lava y los huecos ----------
const box = document.getElementById('obby');
const canvas = box.querySelector('canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('obbyScore');
const bestEl = document.getElementById('obbyBest');
const W = 760, H = 240, GROUND = 196, SIZE = 26;
const GRAVITY = 2600, JUMP = -820;

let best = 0;
try { best = Number(localStorage.getItem('obby404-best')) || 0; } catch { /* sin almacenamiento */ }
bestEl.textContent = best;

let state = 'idle'; // idle | play | dead
let player, things, speed, dist, last, spawnIn, shake, sparks;
const stars = Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * (GROUND - 30), z: 0.2 + Math.random() * 0.8 }));

function color(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function fit() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function reset() {
  player = { x: 90, y: GROUND - SIZE, vy: 0, onGround: true, rot: 0 };
  things = [];
  speed = 330;
  dist = 0;
  spawnIn = 0.9;
  shake = 0;
  sparks = [];
}

function spawn() {
  // Bloque de lava (hay que saltarlo) o hueco en el piso (hay que pasarlo por arriba)
  if (Math.random() < 0.6) {
    const h = 22 + Math.random() * 34;
    things.push({ kind: 'block', x: W + 20, w: 22 + Math.random() * 26, h });
  } else {
    things.push({ kind: 'gap', x: W + 20, w: 48 + Math.random() * 46 });
  }
  spawnIn = Math.max(0.55, 1.35 - speed / 900) + Math.random() * 0.6;
}

function jump() {
  if (state !== 'play') return start();
  if (player.onGround) { player.vy = JUMP; player.onGround = false; }
}

function start() {
  reset();
  state = 'play';
  box.classList.add('playing');
  box.classList.remove('dead');
  last = performance.now();
  requestAnimationFrame(loop);
}

function die() {
  state = 'dead';
  shake = 10;
  for (let i = 0; i < 18; i++) sparks.push({ x: player.x + SIZE / 2, y: player.y + SIZE / 2, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 420, life: 0.7 });
  const score = Math.floor(dist / 10);
  if (score > best) {
    best = score;
    bestEl.textContent = best;
    try { localStorage.setItem('obby404-best', String(best)); } catch { /* sin almacenamiento */ }
  }
  box.classList.add('dead');
  box.classList.remove('playing');
}

function overGap(x) {
  return things.some((t) => t.kind === 'gap' && x + SIZE * 0.7 > t.x && x + SIZE * 0.3 < t.x + t.w);
}

function update(dt) {
  if (state === 'play') {
    speed += dt * 9;
    dist += speed * dt;
    spawnIn -= dt;
    if (spawnIn <= 0) spawn();
    for (const t of things) t.x -= speed * dt;
    things = things.filter((t) => t.x + t.w > -40);

    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    const floor = overGap(player.x) ? H + 80 : GROUND - SIZE;
    if (player.y >= floor) { player.y = floor; player.vy = 0; player.onGround = true; } else player.onGround = false;
    player.rot = player.onGround ? 0 : player.rot + dt * 7;

    if (player.y > GROUND) die();
    for (const t of things) {
      if (t.kind === 'block' && player.x + SIZE - 4 > t.x && player.x + 4 < t.x + t.w && player.y + SIZE - 2 > GROUND - t.h) die();
    }
    scoreEl.textContent = Math.floor(dist / 10);
  }
  if (state === 'play') for (const s of stars) { s.x -= speed * 0.15 * s.z * dt; if (s.x < 0) s.x += W; }
  for (const s of sparks) { s.vy += GRAVITY * 0.5 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
  sparks = sparks.filter((s) => s.life > 0);
  shake = Math.max(0, shake - dt * 40);
}

function draw() {
  const accent = color('--accent-2', '#8fb4ff');
  const line = color('--line-2', 'rgba(255,255,255,.14)');
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  // Estrellas con paralaje
  ctx.fillStyle = accent;
  for (const s of stars) {
    ctx.globalAlpha = 0.25 + s.z * 0.4;
    ctx.fillRect(s.x, s.y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  // Piso con huecos y líneas que se mueven
  const gaps = things.filter((t) => t.kind === 'gap').sort((a, b) => a.x - b.x);
  ctx.fillStyle = line;
  let x = 0;
  for (const g of gaps) { ctx.fillRect(x, GROUND, Math.max(0, g.x - x), 2); x = g.x + g.w; }
  ctx.fillRect(x, GROUND, W - x, 2);
  ctx.globalAlpha = 0.35;
  const off = dist % 40;
  for (let gx = -off; gx < W; gx += 40) {
    if (!gaps.some((g) => gx > g.x && gx < g.x + g.w)) ctx.fillRect(gx, GROUND + 10, 14, 1);
  }
  ctx.globalAlpha = 1;
  // Lava al fondo de cada hueco
  for (const g of gaps) {
    const grad = ctx.createLinearGradient(0, GROUND, 0, H);
    grad.addColorStop(0, 'rgba(255, 79, 94, 0)');
    grad.addColorStop(1, 'rgba(255, 79, 94, .55)');
    ctx.fillStyle = grad;
    ctx.fillRect(g.x, GROUND, g.w, H - GROUND);
  }

  // Bloques de lava (los "kill bricks" de los obbies)
  for (const t of things) {
    if (t.kind !== 'block') continue;
    ctx.shadowColor = '#ff4f5e';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ff4f5e';
    ctx.fillRect(t.x, GROUND - t.h, t.w, t.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, .25)';
    ctx.fillRect(t.x, GROUND - t.h, t.w, 3);
  }

  // Jugador: un cubo azul que gira al saltar
  if (state !== 'dead') {
    ctx.save();
    ctx.translate(player.x + SIZE / 2, player.y + SIZE / 2);
    ctx.rotate(player.rot);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
    ctx.fillStyle = accent;
    ctx.fillRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#08090b';
    ctx.fillRect(2, -6, 4, 6);
    ctx.fillRect(8, -6, 4, 6);
    ctx.restore();
  }
  ctx.fillStyle = accent;
  for (const s of sparks) { ctx.globalAlpha = Math.max(0, s.life / 0.7); ctx.fillRect(s.x, s.y, 4, 4); }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  if (state === 'play' || sparks.length || shake) requestAnimationFrame(loop);
}

fit();
reset();
draw();
addEventListener('resize', () => { fit(); draw(); });
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); jump(); });
box.querySelector('.obby-start').addEventListener('click', jump);
addEventListener('keydown', (e) => {
  if (!['Space', 'ArrowUp', 'KeyW'].includes(e.code) || e.target.closest?.('input, textarea, select, a, button:not(.obby-start)')) return;
  e.preventDefault();
  jump();
});

await renderLayout();
