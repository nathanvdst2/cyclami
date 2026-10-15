import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Clock, Home, MapPin, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { friendlyError } from '../context/AppContext.jsx';
import { citySlug } from '../lib/share.js';
import { CITIES, CITY_RADIUS_KM, cityBySlug, nearbyCities, nearestCity } from '../lib/cities.js';
import { illu } from '../lib/illustrations.js';
import { PACES, speciesInfo } from '../data/constants.js';
import { formatDate } from '../utils/geo.js';
import { SEX_LABEL, STATUS_LABEL, ageLabel, formatPrice } from '../utils/listing.js';
import Brand from '../components/Brand.jsx';
import DirectionsButton from '../components/DirectionsButton.jsx';
import ShareButton from '../components/ShareButton.jsx';
import AdoptedStrip from '../components/AdoptedStrip.jsx';
import { NeedList } from '../components/ShelterNeeds.jsx';
import { EventList } from '../components/ShelterEvents.jsx';
import { getLang, langPath, locale, t } from '../i18n/index.js';

const MapView = lazy(() => import('../components/MapView.jsx'));

// Pages publiques : visibles sans compte et trouvables sur Google (le serveur ajoute aussi
// leur contenu dans la page, voir netlify/edge-functions/share.js). Seules des informations
// publiques y figurent : annonces et refuges vérifiés, sorties à venir sans organisateur ni participants.

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
          <h2 className="text-xl font-extrabold">{t('Rejoins les propriétaires d’animaux de ton quartier')}</h2>
          <p className="mt-1 text-sm">{t('Sorties à plusieurs, entraide, adoptions en refuge : c’est gratuit.')}</p>
          <button className="mt-4 rounded-xl bg-white px-5 py-2.5 font-bold text-teal-600" onClick={() => go('signup')}>{t('Créer mon compte gratuit')}</button>
        </section>
        <nav className="flex flex-wrap justify-center gap-4 text-sm text-stone-500">
          <button onClick={() => go('public-adoptions')}>{t('Animaux à adopter')}</button>
          <button onClick={() => go('public-rides')}>{t('Sorties à venir')}</button>
          <button onClick={() => go('public-lost')}>{t('Animaux perdus')}</button>
          <button onClick={() => go('legal', { doc: 'legal' })}>{t('Mentions légales')}</button>
        </nav>
      </div>
    </div>
  );
}

// événements des refuges (portes ouvertes, collectes…) sur les pages publiques
function EventsSection({ events, go }) {
  if (!events?.length) return null;
  return (
    <section className="card space-y-2">
      <h2 className="font-bold text-stone-800">📅 {t('Événements des refuges')}</h2>
      <EventList events={events} onOpenShelter={(id) => go('refuge', { shelterId: id })} />
    </section>
  );
}

// besoins des refuges (dons, bénévoles…) sur les pages publiques
function NeedsSection({ needs, go }) {
  if (!needs?.length) return null;
  return (
    <section className="card space-y-2">
      <h2 className="font-bold text-stone-800">🙏 {t('Les refuges ont besoin de vous')}</h2>
      <NeedList needs={needs} onOpenShelter={(id) => go('refuge', { shelterId: id })} />
    </section>
  );
}

const Loading = () => <div className="card h-48 animate-pulse" />;
const Missing = ({ text, go, to }) => (
  <div className="card space-y-3 text-center text-stone-500">
    <p>{text}</p>
    <button className="btn-ghost" onClick={() => go(to)}>{t('Voir la liste')}</button>
  </div>
);

function AnimalCard({ l, go }) {
  const sp = speciesInfo(l.species);
  return (
    <button onClick={() => go('listing', { id: l.id })} className="card overflow-hidden !p-0 text-left">
      <div className="relative aspect-square bg-gradient-to-br from-emerald-100 to-teal-100">
        {l.photo
          ? <img src={l.photo} alt={l.title} loading="lazy" className="h-full w-full object-contain" />
          : <span className="flex h-full items-center justify-center text-6xl">{sp.emoji}</span>}
        {l.status !== 'active' && (
          <span className="absolute right-2 top-2 rounded-full bg-stone-800 px-2 py-0.5 text-xs font-semibold text-white">{STATUS_LABEL[l.status]}</span>
        )}
      </div>
      <div className="space-y-0.5 p-2.5">
        <div className="truncate font-bold text-stone-800">{l.title}</div>
        <div className="truncate text-xs text-stone-500">{sp.emoji} {l.breed || sp.label}{ageLabel(l.birth_date) && ` · ${ageLabel(l.birth_date)}`}</div>
        <div className="truncate text-xs text-stone-400">{l.shelter_name}{l.city && ` · ${l.city}`}</div>
      </div>
    </button>
  );
}

// /adoptions : tous les animaux à adopter des refuges vérifiés, et la liste des refuges.
export function PublicAdoptions({ go, inApp, params = {} }) {
  const all = useData(() => rpc('public_listings', {}), []);
  // page par ville (/adoptions/namur) : seulement les animaux de cette ville
  const cityName = params.city && all.data?.find((l) => citySlug(l.city) === params.city)?.city;
  const animals = { ...all, data: all.data && (params.city ? all.data.filter((l) => citySlug(l.city) === params.city) : all.data) };
  const cities = [...new Map((all.data || []).filter((l) => citySlug(l.city)).map((l) => [citySlug(l.city), l.city])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const shelters = useData(() => rpc('public_shelters'), []);
  const needs = useData(() => rpc('public_needs', {}), []);
  const events = useData(() => rpc('public_events', {}), []);
  return (
    <Shell go={go} inApp={inApp}>
      <div>
        <h1 className="text-3xl font-extrabold text-stone-800">
          {params.city ? t('Animaux à adopter à {city}', { city: cityName || params.city }) : t('Animaux à adopter en refuge')}
        </h1>
        <p className="mt-1 text-stone-600">{t('Chiens, chats et autres compagnons qui attendent une famille, proposés uniquement par des refuges agréés et vérifiés, en Belgique et en France.')}</p>
      </div>
      {cities.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label={t('Par ville')}>
          <button className={`chip ${!params.city ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}
            onClick={() => go('public-adoptions')}>{t('Toutes les villes')}</button>
          {cities.map(([slug, name]) => (
            <button key={slug} className={`chip ${params.city === slug ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}
              onClick={() => go('public-adoptions', { city: slug })}>📍 {name}</button>
          ))}
        </nav>
      )}
      {animals.error && <p className="text-sm text-red-600">{animals.error}</p>}
      {animals.data === undefined && <Loading />}
      {animals.data?.length === 0 && <div className="card text-center text-stone-500">{t('Aucun animal à adopter pour le moment. Reviens bientôt !')}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {animals.data?.map((l) => <AnimalCard key={l.id} l={l} go={go} />)}
      </div>
      <EventsSection events={events.data} go={go} />
      <NeedsSection needs={needs.data} go={go} />
      <AdoptedStrip load={() => rpc('public_adopted')} />
      {shelters.data?.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-extrabold text-stone-800">{t('Refuges partenaires')}</h2>
          {shelters.data.map((s) => (
            <button key={s.id} className="card flex w-full items-center gap-3 text-left" onClick={() => go('refuge', { shelterId: s.id })}>
              <Home size={20} className="shrink-0 text-teal-500" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-stone-800">{s.name}</span>
                {s.address && <span className="block truncate text-xs text-stone-500">{s.address}</span>}
              </span>
              <span className="shrink-0 text-xs text-stone-500">{t('{n} à adopter', { n: s.animals })}</span>
            </button>
          ))}
        </section>
      )}
    </Shell>
  );
}

// /a/<id> (sans compte) : fiche publique d'un animal à adopter.
export function PublicListing({ go, params }) {
  const { data: l, error } = useData(() => rpc('public_listing', { p_id: params.id }), [params.id]);
  if (l === undefined && !error) return <Shell go={go}><Loading /></Shell>;
  if (!l) return <Shell go={go}><Missing text={t('Cet animal a peut-être déjà trouvé une famille.')} go={go} to="public-adoptions" /></Shell>;
  const sp = speciesInfo(l.species);
  const rows = [
    [t('Espèce'), `${sp.emoji} ${sp.label}${l.breed ? ` · ${l.breed}` : ''}`],
    [t('Sexe'), SEX_LABEL[l.sex]],
    ageLabel(l.birth_date) && [t('Âge'), ageLabel(l.birth_date)],
    [t('Vacciné'), l.vaccinated ? t('Oui') : t('Non')],
    [t('Stérilisé'), l.sterilized ? t('Oui') : t('Non')],
    [t('Frais d’adoption'), formatPrice(l.price_cents)],
  ].filter(Boolean);
  return (
    <Shell go={go}>
      <button onClick={() => go('public-adoptions')} className="flex items-center gap-1 text-sm text-stone-500"><ArrowLeft size={16} /> {t('Tous les animaux à adopter')}</button>
      {l.photo_urls?.length > 0 ? (
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4">
          {l.photo_urls.map((url) => <img key={url} src={url} alt={l.title} className="h-72 w-[85%] shrink-0 snap-center rounded-2xl bg-emerald-100 object-contain" />)}
        </div>
      ) : <div className="flex h-56 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 text-8xl">{sp.emoji}</div>}
      <section className="card space-y-2">
        <h1 className="text-2xl font-extrabold text-stone-800">{l.title}</h1>
        <p className="text-sm text-stone-500">{STATUS_LABEL[l.status]}{l.city && ` · ${l.city}`}</p>
        {l.description && <p className="whitespace-pre-line text-stone-700">{l.description}</p>}
      </section>
      <section className="card space-y-1 text-sm">
        {rows.map(([k, v]) => <div key={k} className="flex gap-3"><span className="w-28 shrink-0 text-stone-400">{k}</span><span className="text-stone-700">{v}</span></div>)}
      </section>
      <section className="card space-y-2">
        <div className="text-xs text-stone-400">{t('Proposé à l’adoption par')}</div>
        <button className="text-left font-bold text-stone-800 underline-offset-2 hover:underline" onClick={() => go('refuge', { shelterId: l.shelter.id })}>{l.shelter.name}</button>
        <div className="flex items-center gap-1 text-xs font-semibold text-green-700"><ShieldCheck size={12} /> {t('Refuge vérifié · agrément {number}', { number: l.shelter.approval_number })}</div>
        {l.shelter.address && (
          <div className="flex items-center gap-1 text-sm text-stone-600">
            <MapPin size={14} className="shrink-0 text-teal-500" /> {l.shelter.address}
            {l.shelter.lat != null && <DirectionsButton lat={l.shelter.lat} lng={l.shelter.lng} label={l.shelter.name} />}
          </div>
        )}
        <button className="btn-primary w-full" onClick={() => go('signup')}>{t('Contacter le refuge (inscription gratuite)')}</button>
      </section>
    </Shell>
  );
}

// /refuge/<id> : page publique d'un refuge et de ses animaux (lien de l'affiche à QR code).
// coordonnées lisibles dans le champ « contact » du refuge : téléphone, e-mail, site
function contactLinks(text) {
  const src = String(text || '');
  const email = src.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  const web = src.match(/(https?:\/\/[^\s,;]+|www\.[^\s,;]+)/)?.[0];
  const phone = src.replace(email || '', '').replace(web || '', '').match(/\+?\d[\d\s./-]{7,}\d/)?.[0];
  return { email, web: web && (web.startsWith('http') ? web : `https://${web}`), phone: phone?.trim() };
}

const REGION_LABEL = { wallonie: 'Wallonie', bruxelles: 'Bruxelles', flandre: 'Flandre', france: 'France', autre: 'Autre' };

// /refuge/<id> : fiche d'un refuge vérifié — coordonnées, carte, chiffres, animaux, besoins, événements, adoptions réussies.
export function PublicShelter({ go, params, inApp }) {
  const shelter = useData(() => rpc('public_shelter', { p_id: params.shelterId }), [params.shelterId]);
  const animals = useData(() => rpc('public_listings', { p_shelter: params.shelterId }), [params.shelterId]);
  const needs = useData(() => rpc('public_needs', { p_shelter: params.shelterId }), [params.shelterId]);
  const events = useData(() => rpc('public_events', { p_shelter: params.shelterId }), [params.shelterId]);
  const s = shelter.data;
  if (s === undefined && !shelter.error) return <Shell go={go} inApp={inApp}><Loading /></Shell>;
  if (!s) return <Shell go={go} inApp={inApp}><Missing text={t('Ce refuge n’est pas (ou plus) sur Cyclami.')} go={go} to={inApp ? 'listings' : 'public-adoptions'} /></Shell>;
  const parsed = contactLinks(s.contact);
  const c = { email: s.email || parsed.email, phone: s.phone || parsed.phone, web: s.website || parsed.web };
  const write = () => (inApp ? go('messages', { userId: s.id, draft: t('Bonjour, je vous contacte depuis Cyclami : ') }) : go('signup'));
  return (
    <Shell go={go} inApp={inApp}>
      <button onClick={() => go(inApp ? 'listings' : 'public-adoptions')} className="flex items-center gap-1 text-sm text-stone-500"><ArrowLeft size={16} /> {t('Tous les animaux à adopter')}</button>
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 to-emerald-500 p-5 text-white shadow-md">
        <div className="flex items-start gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-3xl">🏠</span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight">{s.name}</h1>
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
              <ShieldCheck size={12} /> {t('Refuge vérifié · agrément {number}', { number: s.approval_number })}
            </p>
            {s.region && <p className="mt-1 text-sm text-teal-50">📍 {t(REGION_LABEL[s.region] || s.region)}</p>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/15 px-2 py-2"><div className="text-2xl font-extrabold">{s.animals ?? animals.data?.length ?? 0}</div><div className="text-xs text-teal-50">{t('à adopter')}</div></div>
          <div className="rounded-2xl bg-white/15 px-2 py-2"><div className="text-2xl font-extrabold">{s.adopted ?? 0}</div><div className="text-xs text-teal-50">{t('adoptés grâce à Cyclami')}</div></div>
          <div className="rounded-2xl bg-white/15 px-2 py-2"><div className="text-2xl font-extrabold">{needs.data?.length || 0}</div><div className="text-xs text-teal-50">{t('besoins en cours')}</div></div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="rounded-xl bg-[#fffaf5] px-3 py-2.5 text-sm font-bold text-[#c2410c] shadow-sm" onClick={write}>
            💬 {inApp ? t('Écrire au refuge') : t('Contacter (inscription gratuite)')}
          </button>
          <ShareButton path={`/refuge/${s.id}`} title={s.name} text={t('Les animaux à adopter au refuge {name}', { name: s.name })}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-white/20 px-3 py-2.5 text-sm font-bold text-white ring-1 ring-white/50" />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold text-stone-800">{t('Infos pratiques')}</h2>
        {s.address && (
          <div className="flex items-start gap-2 text-sm text-stone-700">
            <MapPin size={16} className="mt-0.5 shrink-0 text-teal-500" />
            <span className="flex-1">{s.address}</span>
            {s.lat != null && <DirectionsButton lat={s.lat} lng={s.lng} label={s.name} />}
          </div>
        )}
        {(c.phone || c.email || c.web) ? (
          <div className="flex flex-wrap gap-2">
            {c.phone && <a className="btn-ghost text-sm" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>📞 {c.phone}</a>}
            {c.email && <a className="btn-ghost text-sm" href={`mailto:${c.email}`}>✉️ {c.email}</a>}
            {c.web && <a className="btn-ghost text-sm" href={c.web} target="_blank" rel="noopener noreferrer">🌐 {c.web.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>}
          </div>
        ) : s.contact ? <p className="text-sm text-stone-600">{s.contact}</p> : null}
        {!inApp && s.has_contact && !s.contact && !s.email && !s.phone && !s.website && (
          <p className="text-xs text-stone-500">🔒 {t('E-mail, téléphone et site du refuge : visibles par les membres connectés (inscription gratuite).')}</p>
        )}
        {s.lat != null && (
          <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-emerald-100" />}>
            <MapView height="h-48" center={{ lat: s.lat, lng: s.lng }} zoom={14}
              markers={[{ id: s.id, coords: { lat: s.lat, lng: s.lng }, emoji: '🏠', highlight: true, popup: <strong>{s.name}</strong> }]} />
          </Suspense>
        )}
        {s.verified_at && <p className="text-xs text-stone-500">✅ {t('Agrément vérifié par l’équipe d’Cyclami le {date}', { date: new Date(s.verified_at).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>}
        <p className="text-xs text-stone-500">{t('Rencontre l’animal au refuge avant toute adoption, ne verse jamais d’argent à distance et demande ses documents (identification, carnet de santé).')}</p>
      </section>

      <EventsSection events={events.data} go={go} />
      <NeedsSection needs={needs.data} go={go} />
      <h2 className="text-xl font-extrabold text-stone-800">{t('Ses animaux à adopter')}</h2>
      {animals.data === undefined && <Loading />}
      {animals.data?.length === 0 && <div className="card text-center text-stone-500">{t('Aucun animal à adopter pour le moment. Reviens bientôt !')}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {animals.data?.map((l) => <AnimalCard key={l.id} l={l} go={go} />)}
      </div>
      <AdoptedStrip load={() => rpc('public_adopted').then((r) => (r || []).filter((a) => a.shelter_id === s.id))} />
    </Shell>
  );
}

function RideInfo({ w }) {
  const pace = PACES.find((p) => p.id === w.pace);
  return (
    <div className="grid gap-1 text-sm text-stone-600">
      <span className="flex items-center gap-2"><CalendarDays size={14} /> {formatDate(w.starts_at)}</span>
      <span className="flex items-center gap-2"><Clock size={14} /> {w.duration} min{pace && ` · ${pace.label}`}</span>
      <span className="flex items-center gap-2"><MapPin size={14} /> {w.place}</span>
      <span className="flex items-center gap-2"><Users size={14} /> {w.participants}/{w.max_participants}</span>
    </div>
  );
}

// /sorties : sorties à venir (titre, lieu de rendez-vous, date) — sans organisateur ni participants.
export function PublicRides({ go }) {
  const { data, error } = useData(() => rpc('public_rides'), []);
  return (
    <Shell go={go}>
      <div>
        <h1 className="text-3xl font-extrabold text-stone-800">{t('Sorties entre propriétaires d’animaux')}</h1>
        <p className="mt-1 text-stone-600">{t('Les prochaines sorties organisées par les membres d’Cyclami. Inscris-toi gratuitement pour y participer avec ton compagnon.')}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data === undefined && <Loading />}
      {data?.length === 0 && <div className="card text-center text-stone-500">{t('Aucune sortie prévue pour le moment : organise la première !')}</div>}
      {data?.map((w) => (
        <button key={w.id} className="card w-full space-y-2 text-left" onClick={() => go('rides', { rideId: w.id })}>
          <h2 className="font-bold text-stone-800">{w.title}</h2>
          <RideInfo w={w} />
        </button>
      ))}
      <CityChips cities={CITIES} page="public-city" go={go} title={t('Sorties et rencontres par ville')} />
    </Shell>
  );
}

// /b/<id> (sans compte) : fiche publique d'une sortie.
// /refuges : présentation d'Cyclami aux refuges et inscription (lien des e-mails de proposition).
export function PublicJoinShelters({ go, inApp }) {
  const signup = () => {
    if (inApp) return go('listings');
    try { sessionStorage.setItem('cyclami:shelter-signup', '1'); } catch { /* stockage indisponible */ }
    return go('signup');
  };
  const perks = [
    ['🆓', t('Entièrement gratuit'), t('Inscription et publication gratuites, sans commission ni publicité.')],
    ['🔎', t('Visibles sur Google'), t('Vos animaux ont une page publique, visible sans compte, avec des pages par ville.')],
    ['✅', t('Refuge vérifié'), t('Votre nom et votre numéro d’agrément sont affichés et vérifiés par notre équipe : seuls les refuges agréés publient.')],
    ['💬', t('Vous choisissez les familles'), t('Les adoptants vous écrivent par une messagerie sécurisée, avec un formulaire de pré-adoption.')],
    ['📋', t('Tous vos animaux d’un coup'), t('Importez la liste de vos animaux depuis un tableur (Excel, Google Sheets), puis ajoutez les photos.')],
    ['🙏', t('Besoins et événements'), t('Demandez des dons ou des bénévoles, annoncez vos portes ouvertes, imprimez une affiche avec QR code.')],
  ];
  const faq = [
    [t('C’est vraiment gratuit ?'), t('Oui. Cyclami est un projet indépendant, sans publicité ni commission sur les adoptions.')],
    [t('Qui peut publier des animaux à adopter ?'), t('Uniquement les refuges agréés dont l’équipe a vérifié le numéro d’agrément. Les particuliers et les éleveurs ne peuvent pas publier.')],
    [t('Faut-il présenter un animal personnel pour s’inscrire ?'), t('Non : à l’inscription, choisissez « Tu inscris un refuge ? » et envoyez directement votre demande de vérification.')],
    [t('Une question ?'), t('Écrivez-nous à contact@cyclami.com, nous répondons personnellement.')],
  ];
  return (
    <Shell go={go} inApp={inApp}>
      <section className="rounded-3xl bg-gradient-to-br from-teal-500 to-emerald-500 px-6 py-8 text-white">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t('Refuges : faites adopter vos animaux gratuitement')}</h1>
        <p className="mt-2 text-teal-50">{t('Cyclami rassemble les propriétaires d’animaux de Belgique et de France. Notre rubrique Adoptions est réservée aux refuges agréés et vérifiés.')}</p>
        <button className="mt-4 rounded-xl bg-white px-5 py-2.5 font-bold text-teal-600" onClick={signup}>
          {inApp ? t('Ouvrir mes adoptions') : t('Inscrire mon refuge (gratuit)')}
        </button>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        {perks.map(([emoji, title, text]) => (
          <div key={title} className="card space-y-1">
            <div className="font-bold text-stone-800">{emoji} {title}</div>
            <p className="text-sm text-stone-600">{text}</p>
          </div>
        ))}
      </section>
      <section className="card space-y-2">
        <h2 className="text-lg font-bold text-stone-800">{t('En 3 étapes')}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
          <li>{t('Créez un compte gratuit et choisissez « Tu inscris un refuge ? ».')}</li>
          <li>{t('Indiquez le nom, l’adresse et le numéro d’agrément du refuge : notre équipe le vérifie.')}</li>
          <li>{t('Publiez vos animaux un par un, ou tous d’un coup depuis un tableur.')}</li>
        </ol>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-stone-800">{t('Questions fréquentes')}</h2>
        {faq.map(([q, a]) => (
          <details key={q} className="card">
            <summary className="cursor-pointer font-semibold text-stone-800">{q}</summary>
            <p className="mt-2 text-sm text-stone-600">{a}</p>
          </details>
        ))}
      </section>
      {!inApp && <button className="btn-primary w-full" onClick={signup}>{t('Inscrire mon refuge (gratuit)')}</button>}
    </Shell>
  );
}

// /p/<alerte> sans compte : l'alerte « perdu / trouvé » (lien du QR code de l'affiche)
export function PublicLost({ go, params }) {
  const { data: a, error } = useData(() => rpc('public_lost_alert', { p_id: params.alertId }), [params.alertId]);
  if (a === undefined && !error) return <Shell go={go}><Loading /></Shell>;
  if (!a) return <Shell go={go}><Missing text={t('Cette alerte n’existe plus.')} go={go} to="landing" /></Shell>;
  const sp = speciesInfo(a.species);
  const lost = a.kind === 'perdu';
  const solved = a.status !== 'active';
  return (
    <Shell go={go}>
      <section className="card space-y-3">
        <span className={`inline-block rounded-full px-3 py-1 text-sm font-extrabold text-white ${solved ? 'bg-green-700' : lost ? 'bg-red-700' : 'bg-green-700'}`}>
          {solved ? (lost ? t('🎉 Retrouvé !') : t('🎉 Rendu à son humain')) : lost ? t('🚨 Animal perdu') : t('🚴 Animal trouvé')}
        </span>
        <h1 className="text-2xl font-extrabold text-stone-800">{a.name || sp.label}</h1>
        {a.photo_url
          ? <img src={a.photo_url} alt={a.name || sp.label} className="max-h-96 w-full rounded-2xl bg-emerald-100 object-contain" />
          : <div className="flex h-48 items-center justify-center rounded-2xl bg-emerald-100 text-8xl">{sp.emoji}</div>}
        <p className="text-sm text-stone-500">{sp.emoji} {sp.label}</p>
        {a.description && <p className="whitespace-pre-line text-stone-700">{a.description}</p>}
        <p className="flex items-start gap-1 text-sm font-semibold text-stone-700">
          <MapPin size={16} className="mt-0.5 shrink-0 text-teal-500" />
          {lost ? t('Vu pour la dernière fois : {place}', { place: a.place }) : t('Trouvé : {place}', { place: a.place })} · {formatDate(a.seen_at)}
        </p>
        {!solved && (
          <>
            <button className="btn-primary w-full" onClick={() => go('signup')}>
              {lost ? t('Je l’ai vu : prévenir son humain (inscription gratuite)') : t('C’est le mien : contacter la personne (inscription gratuite)')}
            </button>
            <p className="text-center text-xs text-stone-500">{t('Un numéro figure peut-être sur l’affiche : tu peux aussi appeler directement.')}</p>
          </>
        )}
      </section>
    </Shell>
  );
}

export function PublicRide({ go, params }) {
  const { data: w, error } = useData(() => rpc('public_ride', { p_id: params.rideId }), [params.rideId]);
  if (w === undefined && !error) return <Shell go={go}><Loading /></Shell>;
  if (!w) return <Shell go={go}><Missing text={t('Cette sortie est terminée ou n’existe plus.')} go={go} to="public-rides" /></Shell>;
  return (
    <Shell go={go}>
      <button onClick={() => go('public-rides')} className="flex items-center gap-1 text-sm text-stone-500"><ArrowLeft size={16} /> {t('Toutes les sorties')}</button>
      <section className="card space-y-3">
        <h1 className="text-2xl font-extrabold text-stone-800">{w.title}</h1>
        <RideInfo w={w} />
        {w.description && <p className="whitespace-pre-line text-stone-700">{w.description}</p>}
        <button className="btn-primary w-full" onClick={() => go('signup')}>{t('Participer (inscription gratuite)')}</button>
      </section>
    </Shell>
  );
}

const cityName = (c) => c.name[getLang()] || c.name.fr;

// liens vers d'autres villes (pages par ville)
function CityChips({ cities, page, go, title }) {
  if (!cities.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-stone-800">{title}</h2>
      <nav className="flex flex-wrap gap-2" aria-label={title}>
        {cities.map((c) => (
          <a key={c.slug} href={langPath(`/${page === 'public-lost' ? 'perdus' : 'sorties'}/${c.slug}`)} className="chip bg-white text-stone-600 ring-emerald-200"
            onClick={(e) => { e.preventDefault(); go(page, { city: c.slug }); }}>📍 {cityName(c)}</a>
        ))}
      </nav>
    </section>
  );
}

function Stat({ value, label }) {
  return (
    <div className="card !p-3 text-center">
      <div className="text-2xl font-extrabold text-teal-600">{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

// /sorties/<ville> : sorties et rencontres entre chiens dans une grande ville (chiffres, sorties à venir, refuges proches).
export function PublicCity({ go, params, inApp }) {
  const city = cityBySlug(params.city);
  const { data, error } = useData(() => (city ? rpc('public_city', { p_lat: city.lat, p_lng: city.lng, p_km: CITY_RADIUS_KM }) : Promise.resolve(null)), [params.city]);
  if (!city) return <Shell go={go} inApp={inApp}><Missing text={t('Cette page n’existe pas.')} go={go} to="public-rides" /></Shell>;
  const name = cityName(city);
  const join = () => go(inApp ? 'rides' : 'signup');
  const few = data && data.members < 3;
  return (
    <Shell go={go} inApp={inApp}>
      <section className="card overflow-hidden !p-0">
        <img src={illu('sorties-vide')} alt="" className="h-40 w-full bg-emerald-100 object-contain sm:h-52" />
        <div className="space-y-2 p-4">
          <h1 className="text-2xl font-extrabold text-stone-800 sm:text-3xl">{t('Sorties et rencontres entre chiens à {city}', { city: name })}</h1>
          <p className="text-stone-600">{t('Tu habites à {city} ou dans les environs ? Sur Cyclami, les propriétaires de chiens du coin se rencontrent pour promener leurs compagnons ensemble, se rendre service et s’entraider. Gratuit, sans publicité.', { city: name })}</p>
          <button className="btn-primary w-full sm:w-auto" onClick={join}>
            {inApp ? t('Voir les sorties') : t('Rejoindre les propriétaires de {city} (gratuit)', { city: name })}
          </button>
        </div>
      </section>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data === undefined && <Loading />}
      {data && (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat value={data.members} label={t('membres à moins de {km} km', { km: CITY_RADIUS_KM })} />
            <Stat value={data.dogs} label={t('chiens')} />
            <Stat value={data.rides.length} label={t('sorties prévues')} />
            <Stat value={data.lost_active} label={t('alertes animal perdu')} />
          </section>
          {few && (
            <div className="card bg-teal-50 text-sm text-stone-700 ring-teal-200">
              🌱 {t('Cyclami vient d’arriver à {city} : inscris-toi parmi les premiers et invite les propriétaires de chiens de ton quartier. Plus vous êtes nombreux, plus il y a de sorties !', { city: name })}
            </div>
          )}
          {data.breeds.length > 0 && (
            <p className="text-sm text-stone-600">🐕 {t('Races les plus présentes autour de {city} :', { city: name })} <strong>{data.breeds.join(', ')}</strong></p>
          )}
          <section className="space-y-2">
            <h2 className="text-xl font-extrabold text-stone-800">{t('Prochaines sorties autour de {city}', { city: name })}</h2>
            {data.rides.length === 0 && (
              <div className="card text-center text-sm text-stone-500">{t('Aucune sortie prévue pour le moment : organise la première !')}</div>
            )}
            {data.rides.map((w) => (
              <button key={w.id} className="card w-full space-y-2 text-left" onClick={() => go('rides', { rideId: w.id })}>
                <h3 className="font-bold text-stone-800">{w.title}</h3>
                <RideInfo w={w} />
              </button>
            ))}
          </section>
          {data.lost_active > 0 && (
            <button className="card flex w-full items-center gap-3 text-left ring-red-200" onClick={() => go('public-lost', { city: city.slug })}>
              <span className="text-3xl">🚨</span>
              <span>
                <span className="block font-bold text-stone-800">{t('Animaux perdus à {city}', { city: name })}</span>
                <span className="block text-sm text-stone-500">{t('Ouvre les alertes en cours : tu as peut-être croisé l’un d’eux.')}</span>
              </span>
            </button>
          )}
          {data.shelters.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xl font-extrabold text-stone-800">{t('Refuges près de {city}', { city: name })}</h2>
              {data.shelters.map((s) => (
                <button key={s.id} className="card flex w-full items-center gap-3 text-left" onClick={() => go('refuge', { shelterId: s.id })}>
                  <Home size={20} className="shrink-0 text-teal-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-stone-800">{s.name}</span>
                    {s.address && <span className="block truncate text-xs text-stone-500">{s.address}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-stone-500">{t('{n} à adopter', { n: s.animals })}</span>
                </button>
              ))}
            </section>
          )}
        </>
      )}
      <section className="card space-y-2">
        <h2 className="text-lg font-bold text-stone-800">{t('Comment ça marche ?')}</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
          <li>{t('Présente ton chien : taille, énergie, caractère et quelques photos.')}</li>
          <li>{t('Découvre les chiens compatibles autour de {city}, sur la liste ou sur la carte.', { city: name })}</li>
          <li>{t('Écris à leurs humains ou rejoins une sortie de groupe dans ton quartier.')}</li>
        </ol>
        <p className="text-xs text-stone-500">{t('Ta position est arrondie à environ 1 km : ton adresse n’est jamais affichée.')}</p>
      </section>
      <CityChips cities={nearbyCities(city, 8)} page="public-city" go={go} title={t('Autres villes')} />
    </Shell>
  );
}

// /perdus et /perdus/<ville> : alertes « perdu / trouvé » en cours, visibles sans compte.
export function PublicLostList({ go, params = {} }) {
  const city = params.city ? cityBySlug(params.city) : null;
  const { data, error } = useData(() => rpc('public_lost_alerts', city ? { p_lat: city.lat, p_lng: city.lng } : {}), [params.city]);
  if (params.city && !city) return <Shell go={go}><Missing text={t('Cette page n’existe pas.')} go={go} to="public-lost" /></Shell>;
  const name = city && cityName(city);
  // sans ville : les villes qui ont des alertes en cours
  const withAlerts = !city && data ? [...new Set(data.map((a) => nearestCity(a)).filter(Boolean))] : [];
  return (
    <Shell go={go}>
      <div>
        <h1 className="text-3xl font-extrabold text-stone-800">
          {city ? t('Animaux perdus et trouvés à {city}', { city: name }) : t('Animaux perdus et trouvés en Belgique et en France')}
        </h1>
        <p className="mt-1 text-stone-600">{t('Les alertes en cours des membres d’Cyclami. Tu as vu l’un de ces animaux ? Ouvre l’alerte pour prévenir son humain.')}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data === undefined && <Loading />}
      {data?.length === 0 && (
        <div className="card space-y-2 text-center text-stone-500">
          <img src={illu('retrouve')} alt="" className="mx-auto h-36 object-contain" />
          <p>{city ? t('Aucune alerte en cours autour de {city}. Tant mieux !', { city: name }) : t('Aucune alerte en cours. Tant mieux !')}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {data?.map((a) => {
          const sp = speciesInfo(a.species);
          const lost = a.kind === 'perdu';
          return (
            <button key={a.id} onClick={() => go('lost', { alertId: a.id })} className={`card overflow-hidden !p-0 text-left ${a.solved ? 'opacity-75' : ''}`}>
              <div className="relative aspect-square bg-gradient-to-br from-emerald-100 to-teal-100">
                {a.photo_url
                  ? <img src={a.photo_url} alt={a.name || sp.label} loading="lazy" className="h-full w-full object-cover" />
                  : <span className="flex h-full items-center justify-center text-6xl">{sp.emoji}</span>}
                <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold text-white ${a.solved ? 'bg-green-700' : lost ? 'bg-red-700' : 'bg-green-700'}`}>
                  {a.solved ? (lost ? t('🎉 Retrouvé !') : t('🎉 Rendu à son humain')) : lost ? t('Perdu') : t('Trouvé')}
                </span>
              </div>
              <div className="space-y-0.5 p-2.5">
                <div className="truncate font-bold text-stone-800">{a.name || sp.label}</div>
                <div className="line-clamp-2 text-xs text-stone-500">📍 {a.place}</div>
                <div className="truncate text-xs text-stone-400">{formatDate(a.seen_at)}</div>
              </div>
            </button>
          );
        })}
      </div>
      <section className="card flex flex-wrap items-center gap-3">
        <img src={illu('animal-perdu')} alt="" className="h-20 w-20 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-stone-800">{t('Ton animal a disparu ?')}</h2>
          <p className="text-sm text-stone-600">{t('Lance une alerte avec photos : les membres du coin sont prévenus tout de suite, et tu peux imprimer une affiche avec QR code.')}</p>
        </div>
        <button className="btn-primary w-full sm:w-auto" onClick={() => go('signup')}>{t('Lancer une alerte (gratuit)')}</button>
      </section>
      {city
        ? <CityChips cities={nearbyCities(city, 8)} page="public-lost" go={go} title={t('Autres villes')} />
        : <CityChips cities={withAlerts.length ? withAlerts : CITIES.slice(0, 12)} page="public-lost" go={go} title={t('Par ville')} />}
      {city && <button className="btn-ghost w-full" onClick={() => go('public-lost')}>{t('Toutes les alertes')}</button>}
    </Shell>
  );
}
