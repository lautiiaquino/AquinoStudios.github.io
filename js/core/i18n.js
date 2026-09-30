// Idiomas del sitio: español (el original), inglés y francés.
// El sitio se escribe en español y este módulo traduce lo que se ve en pantalla usando el
// diccionario de js/core/i18n-dict.js (texto en español → [inglés, francés]).
// Un MutationObserver traduce también lo que aparece después (listas, avisos, ventanas).
//   - Claves con {x}: sirven para textos con partes variables ("Hola, {x}" → "Hi, {x}").
//   - Lo que está dentro de translate="no" (comentarios, chat, nombres) no se toca.
//   - El panel de admin y los textos legales quedan en español.
export const LANGS = { es: 'Español', en: 'English', fr: 'Français' };

function detect() {
  if (/admin\.html$/.test(location.pathname)) return 'es';
  try {
    const saved = localStorage.getItem('lang');
    if (LANGS[saved]) return saved;
  } catch { /* sin almacenamiento */ }
  const nav = (navigator.language || 'es').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : 'es';
}

export const LANG = detect();
export const LOCALE = { es: 'es-AR', en: 'en-US', fr: 'fr-FR' }[LANG];

export function setLang(lang) {
  if (!LANGS[lang] || lang === LANG) return;
  try { localStorage.setItem('lang', lang); } catch { /* sin almacenamiento */ }
  location.reload();
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-msg', 'content'];
const SKIP = 'script, style, code, textarea, [translate="no"]';
let words = null;
const patterns = [];

// "Hola, {x}" → /^Hola, (.+?)$/ ; las partes variables se pasan tal cual a la traducción
function compile(key) {
  const names = [];
  // {n} {p} {a} {b} {c} = números (con puntos, comas o "K"/"M"); el resto, cualquier texto
  const src = key.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (m, name) => {
    names.push(name);
    return /^[npabc]$/.test(name) ? '([\\d.,\\s\\u00a0]*\\d(?:\\s?[kKMB])?)' : '(.+?)';
  });
  return [new RegExp(`^${src}$`, 's'), names];
}

// Traduce un texto (o devuelve null si no hay traducción)
export function t(text) {
  if (!words) return null;
  const key = text.replace(/\s+/g, ' ').trim();
  if (!key) return null;
  const hit = words.get(key);
  if (hit !== undefined) return hit;
  for (const [[re, names], out] of patterns) {
    const m = key.match(re);
    if (m) return out.replace(/\{(\w+)\}/g, (all, n) => { const i = names.indexOf(n); return i < 0 ? all : (t(m[i + 1]) ?? m[i + 1]); });
  }
  return null;
}

function translateText(node) {
  const value = node.nodeValue;
  if (!/[A-Za-zÁÉÍÓÚáéíóúñ]/.test(value)) return;
  const parent = node.parentElement;
  if (!parent || parent.closest(SKIP)) return;
  const out = t(value);
  if (out == null) return;
  const [, lead, , trail] = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const next = lead + out + trail;
  if (next !== value) node.nodeValue = next;
}

function translateAttrs(el) {
  if (el.closest('[translate="no"]')) return;
  for (const a of ATTRS) {
    if (a === 'content' && !(el.tagName === 'META' && /description/.test(el.getAttribute('name') ?? el.getAttribute('property') ?? ''))) continue;
    const v = el.getAttribute(a);
    if (!v) continue;
    const out = t(v);
    if (out != null && out !== v) el.setAttribute(a, out);
  }
  if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button') && el.value) {
    const out = t(el.value);
    if (out != null) el.value = out;
  }
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return translateText(root);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    n.nodeType === Node.TEXT_NODE ? translateText(n) : translateAttrs(n);
  }
}

let started = null;
export function initI18n() {
  started ??= (async () => {
    document.documentElement.lang = LANG;
    if (LANG === 'es') return;
    const { default: dict } = await import('./i18n-dict.js');
    const col = LANG === 'en' ? 0 : 1;
    words = new Map();
    for (const [key, tr] of Object.entries(dict)) {
      const out = tr[col];
      if (!out) continue;
      key.includes('{') ? patterns.push([compile(key), out]) : words.set(key.replace(/\s+/g, ' ').trim(), out);
    }
    translateTree(document.documentElement);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(translateTree);
        else if (m.type === 'characterData') translateText(m.target);
        else if (m.type === 'attributes') translateAttrs(m.target);
      }
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  })();
  return started;
}

// Selector de idioma (menú y pie)
export function langPicker(className = '') {
  const sel = document.createElement('select');
  sel.className = `lang-select ${className}`;
  sel.setAttribute('aria-label', 'Idioma / Language');
  sel.setAttribute('translate', 'no');
  for (const [code, name] of Object.entries(LANGS)) {
    sel.add(new Option(name, code, false, code === LANG));
  }
  sel.addEventListener('change', () => setLang(sel.value));
  return sel;
}
