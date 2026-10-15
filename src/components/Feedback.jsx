import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, MessageSquareHeart, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { useDraft } from '../lib/persist.js';
import { t } from '../i18n/index.js';

const KINDS = [
  ['bug', t('🐞 Un bug')],
  ['idee', t('💡 Une idée')],
  ['autre', t('💬 Autre chose')],
];

// Page en cours (enregistrée par la navigation du site), pour savoir d'où vient le retour.
const currentPage = () => window.history.state?.page || 'landing';

// « Donner mon avis / signaler un bug » : texte, capture d'écran facultative ; la page et l'appareil sont joints.
export function FeedbackDialog({ onClose }) {
  const { actions } = useApp();
  const [kind, setKind] = useState('bug');
  const [body, setBody] = useDraft('feedback', '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const [state, setState] = useState(null);
  const [sending, setSending] = useState(false);
  const page = currentPage();

  const send = async (e) => {
    e.preventDefault();
    if (body.trim().length < 3) return;
    setSending(true);
    const err = await actions.sendFeedback({ kind, body, file, page });
    setSending(false);
    if (err) return setState({ error: err });
    setBody('');
    setState({ ok: t('Merci beaucoup ! Ton message est bien arrivé 🧡') });
    setTimeout(onClose, 2200);
  };

  // affichée au niveau de la page (la barre du haut, floutée, capturerait sinon la fenêtre)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center" onClick={onClose}>
      <form onSubmit={send} onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-bold text-stone-800">{t('Donner mon avis')}</h2>
          <button type="button" onClick={onClose} aria-label={t('Fermer')} className="text-stone-400"><X size={18} /></button>
        </div>
        <p className="text-xs text-stone-500">{t('Un bug, une idée, quelque chose de pas clair ? Dis-le-nous, on lit tout. La page et le type de téléphone sont joints automatiquement.')}</p>
        <div className="flex flex-wrap gap-2">
          {KINDS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setKind(id)}
              className={`chip ${kind === id ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
              {label}
            </button>
          ))}
        </div>
        <textarea className="input" rows="4" maxLength={2000} required aria-label={t('Ton message')}
          placeholder={kind === 'bug' ? t('Qu’est-ce qui s’est passé ? Qu’est-ce que tu essayais de faire ?') : t('Ton message…')}
          value={body} onChange={(e) => setBody(e.target.value)} />
        {preview ? (
          <div className="relative w-fit">
            <img src={preview} alt={t('Aperçu de la capture d’écran')} className="max-h-48 rounded-xl bg-emerald-50 object-contain ring-1 ring-emerald-200 dark:bg-stone-800 dark:ring-stone-700" />
            <button type="button" onClick={() => setFile(null)} aria-label={t('Retirer la capture d’écran')}
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
              <X size={14} />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
            <ImagePlus size={16} className="text-teal-600" />
            {t('Ajouter une capture d’écran (facultatif)')}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ''; }} />
          </label>
        )}
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
        <button className="btn-primary w-full" disabled={sending || body.trim().length < 3 || !!state?.ok}>
          {sending ? t('Envoi…') : t('Envoyer')}
        </button>
      </form>
    </div>,
    document.body,
  );
}

// Bouton qui ouvre la fenêtre (carte sur le profil, lien discret ailleurs)
export default function FeedbackButton({ variant = 'card' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === 'card' ? (
        <button onClick={() => setOpen(true)} className="card flex w-full items-center gap-3 text-left hover:ring-teal-200">
          <MessageSquareHeart className="shrink-0 text-teal-600" size={26} />
          <span>
            <span className="block font-bold text-stone-800">{t('Donner mon avis / signaler un bug')}</span>
            <span className="block text-sm text-stone-500">{t('Cyclami vient de naître : chaque retour nous aide à l’améliorer.')}</span>
          </span>
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="mx-auto flex items-center gap-1 text-sm text-stone-500 underline-offset-2 hover:underline">
          <MessageSquareHeart size={14} /> {t('Donner mon avis / signaler un bug')}
        </button>
      )}
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  );
}
