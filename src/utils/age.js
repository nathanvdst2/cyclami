import { t } from '../i18n/index.js';
// Âge d'un animal à partir de sa date de naissance (AAAA-MM-JJ), recalculé à chaque affichage.
export function monthsSince(birthDate, now = new Date()) {
  const [y, m, d] = birthDate.split('-').map(Number);
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (now.getDate() < d) months -= 1;
  return Math.max(0, months);
}

export const yearsSince = (birthDate) => Math.floor(monthsSince(birthDate) / 12);

// Anniversaire aujourd'hui ? (un animal né un 29 février le fête le 28 les autres années)
export function isBirthday(birthDate, now = new Date()) {
  if (!birthDate) return false;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (y >= now.getFullYear()) return false;
  const leap = new Date(now.getFullYear(), 1, 29).getMonth() === 1;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return now.getMonth() + 1 === m && now.getDate() === day;
}

// « 4 mois », « 1 an », « 2 ans et 3 mois » (les mois ne sont détaillés qu'avant 3 ans).
export function ageLabel(pet) {
  const yearsLabel = (n) => t(n > 1 ? '{n} ans' : '{n} an', { n });
  if (!pet.birthDate) return yearsLabel(pet.age);
  const total = monthsSince(pet.birthDate);
  const years = Math.floor(total / 12);
  const months = total % 12;
  if (years === 0) return t('{n} mois', { n: months });
  return years < 3 && months ? t('{y} et {n} mois', { y: yearsLabel(years), n: months }) : yearsLabel(years);
}
