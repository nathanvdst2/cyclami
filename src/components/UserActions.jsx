import { useState } from 'react';
import { AlertTriangle, Ban, Clock, Flag, Gavel, ImageOff, MessageSquareWarning, MoreVertical, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import ReportDialog from './ReportDialog.jsx';
import { t } from '../i18n/index.js';

// Menu « … » pour signaler ou bloquer un membre (et signaler la conversation dans la messagerie).
// L'équipe y trouve aussi : avertir, suspendre, lever la suspension, et bannir (administrateurs).
export default function UserActions({ user, onBlocked, conversation = false }) {
  const { actions, staffRoles, isStaff, isAdmin, currentUser, ownerId } = useApp();
  const reportable = !ownerId || user.id !== ownerId; // le fondateur ne peut pas être signalé
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(null); // 'user' | 'conversation'
  const canModerate = isStaff && !staffRoles[user.id] && user.id !== currentUser.id;

  const run = async (fn, done) => {
    setOpen(false);
    const err = await fn();
    window.alert(err || done);
  };
  const warn = () => {
    const reason = window.prompt(t('Avertir {name} ? Il recevra une notification.\n\nMessage :', { name: user.name }));
    if (reason) run(() => actions.admin.warn(user.id, reason), t('Avertissement envoyé.'));
  };
  const suspend = () => {
    const answer = window.prompt(t('Suspendre {name} pendant combien de jours ? (1 à 365)', { name: user.name }), '7');
    if (answer === null) return;
    const days = Math.min(365, Math.max(1, Math.round(Number(answer)) || 0));
    if (!days) return;
    const reason = window.prompt(t(days > 1
      ? 'Suspendre {name} pendant {days} jours ?\nIl ne pourra plus publier, commenter ni écrire.\n\nMotif :'
      : 'Suspendre {name} pendant {days} jour ?\nIl ne pourra plus publier, commenter ni écrire.\n\nMotif :', { name: user.name, days }));
    if (reason !== null) run(() => actions.admin.suspend(user.id, days, reason), t('Membre suspendu.'));
  };
  const unsuspend = () => {
    if (window.confirm(t('Lever la suspension de {name} ?', { name: user.name }))) run(() => actions.admin.unsuspend(user.id), t('Suspension levée.'));
  };
  const ban = () => {
    const reason = window.prompt(t('Bannir définitivement {name} ?\nCompte et contenus supprimés, adresse bloquée.\n\nRaison :', { name: user.name }));
    if (reason === null) return;
    if (!window.confirm(t('Dernière confirmation : bannir {name} ? Cette action est irréversible.', { name: user.name }))) return;
    run(async () => {
      const err = await actions.admin.banUser(user.id, reason);
      if (!err) onBlocked?.();
      return err;
    }, t('Membre banni.'));
  };

  const deleteAccount = () => {
    if (!window.confirm(t('Supprimer le compte de {name} ?\n\nSon profil, ses animaux, publications, messages et photos seront effacés. Contrairement au bannissement, cette adresse pourra se réinscrire.', { name: user.name }))) return;
    if (!window.confirm(t('Dernière confirmation : supprimer définitivement le compte de {name} ?', { name: user.name }))) return;
    run(async () => {
      const err = await actions.admin.deleteUser(user.id, '');
      if (!err) onBlocked?.();
      return err;
    }, t('Compte supprimé.'));
  };

  const block = async () => {
    setOpen(false);
    if (!window.confirm(t('Bloquer {name} ? Vous ne pourrez plus vous écrire et vous ne verrez plus ses contenus.', { name: user.name }))) return;
    const err = await actions.block(user.id);
    if (err) window.alert(err);
    else onBlocked?.();
  };

  const item = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50';
  if (!reportable && staffRoles[user.id] && !canModerate) return null; // rien à proposer (profil du fondateur)
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="rounded-lg p-1 text-stone-400 hover:bg-emerald-50" aria-label={t('Plus d’options')}>
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-emerald-100">
          {conversation && reportable && (
            <button onClick={() => { setOpen(false); setReporting('conversation'); }} className={item}>
              <MessageSquareWarning size={14} /> {t('Signaler la conversation')}
            </button>
          )}
          {reportable && (
            <button onClick={() => { setOpen(false); setReporting('user'); }} className={item}>
              <Flag size={14} /> {t('Signaler le profil')}
            </button>
          )}
          {reportable && user.avatarUrl && (
            <button onClick={() => { setOpen(false); setReporting('avatar'); }} className={item}>
              <ImageOff size={14} /> {t('Signaler la photo de profil')}
            </button>
          )}
          {!staffRoles[user.id] && (
            <button onClick={block} className={`${item} text-red-600 hover:bg-red-50`}>
              <Ban size={14} /> {t('Bloquer')}
            </button>
          )}
          {canModerate && (
            <>
              <div className="border-t border-emerald-100 px-3 pb-1 pt-2 text-xs font-semibold uppercase text-stone-400">{t('Modération')}</div>
              <button onClick={warn} className={item}><AlertTriangle size={14} className="text-emerald-500" /> {t('Avertir')}</button>
              <button onClick={suspend} className={item}><Clock size={14} className="text-teal-500" /> {t('Suspendre…')}</button>
              <button onClick={unsuspend} className={item}><RotateCcw size={14} /> {t('Lever la suspension')}</button>
              {isAdmin && (
                <>
                  <button onClick={deleteAccount} className={`${item} font-semibold text-red-600 hover:bg-red-50`}><Trash2 size={14} /> {t('Supprimer le compte')}</button>
                  <button onClick={ban} className={`${item} font-semibold text-red-600 hover:bg-red-50`}><Gavel size={14} /> {t('Bannir définitivement')}</button>
                </>
              )}
            </>
          )}
        </div>
      )}
      {reporting && (
        <ReportDialog target={{ type: reporting, userId: user.id }} name={user.name} onClose={() => setReporting(null)} />
      )}
    </div>
  );
}
