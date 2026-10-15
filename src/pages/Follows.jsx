import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import FollowButton from '../components/FollowButton.jsx';
import StaffBadge from '../components/StaffBadge.jsx';
import FollowSuggestions from '../components/FollowSuggestions.jsx';
import { usePageState } from '../lib/persist.js';
import { t } from '../i18n/index.js';

// Abonnés et abonnements d'un profil.
export default function Follows({ go, back, params }) {
  const { currentUser, getUser, actions } = useApp();
  const userId = params.userId || currentUser.id;
  const owner = getUser(userId);
  const [tab, setTab] = usePageState('follows:tab', params.tab || 'followers');
  const [rows, setRows] = useState(null);
  const [counts, setCounts] = useState(null);
  const load = () => {
    setRows(null);
    actions.follows.list(userId, tab).then(setRows).catch(() => setRows([]));
    actions.follows.counts(userId).then(setCounts).catch(() => {});
  };
  useEffect(load, [userId, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = userId === currentUser.id;

  const removeFollower = async (r) => {
    if (!window.confirm(t('Retirer {name} de tes abonnés ?', { name: r.name }))) return;
    const err = await actions.follows.removeFollower(r.id);
    if (!err) load();
  };

  const chip = (active) => `chip flex-1 ${active ? 'bg-stone-800 text-white ring-stone-800' : 'bg-white text-stone-600 ring-emerald-200'}`;
  return (
    <div className="space-y-4">
      <button onClick={() => back('profile')} className="flex items-center gap-1 text-sm text-stone-500"><ArrowLeft size={16} /> {t('Retour')}</button>
      <h1 className="text-2xl font-extrabold text-stone-800">{owner?.name || t('Membre')}</h1>
      <div className="flex gap-2">
        <button className={chip(tab === 'followers')} onClick={() => setTab('followers')}>{t('{n} abonnés', { n: counts?.followers ?? '…' })}</button>
        <button className={chip(tab === 'following')} onClick={() => setTab('following')}>{t('{n} abonnements', { n: counts?.following ?? '…' })}</button>
      </div>
      {!rows && <div className="card h-40 animate-pulse" />}
      {rows?.length === 0 && (
        <div className="card text-center text-stone-500">
          {tab === 'followers' ? t('Personne n’est encore abonné.') : t('Aucun abonnement pour l’instant.')}
        </div>
      )}
      {mine && tab === 'following' && <FollowSuggestions go={go} />}
      <div className="space-y-2">
        {rows?.map((r) => (
          <div key={r.id} className="card flex items-center gap-3 !p-3">
            <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => go('user', { userId: r.id })}>
              <UserAvatar user={{ ...getUser(r.id), id: r.id, name: r.name, avatarUrl: r.avatar_url }} size="md" />
              <span className="min-w-0">
                <span className="block truncate font-bold text-stone-800">{r.name}<StaffBadge userId={r.id} /></span>
                {r.city && <span className="block truncate text-xs text-stone-500">{r.city}</span>}
              </span>
            </button>
            {r.id !== currentUser.id && <FollowButton userId={r.id} small locked={!!r.is_owner} />}
            {mine && tab === 'followers' && !counts?.owner && (
              <button className="text-xs text-stone-400 underline" onClick={() => removeFollower(r)}>{t('Retirer')}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
