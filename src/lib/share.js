// Liens partageables : <site>/s/<sortie>, /f/<sujet du forum>, /g/<club ou groupe>, /p/<profil>.
// Le serveur (netlify/edge-functions/share.js) ajoute l'aperçu (titre, image) pour WhatsApp & co.
import { stripLang } from '../i18n/index.js';
import { cityBySlug } from './cities.js';

export const SHARE_ROUTES = {
  s: ['rides', 'rideId'],
  f: ['forum', 'topicId'],
  g: ['groups', 'groupId'],
  p: ['user', 'userId'],
};

// Pages publiques (visibles sans compte, trouvables sur Google).
export const PUBLIC_PAGES = { 'public-rides': '/sorties' };
// pages par grande ville (src/lib/cities.js) : sorties vélo et cyclistes
const CITY_RE = /^\/sorties\/([a-z0-9-]{2,60})\/?$/;

// « Namur », « Liège 4000 » → « namur », « liege-4000 » (adresse des pages par ville)
export const citySlug = (city) => String(city || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Adresse d'une page de l'application (null si elle n'a pas d'adresse partageable).
export function pathOf(page, params = {}) {
  if (page === 'public-city' && params.city) return `/sorties/${params.city}`;
  if (PUBLIC_PAGES[page]) return PUBLIC_PAGES[page];
  for (const [prefix, [p, key]] of Object.entries(SHARE_ROUTES)) {
    if (p === page && params[key]) return `/${prefix}/${params[key]}`;
  }
  return null;
}

// Page correspondant à une adresse partagée (ou null).
export function routeOf(rawPath) {
  const pathname = stripLang(rawPath);
  const clean = pathname.replace(/\/$/, '');
  const pub = Object.keys(PUBLIC_PAGES).find((p) => PUBLIC_PAGES[p] === clean);
  if (pub) return { page: pub, params: {} };
  const city = pathname.match(CITY_RE);
  if (city) return cityBySlug(city[1]) ? { page: 'public-city', params: { city: city[1] } } : null;
  const m = pathname.match(/^\/([sfgp])\/([0-9a-zA-Z-]{1,64})\/?$/);
  if (!m) return null;
  const [page, key] = SHARE_ROUTES[m[1]];
  return { page, params: { [key]: m[2] } };
}

// Partage natif du téléphone, sinon copie du lien. Renvoie 'shared', 'copied' ou null.
export async function shareLink(path, title, text) {
  const url = `${window.location.origin}${path}`;
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return null;
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    window.prompt('', url);
    return null;
  }
}

// Lien de partage Facebook (aucun compte Facebook à relier : on choisit sa page au moment de publier).
export const facebookShare = (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
