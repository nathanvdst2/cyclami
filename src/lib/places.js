// Lieux utiles aux cyclistes (OpenStreetMap) : types, cache par zone de 0,05° et préchargement.
// Séparé de la carte (Leaflet) pour pouvoir précharger les lieux avant d'ouvrir la carte.
import { useEffect, useState } from 'react';
import { t } from '../i18n/index.js';
import { useApp } from '../context/AppContext.jsx';
import { API } from './supabase.js';

// Lieux utiles autour de la carte, depuis OpenStreetMap (API Overpass, gratuite).
// Les identifiants (id) sont enregistrés en base (favoris, avis) : ne pas les changer.
export const PLACE_KINDS = [
  { id: 'repair', emoji: '🔧', label: t('Bornes de réparation'), query: 'nwr["amenity"="bicycle_repair_station"]' },
  { id: 'shop', emoji: '🚲', label: t('Magasins vélo'), query: 'nwr["shop"="bicycle"]' },
  { id: 'water', emoji: '💧', label: t('Points d’eau'), query: 'node["amenity"="drinking_water"]' },
  { id: 'pump', emoji: '🎈', label: t('Gonflage'), query: 'nwr["amenity"="compressed_air"]' },
];

// Zones de 0,05° (≈ 5 km) : le service Cyclami les garde 7 jours, le téléphone 3 jours.
export const CELL = 0.05;
const TTL = 3 * 86400000;
const memory = new Map(); // zone → Promise<lieux>
const STORE = 'cyclami:places3:'; // v3 : lieux pour cyclistes (les anciennes zones gardées sur le téléphone sont effacées)
try {
  Object.keys(localStorage).filter((k) => /^cyclami:places2?:/.test(k)).forEach((k) => localStorage.removeItem(k));
} catch { /* stockage indisponible */ }

const kindOf = (tags) => (tags.amenity === 'bicycle_repair_station' ? 'repair'
  : tags.shop === 'bicycle' ? 'shop'
    : tags.amenity === 'drinking_water' ? 'water' : 'pump');

// Secours si le service Cyclami (/api/places) ne répond pas (développement, panne) : Overpass en direct.
async function fetchDirect(lat, lng) {
  const around = `(around:4500,${lat},${lng})`;
  const body = `[out:json][timeout:25];(${PLACE_KINDS.map((k) => `${k.query}${around};`).join('')});out center;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: body }) });
  if (!res.ok) throw new Error('overpass');
  return (await res.json()).elements.map((e) => ({
    id: `${e.type[0]}${e.id}`, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon, kind: kindOf(e.tags || {}),
    name: e.tags?.name || '', phone: e.tags?.phone || e.tags?.['contact:phone'] || '', hours: e.tags?.opening_hours || '',
  })).filter((x) => x.lat != null && x.lng != null);
}

export function loadCell(lat, lng) {
  const key = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
  if (memory.has(key)) return memory.get(key);
  const promise = (async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${STORE}${key}`) || 'null');
      if (saved && Date.now() - saved.at < TTL) return saved.places;
    } catch { /* stockage indisponible */ }
    let places;
    try {
      const res = await fetch(`${API}/places?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}`, { signal: AbortSignal.timeout?.(30000) });
      if (!res.ok || !/json/.test(res.headers.get('content-type') || '')) throw new Error('places');
      places = await res.json();
      if (!Array.isArray(places)) throw new Error('places');
    } catch {
      places = await fetchDirect(lat.toFixed(2), lng.toFixed(2));
    }
    try { localStorage.setItem(`${STORE}${key}`, JSON.stringify({ at: Date.now(), places })); } catch { /* plein */ }
    return places;
  })();
  promise.catch(() => memory.delete(key)); // réessayer plus tard en cas d'échec
  memory.set(key, promise);
  return promise;
}


// Précharge les lieux autour d'un point (zones voisines), sans attendre l'ouverture de la carte.
export function preloadPlaces(center) {
  if (!center) return;
  const cells = [];
  const i0 = Math.round(center.lat / CELL);
  const j0 = Math.round(center.lng / CELL);
  for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) cells.push([(i0 + di) * CELL, (j0 + dj) * CELL]);
  cells.forEach(([lat, lng], k) => setTimeout(() => loadCell(lat, lng).catch(() => {}), k * 150));
}

// Favoris partagés entre toutes les cartes ouvertes (chargés une fois par session)
let favCache = null;
const favListeners = new Set();
export function useFavorites() {
  const { actions } = useApp();
  const [favs, setFavs] = useState(favCache || []);
  useEffect(() => {
    favListeners.add(setFavs);
    if (!favCache) actions.favorites.list().then((l) => { favCache = l; favListeners.forEach((f) => f(l)); }).catch(() => {});
    return () => favListeners.delete(setFavs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = async (p) => {
    const on = !favs.some((f) => f.place_id === p.id);
    const next = on ? [{ place_id: p.id, kind: p.kind, name: p.name, lat: p.lat, lng: p.lng }, ...favs] : favs.filter((f) => f.place_id !== p.id);
    favCache = next;
    favListeners.forEach((f) => f(next));
    const err = await actions.favorites.toggle(p, on);
    if (err) { favCache = favs; favListeners.forEach((f) => f(favs)); }
    return err;
  };
  return [favs, toggle];
}
