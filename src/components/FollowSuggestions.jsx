import { useEffect, useState } from 'react';
import { Users, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import UserAvatar from './UserAvatar.jsx';
import FollowButton from './FollowButton.jsx';
import { t } from '../i18n/index.js';

const HIDDEN_KEY = 'cyclami:suggestions-hidden';
const readHidden = () => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); } catch { return []; } };

// « Des membres à suivre » : proches de chez moi ou avec un animal de la même race.
export default function FollowSuggestions({ go, title = t('Des membres à suivre') }) {
  const { actions, following } = useApp();
  const [rows, setRows] = useState(null);
  const [hidden, setHidden] = useState(readHidden);
  useEffect(() => { actions.follows.suggestions().then(setRows).catch(() => setRows([])); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hide = (id) => {
    const next = [...hidden, id].slice(-200);
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
  };
  // ceux que je viens de suivre restent affichés (bouton « Abonné ») jusqu'au prochain chargement
  const list = (rows || []).filter((r) => !hidden.includes(r.id));
  if (!list.length) return null;
  const reason = (r) => (r.breed ? t('A aussi un {breed}', { breed: r.breed })
    : r.km != null ? (r.km < 1 ? t('Tout près de chez toi') : t('À {km} km', { km: r.km })) : r.city);

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 font-bold text-stone-800"><Users size={18} className="text-teal-500" /> {title}</h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {list.map((r) => (
          <div key={r.id} className="card relative flex w-36 shrink-0 snap-start flex-col items-center gap-1.5 !p-3 text-center">
            {!following.has(r.id) && (
              <button className="absolute right-1.5 top-1.5 text-stone-400" onClick={() => hide(r.id)} aria-label={t('Masquer')}><X size={14} /></button>
            )}
            <button className="flex flex-col items-center gap-1" onClick={() => go('user', { userId: r.id })}>
              <UserAvatar user={{ id: r.id, name: r.name, avatarUrl: r.avatar_url, petPhotoUrl: r.pet_photo_url }} size="lg" />
              <span className="w-full truncate text-sm font-bold text-stone-800">{r.name}</span>
            </button>
            <span className="line-clamp-2 min-h-[2rem] text-xs text-stone-500">{reason(r)}</span>
            <FollowButton userId={r.id} small />
          </div>
        ))}
      </div>
    </section>
  );
}
