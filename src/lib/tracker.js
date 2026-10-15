// Suivi d'une sortie vélo au GPS : distance, vitesses et durée, calculées sur le téléphone.
// Le tracé reste sur l'appareil (localStorage, pour survivre à un rechargement) : seuls la distance,
// la durée et les vitesses sont enregistrées dans la base à la fin (table ride_tracks).

import { locale } from '../i18n/index.js';

const KEY = 'cyclami:track';
const MAX_POINTS = 5000; // au-delà, on garde un point sur deux (le tracé n'est qu'un aperçu)
const MAX_ACCURACY_M = 30; // point trop imprécis : ignoré (le GPS d'un téléphone dehors fait 5 à 20 m)
const MIN_STEP_M = 5; // petits sauts dus au GPS immobile : ignorés
const MAX_SPEED_KMH = 70; // au-delà : saut du GPS (ou trajet en voiture), point ignoré
const STALE_MS = 10000; // plus de position depuis 10 s : vitesse instantanée inconnue

export const GOOD_ACCURACY_M = MAX_ACCURACY_M;
// Plafonds (mêmes limites que la base)
export const MAX_DURATION_S = 16 * 3600;
export const MAX_DISTANCE_M = 400000;
export const MAX_AVG_MS = 17; // ≈ 61 km/h de moyenne : au-delà, ce n'est plus du vélo

export function meters(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function loadTrack() {
  try {
    const tr = JSON.parse(localStorage.getItem(KEY) || 'null');
    // ancien format (sans segments) : on l'abandonne
    return tr && Array.isArray(tr.segments) ? tr : null;
  } catch { return null; }
}
export function saveTrack(track) {
  try { if (track) localStorage.setItem(KEY, JSON.stringify(track)); else localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
}

// rideId : sortie de Cyclami à laquelle rattacher le suivi (facultatif)
export const newTrack = (rideId = null) => ({
  startedAt: Date.now(), rideId, distance: 0, last: null, segments: [], rejected: 0,
  speed: 0, maxSpeed: 0, paused: false, pausedAt: null, pausedMs: 0, received: 0, fix: null,
});

// Durée en mouvement (pauses non comprises), en secondes
export const elapsedS = (track, now = Date.now()) => (track
  ? Math.max(0, (now - track.startedAt - (track.pausedMs || 0) - (track.paused ? now - track.pausedAt : 0)) / 1000)
  : 0);

// Vitesse instantanée (km/h) : 0 en pause ou sans position récente
export const currentSpeed = (track, now = Date.now()) => (
  !track || track.paused || !track.last || now - track.last.at > STALE_MS ? 0 : track.speed || 0);

// Vitesse moyenne (km/h) sur la durée en mouvement
export const averageSpeed = (distanceM, durationS) => (durationS > 0 ? (distanceM / durationS) * 3.6 : 0);

export const pauseTrack = (track) => (track.paused ? track : { ...track, paused: true, pausedAt: Date.now(), last: null, speed: 0 });
// à la reprise, le tracé repart d'un nouveau segment (la distance parcourue pendant la pause ne compte pas)
export const resumeTrack = (track) => (track.paused
  ? { ...track, paused: false, pausedMs: (track.pausedMs || 0) + (Date.now() - track.pausedAt), pausedAt: null, last: null, rejected: 0 }
  : track);

const pointCount = (segments) => segments.reduce((s, seg) => s + seg.length, 0);
const thin = (segments) => segments.map((seg) => seg.filter((_, i) => i % 2 === 0 || i === seg.length - 1));

// Ajoute une position GPS au suivi (renvoie le nouveau suivi, ou le même avec seulement la position affichée).
export function addPosition(track, pos) {
  const acc = pos.coords.accuracy ?? 0;
  const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: pos.timestamp || Date.now(), at: Date.now() };
  // dernière position reçue (même imprécise) : affichée sur la carte avec sa précision
  track = { ...track, fix: { lat: p.lat, lng: p.lng, acc: Math.round(acc), at: Date.now() }, received: (track.received || 0) + 1 };
  if (track.paused || acc > MAX_ACCURACY_M) return track;
  // premier point (départ ou reprise) : nouveau segment
  if (!track.last) return { ...track, last: p, speed: 0, segments: [...track.segments, [[p.lat, p.lng]]] };
  const d = meters(track.last, p);
  const dt = Math.max(1, (p.t - track.last.t) / 1000);
  const kmh = (d / dt) * 3.6;
  if (kmh > MAX_SPEED_KMH) {
    // plusieurs sauts d'affilée : on repart de la nouvelle position (nouveau segment), sans compter la distance
    return track.rejected >= 2
      ? { ...track, last: p, rejected: 0, speed: 0, segments: [...track.segments, [[p.lat, p.lng]]] }
      : { ...track, rejected: track.rejected + 1 };
  }
  // vitesse mesurée par le GPS (effet Doppler, plus fiable) si le téléphone la donne
  const gps = pos.coords.speed;
  const hasGps = Number.isFinite(gps) && gps >= 0 && gps * 3.6 <= MAX_SPEED_KMH;
  const measured = hasGps ? gps * 3.6 : kmh;
  if (d < MIN_STEP_M) {
    // à l'arrêt ou presque : la vitesse baisse, la distance ne bouge pas
    return { ...track, speed: Math.min(measured, track.speed || 0), last: { ...track.last, at: p.at } };
  }
  const speed = track.speed ? (track.speed + measured) / 2 : measured; // lissage léger
  const segments = track.segments.slice();
  segments[segments.length - 1] = [...segments[segments.length - 1], [p.lat, p.lng]];
  return {
    ...track,
    distance: track.distance + d,
    last: p,
    rejected: 0,
    speed,
    // vitesse max : sur la vitesse lissée, mesurée par le GPS ou sur au moins 2 s (évite les pointes dues au GPS)
    maxSpeed: hasGps || dt >= 2 ? Math.max(track.maxSpeed || 0, speed) : track.maxSpeed || 0,
    segments: pointCount(segments) > MAX_POINTS ? thin(segments) : segments,
  };
}

// Résultat à enregistrer, ramené dans les limites plausibles (16 h, 400 km, ≤ 61 km/h de moyenne)
export function summary(track, now = Date.now()) {
  const durationS = Math.min(elapsedS(track, now), MAX_DURATION_S);
  const distanceM = Math.min(track.distance, MAX_DISTANCE_M, durationS * MAX_AVG_MS);
  const avgSpeed = averageSpeed(distanceM, durationS);
  return {
    startedAt: track.startedAt,
    rideId: track.rideId || null,
    durationS,
    distanceM,
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    maxSpeed: Math.round(Math.min(MAX_SPEED_KMH, Math.max(track.maxSpeed || 0, avgSpeed)) * 10) / 10,
  };
}

// Garde l'écran allumé pendant la sortie (sinon le téléphone coupe le GPS du navigateur).
// Renvoie null si le navigateur ne sait pas le faire (Wake Lock indisponible).
export async function keepAwake() {
  try { return (await navigator.wakeLock?.request('screen')) || null; } catch { return null; }
}
export const canKeepAwake = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

export const formatKm = (m) => (m / 1000).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatSpeed = (kmh) => (Number(kmh) || 0).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatDuration = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
