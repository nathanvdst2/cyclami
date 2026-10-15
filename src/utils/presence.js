import { locale, t } from '../i18n/index.js';

// « En ligne » si l'appareil a donné signe de vie il y a moins de 3 minutes (signal toutes les minutes).
export const ONLINE_MS = 3 * 60 * 1000;
export const isOnline = (lastSeen) => !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_MS;

// « En ligne », « Vu il y a 12 min », « Vu hier à 18:05 », « Vu le 3 oct. » ; null si masqué / jamais vu.
export function presenceLabel(lastSeen) {
  if (!lastSeen) return null;
  if (isOnline(lastSeen)) return t('En ligne');
  const d = new Date(lastSeen);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600) return t('Vu il y a {n} min', { n: Math.max(1, Math.floor(diff / 60)) });
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d >= today) return t('Vu aujourd’hui à {time}', { time });
  if (d >= new Date(today.getTime() - 86400000)) return t('Vu hier à {time}', { time });
  if (diff < 7 * 86400) return t('Vu {day} à {time}', { day: d.toLocaleDateString(locale(), { weekday: 'long' }), time });
  return t('Vu le {date}', { date: d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) });
}
