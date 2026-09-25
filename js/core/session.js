// Sesión y perfil del usuario.
import { sb } from './supabase.js';

let profilePromise;

export async function getSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getUser() {
  return (await getSession())?.user ?? null;
}

// El perfil se pide una sola vez por página (aunque lo llamen varios módulos a la vez).
export function getProfile({ force = false } = {}) {
  if (!sb) return Promise.resolve(null);
  if (!profilePromise || force) {
    profilePromise = (async () => {
      const session = await getSession();
      if (!session) return null;
      const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
      return data;
    })();
  }
  return profilePromise;
}

const here = () => location.pathname.split('/').pop() + location.search;
export const loginUrl = (back = here()) => `login.html?next=${encodeURIComponent(back)}`;

export async function requireAuth({ admin = false } = {}) {
  if (!sb) return null;
  const profile = await getProfile();
  if (!profile) { location.replace(loginUrl()); return null; }
  if (admin && profile.role !== 'admin') { location.replace('index.html'); return null; }
  return profile;
}

export async function signOut({ everywhere = false } = {}) {
  await sb?.auth.signOut(everywhere ? { scope: 'global' } : undefined);
  location.href = 'index.html';
}
