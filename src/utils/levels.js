import { t } from '../i18n/index.js';

// Niveaux d'activité (les points sont calculés par la base, voir supabase/schema.sql).
// À ne pas confondre avec le niveau cycliste (débutant… sportif) de data/constants.js.
export const LEVELS = [
  { level: 1, min: 0, name: t('Petites roues'), emoji: '🚲', color: 'bg-stone-100 text-stone-700' },
  { level: 2, min: 50, name: t('Cyclotouriste'), emoji: '🧭', color: 'bg-emerald-100 text-emerald-800' },
  { level: 3, min: 150, name: t('Rouleur'), emoji: '🚴', color: 'bg-lime-100 text-lime-800' },
  { level: 4, min: 300, name: t('Grimpeur'), emoji: '⛰️', color: 'bg-emerald-100 text-emerald-800' },
  { level: 5, min: 600, name: t('Baroudeur'), emoji: '🚵', color: 'bg-sky-100 text-sky-800' },
  { level: 6, min: 1000, name: t('Capitaine de route'), emoji: '🏅', color: 'bg-indigo-100 text-indigo-800' },
  { level: 7, min: 1600, name: t('Maillot à pois'), emoji: '🔴', color: 'bg-purple-100 text-purple-800' },
  { level: 8, min: 2500, name: t('Légende du peloton'), emoji: '👑', color: 'bg-teal-500 text-white' },
];

export function levelFor(xp = 0) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.min) current = l;
  const next = LEVELS.find((l) => l.min > xp) || null;
  const progress = next ? (xp - current.min) / (next.min - current.min) : 1;
  return { ...current, next, progress, toNext: next ? next.min - xp : 0 };
}

// Comment gagner des points (affiché dans le profil).
export const XP_RULES = [
  ['🗺️', t('Organiser une sortie'), '+30'],
  ['🚴', t('Rejoindre une sortie'), '+20'],
  ['👋', t('Quelqu’un rejoint ta sortie'), '+5'],
  ['📸', t('Publier (3 par jour)'), '+10'],
  ['💬', t('Commenter les autres (10 par jour)'), '+3'],
  ['❤️', t('Recevoir un « j’aime »'), '+2'],
  ['🚲', t('Photo de ton vélo'), '+15'],
  ['✅', t('Profil complet (présentation, disponibilités, position)'), '+20'],
  ['📅', t('Passer chaque jour'), '+5'],
  ['🔥', t('Série de 7 jours'), '+25'],
];

// Badges débloqués à partir des chiffres renvoyés par member_achievements().
export const BADGES = [
  { id: 'first_ride', emoji: '🚴', name: t('Premier coup de pédale'), desc: t('Rejoindre ou organiser une sortie'), test: (a) => a.rides_joined + a.rides_hosted >= 1 },
  { id: 'organizer', emoji: '📣', name: t('Organisateur'), desc: t('Organiser 3 sorties'), test: (a) => a.rides_hosted >= 3 },
  { id: 'road_captain', emoji: '🧭', name: t('Capitaine de route'), desc: t('Organiser 10 sorties'), test: (a) => a.rides_hosted >= 10 },
  { id: 'regular', emoji: '🔁', name: t('Habitué du peloton'), desc: t('Rejoindre 10 sorties'), test: (a) => a.rides_joined >= 10 },
  { id: 'host', emoji: '🤝', name: t('Rassembleur'), desc: t('20 participants à tes sorties'), test: (a) => a.guests >= 20 },
  { id: 'photographer', emoji: '📸', name: t('Photographe'), desc: t('Publier 10 fois'), test: (a) => a.posts >= 10 },
  { id: 'popular', emoji: '⭐', name: t('Populaire'), desc: t('Recevoir 50 « j’aime »'), test: (a) => a.likes_received >= 50 },
  { id: 'chatty', emoji: '💬', name: t('Bavard'), desc: t('Écrire 25 commentaires'), test: (a) => a.comments >= 25 },
  { id: 'streak7', emoji: '🔥', name: t('Fidèle'), desc: t('7 jours de suite'), test: (a) => a.best_streak >= 7 },
  { id: 'streak30', emoji: '💎', name: t('Inséparable du vélo'), desc: t('30 jours de suite'), test: (a) => a.best_streak >= 30 },
];
