import { useState } from 'react';
import { Lock, UserCheck, UserPlus } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { t } from '../i18n/index.js';

// Bouton « S'abonner » / « Abonné » (comme sur Instagram). followsMe : la personne me suit déjà.
// locked : compte du fondateur, auquel tout le monde est abonné sans pouvoir se désabonner.
export default function FollowButton({ userId, followsMe = false, onChange, small = false, locked = false }) {
  const { following, actions } = useApp();
  const [busy, setBusy] = useState(false);
  const on = following.has(userId);
  const toggle = async () => {
    setBusy(true);
    const err = await (on ? actions.follows.unfollow(userId) : actions.follows.follow(userId));
    setBusy(false);
    if (!err) onChange?.(!on);
  };
  const size = small ? '!py-1 text-sm' : '';
  if (locked) {
    return (
      <span className={`btn-ghost cursor-default opacity-80 ${size}`} title={t('Tous les membres sont abonnés au compte du fondateur.')}>
        <Lock size={14} /> {t('Abonné')}
      </span>
    );
  }
  return on ? (
    <button className={`btn-ghost ${size}`} disabled={busy} onClick={toggle} aria-pressed="true">
      <UserCheck size={16} /> {t('Abonné')}
    </button>
  ) : (
    <button className={`btn-primary ${size}`} disabled={busy} onClick={toggle} aria-pressed="false">
      <UserPlus size={16} /> {followsMe ? t('S’abonner en retour') : t('S’abonner')}
    </button>
  );
}
