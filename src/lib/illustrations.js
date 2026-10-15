// Chemin d'une illustration Cyclami (public/illustrations/<nom>.svg, fond transparent).
// Illustrations disponibles : bienvenue, sorties-vide, messages-vide, notifications-vide, groupes-vide,
// 404, erreur, maintenance, avatar-defaut, anniversaire.
const VERSION = 1; // à changer quand une image est retouchée (cache du téléphone)

export function illu(name) {
  return `/illustrations/${name}.svg?v=${VERSION}`;
}
