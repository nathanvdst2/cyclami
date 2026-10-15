import { useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Clock, Eye, EyeOff, ImageOff, Trash2 } from 'lucide-react';
import { REPORT_CATEGORIES, useApp } from '../context/AppContext.jsx';
import { timeAgo } from '../utils/geo.js';
import { t } from '../i18n/index.js';
import ConversationSnapshot from './ConversationSnapshot.jsx';

const TYPE_LABEL = {
  user: t('Profil'), post: t('Publication'), comment: t('Commentaire'), ride: t('Sortie'), conversation: t('Conversation privée'), listing: t('Annonce'),
  forum_topic: t('Sujet du forum'), forum_reply: t('Réponse du forum'), group: t('Groupe'), group_message: t('Message de groupe'), avatar: t('Photo de profil'), gear: t('Matériel entre voisins'), chat_message: t('Message du tchat général'),
};
const CATEGORY_LABEL = Object.fromEntries(REPORT_CATEGORIES);
const SERIOUS = new Set(['maltraitance', 'danger', 'harcelement']);

// Un « dossier » : tous les signalements qui visent le même contenu (ou le même profil).
export default function ReportCase({ reports, memberName, member, go, onDone }) {
  const { isAdmin, staffRoles, currentUser, actions } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(7);

  const first = reports[0];
  const open = reports.filter((r) => !r.resolved_at);
  const isOpen = open.length > 0;
  const { target_type: type, target_id: targetId, reported_id: authorId } = first;
  const categories = [...new Set(reports.map((r) => r.category))];
  const canSanction = authorId && authorId !== currentUser.id && !staffRoles[authorId];
  const isContent = ['post', 'comment', 'ride', 'listing', 'forum_topic', 'forum_reply', 'group', 'group_message', 'chat_message'].includes(type);

  const run = async (fn, { close } = {}) => {
    setBusy(true);
    setError(null);
    const err = await fn();
    if (!err && close) await actions.admin.resolve(first.id, close);
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  const ask = (question) => window.prompt(question);

  const warn = () => {
    const reason = ask(t('Avertir {name} ? Il recevra une notification.\n\nMessage :', { name: memberName(authorId) }));
    if (reason) run(() => actions.admin.warn(authorId, reason), { close: t('Avertissement : {reason}', { reason }) });
  };
  const suspend = () => {
    const reason = ask(t(days > 1
      ? 'Suspendre {name} pendant {days} jours ?\nIl ne pourra plus publier, commenter ni écrire.\n\nMotif :'
      : 'Suspendre {name} pendant {days} jour ?\nIl ne pourra plus publier, commenter ni écrire.\n\nMotif :', { name: memberName(authorId), days }));
    if (reason !== null) run(() => actions.admin.suspend(authorId, days, reason), { close: t(reason ? 'Suspension {days} j : {reason}' : 'Suspension {days} j', { days, reason }) });
  };
  const remove = () => {
    const reason = ask(t('Retirer ce contenu ? Son auteur sera prévenu.\n\nRaison :'));
    if (reason !== null) run(() => actions.admin.removeContent(type, targetId, reason), { close: reason ? t('Contenu retiré : {reason}', { reason }) : t('Contenu retiré') });
  };
  const ban = () => {
    const reason = ask(t(member?.email
      ? 'Bannir définitivement {name} ({email}) ?\nCompte et contenus supprimés, adresse bloquée.\n\nRaison :'
      : 'Bannir définitivement {name} ?\nCompte et contenus supprimés, adresse bloquée.\n\nRaison :', { name: memberName(authorId), email: member?.email }));
    if (reason !== null) run(() => actions.admin.banUser(authorId, reason));
  };
  const close = () => {
    const resolution = ask(t('Clore le dossier sans autre action ?\n\nConclusion (envoyée aux personnes qui ont signalé) :'), t('Aucune infraction constatée'));
    if (resolution !== null) run(() => actions.admin.resolve(first.id, resolution));
  };

  return (
    <div className={`card space-y-3 ${isOpen ? '' : 'opacity-60'} ${isOpen && categories.some((c) => SERIOUS.has(c)) ? 'ring-2 ring-red-200' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-stone-800 px-2 py-0.5 font-semibold text-white">{TYPE_LABEL[type]}</span>
        {categories.map((c) => (
          <span key={c} className={`rounded-full px-2 py-0.5 font-semibold ${SERIOUS.has(c) ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>
            {CATEGORY_LABEL[c] || c}
          </span>
        ))}
        <span className="ml-auto text-stone-400">
          {t(reports.length > 1 ? '{n} signalements' : '{n} signalement', { n: reports.length })} · {timeAgo(reports[reports.length - 1].created_at)}
        </span>
      </div>

      <div className="text-sm text-stone-600">
        {t('Auteur :')}{' '}
        <button className="font-semibold text-teal-600" onClick={() => go('user', { userId: authorId })}>{memberName(authorId)}</button>
        {member?.reports_against > 1 && <span className="ml-2 text-xs text-red-600">{t('{n} signalements en cours au total', { n: member.reports_against })}</span>}
        {member?.warnings > 0 && <span className="ml-2 text-xs text-emerald-700">{t(member.warnings > 1 ? '{n} avertissements déjà' : '{n} avertissement déjà', { n: member.warnings })}</span>}
        {member?.suspended_until && <span className="ml-2 text-xs text-red-600">{t('suspendu')}</span>}
      </div>

      {first.snapshot && type === 'conversation' && (
        <ConversationSnapshot snapshot={first.snapshot} reporterName={memberName(first.reporter_id)} authorName={memberName(authorId)} />
      )}
      {first.snapshot && type === 'avatar' && (
        <img src={first.snapshot} alt={t('Photo de profil signalée')} className="max-h-48 rounded-xl bg-emerald-50 object-contain" />
      )}
      {first.snapshot && type !== 'conversation' && type !== 'avatar' && (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-emerald-50 px-3 py-2 font-sans text-sm text-stone-700">
          {first.snapshot}
        </pre>
      )}

      <ul className="space-y-1 text-xs text-stone-500">
        {reports.map((r) => (
          <li key={r.id}>
            <button className="font-semibold text-stone-700" onClick={() => go('user', { userId: r.reporter_id })}>{memberName(r.reporter_id)}</button>
            {' : '}{CATEGORY_LABEL[r.category] || r.category}{r.reason && r.reason !== '—' ? ` — « ${r.reason} »` : ''}
          </li>
        ))}
      </ul>

      {isOpen ? (
        <div className="flex flex-wrap gap-2">
          {type === 'gear' && targetId && (
            <button className="btn-ghost !px-3 !py-1.5 text-sm text-red-600" disabled={busy}
              onClick={() => window.confirm(t('Retirer cet objet ?')) && run(() => actions.gear.remove({ id: targetId }), { close: t('Objet retiré') })}>
              <Trash2 size={14} /> {t('Retirer')}
            </button>
          )}
          {type === 'avatar' && (
            <button className="btn-ghost !px-3 !py-1.5 text-sm text-red-600" disabled={busy}
              onClick={() => window.confirm(t('Retirer la photo de profil de {name} ? Il sera prévenu.', { name: memberName(authorId) }))
                && run(() => actions.removeAvatar(authorId, null, first.snapshot), { close: t('Photo de profil retirée') })}>
              <ImageOff size={14} /> {t('Retirer la photo')}
            </button>
          )}
          {isContent && (
            <>
              <button className="btn-ghost !px-3 !py-1.5 text-sm text-red-600" disabled={busy} onClick={remove}><Trash2 size={14} /> {t('Retirer')}</button>
              <button className="btn-ghost !px-3 !py-1.5 text-sm" disabled={busy} onClick={() => run(() => actions.admin.setHidden(type, targetId, true))}><EyeOff size={14} /> {t('Masquer')}</button>
              <button className="btn-ghost !px-3 !py-1.5 text-sm" disabled={busy} onClick={() => run(() => actions.admin.setHidden(type, targetId, false))}><Eye size={14} /> {t('Réafficher')}</button>
            </>
          )}
          {canSanction && (
            <>
              <button className="btn-ghost !px-3 !py-1.5 text-sm text-emerald-700" disabled={busy} onClick={warn}><AlertTriangle size={14} /> {t('Avertir')}</button>
              <span className="inline-flex items-center gap-1">
                <select className="input !w-auto !py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label={t('Durée')}>
                  <option value={1}>{t('{n} jour', { n: 1 })}</option>
                  <option value={7}>{t('{n} jours', { n: 7 })}</option>
                  <option value={30}>{t('{n} jours', { n: 30 })}</option>
                </select>
                <button className="btn-ghost !px-3 !py-1.5 text-sm text-red-600" disabled={busy} onClick={suspend}><Clock size={14} /> {t('Suspendre')}</button>
              </span>
              {isAdmin && (
                <button className="btn-ghost !px-3 !py-1.5 text-sm text-red-700" disabled={busy} onClick={ban}><Ban size={14} /> {t('Bannir')}</button>
              )}
            </>
          )}
          <button className="btn-ghost !px-3 !py-1.5 text-sm text-green-700" disabled={busy} onClick={close}><CheckCircle2 size={14} /> {t('Clore')}</button>
        </div>
      ) : (
        <p className="text-xs text-stone-500">
          {t(first.resolved_by ? '✅ Traité {when} par {name}' : '✅ Traité {when}', { when: timeAgo(first.resolved_at), name: first.resolved_by && memberName(first.resolved_by) })}
          {first.resolution ? ` — ${first.resolution}` : ''}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
