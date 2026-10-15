import { levelFor } from '../utils/levels.js';
import { t } from '../i18n/index.js';

// Petite pastille « 🚴 Niv. 3 » (niveau d'activité, points XP) affichée à côté des noms.
export default function LevelBadge({ xp, className = '' }) {
  const l = levelFor(xp);
  return (
    <span title={`${l.name} · ${xp || 0} XP`}
      className={`ml-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px align-middle text-[10px] font-bold ${l.color} ${className}`}>
      {l.emoji} {t('Niv. {n}', { n: l.level })}
    </span>
  );
}
