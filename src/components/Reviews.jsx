import { useEffect, useState } from 'react';
import { ThumbsUp } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { formatDate, timeAgo } from '../utils/geo.js';
import UserAvatar from './UserAvatar.jsx';
import Stars from './Stars.jsx';
import TrustedSitter from './TrustedSitter.jsx';
import { locale, t } from '../i18n/index.js';

// « Comment s'est passée ta sortie ? » : recommander les participants d'une sortie passée.
export function ReviewPrompts({ go }) {
  const { actions, getUser } = useApp();
  const [rides, setRides] = useState([]);
  const [comments, setComments] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    actions.reviews.pending().then(setRides).catch(() => setRides([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const recommend = async (rideId, userId) => {
    const key = `${rideId}:${userId}`;
    const err = await actions.reviews.give(rideId, userId, comments[key]);
    if (err) return setError(err);
    setRides((ws) => ws.map((w) => (w.id === rideId ? { ...w, people: w.people.filter((id) => id !== userId) } : w)).filter((w) => w.people.length));
  };

  if (!rides.length) return null;
  return (
    <section className="card space-y-3 ring-2 ring-teal-200">
      <h2 className="font-bold text-stone-800">{t('Comment se sont passées tes sorties ? 🚴')}</h2>
      <p className="text-xs text-stone-500">{t('Recommande les membres avec qui tu as passé un bon moment. Un souci ? Signale-le plutôt à l’équipe.')}</p>
      {rides.map((w) => (
        <div key={w.id} className="space-y-2">
          <div className="text-sm font-semibold text-stone-700">« {w.title} » · {formatDate(w.date)}</div>
          {w.people.map((id) => {
            const u = getUser(id);
            const key = `${w.id}:${id}`;
            return (
              <div key={id} className="flex flex-wrap items-center gap-2">
                <button className="flex items-center gap-2 text-sm font-semibold text-stone-700" onClick={() => u && go('user', { userId: id })}>
                  <UserAvatar user={u} size="sm" /> {u?.name || t('Membre')}
                </button>
                <input className="input min-w-0 flex-1 py-1 text-sm" maxLength={300} placeholder={t('Un petit mot (facultatif)')}
                  value={comments[key] || ''} onChange={(e) => setComments({ ...comments, [key]: e.target.value })} />
                <button className="btn-primary py-1" onClick={() => recommend(w.id, id)}>
                  <ThumbsUp size={14} /> {t('Recommander')}
                </button>
              </div>
            );
          })}
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

// Recommandations reçues, affichées sur le profil d'un membre.
export function Recommendations({ userId, go }) {
  const { actions, getUser } = useApp();
  const [state, setState] = useState(null);

  useEffect(() => {
    actions.reviews.forUser(userId).then(setState);
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state || (state.count === 0 && !state.sittingCount)) return null;
  const quote = (r, who, rating) => {
    const u = getUser(who);
    return (
      <p key={r.id} className="text-sm text-stone-600">
        {rating && <Stars value={r.rating || 5} size={12} className="mr-1 align-[-1px]" />}
        {r.comment && <>« {r.comment} » </>}—{' '}
        <button className="font-semibold hover:text-teal-600" onClick={() => u && go('user', { userId: u.id })}>{u?.name || t('un membre')}</button>
        <span className="text-xs text-stone-400"> · {timeAgo(r.created_at)}</span>
      </p>
    );
  };
  return (
    <section className="card space-y-2">
      {state.count > 0 && (
        <>
          <h2 className="flex items-center gap-2 font-bold text-stone-800">
            <ThumbsUp size={18} className="text-teal-500" /> {t('Recommandé {n} fois après une sortie', { n: state.count })}
          </h2>
          {state.rows.filter((r) => r.comment).map((r) => quote(r, r.reviewer_id))}
        </>
      )}
      {state.sittingCount > 0 && (
        <>
          <h2 className="flex flex-wrap items-center gap-2 font-bold text-stone-800">
            <Stars value={Math.round(state.sittingAverage)} size={18} />
            <span>{state.sittingAverage.toLocaleString(locale(), { maximumFractionDigits: 1 })}/5</span>
            <span className="text-sm font-normal text-stone-500">· {state.sittingCount > 1 ? t('{n} avis après une garde', { n: state.sittingCount }) : t('1 avis après une garde')}</span>
            <TrustedSitter stats={{ count: state.sittingCount, average: state.sittingAverage }} />
          </h2>
          {state.sittingRows.map((r) => quote(r, r.reviewer_id, true))}
        </>
      )}
    </section>
  );
}
