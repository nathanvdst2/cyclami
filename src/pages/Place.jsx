import { lazy, Suspense } from 'react';
import { ArrowLeft, Clock, Phone } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { PLACE_KINDS, useFavorites } from '../lib/places.js';
import { distanceKm, formatDistance } from '../utils/geo.js';
import DirectionsButton from '../components/DirectionsButton.jsx';
import PlaceReviews from '../components/PlaceReviews.jsx';
import { locale, t } from '../i18n/index.js';

const MapView = lazy(() => import('../components/MapView.jsx'));

// Page d'un lieu de la carte (borne de réparation, magasin vélo, point d'eau, gonflage).
export default function Place({ go, back, params }) {
  const { rides, currentUser } = useApp();
  const [favs, toggleFav] = useFavorites();
  const p = { id: params.id, kind: params.kind, name: params.name || '', lat: Number(params.lat), lng: Number(params.lng), hours: params.hours || '', phone: params.phone || '' };
  if (!p.id || !Number.isFinite(p.lat)) {
    return <div className="card text-center text-stone-500">{t('Ce lieu n’est plus disponible.')}</div>;
  }
  const kind = PLACE_KINDS.find((k) => k.id === p.kind) || PLACE_KINDS[0];
  const fav = favs.some((f) => f.place_id === p.id);
  const km = currentUser.coords ? distanceKm(currentUser.coords, p) : null;
  // sorties à venir qui partent à moins de 500 m
  const nearby = rides
    .filter((w) => w.coords && new Date(w.date) > new Date() && distanceKm(w.coords, p) <= 0.5)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('discover')} className="flex items-center gap-1 text-sm text-stone-500"><ArrowLeft size={16} /> {t('Retour')}</button>
      <section className="card space-y-3">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-800">{kind.emoji} {p.name || kind.label}</h1>
          <p className="text-sm text-stone-500">{kind.label}{km != null && ` · ${formatDistance(km)}`}</p>
        </div>
        {p.hours && <p className="flex items-center gap-2 text-sm text-stone-600"><Clock size={14} className="shrink-0" /> {p.hours}</p>}
        {p.phone && <a className="flex items-center gap-2 text-sm font-semibold text-teal-600" href={`tel:${p.phone}`}><Phone size={14} /> {p.phone}</a>}
        <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-emerald-100" />}>
          <MapView height="h-56" center={{ lat: p.lat, lng: p.lng }} zoom={16}
            markers={[{ id: p.id, coords: { lat: p.lat, lng: p.lng }, emoji: kind.emoji, highlight: true }]} />
        </Suspense>
        <div className="flex flex-wrap gap-2">
          <button className={fav ? 'btn-ghost' : 'btn-primary'} onClick={() => toggleFav(p)}>{fav ? `★ ${t('Dans mes favoris')}` : `☆ ${t('Ajouter aux favoris')}`}</button>
          <button className="btn-ghost" onClick={() => go('rides', { newRideAt: { name: p.name, lat: p.lat, lng: p.lng } })}>🚴 {t('Proposer une sortie ici')}</button>
          <DirectionsButton lat={p.lat} lng={p.lng} label={p.name || kind.label} big />
        </div>
      </section>

      {nearby.length > 0 && (
        <section className="card space-y-2">
          <h2 className="font-bold text-stone-800">🗺️ {t('Sorties qui partent d’ici')}</h2>
          {nearby.map((w) => (
            <button key={w.id} className="flex w-full items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-left text-sm" onClick={() => go('rides', { rideId: w.id })}>
              <span className="min-w-0 truncate font-semibold text-stone-800">{w.title}</span>
              <span className="shrink-0 text-xs text-stone-500">{new Date(w.date).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </button>
          ))}
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="font-bold text-stone-800">⭐ {t('Avis des membres')}</h2>
        <PlaceReviews placeId={p.id} />
      </section>
    </div>
  );
}
