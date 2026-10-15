import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, Gift, Heart, LifeBuoy, LogOut, MessageSquareHeart, MessagesSquare, PawPrint, Settings, ShieldCheck, Trophy, Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import UserAvatar from './UserAvatar.jsx';
import { FeedbackDialog } from './Feedback.jsx';
import { LANGS, getLang, setLang, t } from '../i18n/index.js';

// Menu du compte (photo en haut à droite) : profil, paramètres, raccourcis et déconnexion.
export default function AccountMenu({ go }) {
  const { currentUser, isStaff, isAdmin, actions } = useApp();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [donate, setDonate] = useState(null);
  const box = useRef(null);
  const lang = getLang();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    // lien de don, s'il est configuré
    if (donate === null) actions.donationLinks().then((l) => setDonate(l?.once || l?.monthly || '')).catch(() => setDonate(''));
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (fn) => () => { setOpen(false); fn(); };
  const item = 'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-stone-700 hover:bg-emerald-50 dark:text-stone-200 dark:hover:bg-stone-800';

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label={t('Menu du compte')}
        className="flex items-center gap-1.5 rounded-full text-sm text-stone-600">
        <UserAvatar user={currentUser} size="sm" className="h-8 w-8" />
        <span className="hidden sm:inline">{currentUser.name}</span>
        <ChevronDown size={14} className={`hidden transition-transform sm:inline ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-emerald-100 dark:bg-stone-900 dark:ring-stone-700">
          <button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-emerald-50 dark:hover:bg-stone-800"
            onClick={pick(() => go('user', { userId: currentUser.id }))}>
            <UserAvatar user={currentUser} size="md" />
            <span className="min-w-0">
              <span className="block truncate font-bold text-stone-800">{currentUser.name}</span>
              <span className="block text-xs font-semibold text-teal-600">{t('Voir mon profil')}</span>
            </span>
          </button>
          <div className="my-1 border-t border-emerald-100 dark:border-stone-700" />
          <button role="menuitem" className={item} onClick={pick(() => go('profile'))}><Settings size={18} /> {t('Paramètres du compte')}</button>
          <button role="menuitem" className={item} onClick={pick(() => go('pet'))}><PawPrint size={18} /> {t('Ajouter un animal')}</button>
          <button role="menuitem" className={`${item} font-semibold !text-teal-700`} onClick={pick(() => go('invite'))}><Gift size={18} /> {t('Inviter des amis')}</button>
          <button role="menuitem" className={item} onClick={pick(() => go('follows', { userId: currentUser.id, tab: 'followers' }))}><Users size={18} /> {t('Abonnés et abonnements')}</button>
          <button role="menuitem" className={item} onClick={pick(() => go('leaderboard'))}><Trophy size={18} /> {t('Niveau et classement')}</button>
          <button role="menuitem" className={item} onClick={pick(() => go('chat'))}><MessagesSquare size={18} /> {t('Tchat général')}</button>
          {isStaff && (
            <button role="menuitem" className={item} onClick={pick(() => go('admin'))}>
              <ShieldCheck size={18} className="text-teal-600" /> {isAdmin ? t('Administration') : t('Modération')}
            </button>
          )}
          <div className="my-1 border-t border-emerald-100 dark:border-stone-700" />
          <div className="flex items-center gap-3 px-4 py-2 text-sm text-stone-700 dark:text-stone-200">
            <span className="text-base" aria-hidden="true">🌐</span>
            <span className="flex-1">{t('Langue')}</span>
            {LANGS.map(([code]) => (
              <button key={code} lang={code} aria-pressed={lang === code} onClick={() => lang !== code && setLang(code)}
                className={`rounded-lg px-2 py-0.5 text-xs font-bold ${lang === code ? 'bg-teal-500 text-white' : 'text-stone-500 ring-1 ring-emerald-200 dark:ring-stone-600'}`}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <button role="menuitem" className={item} onClick={pick(() => setFeedback(true))}><MessageSquareHeart size={18} /> {t('Donner mon avis / signaler un bug')}</button>
          {donate && (
            <a role="menuitem" className={item} href={donate} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>
              <Heart size={18} className="text-pink-600" /> {t('Soutenir Cyclami')}
            </a>
          )}
          <button role="menuitem" className={item} onClick={pick(() => go('legal', { doc: 'safety', back: 'discover' }))}><LifeBuoy size={18} /> {t('Conseils de sécurité')}</button>
          <div className="my-1 border-t border-emerald-100 dark:border-stone-700" />
          <button role="menuitem" className={`${item} font-semibold !text-red-600`} onClick={pick(actions.logout)}><LogOut size={18} /> {t('Se déconnecter')}</button>
        </div>
      )}
      {feedback && <FeedbackDialog onClose={() => setFeedback(false)} />}
    </div>
  );
}
