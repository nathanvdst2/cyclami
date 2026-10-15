import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { AMBASSADOR_AT, referralLink } from '../lib/referral.js';
import { t } from '../i18n/index.js';

// Parrainage : mon lien personnel, mes filleuls, le badge « Ambassadeur » et les quartiers les plus actifs.
export default function Invite({ go, back }) {
  const { currentUser, actions } = useApp();
  const [stats, setStats] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    actions.referral.stats().then(setStats).catch(() => setStats({ count: 0, pending: 0, members: [] }));
    actions.referral.neighbourhoods().then(setRanking).catch(() => setRanking([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = referralLink(stats?.code);
  const message = t('Rejoins-moi sur Cyclami pour promener nos animaux ensemble 🚴 C’est gratuit :');
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Cyclami', text: message, url: link }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    copy();
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* presse-papiers indisponible */ }
  };

  const count = stats?.count || 0;
  const ambassador = count >= AMBASSADOR_AT;
  const myTown = String(currentUser.city || '').trim().toLowerCase();

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('discover')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <h1 className="text-2xl font-extrabold text-stone-800">🎁 {t('Inviter des amis')}</h1>

      <section className="card space-y-3 ring-2 ring-teal-200">
        <p className="text-sm text-stone-600">{t('Plus il y a de propriétaires près de chez toi, plus il y a de sorties et d’entraide. Partage ton lien : chaque inscription t’est comptée.')}</p>
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm dark:bg-stone-800">
          <span className="min-w-0 flex-1 truncate font-mono text-stone-700 dark:text-stone-200" data-testid="referral-link">{stats ? link : '…'}</span>
          <button className="text-teal-600" onClick={copy} aria-label={t('Copier le lien')}><Copy size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" onClick={share} disabled={!stats}><Share2 size={16} /> {copied ? t('Lien copié !') : t('Partager mon lien')}</button>
          <a className="btn-ghost justify-center" target="_blank" rel="noreferrer"
            href={`https://wa.me/?text=${encodeURIComponent(`${message} ${link}`)}`}>WhatsApp</a>
        </div>
      </section>

      <section className={`card space-y-2 ${ambassador ? 'ring-2 ring-yellow-300' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="text-4xl">{ambassador ? '🌟' : '🎯'}</span>
          <div className="flex-1">
            <p className="font-bold text-stone-800">
              {ambassador ? t('Tu es Ambassadeur d’Cyclami !') : t('Badge « Ambassadeur » : {n} / {total} amis inscrits', { n: count, total: AMBASSADOR_AT })}
            </p>
            <p className="text-xs text-stone-500">{t('Un ami compte dès qu’il a présenté son animal.')}</p>
          </div>
        </div>
        {!ambassador && (
          <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
            <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, (count / AMBASSADOR_AT) * 100)}%` }} />
          </div>
        )}
        {stats?.members?.length > 0 && (
          <ul className="space-y-1 pt-1 text-sm">
            {stats.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <button className="font-semibold text-stone-800 hover:underline" onClick={() => go('user', { userId: m.id })}>{m.name}</button>
                <span className={`text-xs ${m.has_pet ? 'text-green-700' : 'text-stone-400'}`}>
                  {m.has_pet ? `✓ ${t('compté')}` : t('n’a pas encore présenté son animal')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold text-stone-800">🏆 {t('Les quartiers les plus actifs')}</h2>
        <p className="text-xs text-stone-500">{t('Ces 30 derniers jours : membres actifs, nouveaux venus et sorties organisées.')}</p>
        {ranking === null && <div className="card h-24 animate-pulse" />}
        {ranking?.length === 0 && <p className="text-sm text-stone-500">{t('Pas encore assez de membres pour un classement : invite tes voisins !')}</p>}
        {ranking?.map((r, i) => (
          <div key={r.city} className={`card flex items-center gap-3 !p-3 text-sm ${r.city.trim().toLowerCase() === myTown ? 'ring-2 ring-teal-300' : ''}`}>
            <span className="w-7 text-center text-lg font-extrabold text-stone-400">{['🥇', '🥈', '🥉'][i] || i + 1}</span>
            <span className="flex-1 font-bold text-stone-800">{r.city}</span>
            <span className="text-xs text-stone-500">{t('{n} actifs', { n: r.active })} · {t('{n} sorties', { n: r.rides })}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
