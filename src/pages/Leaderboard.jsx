import { useEffect, useState } from 'react';
import { ArrowLeft, Trophy } from 'lucide-react';
import { useApp, friendlyError } from '../context/AppContext.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import LevelBadge from '../components/LevelBadge.jsx';
import StaffBadge from '../components/StaffBadge.jsx';
import { t } from '../i18n/index.js';

const MEDALS = ['🥇', '🥈', '🥉'];

// Classement des membres les plus actifs (cette semaine ou depuis toujours).
export default function Leaderboard({ go, back }) {
  const { currentUser, getUser, actions } = useApp();
  const [period, setPeriod] = useState(7);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setRows(null);
    actions.leaderboard(period).then(setRows).catch((e) => setError(friendlyError(e)));
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const myRank = rows?.findIndex((r) => r.user_id === currentUser.id);

  return (
    <div className="space-y-4">
      <button onClick={() => back('profile')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-stone-800">
        <Trophy className="text-teal-500" /> {t('Classement')}
      </h1>
      <div className="flex gap-2">
        {[[7, 'Cette semaine'], [null, 'Depuis toujours']].map(([p, label]) => (
          <button key={label} onClick={() => setPeriod(p)}
            className={`chip ${period === p ? 'bg-stone-800 text-white ring-stone-800' : 'bg-white text-stone-600 ring-emerald-200'}`}>
            {t(label)}
          </button>
        ))}
      </div>
      {rows && myRank >= 0 && (
        <p className="text-sm text-stone-600">{t('Tu es')} <strong>{myRank + 1}<sup>e</sup></strong> {t('avec {points} XP. Continue comme ça ! 🚴', { points: rows[myRank].points })}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!rows && !error && <div className="card h-40 animate-pulse" />}
      {rows?.length === 0 && (
        <div className="card text-center text-stone-500">{period ? t('Personne n’a encore gagné de points cette semaine. Lance-toi ! 🌳') : t('Personne n’a encore gagné de points. Lance-toi ! 🌳')}</div>
      )}
      <div className="space-y-2">
        {rows?.map((r, i) => {
          const u = getUser(r.user_id);
          const me = r.user_id === currentUser.id;
          return (
            <button key={r.user_id} onClick={() => go('user', { userId: r.user_id })}
              className={`card flex w-full items-center gap-3 !p-3 text-left ${me ? 'ring-2 ring-teal-300' : ''}`}>
              <span className="w-7 text-center text-lg font-extrabold text-stone-500">{MEDALS[i] || i + 1}</span>
              <UserAvatar user={u} size="md" className="!h-10 !w-10" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-stone-800">
                  {r.name}<StaffBadge userId={r.user_id} /><LevelBadge xp={r.xp} />
                </span>
                <span className="block truncate text-xs text-stone-500">{r.city}</span>
              </span>
              <span className="font-extrabold text-teal-600">{r.points} XP</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
