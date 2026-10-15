import { t } from '../i18n/index.js';

// Dangers du quartier : mêmes valeurs que la base (public.hazards.kind), conseil affiché avec l'alerte.
export const HAZARD_KINDS = [
  { id: 'poison', emoji: '☠️', label: t('Boulettes empoisonnées'),
    advice: t('Garde ton chien en laisse et empêche-le de manger quoi que ce soit au sol. Vomissements, tremblements, bave ou démarche bizarre : vétérinaire immédiatement. Préviens aussi la police ou ta commune.') },
  { id: 'chenilles', emoji: '🐛', label: t('Chenilles processionnaires'),
    advice: t('Ne laisse pas ton chien renifler ni lécher les chenilles ou leurs nids (pins, chênes). En cas de contact : rince la gueule à l’eau sans frotter et file chez le vétérinaire.') },
  { id: 'algues', emoji: '🦠', label: t('Algues bleues'),
    advice: t('Ne laisse pas ton chien boire ni se baigner. Après un contact, rince-le à l’eau claire. Au moindre symptôme : vétérinaire en urgence.') },
  { id: 'verre', emoji: '🍾', label: t('Verre cassé'),
    advice: t('Évite l’endroit ou garde ton chien en laisse courte, et vérifie ses coussinets après la sortie.') },
  { id: 'tiques', emoji: '🕷️', label: t('Beaucoup de tiques'),
    advice: t('Après la sortie, inspecte ton chien (oreilles, cou, entre les doigts) et retire les tiques avec un tire-tique.') },
  { id: 'chien', emoji: '🐕', label: t('Chien agressif en liberté'),
    advice: t('Évite l’endroit et garde ton chien près de toi. En cas d’attaque, préviens la police.') },
  { id: 'autre', emoji: '⚠️', label: t('Autre danger'), advice: t('Sois prudent et lis la description.') },
];

export const hazardKind = (id) => HAZARD_KINDS.find((k) => k.id === id) || HAZARD_KINDS[HAZARD_KINDS.length - 1];

// nom affiché : celui donné par le membre pour « Autre danger »
export const hazardLabel = (h) => (h?.kind === 'autre' && h?.title ? h.title : hazardKind(h?.kind).label);
