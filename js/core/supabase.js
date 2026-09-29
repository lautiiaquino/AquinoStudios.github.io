// Versión fija de la librería: así una actualización de Supabase nunca rompe el sitio sin aviso.
// Para actualizarla, cambiá el número acá (y en la política de seguridad CSP no hace falta tocar nada).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const configured = /^https:\/\/.+\.supabase\.co/.test(SUPABASE_URL) && !SUPABASE_ANON_KEY.startsWith('TU_');
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
