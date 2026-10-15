// Chemin d'une illustration (public/illustrations/*.webp).
// Versions de saison utilisées automatiquement :
//   Carnaval les 10 jours avant Mardi gras, et Mardi gras lui-même (date calculée depuis Pâques),
//   Pâques de la semaine avant Pâques jusqu'au lundi de Pâques,
//   Halloween du 15 octobre au 2 novembre, Noël du 1er au 29 décembre,
//   Nouvel An du 30 décembre au 6 janvier.

// Dimanche de Pâques (calendrier grégorien).
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

export function season(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  if ((m === 10 && day >= 15) || (m === 11 && day <= 2)) return 'halloween';
  if ((m === 12 && day >= 30) || (m === 1 && day <= 6)) return 'nouvel-an';
  if (m === 12) return 'noel';
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysTo = (date) => Math.round((date - today) / 86400000);
  const paques = easter(d.getFullYear());
  const toEaster = daysTo(paques);
  if (toEaster >= -1 && toEaster <= 7) return 'paques';
  const mardiGras = new Date(paques);
  mardiGras.setDate(mardiGras.getDate() - 47);
  const toMardiGras = daysTo(mardiGras);
  if (toMardiGras >= 0 && toMardiGras <= 10) return 'carnaval';
  return null;
}

export function illu(name) {
  const s = season();
  return `/illustrations/${s ? `${s}/` : ''}${name}.webp?v=2`; // v : à changer quand une image est retouchée (cache du téléphone)
}
