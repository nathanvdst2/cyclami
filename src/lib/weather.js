// Météo des sorties : prévisions horaires Open-Meteo (gratuit, sans clé).
// Position arrondie à 0,1° pour partager les requêtes ; cache mémoire + localStorage (1 h).
const TTL = 3600e3;
const MAX_AHEAD = 15 * 86400e3;
const pending = new Map();

const round = (x) => Math.round(x * 10) / 10;

// Codes WMO → emoji
export function weatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return '🌧️';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '🌨️';
  if (code >= 95 && code <= 99) return '⛈️';
  return '🌡️';
}

const readCache = (key) => {
  try {
    const c = JSON.parse(localStorage.getItem(key));
    if (c && Date.now() - c.at < TTL) return c.data;
  } catch { /* stockage indisponible */ }
  return null;
};

const writeCache = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* ignore */ }
};

async function load(lat, lng) {
  const key = `cyclami:meteo:${lat},${lng}`;
  const cached = readCache(key);
  if (cached) return cached;
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
    + '&hourly=temperature_2m,precipitation_probability,weather_code&timezone=auto&forecast_days=16');
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const j = await res.json();
  const h = j.hourly;
  if (!h?.time?.length) throw new Error('open-meteo: réponse vide');
  // Heures locales du lieu → instants absolus (utc_offset_seconds)
  const offset = (j.utc_offset_seconds || 0) * 1000;
  const data = {
    times: h.time.map((s) => Date.parse(`${s}Z`) - offset),
    temp: h.temperature_2m,
    rain: h.precipitation_probability,
    code: h.weather_code,
  };
  writeCache(key, data);
  return data;
}

function forecast(lat, lng) {
  const k = `${lat},${lng}`;
  if (!pending.has(k)) {
    // En cas d'échec, on oublie la promesse pour pouvoir réessayer plus tard
    pending.set(k, load(lat, lng).catch(() => { pending.delete(k); return null; }));
  }
  return pending.get(k);
}

// { emoji, temp, rain } pour l'heure la plus proche, ou null (passé, trop loin, échec)
export async function weatherAt(lat, lng, date) {
  if (lat == null || lng == null) return null;
  const when = new Date(date).getTime();
  const now = Date.now();
  if (!Number.isFinite(when) || when < now || when > now + MAX_AHEAD) return null;
  const data = await forecast(round(lat), round(lng));
  if (!data) return null;
  let best = -1;
  let gap = Infinity;
  data.times.forEach((ts, i) => {
    const d = Math.abs(ts - when);
    if (d < gap) { gap = d; best = i; }
  });
  if (best < 0 || gap > 3 * 3600e3) return null;
  const temp = data.temp?.[best];
  const code = data.code?.[best];
  if (temp == null || code == null) return null;
  return { emoji: weatherEmoji(code), temp: Math.round(temp), rain: data.rain?.[best] ?? null };
}
