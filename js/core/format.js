// Formatos con la API Intl del navegador (idioma: español de Argentina).

const LOCALE = 'es-AR';
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat(LOCALE);
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export const number = (n) => compact.format(Number(n) || 0);
export const fullNumber = (n) => plain.format(Number(n) || 0);
export const date = (iso) => dateFmt.format(new Date(iso));
export const dateTime = (iso) => dateTimeFmt.format(new Date(iso));
export const dayMonth = (iso) => shortDate.format(new Date(iso));

const UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
export function ago(iso) {
  const secs = (new Date(iso) - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size) return relative.format(Math.round(secs / size), unit);
  }
  return 'hace un momento';
}

export const plural = (n, one, many) => `${fullNumber(n)} ${n === 1 ? one : many}`;
