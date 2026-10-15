import { useState } from 'react';
import { useApp, REPORT_CATEGORIES } from '../context/AppContext.jsx';
import { t } from '../i18n/index.js';

const TITLES = {
  user: (name) => t('Signaler {name}', { name }),
  conversation: (name) => t('Signaler ta conversation avec {name}', { name }),
  post: () => t('Signaler cette publication'),
  comment: () => t('Signaler ce commentaire'),
  ride: () => t('Signaler cette sortie'),
  forum_topic: () => t('Signaler ce sujet'),
  forum_reply: () => t('Signaler cette réponse'),
  group: () => t('Signaler ce club ou groupe'),
  group_message: () => t('Signaler ce message'),
  chat_message: () => t('Signaler ce message'),
  avatar: (name) => t('Signaler la photo de profil de {name}', { name }),
};

// Fenêtre de signalement : motif + détails. Le contenu signalé est copié par la base
// pour que l'équipe puisse le consulter même s'il est supprimé ensuite.
export default function ReportDialog({ target, name, onClose }) {
  const { actions } = useApp();
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [sending, setSending] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    if (!category) return;
    setSending(true);
    const err = await actions.report(target, category, reason.trim());
    setSending(false);
    setFeedback(err ? { error: err } : { ok: t('Merci ! L’équipe va examiner ton signalement. Tu seras prévenu quand il sera traité.') });
    if (!err) setTimeout(onClose, 2200);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center" onClick={onClose}>
      <form onSubmit={send} onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm space-y-3">
        <h2 className="font-bold text-stone-800">{TITLES[target.type]?.(name) || t('Signaler')}</h2>
        {target.type === 'conversation' && (
          <p className="text-xs text-stone-500">{t('Les 15 derniers messages de cette conversation seront transmis à l’équipe de modération.')}</p>
        )}
        <div className="space-y-1">
          {REPORT_CATEGORIES.map(([id, label]) => (
            <label key={id} className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 ${category === id ? 'bg-teal-50 ring-teal-300' : 'ring-emerald-100'}`}>
              <input type="radio" name="category" className="accent-teal-500" checked={category === id} onChange={() => setCategory(id)} />
              <span className="text-stone-700">{label}</span>
            </label>
          ))}
        </div>
        <textarea className="input" rows="2" maxLength={1000} placeholder={t('Détails (facultatif)')}
          value={reason} onChange={(e) => setReason(e.target.value)} />
        {feedback?.error && <p className="text-sm text-red-600">{feedback.error}</p>}
        {feedback?.ok && <p className="text-sm text-green-700">{feedback.ok}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost flex-1" onClick={onClose}>{t('Annuler')}</button>
          <button className="btn-primary flex-1" disabled={!category || sending || !!feedback?.ok}>
            {sending ? t('Envoi…') : t('Signaler')}
          </button>
        </div>
      </form>
    </div>
  );
}
