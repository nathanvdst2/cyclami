import { useEffect, useState } from 'react';
import { ChevronDown, Trophy } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { BADGES, LEVELS, XP_RULES, levelFor } from '../utils/levels.js';
import { t } from '../i18n/index.js';

// Carte « niveau » : barre de progression, badges, et (pour soi) comment gagner des points.
export default function LevelCard({ user, go, mine = false }) {
  const { actions } = useApp();
  const [stats, setStats] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const l = levelFor(user.xp);

  useEffect(() => {
    let alive = true;
    actions.achievements(user.id).then((s) => alive && setStats(s)).catch(() => {});
    return () => { alive = false; };
  }, [user.id, user.xp]); // eslint-disable-line react-hooks/exhaustive-deps

  const unlocked = stats ? BADGES.filter((b) => b.test(stats)) : [];
  const shown = mine ? BADGES : unlocked;

  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-3">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${l.color}`}>{l.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-400">{t('Niveau {n}', { n: l.level })}</div>
          <div className="font-extrabold text-stone-800">{l.name}</div>
          <div className="text-xs text-stone-500">{user.xp} XP{l.next && ` · ${t('encore {n} XP pour « {name} »', { n: l.toNext, name: l.next.name })}`}</div>
        </div>
        {go && (
          <button className="btn-ghost !px-3" onClick={() => go('leaderboard')} aria-label={t('Classement')} title={t('Classement')}>
            <Trophy size={18} />
          </button>
        )}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-emerald-100" role="progressbar" aria-valuenow={Math.round(l.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all" style={{ width: `${Math.max(4, l.progress * 100)}%` }} />
      </div>

      {shown.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-stone-500">
            {t('Badges')} {stats && `(${unlocked.length}/${BADGES.length})`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {shown.map((b) => {
              const ok = unlocked.includes(b);
              return (
                <span key={b.id} title={`${b.name} — ${b.desc}`}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${ok ? 'bg-teal-100 text-teal-800' : 'bg-stone-100 text-stone-400 grayscale'}`}>
                  {b.emoji} {b.name}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {!mine && stats && unlocked.length === 0 && <p className="text-xs text-stone-400">{t('Pas encore de badge.')}</p>}

      {mine && (
        <div>
          <button className="flex items-center gap-1 text-sm font-semibold text-teal-600" onClick={() => setShowRules(!showRules)}>
            {t('Comment gagner des points ?')} <ChevronDown size={16} className={showRules ? 'rotate-180' : ''} />
          </button>
          {showRules && (
            <div className="mt-2 space-y-3">
              <ul className="space-y-1 text-sm text-stone-600">
                {XP_RULES.map(([emoji, label, pts]) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className="w-6 text-center">{emoji}</span>
                    <span className="flex-1">{label}</span>
                    <span className="font-bold text-teal-600">{pts}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-1 text-xs">
                {LEVELS.map((x) => (
                  <span key={x.level} className={`rounded-full px-2 py-0.5 ${x.color} ${x.level === l.level ? 'ring-2 ring-teal-400' : ''}`}>
                    {x.emoji} {x.name} · {x.min}
                  </span>
                ))}
              </div>
              <p className="text-xs text-stone-400">{t('Les points d’un contenu supprimé sont retirés.')}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
