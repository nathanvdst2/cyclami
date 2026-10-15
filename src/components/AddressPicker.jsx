import { lazy, Suspense, useRef, useState } from 'react';
import { LocateFixed, Search } from 'lucide-react';
import { addressAt } from '../lib/geocode.js';
import { getLang, t } from '../i18n/index.js';

const MapView = lazy(() => import('./MapView.jsx'));

// Adresse placée sur une carte : recherche, « ma position » ou clic sur la carte
// (l'adresse précise se remplit toute seule, comme pour les sorties).
//   value : { address, coords: { lat, lng } | null } ; onChange(value)
export default function AddressPicker({ value, onChange, center, required = false, placeholder }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const auto = useRef(null);
  const coords = value.coords;

  const pick = async ({ lat, lng }) => {
    onChange({ ...value, coords: { lat, lng } });
    setLocating(true);
    const address = await addressAt(lat, lng);
    setLocating(false);
    if (!address) return;
    onChange((v) => {
      if (v.address && v.address !== auto.current) return { ...v, coords: { lat, lng } };
      auto.current = address;
      return { address, coords: { lat, lng } };
    });
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query, format: 'json', limit: '1', 'accept-language': getLang() });
      const [hit] = await (await fetch(`https://nominatim.openstreetmap.org/search?${params}`)).json();
      if (!hit) setError(t('Lieu introuvable. Essaie une autre formulation, ou clique directement sur la carte.'));
      else {
        const address = hit.display_name.split(',').slice(0, 4).join(',').trim();
        auto.current = address;
        onChange({ address, coords: { lat: Number(hit.lat), lng: Number(hit.lon) } });
      }
    } catch {
      setError(t('Recherche impossible pour le moment. Clique directement sur la carte.'));
    }
    setSearching(false);
  };

  const myPosition = () => navigator.geolocation?.getCurrentPosition(
    (pos) => pick({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => setError(t('Position refusée : clique sur la carte.')),
    { timeout: 15000 },
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input" placeholder={t('Chercher un parc, une adresse…')} value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} />
        <button type="button" className="btn-ghost px-3" onClick={search} disabled={searching} aria-label={t('Chercher')}><Search size={16} /></button>
        <button type="button" className="btn-ghost px-3" onClick={myPosition} aria-label={t('Ma position')}><LocateFixed size={16} /></button>
      </div>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-emerald-100" />}>
        <MapView height="h-48" center={coords || center} zoom={15} onPick={pick} picked={coords} />
      </Suspense>
      <p className="text-xs text-stone-500">
        {locating ? t('Recherche de l’adresse…') : coords ? `📍 ${t('Point placé. Clique ailleurs pour le déplacer.')}` : t('Clique sur la carte pour placer l’adresse.')}
      </p>
      <input className="input" required={required} maxLength={200} placeholder={placeholder || t('Adresse')} value={value.address}
        onChange={(e) => onChange({ ...value, address: e.target.value })} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
