// Traductions : le texte français sert de clé ; le néerlandais est cherché dans src/i18n/nl/*.js,
// l'anglais dans src/i18n/en/*.js (mêmes fichiers, mêmes clés).
//   t('Sorties')                     → « Fietstochten » en néerlandais
//   t('Bonjour {name} !', { name })  → variables entre accolades
// Changer de langue recharge la page (plus simple et sûr que de tout re-rendre).
// Seule la langue choisie est téléchargée (fichier à part) : le français n'en charge aucune.
const LOADERS = { nl: () => import('./nl/index.js'), en: () => import('./en/index.js') };
const DICTS = {};
const CODES = ['fr', 'nl', 'en'];

const KEY = 'cyclami:lang';
// /nl/… et /en/… (pages publiques trouvées sur Google) : la langue de l'adresse l'emporte
const LANG_PATH = /^\/(nl|en)(?=\/|$)/;
const detect = () => {
  const fromPath = typeof window !== 'undefined' ? LANG_PATH.exec(window.location.pathname)?.[1] : null;
  if (fromPath) {
    try { localStorage.setItem(KEY, fromPath); } catch { /* stockage indisponible */ }
    return fromPath;
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (CODES.includes(saved)) return saved;
  } catch { /* stockage indisponible */ }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  if (/^nl\b/i.test(nav)) return 'nl';
  if (/^en\b/i.test(nav)) return 'en';
  return 'fr';
};

let current = detect();
if (typeof document !== 'undefined') document.documentElement.lang = current;

// À attendre avant d'afficher le site (voir main.jsx) : les textes sont traduits dès le chargement des modules.
export const i18nReady = LOADERS[current]
  ? LOADERS[current]().then((m) => { DICTS[current] = m.default; }, () => { current = 'fr'; })
  : Promise.resolve();

export const LANGS = [['fr', 'Français'], ['nl', 'Nederlands'], ['en', 'English']];
export const getLang = () => current;
// Locale pour les dates et nombres
export const locale = () => ({ nl: 'nl-BE', en: 'en-GB' }[current] || 'fr-BE');

export function t(fr, vars) {
  let s = DICTS[current]?.[fr] ?? fr;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

export function setLang(lang, { reload = true } = {}) {
  if (!CODES.includes(lang)) return;
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  current = lang;
  if (!reload) return;
  // adresse avec une langue (/nl/adoptions) : même page dans la nouvelle langue
  const { pathname, search, hash } = window.location;
  if (LANG_PATH.test(pathname)) window.location.assign(`${langPath(pathname.replace(LANG_PATH, '') || '/', lang)}${search}${hash}`);
  else window.location.reload();
}

// Adresse publique dans une langue : « /adoptions » → « /nl/adoptions » (le français n'a pas de préfixe)
export function langPath(path, lang = current) {
  if (lang === 'fr') return path;
  return path === '/' ? `/${lang}` : `/${lang}${path}`;
}
// Adresse sans le préfixe de langue
export const stripLang = (pathname) => pathname.replace(LANG_PATH, '') || '/';
