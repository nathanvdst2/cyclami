import { t } from '../i18n/index.js';

// Dangers sur la route : mêmes valeurs que la base (public.hazards.kind), conseil affiché avec l'alerte.
// Une alerte reste affichée 7 jours (30 jours pour les travaux et les routes fermées).
export const HAZARD_KINDS = [
  { id: 'nid_de_poule', emoji: '🕳️', label: t('Nid-de-poule'),
    advice: t('Ralentis, tiens bien ton guidon et préviens les cyclistes derrière toi (bras tendu vers le trou). Signale-le aussi à la commune : en Belgique via le site ou l’application de ta commune ou de ta Région, en France à ta mairie.') },
  { id: 'travaux', emoji: '🚧', label: t('Travaux'),
    advice: t('Ralentis, attention aux plaques métalliques, aux bords de tranchée et à la terre sur la chaussée. Si la déviation n’est pas prévue pour les vélos, mets pied à terre.') },
  { id: 'route_fermee', emoji: '⛔', label: t('Route fermée'),
    advice: t('Prévois un autre itinéraire avant de partir et préviens ton groupe dans la discussion de la sortie.') },
  { id: 'chien', emoji: '🐕', label: t('Chien agressif'),
    advice: t('Ne cherche pas à le semer en sprintant : ralentis, parle-lui calmement et, s’il insiste, descends et garde le vélo entre lui et toi. En cas de morsure, va voir un médecin et préviens la police.') },
  { id: 'gravillons', emoji: '🪨', label: t('Gravillons'),
    advice: t('Ralentis avant la zone, freine en ligne droite et évite de pencher le vélo dans les virages.') },
  { id: 'verglas', emoji: '🧊', label: t('Verglas'),
    advice: t('Évite le secteur ou mets pied à terre. Ne freine pas et ne tourne pas brusquement : le verglas reste longtemps à l’ombre et sur les ponts.') },
  { id: 'inondation', emoji: '🌊', label: t('Inondation'),
    advice: t('Ne traverse pas une route inondée : l’eau peut cacher un trou ou du courant. Fais demi-tour et prends un autre chemin.') },
  { id: 'trafic', emoji: '🚗', label: t('Circulation dangereuse'),
    advice: t('Passage où les voitures roulent vite ou frôlent les cyclistes : roule en file indienne, sois visible (éclairage, couleurs vives) et cherche une alternative plus calme.') },
  { id: 'autre', emoji: '⚠️', label: t('Autre danger'), advice: t('Sois prudent et lis la description.') },
];

export const hazardKind = (id) => HAZARD_KINDS.find((k) => k.id === id) || HAZARD_KINDS[HAZARD_KINDS.length - 1];

// nom affiché : celui donné par le membre pour « Autre danger »
export const hazardLabel = (h) => (h?.kind === 'autre' && h?.title ? h.title : hazardKind(h?.kind).label);

// durée d'affichage d'une alerte, en jours (comme la base)
export const hazardDays = (id) => (id === 'travaux' || id === 'route_fermee' ? 30 : 7);
