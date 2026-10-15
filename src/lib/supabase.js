import { createClient } from '@supabase/supabase-js';
import { compressImage } from '../utils/image.js';

// Adresse et clé « publishable » du projet Supabase, lues dans les variables d'environnement
// VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY (Netlify → Environment variables, ou .env.local
// en développement). La clé « publishable » est faite pour être publique : la sécurité repose sur
// les règles Row Level Security définies dans supabase/schema.sql.
const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export const supabaseConfigured = Boolean(url && key);
if (!supabaseConfigured) {
  console.error(
    'Cyclami : configuration Supabase manquante. Renseigne VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY '
    + '(Netlify → Site configuration → Environment variables, ou fichier .env.local en local), puis reconstruis le site. '
    + 'Voir README, « Mise en ligne pas à pas ».',
  );
}

// Session gardée dans le navigateur et renouvelée automatiquement : on reste connecté
// jusqu'à ce qu'on clique sur « Se déconnecter ».
// (Sans configuration, une adresse factice évite de bloquer l'affichage : rien ne se charge.)
export const supabase = createClient(url || 'https://supabase-non-configure.invalid', key || 'cle-manquante', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Demande au navigateur de ne pas effacer les données du site (dont la session) quand l'espace manque.
try { navigator.storage?.persist?.().catch(() => {}); } catch { /* non pris en charge */ }

// Fonctions serveur Netlify (netlify/functions), sur le même domaine : /api/notify, /api/push,
// /api/push/key, /api/places, /api/email-quota… En développement local (vite), elles ne répondent
// pas : les appels échouent sans bloquer le site (utiliser `netlify dev` pour les tester).
export const API = '/api';

export const PHOTO_BUCKET = 'photos'; // public : vélos, publications, photos de profil
export const MESSAGE_PHOTO_BUCKET = 'message-photos'; // privé : photos des messages
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

async function upload(bucket, userId, file) {
  const photo = await compressImage(file);
  if (photo.size > MAX_PHOTO_BYTES) throw new Error('Image trop lourde, même après compression (10 Mo maximum).');
  const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, photo, { contentType: photo.type, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

async function api(method, path) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Le service ne répond pas, réessaie dans un instant.');
  return json;
}

// Crédits d'e-mails Brevo restants (administrateurs) : { type, credits }
export function emailQuota() {
  return api('GET', 'email-quota');
}

// Photo publique (vélo, publication, profil) : renvoie son URL.
export async function uploadPhoto(userId, file) {
  const path = await upload(PHOTO_BUCKET, userId, file);
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Photo de message privé : renvoie le chemin dans le stockage privé (lu via lien temporaire).
export function uploadMessagePhoto(userId, file) {
  return upload(MESSAGE_PHOTO_BUCKET, userId, file);
}

// Chemin d'une photo publique dans le stockage, à partir de son URL (null si ce n'est pas une photo Cyclami).
export function photoPath(photoUrl) {
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const i = photoUrl?.indexOf(marker) ?? -1;
  return i < 0 ? null : decodeURIComponent(photoUrl.slice(i + marker.length).split('?')[0]);
}

// Supprime une photo publique à partir de son URL (photo remplacée ou contenu supprimé).
export async function deletePublicPhoto(photoUrl) {
  const path = photoPath(photoUrl);
  if (!path) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}

// Toutes les photos publiques d'un dossier (un dossier par membre), supprimées par paquets de 100.
async function deleteFolder(userId) {
  if (!userId) return 0;
  let deleted = 0;
  for (let round = 0; round < 50; round += 1) {
    const { data, error } = await supabase.storage.from(PHOTO_BUCKET).list(userId, { limit: 100 });
    if (error) throw error;
    const paths = (data || []).filter((o) => o.name && o.id !== null).map((o) => `${userId}/${o.name}`);
    if (!paths.length) break;
    const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    if (removeError) throw removeError;
    deleted += paths.length;
    if (paths.length < 100) break;
  }
  return deleted;
}

// Supprime toutes les photos publiques du membre connecté (suppression de compte).
export async function deleteAllMyCloudPhotos() {
  const { data } = await supabase.auth.getSession();
  return deleteFolder(data.session?.user?.id);
}

// Toutes les photos d'un membre dont le compte est supprimé (administrateur seulement : la base l'autorise).
export function deleteMemberCloudPhotos(userId) {
  return deleteFolder(userId);
}
