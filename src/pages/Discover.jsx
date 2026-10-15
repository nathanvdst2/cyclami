import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Footprints, Search, X, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { SIZES } from '../data/constants.js';
import SpeciesSelect from '../components/SpeciesSelect.jsx';
import { compatibility, distanceKm, formatDistance, fuzz } from '../utils/geo.js';
import PetBadge from '../components/PetBadge.jsx';
import UserActions from '../components/UserActions.jsx';
import ViewToggle from '../components/ViewToggle.jsx';
import LevelBadge from '../components/LevelBadge.jsx';
import StaffBadge from '../components/StaffBadge.jsx';
import { t } from '../i18n/index.js';
import { hazardLabel } from '../data/hazards.js';
import VerifiedBadge from '../components/VerifiedBadge.jsx';
import { usePageState } from '../lib/persist.js';
import { preloadPlaces } from '../lib/places.js';
import FeedbackButton from '../components/Feedback.jsx';
import InviteNeighbors from '../components/InviteNeighbors.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { NearbyRides, QuickTiles, WelcomeHero } from '../components/HomeTop.jsx';

const MapView = lazy(() => import('../components/MapView.jsx'));

const DISTANCES = [2, 5, 10, 25, null];

export default function Discover({ go }) {
  const { currentUser, users, blockedIds, actions } = useApp();
  const [myPetId, setMyPetId] = useState(currentUser.pets[0].id);
  const [filters, setFilters] = usePageState('discover:filters', { species: 'all', size: 'all', maxKm: null, sameEnergy: false });
  const [showFilters, setShowFilters] = usePageState('discover:showFilters', false);
  const [locMsg, setLocMsg] = useState(null);
  const [view, setView] = usePageState('discover:view', 'list');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchIds, setSearchIds] = useState(null); // null = pas de recherche en cours
  const [lostAlerts, setLostAlerts] = useState([]);
  useEffect(() => { actions.lost.list().then(setLostAlerts); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [hazards, setHazards] = useState([]);
  useEffect(() => { actions.hazards.list().then(setHazards); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // dangers à moins de 3 km (boulettes, chenilles…) : bandeau rouge en haut
  const hazardsNearby = hazards.filter((h) => currentUser.coords && distanceKm(currentUser.coords, { lat: h.lat, lng: h.lng }) <= 3);
  // lieux de la carte préchargés en arrière-plan : la carte s'affiche aussitôt ouverte
  useEffect(() => {
    if (!currentUser.coords) return undefined;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const id = idle(() => preloadPlaces(currentUser.coords));
    return () => (window.cancelIdleCallback || clearTimeout)(id);
  }, [currentUser.coords?.lat, currentUser.coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const lostNearby = lostAlerts.filter((a) => a.owner_id !== currentUser.id
    && (!currentUser.coords || distanceKm(currentUser.coords, { lat: a.lat, lng: a.lng }) <= 15));
  const myPet = currentUser.pets.find((p) => p.id === myPetId) || currentUser.pets[0];
  const setF = (k, v) => setFilters({ ...filters, [k]: v });

  const matching = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users
      .filter((u) => u.id !== currentUser.id && u.pets.length > 0 && !blockedIds.has(u.id))
      .filter((u) => !needle || u.name.toLowerCase().includes(needle) || searchIds?.includes(u.id))
      .map((u) => {
        const km = currentUser.coords && u.coords ? distanceKm(currentUser.coords, u.coords) : null;
        const pets = u.pets.filter((p) =>
          (filters.species === 'all' || p.species === filters.species) &&
          (filters.size === 'all' || p.size === filters.size) &&
          (!filters.sameEnergy || Math.abs(p.energy - myPet.energy) <= 1),
        );
        const score = Math.max(0, ...pets.map((p) => compatibility(myPet, p)));
        return { user: u, km, pets, score };
      })
      .filter((r) => r.pets.length > 0)
      // les plus proches d'abord, puis les plus compatibles
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || b.score - a.score);
  }, [users, currentUser, filters, myPet, blockedIds, searchIds, search]);
  const results = useMemo(() => matching.filter((r) => search.trim() || filters.maxKm == null || (r.km != null && r.km <= filters.maxKm)),
    [matching, filters.maxKm, search]);
  // personne dans le rayon choisi : le membre le plus proche, même plus loin
  const nearestBeyond = results.length === 0 && filters.maxKm != null ? matching.find((r) => r.km != null) : null;

  // Recherche par prénom, y compris parmi les membres éloignés.
  const runSearch = async (e) => {
    e?.preventDefault();
    if (search.trim().length < 2) { setSearchIds(null); return; }
    setSearching(true);
    setSearchIds(await actions.searchMembers(search));
    setSearching(false);
  };
  const clearSearch = () => { setSearch(''); setSearchIds(null); };

  const locate = async () => {
    setLocMsg(t('Localisation…'));
    const err = await actions.locate();
    setLocMsg(err || t('Position mise à jour ✔'));
  };

  const proposeRide = (u, pets) =>
    go('messages', {
      userId: u.id,
      draft: t('Salut {name} ! Ça te dirait une sortie entre {pet} et {pets} ? 🚴', { name: u.name, pet: myPet.name, pets: pets.map((p) => p.name).join(' & ') }),
    });

  return (
    <div className="space-y-4">
      <WelcomeHero go={go} locMsg={locMsg} onLocate={locate} />

      {hazardsNearby.length > 0 && (
        <button className="flex w-full items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-left ring-2 ring-red-300 dark:bg-red-950" onClick={() => go('hazards')}>
          <span className="text-2xl">⚠️</span>
          <span className="flex-1 text-sm text-stone-700 dark:text-stone-200">
            <strong>{t(hazardsNearby.length > 1 ? '{n} dangers signalés près de chez toi' : '{n} danger signalé près de chez toi', { n: hazardsNearby.length })}</strong>
            {' : '}{[...new Set(hazardsNearby.map((h) => hazardLabel(h)))].slice(0, 2).join(', ')}.{' '}
            {t('Regarde où avant ta sortie.')}
          </span>
        </button>
      )}
      {lostNearby.length > 0 && (
        <button className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-2 ring-red-200 dark:bg-stone-800" onClick={() => go('lost')}>
          <span className="text-2xl">🚨</span>
          <span className="flex-1 text-sm text-stone-700 dark:text-stone-200">
            <strong>{t(lostNearby.length > 1 ? '{n} animaux perdus ou trouvés près de toi.' : '{n} animal perdu ou trouvé près de toi.', { n: lostNearby.length })}</strong>{' '}
            {t('Ouvre l’alerte : tu l’as peut-être croisé.')}
          </span>
        </button>
      )}

      <QuickTiles go={go} badges={{ hazards: hazardsNearby.length, lost: lostNearby.length }} />

      <NearbyRides go={go} />

      <h2 className="pt-2 text-lg font-extrabold text-stone-800">🚴 {t('Compagnons de sortie')}</h2>

      {!currentUser.coords && (
        <div className="card border-l-4 border-teal-400 text-sm text-stone-600">
          📍 {t('Active ta localisation pour voir à quelle distance sont les autres membres. Ta position est arrondie à environ 1 km : personne ne voit ton adresse.')}
        </div>
      )}

      <form onSubmit={runSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="input pl-9" placeholder={t('Chercher un membre par son prénom…')} value={search}
            onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setSearchIds(null); }} />
          {search && (
            <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" aria-label={t('Effacer')}>
              <X size={16} />
            </button>
          )}
        </div>
        <button className="btn-ghost" disabled={searching}>{searching ? '…' : t('Chercher')}</button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {currentUser.pets.length > 1 && (
          <select className="input w-auto" value={myPetId} onChange={(e) => setMyPetId(e.target.value)}>
            {currentUser.pets.map((p) => <option key={p.id} value={p.id}>{t('Pour {emoji} {name}', { emoji: p.emoji, name: p.name })}</option>)}
          </select>
        )}
        <button className="btn-ghost" onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal size={16} /> {t('Filtres')}
        </button>
        <span className="text-sm text-stone-500">{t(results.length > 1 ? '{n} membres' : '{n} membre', { n: results.length })}</span>
        <ViewToggle view={view} setView={setView} />
      </div>

      {showFilters && (
        <div className="card space-y-3">
          <FilterRow label={t('Espèce')}>
            <SpeciesSelect className="input w-auto" value={filters.species} onChange={(v) => setF('species', v)} allLabel={t('Toutes les espèces')} aria-label={t('Espèce')} />
          </FilterRow>
          <FilterRow label={t('Taille')}>
            <Chip active={filters.size === 'all'} onClick={() => setF('size', 'all')}>{t('Toutes')}</Chip>
            {SIZES.map((s) => (
              <Chip key={s.id} active={filters.size === s.id} onClick={() => setF('size', s.id)}>{s.label}</Chip>
            ))}
          </FilterRow>
          <FilterRow label={t('Distance max')}>
            {DISTANCES.map((d) => (
              <Chip key={d ?? 'all'} active={filters.maxKm === d} onClick={() => setF('maxKm', d)}>{d ? `${d} km` : t('Toutes')}</Chip>
            ))}
          </FilterRow>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" className="accent-teal-500" checked={filters.sameEnergy} onChange={(e) => setF('sameEnergy', e.target.checked)} />
            {t('Même niveau d’énergie que {name}', { name: myPet.name })}
          </label>
        </div>
      )}

      {results.length === 0 && (
        <div className="card space-y-3 text-center text-stone-600">
          <div className="text-4xl">🐕‍🦺</div>
          <p>
            {search ? t('Aucun membre trouvé pour « {search} ».', { search }) : (
              filters.maxKm || filters.species !== 'all' || filters.size !== 'all' ? t('Personne pour l’instant avec ces filtres.') : t('Personne pour l’instant dans le coin.')
            )}
          </p>
          {nearestBeyond && (
            <button className="btn-ghost mx-auto" onClick={() => setF('maxKm', null)}>
              {t('Le plus proche, {name}, est à {distance} : voir tous les membres', { name: nearestBeyond.user.name, distance: formatDistance(nearestBeyond.km) })}
            </button>
          )}
          {!search && <InviteNeighbors go={go} />}
        </div>
      )}

      {view === 'map' && (
        <Suspense fallback={<div className="card h-96 animate-pulse" />}>
          <MapView
            places
            stateKey="discover"
            onOpenPlace={(p) => go('place', { id: p.id, kind: p.kind, name: p.name, lat: p.lat, lng: p.lng, hours: p.hours || '', phone: p.phone || '' })}
            height="h-[28rem]"
            center={currentUser.coords}
            zoom={12}
            markers={[
              ...(currentUser.coords ? [{
                id: 'me', coords: currentUser.coords, emoji: currentUser.pets[0].emoji,
                photoUrl: currentUser.pets[0].photoUrl, highlight: true,
                popup: <strong>{t('Toi et {name}', { name: currentUser.pets[0].name })}</strong>,
              }] : []),
              ...results.filter((r) => r.user.coords).map(({ user, km, pets, score }) => ({
                id: user.id,
                coords: fuzz(user.coords, user.id),
                emoji: pets[0].emoji,
                photoUrl: pets[0].photoUrl,
                popup: (
                  <div className="space-y-1 text-sm">
                    <div className="font-bold">{user.name}<StaffBadge userId={user.id} /> · {pets.map((p) => p.name).join(', ')}</div>
                    <div className="text-stone-500">{km != null && `${formatDistance(km)} · `}{t('{score}% compatible', { score })}</div>
                    <button className="font-semibold text-teal-600" onClick={() => go('user', { userId: user.id })}>{t('Voir le profil →')}</button>
                  </div>
                ),
              })),
            ]}
          />
          {results.some((r) => !r.user.coords) && (
            <p className="text-xs text-stone-500">{t('Les membres qui n’ont pas partagé leur position n’apparaissent pas sur la carte.')}</p>
          )}
        </Suspense>
      )}

      {view === 'list' && results.map(({ user, km, pets, score }) => (
        <article key={user.id} className="card space-y-3 !p-3 sm:!p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => go('user', { userId: user.id })} aria-label={user.name} className="shrink-0">
              <UserAvatar user={user} size="md" />
            </button>
            <button className="min-w-0 flex-1 text-left" onClick={() => go('user', { userId: user.id })}>
              <div className="truncate font-bold text-stone-800 hover:text-teal-600">{user.name}<VerifiedBadge user={user} compact /><StaffBadge userId={user.id} /><LevelBadge xp={user.xp} /></div>
              <div className="truncate text-sm text-stone-500">
                {km != null && <strong className="font-semibold text-stone-700 dark:text-stone-200">{formatDistance(km)}</strong>}{km != null && user.city && ' · '}{user.city}
              </div>
            </button>
            <div className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${score >= 75 ? 'bg-green-100 text-green-700' : score >= 55 ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}
              title={t('{score}% compatible', { score })}>
              {score}% 🤝
            </div>
            <UserActions user={user} />
          </div>
          {user.bio && <p className="line-clamp-2 text-sm text-stone-600">{user.bio}</p>}
          <div className="space-y-2">
            {pets.map((p) => <PetBadge key={p.id} pet={p} onOpen={() => go('animal', { petId: p.id, userId: user.id })} />)}
          </div>
          {user.availability?.length > 0 && (
            <div className="text-xs text-stone-500">🕒 {t('Dispo : {slots}', { slots: user.availability.map((a) => t(a)).join(', ') })}</div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary flex-1 !py-2 text-sm" onClick={() => proposeRide(user, pets)}>
              <Footprints size={16} /> {t('Proposer une sortie')}
            </button>
            <button className="btn-ghost !py-2" onClick={() => go('messages', { userId: user.id })} aria-label={t('Message')}>
              <MessageCircle size={16} />
            </button>
          </div>
        </article>
      ))}
      <div className="pt-4"><FeedbackButton variant="link" /></div>
    </div>
  );
}

function FilterRow({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-sm font-semibold text-stone-600">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`chip ${active ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
      {children}
    </button>
  );
}
