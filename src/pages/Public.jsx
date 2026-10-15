import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Clock, Gauge, MapPin, Mountain, Route, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../context/AppContext.jsx';
import { CITIES, CITY_RADIUS_KM, cityBySlug, nearbyCities } from '../lib/cities.js';
import { LEVELS, RIDE_TYPES, levelInfo, rideType } from '../data/constants.js';
import { formatDate } from '../utils/geo.js';
import Brand from '../components/Brand.jsx';
import ShareButton from '../components/ShareButton.jsx';
import { getLang, langPath, locale, t } from '../i18n/index.js';

const MapView = lazy(() => import('../components/MapView.jsx'));

// Pages publiques : visibles sans compte et trouvables sur Google (le serveur ajoute aussi
// leur contenu dans la page, voir netlify/edge-functions/share.js). Seules des informations
// publiques y figurent : sorties à venir sans organisateur ni participants, chiffres par ville, noms des clubs.
//   PublicRides : /sorties — PublicRide : /s/<sortie> — PublicCity : /sorties/<ville>

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
};

function useData(load, deps) {
  const [state, setState] = useState({ data: undefined, error: null });
  useEffect(() => {
    let alive = true;
    setState({ data: undefined, error: null });
    load().then((data) => alive && setState({ data, error: null }), (e) => alive && setState({ data: null, error: friendlyError(e) }));
    return () => { alive = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// Cadre commun : logo, connexion / inscription, et l'invitation à rejoindre le site.
// inApp : page affichée dans l'application (membre connecté), sans en-tête ni pied de page.
function Shell({ go, inApp, children }) {
  if (inApp) return <div className="space-y-4 pb-4">{children}</div>;
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-100 to-emerald-50">
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <header className="flex items-center justify-between gap-3">
          <button onClick={() => go('landing')} aria-label="Cyclami"><Brand size="md" /></button>
          <span className="flex gap-2">
            <button className="btn-ghost" onClick={() => go('login')}>{t('Se connecter')}</button>
            <button className="btn-primary hidden sm:inline-flex" onClick={() => go('signup')}>{t('S’inscrire')}</button>
          </span>
        </header>
        {children}
        <section className="rounded-3xl bg-teal-500 px-6 py-8 text-center text-white">
          <h2 className="text-xl font-extrabold">{t('Rejoins les cyclistes de ta région')}</h2>
          <p className="mt-1 text-sm">{t('Trouve des cyclistes de ton niveau et rejoins des sorties de groupe près de chez toi : c’est gratuit.')}</p>
          <button className="mt-4 rounded-xl bg-white px-5 py-2.5 font-bold text-teal-600" onClick={() => go('signup')}>{t('Créer mon compte gratuit')}</button>
        </section>
        <nav className="flex flex-wrap justify-center gap-4 text-sm text-stone-500">
          <a href={langPath('/sorties')} onClick={(e) => { e.preventDefault(); go('public-rides'); }}>{t('Sorties à venir')}</a>
          <button onClick={() => go('legal', { doc: 'safety' })}>{t('Conseils de sécurité')}</button>
          <button onClick={() => go('legal', { doc: 'legal' })}>{t('Mentions légales')}</button>
        </nav>
      </div>
    </div>
  );
}

const Loading = () => <div className="card h-48 animate-pulse" />;
const Missing = ({ text, go, to }) => (
  <div className="card space-y-3 text-center text-stone-500">
    <p>{text}</p>
    <button className="btn-ghost" onClick={() => go(to)}>{t('Voir les sorties à venir')}</button>
  </div>
);

const num = (v) => (v == null || v === '' ? null : Number(v));
const fmt = (v) => num(v)?.toLocaleString(locale(), { maximumFractionDigits: 1 });

// Petites étiquettes d'une sortie : type, niveau, « pas de lâchage »
function RideBadges({ w }) {
  const type = rideType(w.ride_type);
  const level = levelInfo(w.level);
  return (
    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
      {type && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700 ring-1 ring-teal-200">{type.emoji} {type.label}</span>}
      {level && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-200">{level.label}</span>}
      {w.no_drop && <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700 ring-1 ring-green-200">🤝 {t('Pas de lâchage')}</span>}
    </div>
  );
}

function RideInfo({ w }) {
  return (
    <div className="grid gap-1 text-sm text-stone-600">
      <span className="flex items-center gap-2"><CalendarDays size={14} /> {formatDate(w.starts_at)}</span>
      <span className="flex items-center gap-2"><MapPin size={14} /> {w.place}</span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1"><Clock size={14} /> {w.duration} min</span>
        {num(w.distance_km) != null && <span className="flex items-center gap-1"><Route size={14} /> {fmt(w.distance_km)} km</span>}
        {num(w.elevation_m) != null && <span className="flex items-center gap-1"><Mountain size={14} /> {fmt(w.elevation_m)} m D+</span>}
        {num(w.avg_speed) != null && <span className="flex items-center gap-1"><Gauge size={14} /> {t('{n} km/h', { n: fmt(w.avg_speed) })}</span>}
        {w.max_participants != null && <span className="flex items-center gap-1"><Users size={14} /> {w.participants ?? 0}/{w.max_participants}</span>}
      </span>
    </div>
  );
}

function RideItem({ w, go, heading: H = 'h2' }) {
  return (
    <a href={langPath(`/s/${w.id}`)} className="card block w-full space-y-2 text-left"
      onClick={(e) => { e.preventDefault(); go('rides', { rideId: w.id }); }}>
      <H className="font-bold text-stone-800">{w.title}</H>
      <RideBadges w={w} />
      <RideInfo w={w} />
    </a>
  );
}

// Filtre par type de sortie (route, VTT / gravel, loisir / électrique)
function TypeFilter({ value, onChange }) {
  const chip = (active) => `chip ${active ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`;
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('Type de sortie')}>
      <button className={chip(!value)} aria-pressed={!value} onClick={() => onChange(null)}>{t('Toutes')}</button>
      {RIDE_TYPES.map((r) => (
        <button key={r.id} className={chip(value === r.id)} aria-pressed={value === r.id} onClick={() => onChange(r.id)}>{r.emoji} {r.label}</button>
      ))}
    </div>
  );
}

const SafetyNote = () => (
  <p className="flex items-start gap-1.5 text-xs text-stone-500">
    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-teal-500" />
    {t('Cyclami n’organise pas les sorties : chacun roule sous sa propre responsabilité. Casque recommandé et code de la route de rigueur.')}
  </p>
);

// /sorties : sorties à venir (titre, lieu de rendez-vous, date, type, niveau…) — sans organisateur ni participants.
export function PublicRides({ go, inApp }) {
  const { data, error } = useData(() => rpc('public_rides'), []);
  const [type, setType] = useState(null);
  const rides = data?.filter((w) => !type || w.ride_type === type);
  return (
    <Shell go={go} inApp={inApp}>
      <div>
        <h1 className="text-3xl font-extrabold text-stone-800">{t('Sorties vélo à venir')}</h1>
        <p className="mt-1 text-stone-600">{t('Les prochaines sorties de groupe proposées par les cyclistes de Cyclami, en Belgique et en France : route, VTT, gravel ou balade à vélo électrique. Inscris-toi gratuitement pour y participer.')}</p>
      </div>
      <TypeFilter value={type} onChange={setType} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data === undefined && <Loading />}
      {rides?.length === 0 && <div className="card text-center text-stone-500">{t('Aucune sortie prévue pour le moment : organise la première !')}</div>}
      {rides?.map((w) => <RideItem key={w.id} w={w} go={go} />)}
      <SafetyNote />
      <CityChips cities={CITIES} go={go} title={t('Sorties vélo par ville')} />
    </Shell>
  );
}

// /s/<id> (sans compte) : fiche publique d'une sortie.
export function PublicRide({ go, params }) {
  const { data: w, error } = useData(() => rpc('public_ride', { p_id: params.rideId }), [params.rideId]);
  if (w === undefined && !error) return <Shell go={go}><Loading /></Shell>;
  if (!w) return <Shell go={go}><Missing text={t('Cette sortie est terminée ou n’existe plus.')} go={go} to="public-rides" /></Shell>;
  const type = rideType(w.ride_type);
  const level = levelInfo(w.level);
  const start = num(w.lat) != null && num(w.lng) != null ? { lat: num(w.lat), lng: num(w.lng) } : null;
  return (
    <Shell go={go}>
      <button onClick={() => go('public-rides')} className="flex items-center gap-1 text-sm text-stone-500"><ArrowLeft size={16} /> {t('Toutes les sorties')}</button>
      <section className="card space-y-3">
        <h1 className="text-2xl font-extrabold text-stone-800">{type?.emoji || '🚴'} {w.title}</h1>
        <RideBadges w={w} />
        <RideInfo w={w} />
        {level && <p className="text-sm text-stone-500">{t('Niveau {level} : {speed} de moyenne sur le plat.', { level: level.label, speed: level.speed })}</p>}
        {w.no_drop && <p className="text-sm text-green-700">🤝 {t('Pas de lâchage : le groupe attend tout le monde, idéal si tu débutes ou reprends.')}</p>}
        {w.description && <p className="whitespace-pre-line break-words text-stone-700">{w.description}</p>}
        {start && (
          <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-emerald-100" />}>
            <MapView height="h-48" center={start} zoom={13}
              markers={[{ id: w.id, coords: start, emoji: type?.emoji || '🚴', highlight: true, popup: <strong>{w.place}</strong> }]} />
          </Suspense>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <button className="btn-primary w-full" onClick={() => go('signup')}>{t('Participer (inscription gratuite)')}</button>
          <ShareButton path={langPath(`/s/${w.id}`)} title={w.title} text={t('Sortie vélo « {title} » sur Cyclami', { title: w.title })} className="btn-ghost w-full justify-center" />
        </div>
        <SafetyNote />
      </section>
    </Shell>
  );
}

const cityName = (c) => c.name[getLang()] || c.name.fr;

// liens vers d'autres villes (pages par ville)
function CityChips({ cities, go, title }) {
  if (!cities.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-stone-800">{title}</h2>
      <nav className="flex flex-wrap gap-2" aria-label={title}>
        {cities.map((c) => (
          <a key={c.slug} href={langPath(`/sorties/${c.slug}`)} className="chip bg-white text-stone-600 ring-emerald-200"
            onClick={(e) => { e.preventDefault(); go('public-city', { city: c.slug }); }}>📍 {cityName(c)}</a>
        ))}
      </nav>
    </section>
  );
}

function Stat({ value, label }) {
  return (
    <div className="card !p-3 text-center">
      <div className="text-2xl font-extrabold text-teal-600">{value ?? 0}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

// /sorties/<ville> : sorties vélo et cyclistes autour d'une grande ville (chiffres, sorties à venir, clubs).
export function PublicCity({ go, params, inApp }) {
  const city = cityBySlug(params.city);
  const { data, error } = useData(() => (city ? rpc('public_city', { p_lat: city.lat, p_lng: city.lng, p_km: CITY_RADIUS_KM }) : Promise.resolve(null)), [params.city]);
  const [type, setType] = useState(null);
  if (!city) return <Shell go={go} inApp={inApp}><Missing text={t('Cette page n’existe pas.')} go={go} to="public-rides" /></Shell>;
  const name = cityName(city);
  const join = () => go(inApp ? 'rides' : 'signup');
  const few = data && data.members < 3;
  const rides = (data?.rides || []).filter((w) => !type || w.ride_type === type);
  const groups = data?.groups || [];
  const levels = data?.levels || {};
  return (
    <Shell go={go} inApp={inApp}>
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 to-emerald-500 p-5 text-white shadow-md">
        <div className="text-5xl" aria-hidden="true">🚴</div>
        <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">{t('Sorties vélo et cyclistes à {city}', { city: name })}</h1>
        <p className="mt-2 text-teal-50">{t('Tu roules à {city} ou dans les environs ? Sur Cyclami, les cyclistes du coin se retrouvent pour rouler ensemble, à leur niveau : sorties sur route, en VTT ou gravel, balades à vélo électrique. Gratuit, sans publicité.', { city: name })}</p>
        <button className="mt-4 rounded-xl bg-white px-5 py-2.5 font-bold text-teal-600" onClick={join}>
          {inApp ? t('Voir les sorties') : t('Rejoindre les cyclistes de {city} (gratuit)', { city: name })}
        </button>
      </section>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data === undefined && <Loading />}
      {data && (
        <>
          <section className="grid grid-cols-3 gap-2">
            <Stat value={data.members} label={t('cyclistes à moins de {km} km', { km: CITY_RADIUS_KM })} />
            <Stat value={data.rides?.length} label={t('sorties prévues')} />
            <Stat value={groups.length} label={t('clubs et groupes')} />
          </section>
          {LEVELS.some((l) => levels[l.id] > 0) && (
            <p className="text-sm text-stone-600">
              🚴 {t('Niveaux des cyclistes autour de {city} :', { city: name })}{' '}
              <strong>{LEVELS.filter((l) => levels[l.id] > 0).map((l) => `${l.label} (${levels[l.id]})`).join(', ')}</strong>
            </p>
          )}
          {few && (
            <div className="card bg-teal-50 text-sm text-stone-700 ring-teal-200">
              🌱 {t('Cyclami vient d’arriver à {city} : inscris-toi parmi les premiers et invite tes amis cyclistes. Plus vous êtes nombreux, plus il y a de sorties à ton niveau !', { city: name })}
            </div>
          )}
          <section className="space-y-2">
            <h2 className="text-xl font-extrabold text-stone-800">{t('Prochaines sorties autour de {city}', { city: name })}</h2>
            {data.rides?.length > 0 && <TypeFilter value={type} onChange={setType} />}
            {rides.length === 0 && (
              <div className="card text-center text-sm text-stone-500">{t('Aucune sortie prévue pour le moment : organise la première !')}</div>
            )}
            {rides.map((w) => <RideItem key={w.id} w={w} go={go} heading="h3" />)}
          </section>
          {groups.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xl font-extrabold text-stone-800">{t('Clubs et groupes près de {city}', { city: name })}</h2>
              {groups.map((g) => (
                <a key={g.id} href={langPath(`/g/${g.id}`)} className="card flex w-full items-center gap-3 text-left"
                  onClick={(e) => { e.preventDefault(); go('groups', { groupId: g.id }); }}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl">{g.emoji || '🚴'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-stone-800">{g.name}</span>
                    {g.city && <span className="block truncate text-xs text-stone-500">{g.city}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-xs text-stone-500"><Users size={14} /> {g.member_count}</span>
                </a>
              ))}
            </section>
          )}
        </>
      )}
      <section className="card space-y-2">
        <h2 className="text-lg font-bold text-stone-800">{t('Comment ça marche ?')}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
          <li>{t('Présente-toi : route, VTT ou vélo électrique, ton niveau et ta vitesse moyenne habituelle.')}</li>
          <li>{t('Découvre les cyclistes de ton niveau autour de {city}, sur la liste ou sur la carte.', { city: name })}</li>
          <li>{t('Rejoins une sortie de groupe, ou organise la tienne : une fois ou chaque semaine, avec ou sans lâchage.')}</li>
        </ol>
        <p className="text-xs text-stone-500">{t('Ta position est arrondie à environ 1 km : ton adresse n’est jamais affichée.')}</p>
      </section>
      <SafetyNote />
      <CityChips cities={nearbyCities(city, 8)} go={go} title={t('Autres villes')} />
      {!inApp && <button className="btn-ghost w-full" onClick={() => go('public-rides')}>{t('Toutes les sorties à venir')}</button>}
    </Shell>
  );
}
