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
