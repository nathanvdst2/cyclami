import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Bike, Search, X, MessageCircle, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { DISCIPLINES, LEVELS, levelInfo, levelRank } from '../data/constants.js';
import { compatibilityDetails, distanceKm, formatDistance, fuzz } from '../utils/geo.js';
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
import { RiderChips } from '../components/Rider.jsx';
import { NearbyRides, QuickTiles, WelcomeHero } from '../components/HomeTop.jsx';

const MapView = lazy(() => import('../components/MapView.jsx'));

const DISTANCES = [5, 10, 25, 50, null];
const SPEED_GAPS = [2, 4, null];
const DEFAULT_FILTERS = { discipline: 'all', level: 'near', speedGap: null, maxKm: 25, sort: 'match' };

// Accueil : trouver des cyclistes de son niveau près de chez soi (liste ou carte).
export default function Discover({ go }) {
  const { currentUser, users, blockedIds, actions } = useApp();
  const [filters, setFilters] = usePageState('discover:filters', DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = usePageState('discover:showFilters', false);
  const [locMsg, setLocMsg] = useState(null);
  const [view, setView] = usePageState('discover:view', 'list');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchIds, setSearchIds] = useState(null); // null = pas de recherche en cours
  const [hazards, setHazards] = useState([]);
  useEffect(() => { actions.hazards.list().then(setHazards).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // dangers à moins de 5 km (travaux, route fermée, nids-de-poule…) : bandeau rouge en haut
  const hazardsNearby = hazards.filter((h) => currentUser.coords && distanceKm(currentUser.coords, { lat: h.lat, lng: h.lng }) <= 5);
  // lieux de la carte préchargés en arrière-plan : la carte s'affiche aussitôt ouverte
  useEffect(() => {
    if (!currentUser.coords) return undefined;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    const id = idle(() => preloadPlaces(currentUser.coords));
    return () => (window.cancelIdleCallback || clearTimeout)(id);
  }, [currentUser.coords?.lat, currentUser.coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = { ...DEFAULT_FILTERS, ...filters };
  const setF = (k, v) => setFilters({ ...f, [k]: v });
  const myRank = levelRank(currentUser.level);

  const matching = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users
      .filter((u) => u.id !== currentUser.id && u.level && !blockedIds.has(u.id))
      .filter((u) => !needle || u.name.toLowerCase().includes(needle) || searchIds?.includes(u.id))
      .filter((u) => needle || f.discipline === 'all' || u.disciplines.includes(f.discipline))
      .filter((u) => {
        if (needle || f.level === 'all') return true;
        if (f.level === 'near') return myRank < 0 || Math.abs(levelRank(u.level) - myRank) <= 1;
        if (f.level === 'same') return u.level === currentUser.level;
        return u.level === f.level;
      })
      .filter((u) => needle || f.speedGap == null || !currentUser.usualSpeed || (u.usualSpeed && Math.abs(u.usualSpeed - currentUser.usualSpeed) <= f.speedGap))
      .map((u) => {
        const d = compatibilityDetails(currentUser, u);
        return { user: u, km: d.km, score: d.score, details: d };
      })
      .sort((a, b) => (f.sort === 'distance'
        ? (a.km ?? 1e9) - (b.km ?? 1e9) || b.score - a.score
        : b.score - a.score || (a.km ?? 1e9) - (b.km ?? 1e9)));
  }, [users, currentUser, f.discipline, f.level, f.speedGap, f.sort, blockedIds, searchIds, search, myRank]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => matching.filter((r) => search.trim() || f.maxKm == null || (r.km != null && r.km <= f.maxKm)),
    [matching, f.maxKm, search]);
  // personne dans le rayon choisi : le cycliste le plus proche, même plus loin
  const nearestBeyond = results.length === 0 && f.maxKm != null ? [...matching].filter((r) => r.km != null).sort((a, b) => a.km - b.km)[0] : null;
  const filtered = f.discipline !== 'all' || f.level !== 'all' || f.speedGap != null || f.maxKm != null;

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

  const proposeRide = (u) => go('messages', {
    userId: u.id,
    draft: t('Salut {name} ! Ça te dirait d’aller rouler ensemble ? 🚴', { name: u.name }),
  });
  const myLevel = levelInfo(currentUser.level);

  return (
    <div className="space-y-4">
      <WelcomeHero go={go} locMsg={locMsg} onLocate={locate} />

      {hazardsNearby.length > 0 && (
        <button className="flex w-full items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-left ring-2 ring-red-300 dark:bg-red-950" onClick={() => go('hazards')}>
          <span className="text-2xl">⚠️</span>
          <span className="flex-1 text-sm text-stone-700 dark:text-stone-200">
            <strong>{t(hazardsNearby.length > 1 ? '{n} dangers signalés près de chez toi' : '{n} danger signalé près de chez toi', { n: hazardsNearby.length })}</strong>
            {' : '}{[...new Set(hazardsNearby.map((h) => hazardLabel(h)))].slice(0, 2).join(', ')}.{' '}
            {t('Regarde où avant de partir rouler.')}
          </span>
        </button>
      )}

      <QuickTiles go={go} badges={{ hazards: hazardsNearby.length }} />

      <NearbyRides go={go} />

      <div className="pt-2">
        <h2 className="text-lg font-extrabold text-stone-800">🚴 {t('Cyclistes de ton niveau')}</h2>
        {myLevel && (
          <p className="text-sm text-stone-500">
            {t('Ton niveau : {level}', { level: `${myLevel.emoji} ${myLevel.label}` })}
            {currentUser.usualSpeed ? ` · ${t('{n} km/h de moyenne', { n: currentUser.usualSpeed })}` : ''}
            {' · '}<button className="font-semibold text-teal-600" onClick={() => go('rider')}>{t('Modifier')}</button>
          </p>
        )}
      </div>

      {!currentUser.coords && (
        <div className="card border-l-4 border-teal-400 text-sm text-stone-600">
          📍 {t('Active ta localisation pour voir à quelle distance sont les autres cyclistes. Ta position est arrondie à environ 1 km : personne ne voit ton adresse.')}
        </div>
      )}

      <form onSubmit={runSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="input pl-9" placeholder={t('Chercher un cycliste par son prénom…')} value={search}
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
        <button className="btn-ghost" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}>
          <SlidersHorizontal size={16} /> {t('Filtres')}
        </button>
        <span className="text-sm text-stone-500">{t(results.length > 1 ? '{n} cyclistes' : '{n} cycliste', { n: results.length })}</span>
        <ViewToggle view={view} setView={setView} />
      </div>

      {showFilters && (
        <div className="card space-y-3">
          <FilterRow label={t('Discipline')}>
            <Chip active={f.discipline === 'all'} onClick={() => setF('discipline', 'all')}>{t('Toutes')}</Chip>
            {DISCIPLINES.map((d) => (
              <Chip key={d.id} active={f.discipline === d.id} onClick={() => setF('discipline', d.id)}>{d.emoji} {d.label}</Chip>
            ))}
          </FilterRow>
          <FilterRow label={t('Niveau')}>
            <Chip active={f.level === 'near'} onClick={() => setF('level', 'near')}>{t('Proche du mien')}</Chip>
            <Chip active={f.level === 'same'} onClick={() => setF('level', 'same')}>{t('Le même que moi')}</Chip>
            <Chip active={f.level === 'all'} onClick={() => setF('level', 'all')}>{t('Tous')}</Chip>
            {LEVELS.map((l) => (
              <Chip key={l.id} active={f.level === l.id} onClick={() => setF('level', l.id)}>{l.emoji} {l.label}</Chip>
            ))}
          </FilterRow>
          {currentUser.usualSpeed ? (
            <FilterRow label={t('Vitesse moyenne (toi : {n} km/h)', { n: currentUser.usualSpeed })}>
              {SPEED_GAPS.map((g) => (
                <Chip key={g ?? 'all'} active={f.speedGap === g} onClick={() => setF('speedGap', g)}>{g ? t('± {n} km/h', { n: g }) : t('Toutes')}</Chip>
              ))}
            </FilterRow>
          ) : (
            <p className="text-xs text-stone-500">
              💨 {t('Indique ta vitesse moyenne habituelle pour trouver des cyclistes qui roulent comme toi.')}{' '}
              <button className="font-semibold text-teal-600" onClick={() => go('rider')}>{t('Compléter mon profil')}</button>
            </p>
          )}
          <FilterRow label={t('Distance max')}>
            {DISTANCES.map((d) => (
              <Chip key={d ?? 'all'} active={f.maxKm === d} onClick={() => setF('maxKm', d)}>{d ? `${d} km` : t('Toutes')}</Chip>
            ))}
          </FilterRow>
          <FilterRow label={t('Trier par')}>
            <Chip active={f.sort === 'match'} onClick={() => setF('sort', 'match')}>🤝 {t('Compatibilité')}</Chip>
            <Chip active={f.sort === 'distance'} onClick={() => setF('sort', 'distance')}>📍 {t('Distance')}</Chip>
          </FilterRow>
        </div>
      )}

      {results.length === 0 && (
        <div className="card space-y-3 text-center text-stone-600">
          <div className="text-4xl">🚵</div>
          <p>
            {search ? t('Aucun cycliste trouvé pour « {search} ».', { search })
              : filtered ? t('Personne pour l’instant avec ces filtres.') : t('Personne pour l’instant dans le coin.')}
          </p>
          {nearestBeyond && (
            <button className="btn-ghost mx-auto" onClick={() => setF('maxKm', null)}>
              {t('Le plus proche, {name}, est à {distance} : voir tous les cyclistes', { name: nearestBeyond.user.name, distance: formatDistance(nearestBeyond.km) })}
            </button>
          )}
          {!search && filtered && (
            <button className="text-sm font-semibold text-teal-600" onClick={() => setFilters({ ...DEFAULT_FILTERS, level: 'all', maxKm: null })}>{t('Retirer les filtres')}</button>
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
                id: 'me', coords: currentUser.coords, emoji: '🚴', photoUrl: currentUser.avatarUrl, highlight: true,
                popup: <strong>{t('Toi')}</strong>,
              }] : []),
              ...results.filter((r) => r.user.coords).map(({ user, km, score }) => ({
                id: user.id,
                coords: fuzz(user.coords, user.id),
                emoji: levelInfo(user.level)?.emoji || '🚴',
                photoUrl: user.avatarUrl,
                popup: (
                  <div className="space-y-1 text-sm">
                    <div className="font-bold">{user.name}<StaffBadge userId={user.id} /></div>
                    <RiderChips user={user} compact />
                    <div className="text-stone-500">{km != null && `${formatDistance(km)} · `}{t('{score}% compatible', { score })}</div>
                    <button className="font-semibold text-teal-600" onClick={() => go('user', { userId: user.id })}>{t('Voir le profil →')}</button>
                  </div>
                ),
              })),
            ]}
          />
          {results.some((r) => !r.user.coords) && (
            <p className="text-xs text-stone-500">{t('Les cyclistes qui n’ont pas partagé leur position n’apparaissent pas sur la carte.')}</p>
          )}
        </Suspense>
      )}

      {view === 'list' && results.map(({ user, km, score, details }) => (
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
          <RiderChips user={user} />
          {user.bio && <p className="line-clamp-2 text-sm text-stone-600">{user.bio}</p>}
          {user.bikes.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {user.bikes.slice(0, 4).map((b) => (b.photoUrl
                ? <img key={b.id} src={b.photoUrl} alt={b.name} title={b.name} loading="lazy" className="h-14 w-20 shrink-0 rounded-xl bg-emerald-50 object-cover" />
                : <span key={b.id} className="shrink-0 rounded-xl bg-emerald-50 px-2 py-1 text-xs text-stone-600">🚲 {b.name}</span>))}
            </div>
          )}
          {(details.sharedSlots.length > 0 || user.availability?.length > 0) && (
            <div className="text-xs text-stone-500">
              🕒 {details.sharedSlots.length > 0
                ? t('Dispo en même temps que toi : {slots}', { slots: details.sharedSlots.map((a) => t(a)).join(', ') })
                : t('Dispo : {slots}', { slots: user.availability.map((a) => t(a)).join(', ') })}
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary flex-1 !py-2 text-sm" onClick={() => proposeRide(user)}>
              <Bike size={16} /> {t('Proposer une sortie')}
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
    <button onClick={onClick} aria-pressed={active}
      className={`chip ${active ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
      {children}
    </button>
  );
}
