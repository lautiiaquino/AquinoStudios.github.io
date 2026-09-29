// Verificación "No soy un robot" con Cloudflare Turnstile (opcional).
// Frena bots que crean cuentas o prueban contraseñas en masa. Se activa poniendo
// CAPTCHA_SITE_KEY en js/config.js y activando Turnstile en Supabase (ver README).
// Si no hay clave, todo funciona igual que antes, sin verificación.
import * as CONFIG from '../config.js';

const KEY = CONFIG.CAPTCHA_SITE_KEY ?? '';
export const captchaOn = () => /^0x[\w-]{10,}$/.test(KEY);

let loading;
function loadTurnstile() {
  loading ??= new Promise((resolve, reject) => {
    window.onTurnstileLoad = resolve;
    const s = Object.assign(document.createElement('script'), {
      src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad',
      async: true,
    });
    s.onerror = () => reject(new Error('No se pudo cargar la verificación'));
    document.head.append(s);
  });
  return loading;
}

// Dibuja el widget dentro de `el` y devuelve { token(), reset() }. Sin clave devuelve null.
export async function mountCaptcha(el) {
  if (!captchaOn() || !el) return null;
  await loadTurnstile();
  const id = window.turnstile.render(el, { sitekey: KEY, theme: 'auto', language: 'es', size: 'flexible' });
  return {
    token: () => window.turnstile.getResponse(id) || null,
    reset: () => window.turnstile.reset(id),
  };
}
