// Atajos del DOM y utilidades del navegador.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Delegación de eventos: on(lista, 'click', '[data-del]', (e, el) => ...)
// Un solo listener sirve para todos los elementos, incluso los que se dibujan después.
export function on(root, type, selector, handler, options) {
  root.addEventListener(type, (e) => {
    const el = e.target.closest?.(selector);
    if (el && root.contains(el)) handler(e, el);
  }, options);
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Cambios de pantalla con View Transitions API (si el navegador la soporta).
// Si el navegador corta la animación, el cambio igual se aplica y no se muestra ningún error.
export function transition(update) {
  if (!document.startViewTransition || reducedMotion() || document.hidden) return Promise.resolve(update());
  let ran = false;
  const run = () => { if (ran) return undefined; ran = true; return update(); };
  const vt = document.startViewTransition(run);
  // Si el navegador tarda en arrancar la animación, el cambio se aplica igual (sin animación)
  const guard = setTimeout(() => { if (!ran) { vt.skipTransition(); run(); } }, 300);
  vt.ready.catch(() => {});
  vt.finished.catch(() => {});
  return vt.updateCallbackDone.catch(() => {}).then(() => { clearTimeout(guard); run(); });
}

// Espera a que el navegador esté libre para tareas no urgentes.
export const idle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));

// localStorage que nunca rompe la página (modo privado, bloqueos, etc.)
export const storage = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
  },
};

// Caché corta en sessionStorage (por ejemplo, estadísticas de Roblox por 60 segundos)
export const memo = {
  get(key, maxAgeMs) {
    try {
      const hit = JSON.parse(sessionStorage.getItem(key));
      return hit && Date.now() - hit.t < maxAgeMs ? hit.v : undefined;
    } catch { return undefined; }
  },
  set(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch { /* lleno o bloqueado */ }
  },
};

// "Stale-while-revalidate": muestra al instante lo último que se cargó (si tiene menos de maxAgeMs)
// y en paralelo pide los datos nuevos. Menos espera para el usuario y menos carga para la base
// cuando hay muchos visitantes. onData se llama 1 o 2 veces (cacheado y fresco).
export async function swr(key, maxAgeMs, fetcher, onData) {
  const cached = memo.get(key, maxAgeMs);
  if (cached !== undefined && cached !== null) onData(cached, true);
  const fresh = await fetcher();
  if (fresh === undefined) return cached;
  if (JSON.stringify(fresh) !== JSON.stringify(cached)) onData(fresh, false);
  memo.set(key, fresh);
  return fresh;
}

// Descarga un archivo generado en el navegador (Blob + URL temporal)
export function download(filename, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
