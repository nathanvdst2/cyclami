import { lazy, Suspense, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { formatDate } from '../utils/geo.js';
import RideCard from '../components/RideCard.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import RideForm from '../components/RideForm.jsx';
import { ReviewPrompts } from '../components/Reviews.jsx';
import ExampleRide from '../components/ExampleRide.jsx';
import { locale, t } from '../i18n/index.js';
import { EmptyState } from '../components/Illustration.jsx';
import { usePageState } from '../lib/persist.js';
import InviteNeighbors from '../components/InviteNeighbors.jsx';

const MapView = lazy(() => import('../components/MapView.jsx'));

export default function Rides({ go, params = {} }) {
  const { rides: allRides, currentUser, actions } = useApp();
  const [tab, setTab] = usePageState('rides:tab', 'all');
  const [view, setView] = usePageState('rides:view', 'list');
  const [creating, setCreating] = usePageState('rides:creating', false);
  // « Proposer une sortie ici » depuis un lieu de la carte (ici ou depuis Découvrir)
  const [preset, setPreset] = useState(params.newRideAt || null);
  useEffect(() => { if (params.newRideAt) { setPreset(params.newRideAt); setCreating(true); } }, [params.newRideAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // « Organiser une sortie » depuis l'accueil : le formulaire s'ouvre directement
  useEffect(() => { if (params.create) setCreating(true); }, [params.create]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = currentUser.id;
  // sortie choisie (lien partagé, bulle de la carte) : on l'affiche en tête de la liste
  useEffect(() => {
    if (params.rideId) { setView('list'); setTab('all'); }
  }, [params.rideId]);

  const now = Date.now();
  const rides = allRides
    .filter((w) => new Date(w.date).getTime() > now - 3600_000)
    .filter((w) => tab === 'all' || w.participants.includes(me))
    .sort((a, b) => a.date.localeCompare(b.date))
    // sortie ouverte depuis un lien partagé : en premier
    .sort((a, b) => (b.id === params.rideId) - (a.id === params.rideId));
  const sharedMissing = params.rideId && !allRides.some((w) => w.id === params.rideId);
  const onMap = rides.filter((w) => w.coords);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-stone-800">{t('Sorties')}</h1>
        <span className="flex gap-2">
          <button className="btn-ghost" onClick={() => go('tracker')} title={t('Suivre ma sortie')}>📍 {t('Suivre')}</button>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> {t('Organiser')}
          </button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[['all', t('À venir')], ['mine', t('Mes sorties')]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`chip ${tab === id ? 'bg-stone-800 text-white ring-stone-800' : 'bg-white text-stone-600 ring-emerald-200'}`}>
            {label}
          </button>
        ))}
        <ViewToggle view={view} setView={setView} calendar />
      </div>

      <p className="rounded-xl bg-emerald-100/60 px-3 py-2 text-xs text-stone-600">
        🛡️ {t('Donne rendez-vous dans un lieu public et préviens un proche.')}{' '}
        <button className="underline" onClick={() => go('legal', { doc: 'safety', back: 'rides' })}>{t('Conseils de sécurité')}</button>
      </p>

      <ReviewPrompts go={go} />

      {creating && (
        <RideForm
          center={currentUser.coords}
          preset={preset}
          onClose={() => setCreating(false)}
          onSubmit={async (w) => {
            const err = await actions.createRide(w);
            if (!err) { setCreating(false); setTab('mine'); }
            return err;
          }}
        />
      )}

      {rides.length === 0 && view === 'list' && (
        <>
          <EmptyState name="sorties-vide">{t('Aucune sortie prévue. Lance-toi et organise la première ! 🌳')}</EmptyState>
          <InviteNeighbors go={go} shareText={t('Je cherche des compagnons de sortie pour mon animal près de chez moi, rejoins-moi sur Cyclami 🚴')} />
        </>
      )}

      {view === 'map' && rides.length === 0 && (
        <p className="text-sm text-stone-500">{t('Aucune sortie prévue. Lance-toi et organise la première ! 🌳')}</p>
      )}

      {view === 'map' && (
        <Suspense fallback={<div className="card h-96 animate-pulse" />}>
          <MapView
            places
            stateKey="rides"
            onOpenPlace={(p) => go('place', { id: p.id, kind: p.kind, name: p.name, lat: p.lat, lng: p.lng, hours: p.hours || '', phone: p.phone || '' })}
            height="h-[28rem]"
            center={currentUser.coords || onMap[0]?.coords}
            zoom={12}
            markers={onMap.map((w) => ({
              id: w.id,
              coords: w.coords,
              emoji: '🌳',
              highlight: w.participants.includes(me),
              popup: (
                <div className="space-y-1 text-sm">
                  <button type="button" className="block text-left font-bold hover:underline" onClick={() => go('rides', { rideId: w.id })}>{w.title}</button>
                  <div className="text-stone-500">{formatDate(w.date)} · {w.participants.length}/{w.maxParticipants}</div>
                  <button type="button" className="block text-left text-stone-500 underline decoration-dotted hover:text-teal-600"
                    onClick={() => go('rides', { rideId: w.id })}>{w.place}</button>
                  <button type="button" className="font-semibold text-teal-600" onClick={() => go('rides', { rideId: w.id })}>
                    {t('Voir la sortie →')}
                  </button>
                </div>
              ),
            }))}
          />
          {onMap.length < rides.length && (
            <p className="text-xs text-stone-500">{t('Certaines sorties n’ont pas de point sur la carte : retrouve-les dans la liste.')}</p>
          )}
        </Suspense>
      )}

      {view === 'list' && tab === 'all' && !creating && <ExampleRide onCreate={() => { setCreating(true); window.scrollTo(0, 0); }} />}
      {sharedMissing && <div className="card text-center text-sm text-stone-500">{t('Cette sortie est terminée ou a été annulée.')}</div>}
      {view === 'list' && rides.map((w) => <RideCard key={w.id} ride={w} go={go} highlight={w.id === params.rideId} />)}
      {view === 'calendar' && <RideCalendar rides={rides} me={me} onOpen={(id) => { setView('list'); go('rides', { rideId: id }); }} />}
    </div>
  );
}

// Vue calendrier : les sorties à venir regroupées par jour.
function RideCalendar({ rides, me, onOpen }) {
  if (!rides.length) return <div className="card text-center text-sm text-stone-500">{t('Aucune sortie prévue pour le moment : organise la première !')}</div>;
  const days = new Map();
  for (const w of rides) {
    const key = new Date(w.date).toLocaleDateString('fr-CA');
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(w);
  }
  const today = new Date().toLocaleDateString('fr-CA');
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('fr-CA');
  return (
    <div className="space-y-3">
      {[...days.entries()].map(([day, list]) => (
        <section key={day} className="card space-y-2">
          <h2 className="text-sm font-bold text-stone-800">
            {day === today ? t('Aujourd’hui') : day === tomorrow ? t('Demain')
              : new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())}
          </h2>
          {list.map((w) => (
            <button key={w.id} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-emerald-50" onClick={() => onOpen(w.id)}>
              <span className="w-12 shrink-0 text-sm font-bold text-teal-600">
                {new Date(w.date).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-stone-800">{w.title}</span>
                <span className="block truncate text-xs text-stone-500">📍 {w.place} · {w.duration} min</span>
              </span>
              <span className="shrink-0 text-xs text-stone-500">
                {w.participants.includes(me) || w.hostId === me ? '✅ ' : ''}{w.participants.length}/{w.maxParticipants}
              </span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
