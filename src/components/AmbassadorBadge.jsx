import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { AMBASSADOR_AT } from '../lib/referral.js';
import { t } from '../i18n/index.js';

const cache = new Map();

// « Ambassadeur » : au moins 3 amis inscrits grâce à son lien (avec un profil cycliste rempli).
export default function AmbassadorBadge({ userId }) {
  const [count, setCount] = useState(cache.get(userId) ?? 0);
  useEffect(() => {
    if (!userId || cache.has(userId)) return undefined;
    let alive = true;
    supabase.rpc('referral_stats', { p_user: userId }).then(({ data }) => {
      cache.set(userId, data?.count || 0);
      if (alive) setCount(data?.count || 0);
    }, () => {});
    return () => { alive = false; };
  }, [userId]);
  if (count < AMBASSADOR_AT) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"
      title={t('A fait inscrire au moins {n} amis', { n: AMBASSADOR_AT })}>
      🌟 {t('Ambassadeur')}
    </span>
  );
}
