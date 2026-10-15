import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { t } from '../i18n/index.js';

const cache = new Map();

// « Pionnier » : les 100 premiers membres de Cyclami (rang d'inscription calculé par la base).
export default function PioneerBadge({ userId }) {
  const [rank, setRank] = useState(cache.get(userId) ?? null);
  useEffect(() => {
    if (!userId || cache.has(userId)) return undefined;
    let alive = true;
    supabase.rpc('pioneer_rank', { p_user: userId }).then(({ data }) => {
      cache.set(userId, data || 0);
      if (alive) setRank(data || 0);
    }, () => {});
    return () => { alive = false; };
  }, [userId]);
  if (!rank) return null;
  return (
    <span className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
      title={t('Parmi les 100 premiers membres de Cyclami')}>
      🧪 {t('Pionnier n° {rank}', { rank })}
    </span>
  );
}
