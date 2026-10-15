// Suivi d'une sortie au GPS : distance et durée, calculées sur le téléphone.
// Le tracé reste sur l'appareil (localStorage, pour survivre à un rechargement) : seuls la distance
// et la durée sont enregistrées dans la base à la fin.

import { locale } from '../i18n/index.js';

const KEY = 'cyclami:track';
const MAX_POINTS = 3000;
const MAX_ACCURACY_M = 50; // point trop imprécis : ignoré (le GPS d'un téléphone dehors fait 5 à 20 m)
const MIN_STEP_M = 4; // petits sauts dus au GPS immobile : ignorés
const MAX_SPEED_MS = 7; // ≈ 25 km/h : au-delà, saut du GPS (ou trajet en voiture)

export const GOOD_ACCURACY_M = MAX_ACCURACY_M;

export const BADGES = [
  { km: 10, emoji: '🥉' }, { km: 50, emoji: '🥈' }, { km: 100, emoji: '🥇' },
  { km: 250, emoji: '🏅' }, { km: 500, emoji: '🏆' }, { km: 1000, emoji: '👑' },
];
export const badgeFor = (km) => [...BADGES].reverse().find((b) => km >= b.km) || null;
export const nextBadge = (km) => BADGES.find((b) => km < b.km) || null;

export function meters(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function loadTrack() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
export function saveTrack(track) {
  try { if (track) localStorage.setItem(KEY, JSON.stringify(track)); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
}

export const newTrack = () => ({ startedAt: Date.now(), distance: 0, last: null, points: [], rejected: 0 });

// Ajoute une position GPS au suivi (renvoie le nouveau suivi, ou le même si le point est ignoré).
export function addPosition(track, pos) {
  const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: pos.timestamp || Date.now() };
  // dernière position reçue (même imprécise) : affichée sur la carte avec sa précision
  track = { ...track, fix: { lat: p.lat, lng: p.lng, acc: Math.round(pos.coords.accuracy ?? 0), at: Date.now() }, received: (track.received || 0) + 1 };
  if ((pos.coords.accuracy ?? 0) > MAX_ACCURACY_M) return track;
  if (!track.last) return { ...track, last: p, points: [[p.lat, p.lng]] };
  const d = meters(track.last, p);
  const dt = Math.max(1, (p.t - track.last.t) / 1000);
  if (d < MIN_STEP_M) return track;
  if (d / dt > MAX_SPEED_MS) {
    // plusieurs sauts d'affilée : on repart de la nouvelle position, sans compter la distance
    return track.rejected >= 2 ? { ...track, last: p, rejected: 0 } : { ...track, rejected: track.rejected + 1 };
  }
  const points = [...track.points, [p.lat, p.lng]];
  return { ...track, distance: track.distance + d, last: p, rejected: 0, points: points.length > MAX_POINTS ? points.filter((_, i) => i % 2 === 0) : points };
}

// Garde l'écran allumé pendant la sortie (sinon le téléphone coupe le GPS du navigateur).
export async function keepAwake() {
  try { return await navigator.wakeLock?.request('screen'); } catch { return null; }
}

export const formatKm = (m) => (m / 1000).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatDuration = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
