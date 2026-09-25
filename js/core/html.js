// =====================================================================
// Plantillas HTML seguras.
//
//   html`<p>${texto}</p>`   → escapa automáticamente todo lo que interpolás
//   raw(markup)             → marca un texto como HTML de confianza (no se escapa)
//   render(el, html`...`)   → dibuja la plantilla dentro de un elemento
//
// Así no hace falta acordarse de escapar: el contenido de los usuarios
// (comentarios, nombres, etc.) nunca se interpreta como HTML.
// =====================================================================

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

class SafeHTML {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

export const escape = (value) => String(value ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

// null/undefined no se dibujan; true/false se escriben como texto (sirve para aria-checked="${...}")
function stringify(value) {
  if (value == null) return '';
  if (value instanceof SafeHTML) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  return escape(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += stringify(values[i]) + strings[i + 1];
  return new SafeHTML(out);
}

export const raw = (markup) => new SafeHTML(String(markup ?? ''));

export function render(el, template) {
  el.innerHTML = stringify(template);
  return el;
}

// Solo acepta URLs https (evita javascript:, data: y similares en contenido de usuarios)
export const safeUrl = (url) => (typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url) ? url : '');

// Para usar una URL dentro de CSS: url("...") sin que pueda romper el estilo
export const cssUrl = (url) => {
  const u = safeUrl(url);
  return u ? `url("${u.replace(/["\\\n\r()]/g, encodeURIComponent)}")` : 'none';
};
