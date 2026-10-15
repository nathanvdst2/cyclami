import { lazy, Suspense, useEffect, useState } from 'react';
import { pathOf, routeOf } from './lib/share.js';
import { useApp } from './context/AppContext.jsx';
import { langPath, locale, stripLang, t } from './i18n/index.js';
import Nav from './components/Nav.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Discover from './pages/Discover.jsx';
import NotFound from './pages/NotFound.jsx';
import { illu } from './lib/illustrations.js';

// Pages chargées à la demande : le premier affichage ne télécharge que l'essentiel.
const LOADERS = {
  NewPassword: () => import('./pages/NewPassword.jsx'),
  PetForm: () => import('./pages/PetForm.jsx'),
  Rides: () => import('./pages/Rides.jsx'),
  Feed: () => import('./pages/Feed.jsx'),
  Messages: () => import('./pages/Messages.jsx'),
  Profile: () => import('./pages/Profile.jsx'),
  Legal: () => import('./pages/Legal.jsx'),
  UserProfile: () => import('./pages/UserProfile.jsx'),
  Notifications: () => import('./pages/Notifications.jsx'),
  Admin: () => import('./pages/Admin.jsx'),
  Leaderboard: () => import('./pages/Leaderboard.jsx'),
  Listings: () => import('./pages/Listings.jsx'),
  ListingDetail: () => import('./pages/ListingDetail.jsx'),
  ListingForm: () => import('./pages/ListingForm.jsx'),
  LostAlerts: () => import('./pages/LostAlerts.jsx'),
  PetHealth: () => import('./pages/PetHealth.jsx'),
  Sitting: () => import('./pages/Sitting.jsx'),
  Forum: () => import('./pages/Forum.jsx'),
  Groups: () => import('./pages/Groups.jsx'),
  PetPage: () => import('./pages/PetPage.jsx'),
  Public: () => import('./pages/Public.jsx'),
  Follows: () => import('./pages/Follows.jsx'),
  Search: () => import('./pages/Search.jsx'),
  Gear: () => import('./pages/Gear.jsx'),
  Games: () => import('./pages/Games.jsx'),
  Place: () => import('./pages/Place.jsx'),
  Chat: () => import('./pages/Chat.jsx'),
  Emergency: () => import('./pages/Emergency.jsx'),
  Hazards: () => import('./pages/Hazards.jsx'),
  Tracker: () => import('./pages/Tracker.jsx'),
  Invite: () => import('./pages/Invite.jsx'),
  Verify: () => import('./pages/Verify.jsx'),
};
const L = Object.fromEntries(Object.entries(LOADERS).map(([k, load]) => [k, lazy(load)]));
const { NewPassword, PetForm, Rides, Feed, Messages, Profile, Legal, UserProfile, Notifications, Admin, Leaderboard, Listings, ListingDetail, ListingForm, LostAlerts, PetHealth, Sitting, Forum, Groups, PetPage, Follows, Search, Gear, Games, Place, Chat, Emergency, Hazards, Tracker, Invite, Verify } = L;
// pages publiques (sans compte) : un seul fichier, chargé à la demande
const publicPage = (name) => lazy(() => LOADERS.Public().then((m) => ({ default: m[name] })));
const PUBLIC = {
  adoptions: publicPage('PublicAdoptions'), listing: publicPage('PublicListing'), shelter: publicPage('PublicShelter'),
  rides: publicPage('PublicRides'), ride: publicPage('PublicRide'), lost: publicPage('PublicLost'), join: publicPage('PublicJoinShelters'),
  city: publicPage('PublicCity'), lostList: publicPage('PublicLostList'),
};
const RefugePage = (props) => <PUBLIC.shelter {...props} inApp />;
const JoinSheltersPage = (props) => <PUBLIC.join {...props} inApp />;
const CityPage = (props) => <PUBLIC.city {...props} inApp />;
// Une fois le site affiché, les autres pages sont préchargées en arrière-plan (navigation instantanée).
const preloadPages = () => Object.values(LOADERS).forEach((load) => load().catch(() => {}));

const PAGES = {
  discover: Discover,
  rides: Rides,
  feed: Feed,
  messages: Messages,
  profile: Profile,
  pet: PetForm,
  legal: Legal,
  user: UserProfile,
  notifications: Notifications,
  admin: Admin,
  leaderboard: Leaderboard,
  listings: Listings,
  listing: ListingDetail,
  'listing-form': ListingForm,
  lost: LostAlerts,
  health: PetHealth,
  sitting: Sitting,
  forum: Forum,
  groups: Groups,
  animal: PetPage,
  refuge: RefugePage,
  follows: Follows,
  search: Search,
  gear: Gear,
  games: Games,
  place: Place,
  chat: Chat,
  'join-shelters': JoinSheltersPage,
  emergency: Emergency,
  hazards: Hazards,
  tracker: Tracker,
  invite: Invite,
  verify: Verify,
  // adresses publiques ouvertes par un membre connecté : les pages habituelles
  'public-adoptions': Listings,
  'public-rides': Rides,
  'public-city': CityPage,
  'public-lost': LostAlerts,
};

// Pages qui ont besoin d'un animal (compatibilité, publication avec son animal)
const NEEDS_PET = new Set(['discover', 'feed']);
function NoPet({ go }) {
  return (
    <div className="card space-y-3 text-center text-stone-600">
      <div className="text-5xl">🚴</div>
      <p>{t('Cette page sert à trouver des compagnons de sortie pour ton animal. Ton compte de refuge n’a pas besoin d’animal personnel, mais tu peux en ajouter un quand tu veux.')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button className="btn-primary" onClick={() => go('listings')}>{t('Mes adoptions')}</button>
        <button className="btn-ghost" onClick={() => go('pet')}>{t('Ajouter un animal')}</button>
      </div>
    </div>
  );
}

// logo : le logo animé de chargement (masqué quand une illustration le remplace)
function Splash({ children, logo = true }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-emerald-50 px-4 text-center text-stone-500">
      {logo && <img src="/logo-mark-96.webp" alt="Cyclami" className="h-20 w-20 animate-bounce object-contain" />}
      {children}
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Splash>{t('Chargement…')}</Splash>}>
      <AppRoutes />
    </Suspense>
  );
}

export const LEGAL_PATHS = { privacy: '/confidentialite', terms: '/conditions', legal: '/mentions-legales' };

// Données momentanément indisponibles (en général pendant une mise à jour de la base) :
// message simple et nouvel essai automatique toutes les 15 secondes.
function Unavailable({ retry, logout }) {
  useEffect(() => {
    const timer = setInterval(retry, 15000);
    return () => clearInterval(timer);
  }, [retry]);
  return (
    <Splash logo={false}>
      <img src={illu('maintenance')} alt="" className="h-40 w-40 object-contain" />
      <p className="font-semibold">{t('🛠️ Mise à jour du site en cours')}</p>
      <p className="text-sm">{t('Cyclami revient dans un instant. La page se recharge toute seule.')}</p>
      <button className="btn-primary" onClick={retry}>{t('Réessayer')}</button>
      <button className="text-sm underline" onClick={logout}>{t('Se déconnecter')}</button>
    </Splash>
  );
}

function AppRoutes() {
  const { session, authReady, recovering, dataReady, loadError, currentUser, actions, suspension, toast, isShelterAccount } = useApp();
  // La navigation passe par l'historique du navigateur : le bouton « retour » du téléphone fonctionne.
  const [route, setRoute] = useState(() => {
    if (window.history.state?.page) return window.history.state;
    // pages publiques avec une vraie adresse (liens demandés par Google pour l'écran de connexion)
    const doc = Object.keys(LEGAL_PATHS).find((d) => LEGAL_PATHS[d] === window.location.pathname.replace(/\/$/, ''));
    if (doc) return { page: 'legal', params: { doc }, depth: 0 };
    // lien partagé (sortie, annonce…) : ouvert tout de suite, ou après la connexion
    const shared = routeOf(window.location.pathname);
    if (shared) {
      try { sessionStorage.setItem('cyclami:deeplink', JSON.stringify(shared)); } catch { /* stockage indisponible */ }
      // sans compte, les annonces, refuges et sorties ont une page publique
      return { ...shared, depth: 0 };
    }
    // adresse inconnue : page 404 (illustrée), puis retour à l'accueil
    const known = shared || ['/', '/index.html', ''].includes(stripLang(window.location.pathname));
    return { page: known ? 'landing' : 'notfound', params: {}, depth: 0 };
  });
  const go = (page, params = {}) => {
    const next = { page, params, depth: (route.depth || 0) + 1 };
    // visiteur sans compte : la page publique consultée s'ouvrira après l'inscription ou la connexion
    if (!session && pathOf(page, params)) {
      try { sessionStorage.setItem('cyclami:deeplink', JSON.stringify({ page, params })); } catch { /* stockage indisponible */ }
    }
    // pages publiques : l'adresse garde la langue (/nl/adoptions), pour pouvoir la partager telle quelle
    const shared = pathOf(page, params);
    window.history.pushState(next, '', page === 'legal' && LEGAL_PATHS[params.doc] ? LEGAL_PATHS[params.doc] : shared ? langPath(shared) : '/');
    setRoute(next);
    window.scrollTo(0, 0);
  };
  const back = (fallback = 'discover') => {
    if (route.depth > 0) window.history.back();
    else go(fallback);
  };

  // lien partagé en attente : on l'ouvre dès que le membre est connecté
  useEffect(() => {
    if (!session) return;
    let shared = null;
    try {
      shared = JSON.parse(sessionStorage.getItem('cyclami:deeplink') || 'null');
      sessionStorage.removeItem('cyclami:deeplink');
    } catch { /* stockage indisponible */ }
    // déjà sur cette page (lien ouvert en étant connecté) : rien à faire
    if (shared?.page && !(shared.page === route.page && JSON.stringify(shared.params) === JSON.stringify(route.params))) go(shared.page, shared.params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!session]);

  useEffect(() => {
    const onPop = (e) => setRoute(e.state?.page ? e.state : { page: 'landing', params: {}, depth: 0 });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Préchargement des autres pages quand le navigateur est libre
  useEffect(() => {
    if (!session || !dataReady) return;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    idle(preloadPages);
  }, [session, dataReady]);

  // Statistiques anonymes : un compteur par page et par jour (aucun identifiant envoyé).
  // Une visite = un navigateur par jour ; une page revue dans la demi-heure (actualisation, retour) n'est pas recomptée.
  useEffect(() => {
    if (navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|headless|preview/i.test(navigator.userAgent)) return; // robots
    if (route.page === 'admin') return; // l'équipe qui consulte l'administration ne compte pas
    if (!authReady) return; // sinon la page d'accueil « visiteurs » serait comptée avant la reprise de la connexion
    const page = session ? route.page : ['login', 'signup', 'forgot', 'legal'].includes(route.page) ? route.page : 'landing';
    let visit = false;
    try {
      const today = new Date().toLocaleDateString('fr-CA');
      const key = 'cyclami:views';
      const seen = JSON.parse(localStorage.getItem(key) || '{}');
      const fresh = seen.day === today ? seen : { day: today, pages: {} };
      visit = !seen.day || seen.day !== today;
      const last = fresh.pages[page] || 0;
      if (!visit && Date.now() - last < 30 * 60 * 1000) return;
      fresh.pages[page] = Date.now();
      localStorage.setItem(key, JSON.stringify(fresh));
    } catch { /* stockage indisponible : on compte quand même */ }
    actions.trackView(page, visit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.page, !!session, authReady]);

  // Rafraîchit les données à chaque changement de page.
  useEffect(() => {
    if (session && dataReady) actions.refreshIfStale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  if (!authReady) return <Splash>{t('Chargement…')}</Splash>;
  if (recovering) return <NewPassword />;

  if (route.page === 'notfound') {
    return <div className="min-h-screen bg-emerald-50"><NotFound go={(page, params) => go(session ? page : 'landing', params)} /></div>;
  }

  if (!session) {
    if (route.page === 'legal') return <div className="mx-auto max-w-2xl px-4 py-6"><Legal go={go} back={back} params={route.params} /></div>;
    if (['login', 'signup', 'forgot'].includes(route.page)) return <Auth mode={route.page} go={go} />;
    const Public = { 'public-adoptions': PUBLIC.adoptions, 'public-rides': PUBLIC.rides, refuge: PUBLIC.shelter,
      listing: route.params.id && PUBLIC.listing, rides: route.params.rideId && PUBLIC.ride,
      lost: route.params.alertId && PUBLIC.lost, 'join-shelters': PUBLIC.join,
      'public-city': PUBLIC.city, 'public-lost': PUBLIC.lostList }[route.page];
    if (Public) return <Suspense fallback={<Splash>{t('Chargement…')}</Splash>}><Public go={go} params={route.params} /></Suspense>;
    return <Landing go={go} />;
  }

  if (!dataReady) return <Splash>{t('Chargement de ton compte…')}</Splash>;
  if (loadError || !currentUser) return <Unavailable retry={actions.refresh} logout={actions.logout} />;

  // Un nouvel utilisateur doit d'abord présenter son animal (sauf un compte de refuge).
  if (currentUser.pets.length === 0) {
    if (isShelterAccount === undefined) return <Splash>{t('Chargement de ton compte…')}</Splash>;
    if (!isShelterAccount) return <PetForm go={go} onboarding />;
  }

  // compte de refuge sans animal personnel : l'accueil est la page des adoptions, et les pages
  // qui comparent les animaux (sorties à deux, fil) invitent à en ajouter un
  const noPet = currentUser.pets.length === 0;
  const page = PAGES[route.page] ? route.page : noPet ? 'listings' : 'discover';
  const Page = noPet && NEEDS_PET.has(page) ? NoPet : PAGES[page];
  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-24">
      <Nav page={page} go={go} />
      <main className="px-4 pt-4">
        {suspension && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            <strong>{t('🚫 Ton compte est suspendu')}</strong>{' '}
            {t('jusqu’au {date}.', { date: new Date(suspension.until).toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' }) })}
            {suspension.reason && <> {t('Motif : {reason}.', { reason: suspension.reason })}</>}{' '}
            {t('Tu peux consulter le site, mais pas publier, commenter, écrire ni organiser de sortie d’ici là.')}
          </div>
        )}
        <Suspense fallback={<div className="card h-64 animate-pulse" />}>
          <Page go={go} back={back} params={route.params} />
        </Suspense>
      </main>
      {toast && (
        <div role="status" className={`fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-[90%] rounded-2xl px-4 py-2 text-center font-bold shadow-lg ${
          toast.levelUp ? 'animate-bounce bg-gradient-to-r from-emerald-400 to-teal-500 text-lg text-white' : 'bg-stone-800 text-sm text-white'}`}>
          {toast.levelUp && <div className="text-xs font-semibold uppercase tracking-wide opacity-90">{t('Niveau supérieur 🎉')}</div>}
          {toast.text}
        </div>
      )}
    </div>
  );
}
