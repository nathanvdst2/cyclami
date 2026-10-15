import { useEffect, useState } from 'react';
import { CalendarDays, LocateFixed, MapPin, Plus, Users } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import PetAvatar from './PetAvatar.jsx';
import { weatherAt } from '../lib/weather.js';
import { distanceKm, formatDistance } from '../utils/geo.js';
import { locale, t } from '../i18n/index.js';

// Haut de l'accueil : bonjour, météo de la prochaine heure et les deux actions principales.
export function WelcomeHero({ go, locMsg, onLocate }) {
  const { currentUser } = useApp();
  const pet = currentUser.pets[0];
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    const c = currentUser.coords;
    if (c) weatherAt(c.lat, c.lng, Date.now() + 20 * 60e3).then(setWeather).catch(() => {});
  }, [currentUser.coords?.lat, currentUser.coords?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const hour = new Date().getHours();
  const hello = hour < 5 || hour >= 18 ? t('Bonsoir {name}', { name: currentUser.name }) : t('Bonjour {name}', { name: currentUser.name });
  const rainy = weather?.rain != null && weather.rain >= 50;

  return (
    <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 via-teal-500 to-emerald-500 p-4 text-white shadow-md sm:p-5">
      <div className="flex items-center gap-3">
        {pet && <PetAvatar pet={pet} size="lg" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold leading-tight sm:text-2xl">{hello} 👋</h1>
          <p className="text-sm text-teal-50">
            {pet ? t('{pet} a envie de se dégourdir les pattes !', { pet: pet.name }) : t('Prêt pour une sortie ?')}
          </p>
        </div>
        {weather && (
          <div className="shrink-0 rounded-2xl bg-white/20 px-3 py-1.5 text-center backdrop-blur" title={t('Météo de la prochaine heure')}>
            <div className="text-2xl leading-none">{weather.emoji}</div>
            <div className="text-sm font-bold">{weather.temp}°</div>
          </div>
        )}
      </div>
      {weather && (
        <p className="mt-2 text-sm font-semibold text-white/95">
          {rainy ? t('🌧️ Pluie probable ({n} %) : prévois un imperméable… ou une sortie courte.', { n: weather.rain })
            : weather.temp >= 27 ? t('🥵 Il fait chaud : sortie tôt ou tard, à l’ombre, avec de l’eau.')
              : weather.temp <= 0 ? t('🥶 Il gèle : attention au sel sur les trottoirs, rince les pattes au retour.')
                : t('Temps idéal pour une sortie 🚴')}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#fffaf5] px-2 py-2.5 text-[13px] font-bold text-[#c2410c] shadow-sm active:scale-[0.98] sm:text-sm" onClick={() => go('tracker')}>
          📍 {t('Démarrer une sortie')}
        </button>
        <button className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white/20 px-2 py-2.5 text-[13px] font-bold text-white ring-1 ring-white/50 active:scale-[0.98] sm:text-sm" onClick={() => go('rides', { create: Date.now() })}>
          <Plus size={15} /> {t('Organiser une sortie')}
        </button>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-teal-50">
        <MapPin size={12} /> {currentUser.city || t('Ma position')}
        <button onClick={onLocate} className="ml-1 inline-flex items-center gap-1 font-semibold text-white underline-offset-2 hover:underline">
          <LocateFixed size={12} /> {currentUser.coords ? t('Mettre à jour ma position') : t('Me localiser')}
        </button>
        {locMsg && <span className="ml-1">{locMsg}</span>}
      </p>
    </section>
  );
}

// Raccourcis en icônes (au lieu d'une longue liste de boutons), avec des pastilles quand il se passe quelque chose.
export function QuickTiles({ go, badges = {} }) {
  // [page, emoji, libellé court affiché, nom complet (lecteurs d'écran, info-bulle), ton]
  const tiles = [
    ['chat', '💬', t('Tchat'), t('Tchat général')],
    ['emergency', '🚑', t('Véto'), t('Urgence véto'), 'red'],
    ['hazards', '⚠️', t('Dangers'), t('Dangers du quartier')],
    ['lost', '🚨', t('Perdus'), t('Animaux perdus')],
    ['sitting', '🏠', t('Garde'), t('Garde entre voisins')],
    ['groups', '👥', t('Groupes'), t('Groupes')],
    ['forum', '🗂️', t('Forum'), t('Forum')],
    ['gear', '🎁', t('Matériel'), t('Matériel entre voisins')],
    ['games', '🎮', t('Jeux'), t('Jeux')],
    ['invite', '💌', t('Inviter'), t('Inviter des amis')],
  ];
  return (
    <nav className="grid grid-cols-5 gap-2" aria-label={t('Raccourcis')}>
      {tiles.map(([page, emoji, label, full, tone]) => (
        <button key={page} onClick={() => go(page)} aria-label={full} title={full}
          className={`relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-center shadow-sm ring-1 transition active:scale-95 ${tone === 'red'
            ? 'bg-red-50 ring-red-200' : 'bg-white ring-emerald-100 hover:ring-teal-200'}`}>
          <span className="text-2xl leading-none">{emoji}</span>
          <span className={`w-full truncate text-[11px] font-semibold ${tone === 'red' ? 'text-red-700' : 'text-stone-600'}`}>{label}</span>
          {badges[page] > 0 && (
            <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-red-600 px-1 text-[11px] font-bold leading-5 text-white">{badges[page]}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

// Prochaines sorties autour de moi (≤ 25 km), en cartes que l'on fait défiler.
export function NearbyRides({ go }) {
  const { rides, currentUser } = useApp();
  const now = Date.now();
  const list = rides
    .filter((w) => !w.hidden && new Date(w.date).getTime() > now)
    .map((w) => ({ ...w, km: currentUser.coords && w.coords ? distanceKm(currentUser.coords, w.coords) : null }))
    .filter((w) => w.km == null || w.km <= 25)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 8);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold text-stone-800">🌳 {t('Sorties près de chez toi')}</h2>
        <button className="text-sm font-semibold text-teal-600" onClick={() => go('rides')}>{t('Tout voir')}</button>
      </div>
      {list.length === 0 ? (
        <button className="card flex w-full items-center gap-3 border-2 border-dashed border-teal-200 text-left !ring-0" onClick={() => go('rides', { create: Date.now() })}>
          <span className="text-3xl">🦮</span>
          <span className="flex-1 text-sm text-stone-600">
            <strong className="block text-stone-800">{t('Aucune sortie prévue autour de toi')}</strong>
            {t('Organise la première : les voisins sont prévenus et peuvent s’inscrire.')}
          </span>
          <Plus className="shrink-0 text-teal-600" />
        </button>
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
          {list.map((w) => {
            const d = new Date(w.date);
            const joined = w.participants.includes(currentUser.id) || w.hostId === currentUser.id;
            return (
              <button key={w.id} onClick={() => go('rides', { rideId: w.id })}
                className={`card w-56 shrink-0 snap-start space-y-1.5 !p-3 text-left ${joined ? 'ring-2 ring-green-300' : ''}`}>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-600">
                  <CalendarDays size={12} /> {d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })} · {d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="line-clamp-2 font-bold text-stone-800">{w.title}</div>
                <div className="truncate text-xs text-stone-500">📍 {w.place}{w.km != null && ` · ${formatDistance(w.km)}`}</div>
                <div className="flex items-center gap-1 text-xs text-stone-500">
                  <Users size={12} /> {w.participants.length}/{w.maxParticipants}
                  {joined && <span className="ml-auto font-semibold text-green-700">✓ {t('inscrit')}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
