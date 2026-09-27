// =====================================================================
// CONFIGURACIÓN DE SUPABASE
// Sacá estos dos valores de: Supabase > Project Settings > API
// (la "anon public key" es segura para poner acá: la seguridad real
//  la dan las reglas del archivo supabase/schema.sql)
// =====================================================================
export const SUPABASE_URL = 'https://mosaxafxqpsozjzmfvib.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_aZZGg_Q3YQXh3-slNovKYw_9paVn24W';

// Login con otras cuentas (opcional). Primero activalas en
// Supabase > Authentication > Sign In / Providers y después agregalas acá.
// Opciones: 'google', 'discord'.   Ejemplo: ['google', 'discord']
export const AUTH_PROVIDERS = [];

// Redes del estudio (dejá '' para ocultar el ícono)
export const SOCIALS = {
  roblox: '',   // ej: https://www.roblox.com/communities/123456/Aquino-Studios
  discord: '',  // ej: https://discord.gg/xxxx
  youtube: '',
  tiktok: '',
};

// =====================================================================
// DONACIONES — cada método aparece solo si está completado.
// Los de pago automático (Mercado Pago, PayPal, Stripe) además necesitan
// sus claves cargadas en Supabase (ver README, paso 5b).
// =====================================================================
export const DONATIONS = {
  enabled: true,

  // Pago automático (se confirma solo)
  mercadopago: true,   // pesos: tarjeta, débito, dinero en cuenta, Rapipago/Pago Fácil
  paypal: false,       // PayPal automático (necesita claves de desarrollador). Si usás PayPal.me, dejalo en false
  stripe: false,       // dólares: tarjetas de todo el mundo, Apple Pay y Google Pay

  // Montos rápidos por moneda
  amounts: { ARS: [500, 1000, 2500, 5000], USD: [2, 5, 10, 20] },

  // PayPal.me (sin claves): la gente elige el monto y se abre tu PayPal.me con ese monto.
  // Después avisa la donación y vos la confirmás en el panel.
  paypalme: '',        // ej: https://paypal.me/tuusuario

  // Transferencia bancaria / billetera (Argentina)
  transfer: {
    alias: '',     // ej: aquino.studios.mp
    cvu: '',       // CVU o CBU (22 números)
    holder: '',    // titular de la cuenta
    bank: '',      // ej: Mercado Pago, Ualá, Brubank
  },

  // Cripto: dirección de cada billetera ('' para ocultar)
  crypto: {
    'USDT (TRC20)': '',
    'USDT (BEP20)': '',
    'Bitcoin (BTC)': '',
    'Ethereum (ETH)': '',
  },
  binance: '',         // Binance Pay ID (número)

  // Robux: link a un Game Pass de donación en uno de tus juegos
  robux: '',           // ej: https://www.roblox.com/game-pass/123456/Donacion

  // Links de otras plataformas ('' para ocultar)
  links: {
    cafecito: '',      // https://cafecito.app/tuusuario
    kofi: '',          // https://ko-fi.com/tuusuario
    patreon: '',       // https://patreon.com/tuusuario
    buymeacoffee: '',  // https://buymeacoffee.com/tuusuario
    lemon: '',         // link de pago de Lemon Cash
    uala: '',          // link de cobro de Ualá
  },
};
