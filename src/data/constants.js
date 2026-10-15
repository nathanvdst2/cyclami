// Listes de référence utilisées dans les formulaires et les filtres.
// Les identifiants (id) sont enregistrés en base ; les libellés sont traduits à l'affichage.
// AVAILABILITY_SLOTS est enregistré en base en français : on le traduit à l'affichage avec t().
import { t } from '../i18n/index.js';

// Types de sortie (rides.ride_type) et disciplines des cyclistes (profiles.disciplines) : mêmes valeurs.
export const RIDE_TYPES = [
  { id: 'route', label: t('Route'), emoji: '🚴' },
  { id: 'vtt_gravel', label: t('VTT / gravel'), emoji: '🚵' },
  { id: 'loisir_electrique', label: t('Loisir / électrique'), emoji: '🚲' },
];
export const DISCIPLINES = RIDE_TYPES;

// Niveaux (profiles.level et rides.level), du plus tranquille au plus rapide.
// speed : vitesse moyenne indicative sur le plat (km/h) ; min/max servent à suggérer un niveau.
export const LEVELS = [
  { id: 'debutant', label: t('Débutant'), hint: t('Je débute ou je roule tranquille'), speed: t('~15–20 km/h'), min: 8, max: 20, emoji: '🌱' },
  { id: 'intermediaire', label: t('Intermédiaire'), hint: t('Je roule régulièrement, sans forcer'), speed: t('~20–25 km/h'), min: 20, max: 25, emoji: '🚴' },
  { id: 'confirme', label: t('Confirmé'), hint: t('Je roule souvent et longtemps'), speed: t('~25–30 km/h'), min: 25, max: 30, emoji: '💨' },
  { id: 'sportif', label: t('Sportif'), hint: t('Je m’entraîne et j’aime que ça roule vite'), speed: t('30 km/h et plus'), min: 30, max: 50, emoji: '⚡' },
];
export const LEVEL_IDS = LEVELS.map((l) => l.id);

// Vélos (bikes.kind)
export const BIKE_KINDS = [
  { id: 'route', label: t('Vélo de route'), emoji: '🚴' },
  { id: 'gravel', label: t('Gravel'), emoji: '🛤️' },
  { id: 'vtt', label: t('VTT'), emoji: '🚵' },
  { id: 'ville', label: t('Vélo de ville'), emoji: '🚲' },
  { id: 'electrique', label: t('Vélo électrique'), emoji: '⚡' },
  { id: 'autre', label: t('Autre vélo'), emoji: '🚲' },
];

// Limites communes avec la base (supabase/schema.sql)
export const SPEED_MIN = 8;
export const SPEED_MAX = 50;
export const MAX_BIKES = 10;

export const rideType = (id) => RIDE_TYPES.find((x) => x.id === id) || RIDE_TYPES[0];
export const levelInfo = (id) => LEVELS.find((x) => x.id === id) || null;
export const bikeKind = (id) => BIKE_KINDS.find((x) => x.id === id) || BIKE_KINDS[BIKE_KINDS.length - 1];
// rang du niveau (0 = débutant … 3 = sportif), -1 si inconnu
export const levelRank = (id) => LEVEL_IDS.indexOf(id);
// niveau suggéré d'après une vitesse moyenne habituelle (km/h)
export const levelForSpeed = (speed) => {
  const v = Number(speed);
  if (!v) return null;
  return (LEVELS.find((l) => v < l.max) || LEVELS[LEVELS.length - 1]).id;
};

export const AVAILABILITY_SLOTS = ['Matin', 'Midi', 'Après-midi', 'Soir', 'Week-end'];
