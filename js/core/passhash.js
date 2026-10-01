// Capa propia sobre la contraseña: el navegador NO manda la contraseña que escribe la persona,
// sino una huella derivada de ella (PBKDF2-SHA256, 100.000 vueltas, con una sal propia del sitio).
// Después Supabase la vuelve a cifrar con bcrypt, así que quedan dos capas.
//
// Qué mejora: la contraseña real nunca sale del dispositivo ni llega al servidor, así que si
// alguien reutiliza esa clave en otros sitios, queda a salvo aunque se filtraran los registros.
// Qué NO hace: la huella pasa a ser la clave de este sitio, y la sal es pública (no es un secreto).
//
// OJO: no cambiar SALT ni ROUNDS una vez que haya cuentas, o nadie podría volver a entrar.
const SALT = 'aquino-studios/pw/v1';
const ROUNDS = 100_000;
const enc = new TextEncoder();

export async function lock(password) {
  if (!globalThis.crypto?.subtle) throw new Error('secure-crypto-unavailable');
  const key = await crypto.subtle.importKey('raw', enc.encode(String(password).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ROUNDS }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
