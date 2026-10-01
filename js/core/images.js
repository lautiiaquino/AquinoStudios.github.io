// Imágenes: compresión en el navegador (Canvas) y subida a Supabase Storage.
import { sb } from './supabase.js';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = /^image\/(png|jpeg|webp|gif)$/;

// Achica la imagen a un máximo de `maxSize` px y la convierte a WEBP.
// Los GIF se dejan igual para no perder la animación.
export async function compressImage(file, { maxSize = 1920, quality = 0.86 } = {}) {
  if (!TYPES.test(file.type)) throw new Error('mime type');
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  let blob;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    blob = await canvas.convertToBlob({ type: 'image/webp', quality });
  } else {
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  }
  bitmap.close?.();
  // Si el navegador no sabe hacer WEBP, o el original ya era más liviano, se usa el original
  return blob && blob.type === 'image/webp' && blob.size < file.size ? blob : file;
}

export async function uploadImage(file, folder, { bucket = 'media', maxSize = 1920 } = {}) {
  const blob = await compressImage(file, { maxSize });
  if (blob.size > MAX_BYTES) throw new Error('payload too large');
  const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }[blob.type] ?? 'img';
  const path = `${folder}/${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Foto de perfil: va a su propia carpeta ("avatars/<tu-user-id>/...") para que las reglas
// de la base solo te dejen subir o borrar las tuyas. Se achica más porque es chica en pantalla.
export const uploadAvatar = (file, userId) => uploadImage(file, userId, { bucket: 'avatars', maxSize: 400 });

// Lee las imágenes de un evento de soltar (drag & drop) o de pegar (Ctrl+V)
export function imagesFrom(dataTransfer) {
  return [...(dataTransfer?.files ?? [])].filter((f) => TYPES.test(f.type));
}
