import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search as SearchIcon } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import StaffBadge from '../components/StaffBadge.jsx';
import { usePageState } from '../lib/persist.js';
import { locale, t } from '../i18n/index.js';
import { levelInfo, rideType } from '../data/constants.js';

// Recherche globale : une seule barre pour les membres, sujets du forum, sorties et clubs.
export default function Search({ go, back }) {
  const { actions } = useApp();
  const [query, setQuery] = usePageState('search:q', '');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setRes(null); return undefined; }
    setLoading(true);
    const timer = setTimeout(async () => {
      try { setRes(await actions.search(q)); } catch { setRes({}); }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = res ? Object.values(res).reduce((n, list) => n + (list?.length || 0), 0) : 0;
  const row = 'card flex w-full items-center gap-3 !p-3 text-left';
  const Section = ({ title, items, children }) => (items?.length ? (
    <section className="space-y-2">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">{title}</h2>
      {items.map(children)}
    </section>
  ) : null);

  return (
    <div className="space-y-4">
      <button onClick={() => back('discover')} className="flex items-center gap-1 text-sm text-stone-500"><ArrowLeft size={16} /> {t('Retour')}</button>
      <label className="relative block">
        <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input ref={input} className="input !pl-10" type="search" placeholder={t('Cycliste, sortie, club, sujet du forum…')}
          value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {query.trim().length < 2 && <p className="text-center text-sm text-stone-500">{t('Tape au moins 2 lettres.')}</p>}
      {loading && !res && <div className="card h-24 animate-pulse" />}
      {res && total === 0 && !loading && <div className="card text-center text-stone-500">{t('Aucun résultat pour « {q} ».', { q: query.trim() })}</div>}

      {res && (
        <>
          <Section title={t('Membres')} items={res.members}>
            {(m) => (
              <button key={m.id} className={row} onClick={() => go('user', { userId: m.id })}>
                <UserAvatar user={{ id: m.id, name: m.name, avatarUrl: m.avatar_url }} />
                <span className="min-w-0"><span className="block truncate font-bold text-stone-800">{m.name}<StaffBadge userId={m.id} /></span>
                  <span className="block truncate text-xs text-stone-500">{[levelInfo(m.level)?.label, m.city].filter(Boolean).join(' · ')}</span></span>
              </button>
            )}
          </Section>
          <Section title={t('Forum')} items={res.topics}>
            {(f) => (
              <button key={f.id} className={row} onClick={() => go('forum', { topicId: f.id })}>
                <span className="text-2xl">💬</span>
                <span className="min-w-0"><span className="block truncate font-bold text-stone-800">{f.title}</span>
                  <span className="block text-xs text-stone-500">{t('{n} réponses', { n: f.reply_count })}</span></span>
              </button>
            )}
          </Section>
          <Section title={t('Sorties à venir')} items={res.rides}>
            {(w) => (
              <button key={w.id} className={row} onClick={() => go('rides', { rideId: w.id })}>
                <span className="text-2xl">{rideType(w.ride_type).emoji}</span>
                <span className="min-w-0"><span className="block truncate font-bold text-stone-800">{w.title}</span>
                  <span className="block text-xs text-stone-500">{new Date(w.starts_at).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
              </button>
            )}
          </Section>
          <Section title={t('Clubs et groupes')} items={res.groups}>
            {(g) => (
              <button key={g.id} className={row} onClick={() => go('groups', { groupId: g.id })}>
                <span className="text-2xl">👥</span>
                <span className="min-w-0"><span className="block truncate font-bold text-stone-800">{g.name}</span>
                  {g.city && <span className="block text-xs text-stone-500">{g.city}</span>}</span>
              </button>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
