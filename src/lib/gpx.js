// Tracés GPX : lecture dans le navigateur (le fichier n'est jamais envoyé), calculs et export.
// Le tracé gardé avec la sortie est simplifié : tableau [[lat, lng], …] de 2 à 2000 points.

export const MAX_ROUTE_POINTS = 2000;
export const MAX_GPX_BYTES = 15 * 1024 * 1024;

const R = 6371000;
const rad = Math.PI / 180;

// Distance en mètres entre deux points [lat, lng] (formule de haversine)
export function haversine(a, b) {
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Longueur totale d'un tracé, en mètres
export const routeLength = (pts) => pts.reduce((s, p, i) => (i ? s + haversine(pts[i - 1], p) : 0), 0);

// Dénivelé positif lissé : moyenne glissante des altitudes, puis on ne compte une montée
// qu'au-delà d'un seuil (le bruit du GPS ou du baromètre gonfle sinon le total).
export function elevationGain(eles, { window = 5, threshold = 3 } = {}) {
  const vals = eles.filter((e) => Number.isFinite(e));
  if (vals.length < 2) return null;
  const half = Math.floor(window / 2);
  const smooth = vals.map((_, i) => {
    const part = vals.slice(Math.max(0, i - half), i + half + 1);
    return part.reduce((s, e) => s + e, 0) / part.length;
  });
  let gain = 0;
  let ref = smooth[0];
  for (const e of smooth) {
    if (e - ref >= threshold) { gain += e - ref; ref = e; } else if (e < ref) ref = e;
  }
  return Math.round(gain);
}

// Distance d'un point au segment [a, b], en mètres (projection plate locale, suffisante à cette échelle)
function segmentDistance(p, a, b) {
  const k = Math.cos(p[0] * rad);
  const ax = a[1] * k; const ay = a[0];
  const bx = b[1] * k; const by = b[0];
  const px = p[1] * k; const py = p[0];
  const dx = bx - ax; const dy = by - ay;
  const len = dx * dx + dy * dy;
  const tt = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  const x = ax + tt * dx - px; const y = ay + tt * dy - py;
  return Math.sqrt(x * x + y * y) * rad * R;
}

// Douglas-Peucker itératif (pas de récursion : les gros tracés font des dizaines de milliers de points)
function douglasPeucker(pts, tolerance) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let max = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(pts[i], pts[first], pts[last]);
      if (d > max) { max = d; index = i; }
    }
    if (index > 0 && max > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Simplifie jusqu'à tenir dans maxPoints (tolérance de 5 m, augmentée si besoin)
export function simplify(pts, maxPoints = MAX_ROUTE_POINTS) {
  let tolerance = 5;
  let out = douglasPeucker(pts, tolerance);
  while (out.length > maxPoints && tolerance < 5000) {
    tolerance *= 1.6;
    out = douglasPeucker(pts, tolerance);
  }
  // filet de sécurité : un point sur n, en gardant le dernier
  if (out.length > maxPoints) {
    const step = Math.ceil(out.length / (maxPoints - 1));
    out = [...out.filter((_, i) => i % step === 0), out[out.length - 1]];
  }
  return out;
}

const round5 = (x) => Math.round(x * 1e5) / 1e5;

// Lit un fichier GPX (texte). Renvoie { route, distanceKm, elevationM, start, name }
// ou lance une erreur (message en français, clé de traduction).
export function parseGpx(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Ce fichier n’est pas un GPX valide.');
  // traces enregistrées (trkpt), sinon itinéraires (rtept)
  let nodes = [...doc.getElementsByTagName('trkpt')];
  if (nodes.length < 2) nodes = [...doc.getElementsByTagName('rtept')];
  const pts = [];
  const eles = [];
  for (const n of nodes) {
    const lat = Number(n.getAttribute('lat'));
    const lng = Number(n.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const prev = pts[pts.length - 1];
    if (prev && prev[0] === lat && prev[1] === lng) continue;
    pts.push([lat, lng]);
    const ele = n.getElementsByTagName('ele')[0];
    eles.push(ele ? Number(ele.textContent) : NaN);
  }
  if (pts.length < 2) throw new Error('Aucun tracé trouvé dans ce fichier GPX.');
  const meters = routeLength(pts);
  if (meters < 500) throw new Error('Le tracé est trop court.');
  const name = (doc.querySelector('trk > name, rte > name, metadata > name')?.textContent || '').trim().slice(0, 100);
  const route = simplify(pts).map(([a, b]) => [round5(a), round5(b)]);
  return {
    route,
    distanceKm: Math.round(meters / 100) / 10,
    elevationM: elevationGain(eles),
    start: { lat: route[0][0], lng: route[0][1] },
    name,
  };
}

const xml = (s) => String(s || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// Fichier GPX (trace) à partir des points d'une sortie
export function toGpx(route, name = 'Cyclami') {
  const pts = route.map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Cyclami" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${xml(name)}</name></metadata>
  <trk>
    <name>${xml(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

// Nom de fichier lisible : « Boucle des lacs » → « boucle-des-lacs.gpx »
export const gpxFileName = (title) => `${String(title || 'sortie').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sortie'}.gpx`;

// Télécharge le tracé d'une sortie au format GPX
export function downloadGpx(route, title) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toGpx(route, title)], { type: 'application/gpx+xml' }));
  a.download = gpxFileName(title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
