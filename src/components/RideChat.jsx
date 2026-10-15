import { useEffect, useRef, useState } from 'react';
import { MessagesSquare, Send, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { supabase } from '../lib/supabase.js';
import { timeAgo } from '../utils/geo.js';
import { t } from '../i18n/index.js';
import { useDraft } from '../lib/persist.js';
import MessageInput from './MessageInput.jsx';

// Discussion de groupe d'une sortie : seuls l'organisateur et les participants la voient (temps réel).
export default function RideChat({ rideId, count }) {
  const { currentUser, getUser } = useApp();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [text, setText] = useDraft(`ride-chat:${rideId}`, '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const bottom = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    supabase.from('ride_messages').select('id, author_id, body, created_at').eq('ride_id', rideId)
      .order('created_at').limit(200)
      .then(({ data, error: err }) => { if (alive) { setList(data || []); if (err) setError(t('Discussion indisponible pour le moment.')); } });
    const channel = supabase.channel(`ride-chat-${rideId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${rideId}` }, (p) => {
        setList((prev) => {
          const rest = (prev || []).filter((m) => m.id !== (p.new?.id || p.old?.id));
          return p.eventType === 'DELETE' ? rest : [...rest, p.new].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [open, rideId]);

  useEffect(() => { bottom.current?.scrollIntoView?.({ block: 'nearest' }); }, [list?.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { data, error: err } = await supabase.from('ride_messages')
      .insert({ ride_id: rideId, author_id: currentUser.id, body }).select('id, author_id, body, created_at').single();
    setSending(false);
    if (err) return setError(/suspendu|Trop de messages|terminée/.test(err.message) ? t(err.message) : t('Message non envoyé, réessaie.'));
    setError(null);
    setText('');
    setList((prev) => [...(prev || []).filter((m) => m.id !== data.id), data]);
  };

  const remove = async (id) => {
    await supabase.from('ride_messages').delete().eq('id', id);
    setList((prev) => (prev || []).filter((m) => m.id !== id));
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-sm font-semibold text-teal-600">
        <MessagesSquare size={18} /> {t('Discussion du groupe ({n} participants)', { n: count })}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
      <div className="flex items-center justify-between text-sm font-semibold text-stone-700">
        <span className="flex items-center gap-1"><MessagesSquare size={16} /> {t('Discussion du groupe')}</span>
        <button className="text-xs text-stone-400" onClick={() => setOpen(false)}>{t('Fermer')}</button>
      </div>
      <p className="text-xs text-stone-500">{t('Visible seulement par l’organisateur et les participants.')}</p>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {list === null && <p className="text-xs text-stone-400">{t('Chargement…')}</p>}
        {list?.length === 0 && <p className="text-xs text-stone-400">{t('Pas encore de message : dis bonjour au groupe 👋')}</p>}
        {list?.map((m) => {
          const mine = m.author_id === currentUser.id;
          return (
            <div key={m.id} className={`flex items-end gap-1 ${mine ? 'justify-end' : ''}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${mine ? 'bg-teal-500 text-white' : 'bg-white text-stone-700'}`}>
                {!mine && <div className="text-xs font-semibold text-teal-600">{getUser(m.author_id)?.name || t('Membre')}</div>}
                <p className="whitespace-pre-line break-words">{m.body}</p>
                <div className={`text-[10px] ${mine ? 'text-teal-100' : 'text-stone-400'}`}>{timeAgo(m.created_at)}</div>
              </div>
              {mine && (
                <button onClick={() => remove(m.id)} className="p-1 text-stone-300 hover:text-red-500" aria-label={t('Supprimer')}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex items-end gap-2">
        <MessageInput className="input py-1.5 text-sm" placeholder={t('Écrire au groupe…')} maxLength={1000}
          value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary px-3" disabled={sending || !text.trim()} aria-label={t('Envoyer')}><Send size={16} /></button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
