// Télécharge les lieux utiles (OpenStreetMap) de la Belgique et de la France par carreaux de 1°, puis
// remplit le stockage du service Cyclami : la carte n'interroge plus OpenStreetMap en direct.
// Chaque carreau est envoyé dès qu'il est prêt ; un carreau en échec est repris au passage suivant.
// Les carreaux importés depuis moins de 6 jours sont sautés : le workflow quotidien avance petit à petit.
// Usage : NOTIFY_SECRET=… node scripts/import-places.mjs [belgique] [france]   (DRY=1 : sans envoi)
const API = process.env.PLACES_API || 'https://cyclami-photos.nathanbarbaraytb.workers.dev';
const REGIONS = {
  belgique: { south: 49.45, west: 2.5, north: 51.55, east: 6.45 },
  france: { south: 41.3, west: -5.2, north: 51.15, east: 9.6 },
};
const CELL = 0.05; // même découpage que le service (src/index.js) et la carte (PlacesLayer.jsx)
const REFRESH_DAYS = 6;
// carreaux importés avant cette date : à refaire (réponses tronquées par OpenStreetMap acceptées à tort)
const VALID_SINCE = Date.parse('2026-10-14T00:00:00Z');
const PIECE = 0.25; // un carreau est téléchargé en 16 morceaux : une réponse complète plutôt qu'une tronquée
const BUDGET_MS = 85 * 60 * 1000; // s'arrête à temps avant la limite du workflow (vérifié avant chaque morceau)
const MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const QUERY = [
  'nwr["leisure"="dog_park"]', 'nwr["leisure"="park"]["name"]', 'node["amenity"="drinking_water"]',
  'nwr["amenity"="veterinary"]', 'nwr["shop"="pet"]',
].map((q) => `${q};`).join('');
const kindOf = (tags) => (tags.leisure === 'dog_park' ? 'dog_park'
  : tags.leisure === 'park' ? 'park'
    : tags.amenity === 'drinking_water' ? 'water'
      : tags.amenity === 'veterinary' ? 'vet' : 'pet_shop');

const started = Date.now();
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const cellOf = (x) => Math.round(x / CELL) * CELL;
const cellKey = (lat, lng) => `${cellOf(lat).toFixed(2)}_${cellOf(lng).toFixed(2)}`;
// carreau d'une zone = carreau de son centre (même règle que tileOf dans le service)
const tileOfCell = (clat, clng) => `${Math.floor(clat + 1e-9)}_${Math.floor(clng + 1e-9)}`;

async function overpass(box) {
  const body = new URLSearchParams({
    data: `[out:json][timeout:180][bbox:${box.south},${box.west},${box.north},${box.east}];(${QUERY});out center;`,
  });
  for (let round = 0; round < 3; round += 1) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST', body,
          headers: { 'User-Agent': 'Cyclami (contact@cyclami.com)', Accept: 'application/json' },
          signal: AbortSignal.timeout(200000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // délai ou mémoire dépassés : Overpass répond 200 avec une liste incomplète et une remarque
        if (/error|timed out|out of memory/i.test(json.remark || '')) throw new Error(`réponse incomplète : ${json.remark}`);
        return json.elements;
      } catch (e) {
        console.log(`    ⚠️ ${new URL(url).hostname} : ${e.message}`);
      }
    }
    await wait(15000 * (round + 1)); // serveurs surchargés : on patiente avant de réessayer
  }
  return null;
}

async function send(cells, tiles) {
  const res = await fetch(`${API}/places/import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.NOTIFY_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cells, tiles }),
  });
  if (!res.ok) throw new Error(`Import refusé : HTTP ${res.status} ${await res.text()}`);
}

// carreaux de 1° couvrant les régions demandées
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(REGIONS);
const tiles = new Map();
for (const name of names) {
  const r = REGIONS[name];
  if (!r) throw new Error(`Région inconnue : ${name}`);
  for (let lat = Math.floor(r.south); lat <= Math.floor(r.north); lat += 1) {
    for (let lng = Math.floor(r.west); lng <= Math.floor(r.east); lng += 1) tiles.set(`${lat}_${lng}`, { lat, lng });
  }
}

if (!process.env.DRY && !process.env.NOTIFY_SECRET) throw new Error('NOTIFY_SECRET manquant');
const done = process.env.DRY ? {} : await fetch(`${API}/places/tiles`).then((r) => r.json()).catch(() => ({}));
const todo = [...tiles].filter(([key]) => (done[key] || 0) < VALID_SINCE || Date.now() - done[key] > REFRESH_DAYS * 86400000);
console.log(`${tiles.size} carreaux, ${todo.length} à (re)télécharger`);

let ok = 0;
let failed = 0;
let total = 0;
for (const [key, { lat, lng }] of todo) {
  if (Date.now() - started > BUDGET_MS) {
    console.log('⏱️ Temps écoulé : la suite au prochain passage.');
    break;
  }
  // les zones dont le centre est dans le carreau débordent de CELL / 2 tout autour
  console.log(`Carreau ${key}…`);
  let elements = [];
  for (let a = 0; a < 1 && elements; a += PIECE) {
    for (let b = 0; b < 1 && elements; b += PIECE) {
      if (Date.now() - started > BUDGET_MS) { elements = null; break; } // carreau repris au prochain passage
      const part = await overpass({ south: lat + a - CELL / 2, west: lng + b - CELL / 2, north: lat + a + PIECE - CELL / 2, east: lng + b + PIECE - CELL / 2 });
      elements = part ? elements.concat(part) : null;
    }
  }
  if (!elements) {
    failed += 1;
    console.log('  ✖ échec, repris au prochain passage');
    continue;
  }
  const cells = {};
  const seen = new Set();
  for (const e of elements) {
    const id = `${e.type[0]}${e.id}`;
    const plat = e.lat ?? e.center?.lat;
    const plng = e.lon ?? e.center?.lon;
    if (seen.has(id) || plat == null || plng == null) continue;
    if (tileOfCell(cellOf(plat), cellOf(plng)) !== key) continue; // zone d'un carreau voisin
    seen.add(id);
    (cells[cellKey(plat, plng)] ||= []).push({
      id, lat: Math.round(plat * 1e5) / 1e5, lng: Math.round(plng * 1e5) / 1e5, kind: kindOf(e.tags || {}),
      name: e.tags?.name || '', phone: e.tags?.phone || e.tags?.['contact:phone'] || '', hours: e.tags?.opening_hours || '',
    });
  }
  const keys = Object.keys(cells);
  if (!process.env.DRY) {
    for (let i = 0; i < keys.length; i += 100) {
      const last = i + 100 >= keys.length;
      await send(Object.fromEntries(keys.slice(i, i + 100).map((k) => [k, cells[k]])), last ? [key] : []);
    }
    if (!keys.length) await send({}, [key]);
  }
  ok += 1;
  total += seen.size;
  console.log(`  ✔ ${seen.size} lieux dans ${keys.length} zones`);
}
console.log(`✅ ${ok} carreaux importés (${total} lieux), ${failed} en échec, ${todo.length - ok - failed} pour plus tard`);
