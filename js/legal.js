// Páginas legales: índice automático con los títulos y marca de la sección que estás leyendo.
import { html, render } from './core/html.js';
import { $, $$ } from './core/dom.js';
import { renderLayout } from './core/layout.js';

await renderLayout();

const headings = $$('.legal-content h2[id]');
render($('#toc'), headings.map((h) => html`<li><a href="#${h.id}">${h.textContent}</a></li>`));

// Scroll-spy con IntersectionObserver: resalta en el índice la sección visible
const links = new Map($$('#toc a').map((a) => [a.hash.slice(1), a]));
const visible = new Set();
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id);
  const current = headings.find((h) => visible.has(h.id))?.id;
  if (current) links.forEach((a, id) => { a.classList.toggle('active', id === current); a.toggleAttribute('aria-current', id === current); });
}, { rootMargin: '-90px 0px -60% 0px' });
headings.forEach((h) => spy.observe(h));
