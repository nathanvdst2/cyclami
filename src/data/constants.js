// Listes de référence utilisées dans les formulaires et les filtres.
// Les libellés affichés seulement sont traduits ici ; TRAITS et AVAILABILITY_SLOTS sont enregistrés
// en base en français : on les traduit à l'affichage avec t().
import { t } from '../i18n/index.js';

// Espèces, regroupées par famille (les identifiants sont enregistrés en base).
export const SPECIES_GROUPS = [
  t('Chiens & chats'),
  t('Petits mammifères (NAC)'),
  t('Oiseaux'),
  t('Reptiles & amphibiens'),
  t('Équidés & animaux de ferme'),
  t('Autres'),
];

export const SPECIES = [
  { id: 'chien', label: t('Chien'), emoji: '🐕', group: t('Chiens & chats') },
  { id: 'chat', label: t('Chat'), emoji: '🐈', group: t('Chiens & chats') },
  { id: 'lapin', label: t('Lapin'), emoji: '🐇', group: t('Petits mammifères (NAC)') },
  { id: 'furet', label: t('Furet'), emoji: '🦦', group: t('Petits mammifères (NAC)') },
  { id: 'chinchilla', label: t('Chinchilla'), emoji: '🐭', group: t('Petits mammifères (NAC)') },
  { id: 'cochon_inde', label: t('Cochon d’Inde'), emoji: '🐹', group: t('Petits mammifères (NAC)') },
  { id: 'hamster', label: t('Hamster'), emoji: '🐹', group: t('Petits mammifères (NAC)') },
  { id: 'rat', label: t('Rat'), emoji: '🐀', group: t('Petits mammifères (NAC)') },
  { id: 'souris', label: t('Souris'), emoji: '🐁', group: t('Petits mammifères (NAC)') },
  { id: 'gerbille', label: t('Gerbille'), emoji: '🐭', group: t('Petits mammifères (NAC)') },
  { id: 'octodon', label: t('Octodon (dègue)'), emoji: '🐭', group: t('Petits mammifères (NAC)') },
  { id: 'herisson', label: t('Hérisson'), emoji: '🦔', group: t('Petits mammifères (NAC)') },
  { id: 'perroquet', label: t('Perroquet'), emoji: '🦜', group: t('Oiseaux') },
  { id: 'perruche', label: t('Perruche'), emoji: '🦜', group: t('Oiseaux') },
  { id: 'canari', label: t('Canari'), emoji: '🐦', group: t('Oiseaux') },
  { id: 'poule', label: t('Poule'), emoji: '🐔', group: t('Oiseaux') },
  { id: 'canard', label: t('Canard'), emoji: '🦆', group: t('Oiseaux') },
  { id: 'tortue', label: t('Tortue'), emoji: '🐢', group: t('Reptiles & amphibiens') },
  { id: 'serpent', label: t('Serpent'), emoji: '🐍', group: t('Reptiles & amphibiens') },
  { id: 'lezard', label: t('Lézard'), emoji: '🦎', group: t('Reptiles & amphibiens') },
  { id: 'amphibien', label: t('Grenouille / axolotl'), emoji: '🐸', group: t('Reptiles & amphibiens') },
  { id: 'cheval', label: t('Cheval'), emoji: '🐴', group: t('Équidés & animaux de ferme') },
  { id: 'poney', label: t('Poney'), emoji: '🐴', group: t('Équidés & animaux de ferme') },
  { id: 'ane', label: t('Âne'), emoji: '🫏', group: t('Équidés & animaux de ferme') },
  { id: 'chevre', label: t('Chèvre'), emoji: '🐐', group: t('Équidés & animaux de ferme') },
  { id: 'mouton', label: t('Mouton'), emoji: '🐑', group: t('Équidés & animaux de ferme') },
  { id: 'cochon', label: t('Cochon (mini-pig)'), emoji: '🐖', group: t('Équidés & animaux de ferme') },
  { id: 'poisson', label: t('Poisson'), emoji: '🐠', group: t('Autres') },
  { id: 'autre', label: t('Autre'), emoji: '🚴', group: t('Autres') },
];

export const speciesInfo = (id) => SPECIES.find((s) => s.id === id) || { id, label: id, emoji: '🚴', group: t('Autres') };

// Règles des annonces (mêmes règles vérifiées par la base, voir supabase/schema.sql v10).
export const IDENTIFIED_SPECIES = ['chien', 'chat', 'cheval', 'poney', 'ane']; // DogID, CatID, passeport équin
export const MIN_AGE_SPECIES = ['chien', 'chat']; // 8 semaines minimum
export const PERMIT_SPECIES = ['chien', 'chat', 'furet', 'lapin', 'cochon_inde', 'chinchilla', 'hamster', 'rat', 'souris', 'cheval', 'poney', 'ane']; // permis de détention (Wallonie)
export const PROTECTED_HINT_SPECIES = ['perroquet', 'tortue', 'serpent', 'lezard', 'amphibien'];

export const SIZES = [
  { id: 'petit', label: t('Petit') },
  { id: 'moyen', label: t('Moyen') },
  { id: 'grand', label: t('Grand') },
];

export const TRAITS = [
  'Joueur', 'Calme', 'Sociable', 'Timide', 'Énergique', 'Câlin',
  'Curieux', 'Obéissant', 'Aime l’eau', 'Aime courir', 'Protecteur', 'Gourmand',
];

export const EMOJIS = [
  '🐕', '🐶', '🦮', '🐕‍🦺', '🐩', '🐈', '🐱', '🐈‍⬛', '🐇', '🦦', '🐹', '🐭', '🐀', '🐁', '🦔',
  '🦜', '🐦', '🐔', '🦆', '🐢', '🐍', '🦎', '🐸', '🐴', '🫏', '🐐', '🐑', '🐖', '🐠', '🚴',
];

export const PACES = [
  { id: 'tranquille', label: t('Tranquille'), energy: 1 },
  { id: 'normal', label: t('Normal'), energy: 3 },
  { id: 'sportif', label: t('Sportif'), energy: 5 },
];

export const AVAILABILITY_SLOTS = ['Matin', 'Midi', 'Après-midi', 'Soir', 'Week-end'];
