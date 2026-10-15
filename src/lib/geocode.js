import { getLang } from '../i18n/index.js';

// Adresse lisible d'un point de la carte (OpenStreetMap / Nominatim, gratuit) :
// « Parc Josaphat, Avenue Louis Bertrand 12, 1030 Schaerbeek ». null si introuvable.
let last = 0;
export async function addressAt(lat, lng) {
  // Nominatim demande au plus une requête par seconde
  const wait = last + 1100 - Date.now();
  last = Math.max(Date.now(), last + 1100);
  if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
  const params = new URLSearchParams({
    lat: lat.toFixed(6), lon: lng.toFixed(6), format: 'jsonv2', zoom: '18', addressdetails: '1', 'accept-language': getLang(),
  });
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!res.ok) return null;
    const hit = await res.json();
    const a = hit?.address;
    if (!a) return null;
    const street = [a.road || a.pedestrian || a.footway || a.path, a.house_number].filter(Boolean).join(' ');
    const city = [a.postcode, a.city || a.town || a.village || a.municipality || a.suburb].filter(Boolean).join(' ');
    const name = hit.name && hit.name !== a.road ? hit.name : '';
    const label = [name, street, city].filter(Boolean).join(', ');
    return (label || hit.display_name?.split(',').slice(0, 3).join(',') || '').slice(0, 150) || null;
  } catch {
    return null;
  }
}
