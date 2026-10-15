import { useState } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import { t } from '../i18n/index.js';

// Extrait de conversation joint à un signalement (texte « JJ/MM HH:MI Moi : … » écrit par la base),
// affiché comme une vraie messagerie : le membre qui signale à droite, la personne signalée à gauche.
export function parseConversation(snapshot) {
  const messages = [];
  for (const line of (snapshot || '').split('\n')) {
    const m = line.match(/^(\d{2}\/\d{2} \d{2}:\d{2}) (Moi|Lui\/elle) : (.*)$/);
    if (m) messages.push({ at: m[1], mine: m[2] === 'Moi', body: m[3] });
    else if (messages.length) messages[messages.length - 1].body += `\n${line}`;
  }
  return messages;
}

export default function ConversationSnapshot({ snapshot, reporterName, authorName }) {
  const [open, setOpen] = useState(false);
  const messages = parseConversation(snapshot);
  if (!messages.length) {
    return <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-emerald-50 px-3 py-2 font-sans text-sm text-stone-700">{snapshot}</pre>;
  }
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        <MessageSquareText size={16} /> {t('Voir la conversation ({n} messages)', { n: messages.length })}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 border-b border-emerald-100 px-4 py-3">
              <div>
                <div className="font-bold text-stone-800">{t('{a} et {b}', { a: authorName, b: reporterName })}</div>
                <div className="text-xs text-stone-500">{t('Derniers messages transmis par {name} avec son signalement', { name: reporterName })}</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label={t('Fermer')}><X size={20} /></button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-emerald-50/50 px-3 py-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'rounded-br-sm bg-teal-500 text-white' : 'rounded-bl-sm bg-white text-stone-800 ring-1 ring-emerald-100'}`}>
                    <div className={`mb-0.5 text-[11px] font-semibold ${m.mine ? 'text-teal-100' : 'text-stone-500'}`}>
                      {m.mine ? reporterName : authorName} · {m.at}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{m.body === '[photo]' ? `📷 ${t('Photo')}` : m.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
