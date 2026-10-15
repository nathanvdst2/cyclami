import { t } from '../i18n/index.js';

// Gestes demandés pendant la vidéo de vérification (tirés au hasard par la base : start_verification).
export const VERIFY_ACTIONS = {
  tete_gauche: { emoji: '👈', label: t('Tourne la tête vers la gauche') },
  tete_droite: { emoji: '👉', label: t('Tourne la tête vers la droite') },
  trois_doigts: { emoji: '🤟', label: t('Montre trois doigts') },
  pouce: { emoji: '👍', label: t('Lève le pouce') },
  main_front: { emoji: '🤚', label: t('Pose la main sur ton front') },
  clin_oeil: { emoji: '😉', label: t('Fais un clin d’œil') },
  sourire: { emoji: '😁', label: t('Fais un grand sourire') },
  main_oreille: { emoji: '👂', label: t('Touche ton oreille') },
};
export const verifyAction = (id) => VERIFY_ACTIONS[id] || { emoji: '❓', label: id };

// Caméras « virtuelles » (logiciels qui peuvent diffuser une vidéo préparée ou générée par IA)
export const VIRTUAL_CAMERA_RE = /obs|virtual|manycam|snap ?camera|xsplit|splitcam|e2esoft|camtwist|youcam|vcam|droidcam|iriun|epoccam|ndi|mmhmm|chromacam|nvidia broadcast|fake/i;
