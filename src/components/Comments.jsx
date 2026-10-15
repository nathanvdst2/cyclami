import { useState } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { timeAgo } from '../utils/geo.js';
import UserAvatar from './UserAvatar.jsx';
import StaffBadge from './StaffBadge.jsx';
import { ModerationBar, ReportButton } from './ModerationTools.jsx';
import { t } from '../i18n/index.js';
import { useDraft } from '../lib/persist.js';

// Fil de commentaires sous une publication (postId) ou une sortie (rideId).
export default function Comments({ postId, rideId, go }) {
  const { comments, currentUser, getUser, actions, isAdmin } = useApp();
  const list = comments.filter((c) => (postId ? c.postId === postId : c.rideId === rideId));
  const [open, setOpen] = useState(false);
  const [text, setText] = useDraft(`comment:${postId || rideId}`, '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const err = await actions.addComment({ postId, rideId, text: text.trim() });
    setSending(false);
    if (err) setError(err);
    else { setText(''); setError(null); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700">
        <MessageSquare size={18} /> {list.length > 0 ? t(list.length > 1 ? '{n} commentaires' : '{n} commentaire', { n: list.length }) : t('Commenter')}
      </button>
    );
  }

  return (
    <div className="space-y-2 border-t border-emerald-100 pt-3">
      {list.map((c) => {
        const author = getUser(c.authorId);
        return (
          <div key={c.id} className="flex items-start gap-2 text-sm">
            <button onClick={() => author && go('user', { userId: author.id })}>
              <UserAvatar user={author} size="sm" />
            </button>
            <div className="min-w-0 flex-1 rounded-xl bg-emerald-50 px-3 py-1.5">
              <button className="font-semibold text-stone-800" onClick={() => author && go('user', { userId: author.id })}>
                {author?.name || t('Membre')}{author && <StaffBadge userId={author.id} />}
              </button>
              <span className="ml-2 text-xs text-stone-400">{timeAgo(c.createdAt)}</span>
              <p className="whitespace-pre-line break-words text-stone-700">{c.text}</p>
              <ModerationBar type="comment" id={c.id} hidden={c.hidden} isAuthor={c.authorId === currentUser.id} />
            </div>
            {c.authorId !== currentUser.id && <ReportButton type="comment" id={c.id} userId={c.authorId} size={13} className="!p-1" />}
            {(c.authorId === currentUser.id || isAdmin) && (
              <button onClick={() => actions.deleteComment(c.id)} className="p-1 text-stone-300 hover:text-red-500" aria-label={t('Supprimer')}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      })}
      <form onSubmit={submit} className="flex gap-2">
        <input className="input py-1.5 text-sm" placeholder={t('Écrire un commentaire…')} maxLength={1000}
          value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <button className="btn-primary px-3" disabled={sending || !text.trim()} aria-label={t('Envoyer')}><Send size={16} /></button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
