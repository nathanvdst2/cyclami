// GET /api/places?lat=50.70&lng=4.40 — lieux utiles aux cyclistes autour d'un point, depuis
// OpenStreetMap (API Overpass, gratuite) : bornes de réparation, magasins vélo, points d'eau, gonflage.
// Réponse : [{ id, lat, lng, kind, name, phone, hours }], kind ∈ repair | shop | water | pump.
// Zones de 0,05° (≈ 5 km) gardées 10 jours dans Netlify Blobs (magasin « cyclami-places ») ;
// une zone plus ancienne est servie tout de suite et rafraîchie en arrière-plan.
import { json, stores } from '../lib/shared.js';

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
export const PLACE_QUERIES = [
  'nwr["amenity"="bicycle_repair_station"]',
  'nwr["shop"="bicycle"]',
  'node["amenity"="drinking_water"]',
  'nwr["amenity"="compressed_air"]',
];
export const CELL = 0.05;
const FRESH_MS = 10 * 86400000;
const PREFIX = 'v1/';

export const placeKind = (tags) => (tags.amenity === 'bicycle_repair_station' ? 'repair'
  : tags.shop === 'bicycle' ? 'shop'
    : tags.amenity === 'drinking_water' ? 'water'
      : tags.amenity === 'compressed_air' ? 'pump' : null);

async function fetchOverpass(lat, lng) {
  const h = CELL / 2;
  const box = `[bbox:${(lat - h).toFixed(3)},${(lng - h).toFixed(3)},${(lat + h).toFixed(3)},${(lng + h).toFixed(3)}]`;
  const body = new URLSearchParams({ data: `[out:json][timeout:25]${box};(${PLACE_QUERIES.map((q) => `${q};`).join('')});out center;` });
  // le premier serveur qui répond gagne ; 25 s max par serveur
  const data = await Promise.any(OVERPASS_MIRRORS.map(async (url) => {
    const res = await fetch(url, {
      method: 'POST', body, headers: { 'User-Agent': 'Cyclami (https://cyclami.com)' }, signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const out = await res.json();
    // délai dépassé : liste incomplète, à ne pas garder en cache
    if (/error|timed out|out of memory/i.test(out.remark || '')) throw new Error('overpass incomplet');
    return out;
  }));
  return (data.elements || []).map((e) => ({
    id: `${e.type[0]}${e.id}`,
    lat: Math.round((e.lat ?? e.center?.lat) * 1e5) / 1e5,
    lng: Math.round((e.lon ?? e.center?.lon) * 1e5) / 1e5,
    kind: placeKind(e.tags || {}),
    name: e.tags?.name || '',
    phone: e.tags?.phone || e.tags?.['contact:phone'] || '',
    hours: e.tags?.opening_hours || '',
  })).filter((p) => p.kind && Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export default async (req, context) => {
  if (req.method !== 'GET') return json({ error: 'Méthode non autorisée' }, 405, { Allow: 'GET' });
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!url.searchParams.get('lat') || !url.searchParams.get('lng') || !Number.isFinite(lat) || !Number.isFinite(lng)
    || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return json({ error: 'Position invalide' }, 400);
  }
  const clat = (Math.round(lat / CELL) * CELL).toFixed(2);
  const clng = (Math.round(lng / CELL) * CELL).toFixed(2);
  const reply = (body) => new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
  const key = `${PREFIX}${clat}_${clng}`;
  const store = stores.get('cyclami-places');
  const save = (places) => store.set(key, JSON.stringify(places), { metadata: { at: Date.now() } });

  const stored = await store.getWithMetadata(key, { type: 'text' }).catch(() => null);
  const at = Number(stored?.metadata?.at || 0);
  if (stored && Date.now() - at < FRESH_MS) return reply(stored.data);
  if (stored) {
    // ancienne version : servie tout de suite, mise à jour en arrière-plan pour la prochaine visite
    const refresh = fetchOverpass(Number(clat), Number(clng)).then(save).catch(() => {});
    context?.waitUntil?.(refresh);
    return reply(stored.data);
  }
  let places;
  try {
    places = await fetchOverpass(Number(clat), Number(clng));
  } catch {
    return json({ error: 'Lieux indisponibles pour le moment' }, 502);
  }
  const saving = save(places).catch(() => {});
  if (context?.waitUntil) context.waitUntil(saving); else await saving;
  return reply(JSON.stringify(places));
};

export const config = { path: '/api/places' };
