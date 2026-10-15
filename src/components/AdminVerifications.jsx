import { useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import UserAvatar from './UserAvatar.jsx';
import { verifyAction } from '../data/verification.js';
import { timeAgo } from '../utils/geo.js';
import { t } from '../i18n/index.js';

const REASONS = [
  t('Les gestes demandés ne sont pas faits'),
  t('Le code n’est pas dit à voix haute'),
  t('Visage pas assez visible'),
  t('La personne ne correspond pas aux photos du profil'),
  t('Vidéo suspecte (montage, écran filmé ou image générée)'),
];

// Administration : vidéos de vérification à regarder. La vidéo est supprimée dès la décision.
export default function AdminVerifications({ go, onCount }) {
  const { actions } = useApp();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = () => actions.verification.adminList().then((r) => { setRows(r); onCount?.(r.length); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows) return <div className="card h-32 animate-pulse" />;
  if (!rows.length) return <div className="card text-center text-stone-500">{t('Aucune vidéo à vérifier.')}</div>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">{t('Regarde la vidéo : la personne fait-elle les gestes dans l’ordre et dit-elle le bon code ? Correspond-elle aux photos du profil ? Méfie-toi d’un visage trop lisse, d’un décor figé ou d’une voix décalée.')}</p>
      {rows.map((v) => <Item key={v.id} v={v} go={go} onDone={load} />)}
    </div>
  );
}

function Item({ v, go, onDone }) {
  const { actions } = useApp();
  const [url, setUrl] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { actions.verification.videoUrl(v.video_path).then(setUrl).catch(() => {}); }, [v.video_path]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = v.signals || {};
  // indices techniques à surveiller (jamais décisifs seuls)
  const flags = [
    s.virtual_camera && t('caméra virtuelle « {name} »', { name: s.camera }),
    s.hidden_during_recording > 0 && t('appli quittée pendant l’enregistrement'),
    s.delay_s > 300 && t('envoyée {n} min après le défi', { n: Math.round(s.delay_s / 60) }),
    s.duration_ms && s.duration_ms < 10000 && t('vidéo trop courte'),
    v.rejected_before > 0 && t('{n} refus précédent(s)', { n: v.rejected_before }),
  ].filter(Boolean);

  const decide = async (approve) => {
    if (!approve && !reason) return setError(t('Choisis un motif de refus.'));
    setBusy(true);
    const err = await actions.verification.decide(v.id, approve, approve ? '' : reason);
    setBusy(false);
    if (err) setError(err); else onDone();
  };

  return (
    <article className="card space-y-3">
      <button className="flex items-center gap-3 text-left" onClick={() => go('user', { userId: v.user_id })}>
        <UserAvatar user={{ id: v.user_id, name: v.name, avatarUrl: v.avatar_url }} size="md" />
        <span>
          <span className="block font-bold text-stone-800">{v.name}</span>
          <span className="block text-xs text-stone-500">{t('Envoyée {when}', { when: timeAgo(v.submitted_at) })} · {t('membre depuis {when}', { when: timeAgo(v.member_since) })}</span>
        </span>
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        {url ? <video src={url} controls playsInline className="aspect-[3/4] w-full rounded-xl bg-black object-cover" />
          : <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-stone-200" />}
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-stone-700">{t('Défi demandé, dans l’ordre :')}</p>
          <ol className="list-decimal space-y-1 pl-5 text-stone-700">
            {v.challenge.actions.map((a) => <li key={a}>{verifyAction(a).emoji} {verifyAction(a).label}</li>)}
            <li>🗣️ {t('Code dit à voix haute :')} <strong className="font-mono text-lg tracking-widest text-teal-600">{v.challenge.code}</strong></li>
          </ol>
          <p className="text-xs text-stone-500">{[s.camera, s.width && `${s.width}×${s.height}`, s.fps && `${s.fps} i/s`, s.mime].filter(Boolean).join(' · ')}</p>
          {flags.length > 0 && (
            <p className="flex items-start gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {flags.join(' · ')}
            </p>
          )}
        </div>
      </div>
      <select className="input text-sm" value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('Motif de refus')}>
        <option value="">{t('Motif de refus (si refus)…')}</option>
        {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1 !bg-green-600" disabled={busy} onClick={() => decide(true)}><Check size={16} /> {t('Vérifier le profil')}</button>
        <button className="btn-ghost flex-1 text-red-600" disabled={busy} onClick={() => decide(false)}><X size={16} /> {t('Refuser')}</button>
      </div>
      <p className="text-[11px] text-stone-400">{t('La vidéo est supprimée dès ta décision.')}</p>
    </article>
  );
}
