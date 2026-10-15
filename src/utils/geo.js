import { locale, t } from '../i18n/index.js';
// Distance en km entre deux points (formule de Haversine).
export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Compatibilité (0–100) entre deux cyclistes pour rouler ensemble : niveau, vitesse habituelle,
// disciplines communes, disponibilités communes et distance entre les deux.
//   a, b : membres { level, usualSpeed, disciplines, availability, coords }
export function compatibilityDetails(a, b) {
  if (!a || !b) return { score: 0, km: null, sharedDisciplines: [], sharedSlots: [], levelGap: null, speedGap: null };
  const order = ['debutant', 'intermediaire', 'confirme', 'sportif'];
  const ra = order.indexOf(a.level);
  const rb = order.indexOf(b.level);
  const levelGap = ra >= 0 && rb >= 0 ? Math.abs(ra - rb) : null;
  const speedGap = a.usualSpeed && b.usualSpeed ? Math.abs(a.usualSpeed - b.usualSpeed) : null;
  const sharedDisciplines = (a.disciplines || []).filter((d) => (b.disciplines || []).includes(d));
  const sharedSlots = (a.availability || []).filter((s) => (b.availability || []).includes(s));
  const km = a.coords && b.coords ? distanceKm(a.coords, b.coords) : null;

  let score = 0;
  // niveau : 35 points
  score += levelGap == null ? 15 : [35, 20, 5, 0][levelGap];
  // vitesse moyenne habituelle : 25 points (inconnue : on se fie au niveau)
  if (speedGap == null) score += levelGap == null ? 10 : [20, 10, 0, 0][levelGap];
  else score += speedGap <= 2 ? 25 : speedGap <= 4 ? 18 : speedGap <= 7 ? 10 : speedGap <= 10 ? 4 : 0;
  // disciplines : 20 points
  if (!(a.disciplines || []).length || !(b.disciplines || []).length) score += 10;
  else score += sharedDisciplines.length ? 20 : 0;
  // disponibilités : 10 points
  if (!(a.availability || []).length || !(b.availability || []).length) score += 5;
  else score += Math.min(sharedSlots.length * 4, 10);
  // distance : 10 points
  score += km == null ? 3 : km <= 5 ? 10 : km <= 15 ? 7 : km <= 30 ? 4 : 0;

  return { score: Math.max(0, Math.min(100, Math.round(score))), km, sharedDisciplines, sharedSlots, levelGap, speedGap };
}

export const compatibility = (a, b) => compatibilityDetails(a, b).score;

export function formatDate(iso) {
  return new Date(iso).toLocaleString(locale(), {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return t('à l’instant');
  if (diff < 3600) return t('il y a {n} min', { n: Math.floor(diff / 60) });
  if (diff < 86400) return t('il y a {n} h', { n: Math.floor(diff / 3600) });
  return t('il y a {n} j', { n: Math.floor(diff / 86400) });
}

export const uid = () => Math.random().toString(36).slice(2, 10);

// Décalage stable (~200 m) propre à chaque membre, pour que deux voisins ne se superposent
// pas sur la carte et pour ne jamais afficher une position exacte.
export function fuzz(coords, seed) {
  if (!coords) return null;
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) | 0;
  const a = ((h & 0xffff) / 0xffff - 0.5) * 0.004;
  const b = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.004;
  return { lat: coords.lat + a, lng: coords.lng + b };
}
