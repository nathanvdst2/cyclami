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

// Score de compatibilité (0–100) entre deux animaux pour une sortie commune.
export function compatibility(a, b) {
  if (!a || !b) return 0;
  let score = 40;
  if (a.species === b.species) score += 20;
  score += 20 - Math.abs((a.energy ?? 3) - (b.energy ?? 3)) * 5;
  const sizes = ['petit', 'moyen', 'grand'];
  const sizeGap = Math.abs(sizes.indexOf(a.size) - sizes.indexOf(b.size));
  score += sizeGap === 0 ? 10 : sizeGap === 1 ? 5 : 0;
  const shared = (a.traits || []).filter((t) => (b.traits || []).includes(t)).length;
  score += Math.min(shared * 5, 10);
  if ((b.traits || []).includes('Sociable')) score += 5;
  if ((b.traits || []).includes('Timide') || (a.traits || []).includes('Timide')) score -= 5;
  return Math.max(0, Math.min(100, score));
}

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
