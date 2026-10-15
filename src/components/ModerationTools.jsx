import { useState } from 'react';
import { EyeOff, Eye, Flag, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import ReportDialog from './ReportDialog.jsx';
import { t } from '../i18n/index.js';

// Petit drapeau pour signaler un contenu (publication, commentaire, sortie, danger…).
export function ReportButton({ type, id, userId, size = 16, className = '' }) {
  const { ownerId } = useApp();
  const [open, setOpen] = useState(false);
  if (ownerId && userId === ownerId) return null; // le fondateur ne peut pas être signalé
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={t('Signaler')} title={t('Signaler')}
        className={`rounded-lg p-1.5 text-stone-300 hover:bg-emerald-50 hover:text-stone-500 ${className}`}>
        <Flag size={size} />
      </button>
      {open && <ReportDialog target={{ type, id, userId }} onClose={() => setOpen(false)} />}
    </>
  );
}

// Bandeau « masqué » + boutons de l'équipe (masquer / réafficher / retirer).
export function ModerationBar({ type, id, hidden, isAuthor }) {
  const { isStaff, actions } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!hidden && !isStaff) return null;

  const run = async (fn) => {
    setBusy(true);
    setError(await fn());
    setBusy(false);
  };
  const remove = () => {
    const reason = window.prompt(t('Retirer ce contenu ? Son auteur sera prévenu.\n\nRaison (facultatif) :'));
    if (reason !== null) run(() => actions.admin.removeContent(type, id, reason));
  };

  return (
    <div className={`space-y-1 rounded-xl px-3 py-2 text-xs ${hidden ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' : ''}`}>
      {hidden && (
        <p className="flex items-center gap-1 font-semibold">
          <EyeOff size={14} />
          {isAuthor && !isStaff
            ? t('Masqué : plusieurs membres l’ont signalé, l’équipe va le vérifier. Toi seul le vois pour l’instant.')
            : t('Masqué aux membres en attente de vérification.')}
        </p>
      )}
      {isStaff && !isAuthor && (
        <div className="flex flex-wrap gap-3 text-stone-500">
          <button disabled={busy} className="inline-flex items-center gap-1 hover:text-stone-800"
            onClick={() => run(() => actions.admin.setHidden(type, id, !hidden))}>
            {hidden ? <><Eye size={13} /> {t('Réafficher')}</> : <><EyeOff size={13} /> {t('Masquer')}</>}
          </button>
          <button disabled={busy} className="inline-flex items-center gap-1 text-red-600 hover:text-red-700" onClick={remove}>
            <Trash2 size={13} /> {t('Retirer')}
          </button>
          <span className="text-stone-400">({t('modération')})</span>
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
