import { createClient } from '@supabase/supabase-js';
import { compressImage } from '../utils/image.js';

// La clé « publishable » est faite pour être publique : la sécurité repose sur les
// règles Row Level Security définies dans supabase/schema.sql.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://qwhssunuewkzdppzvjdv.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_aaKHdx4rse2owAsSRLL4Rg_jGJ3HTIk';

// Session gardée dans le navigateur et renouvelée automatiquement : on reste connecté
// jusqu'à ce qu'on clique sur « Se déconnecter ».
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Demande au navigateur de ne pas effacer les données du site (dont la session) quand l'espace manque.
try { navigator.storage?.persist?.().catch(() => {}); } catch { /* non pris en charge */ }

// Service photos Cloudflare (R2). Tant qu'il n'est pas configuré, les photos publiques
// restent dans Supabase Storage : rien ne casse.
export const PHOTO_API = (import.meta.env.VITE_PHOTO_API_URL || '').replace(/\/+$/, '');

export const PHOTO_BUCKET = 'photos'; // public : animaux, publications
export const MESSAGE_PHOTO_BUCKET = 'message-photos'; // privé : photos des messages
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

async function upload(bucket, userId, file) {
  const photo = await compressImage(file);
  if (photo.size > MAX_PHOTO_BYTES) throw new Error('Image trop lourde, même après compression (10 Mo maximum).');
  const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, photo, { contentType: photo.type });
  if (error) throw error;
  return path;
}

// Crédits d'e-mails Brevo restants (administrateurs) : { type, credits }
export async function emailQuota() {
  if (!PHOTO_API) return null;
  return photoApi('GET', 'email-quota');
}

async function photoApi(method, path, body, contentType) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${PHOTO_API}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${data.session?.access_token || ''}`,
      ...(contentType && { 'Content-Type': contentType }),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Le service photos ne répond pas, réessaie dans un instant.');
  return json;
}

// Photo publique (animal, publication) : renvoie son URL.
export async function uploadPhoto(userId, file) {
  if (PHOTO_API) {
    const photo = await compressImage(file);
    if (photo.size > MAX_PHOTO_BYTES) throw new Error('Image trop lourde, même après compression (10 Mo maximum).');
    return (await photoApi('POST', 'upload', photo, photo.type)).url;
  }
  const path = await upload(PHOTO_BUCKET, userId, file);
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Supprime toutes les photos publiques du membre chez Cloudflare (suppression de compte).
export async function deleteAllMyCloudPhotos() {
  if (PHOTO_API) await photoApi('DELETE', 'mine');
}

// Toutes les photos d'un membre dont le compte est supprimé (administrateur seulement)
export async function deleteMemberCloudPhotos(userId) {
  if (PHOTO_API) await photoApi('DELETE', `user/${userId}`);
}

// Photo de message privé : renvoie le chemin dans le stockage privé (lu via lien temporaire).
export function uploadMessagePhoto(userId, file) {
  return upload(MESSAGE_PHOTO_BUCKET, userId, file);
}

// Supprime une photo publique à partir de son URL (photo remplacée ou contenu supprimé).
export async function deletePublicPhoto(photoUrl) {
  if (PHOTO_API && photoUrl?.startsWith(`${PHOTO_API}/`)) {
    await photoApi('DELETE', photoUrl.slice(PHOTO_API.length + 1));
    return;
  }
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const i = photoUrl?.indexOf(marker) ?? -1;
  if (i < 0) return;
  await supabase.storage.from(PHOTO_BUCKET).remove([decodeURIComponent(photoUrl.slice(i + marker.length))]);
}
