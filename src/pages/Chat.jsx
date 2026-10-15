import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CornerUpLeft, ImagePlus, Send, Trash2, X } from 'lucide-react';
import { useApp, friendlyError } from '../context/AppContext.jsx';
import { deletePublicPhoto, supabase, uploadPhoto } from '../lib/supabase.js';
import UserAvatar from '../components/UserAvatar.jsx';
import StaffBadge from '../components/StaffBadge.jsx';
import { ReportButton, ModerationBar } from '../components/ModerationTools.jsx';
import { timeAgo } from '../utils/geo.js';
import { useDraft } from '../lib/persist.js';
import { t } from '../i18n/index.js';
import { VoicePlayer, VoiceRecorder } from '../components/Voice.jsx';
import { canRecord, deleteVoice, uploadVoice } from '../lib/voice.js';
import { TypingBubble } from '../components/Typing.jsx';
import MessageInput from '../components/MessageInput.jsx';

const PAGE = 60;
const FIELDS = 'id, author_id, body, photo_url, audio_path, audio_seconds, reply_to, mentions, hidden_at, created_at';
const byDate = (a, b) => a.created_at.localeCompare(b.created_at);
const excerpt = (m) => (m?.body ? m.body.slice(0, 80) : m?.photo_url ? '📷' : m?.audio_path ? '🎤' : '…');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Texte d'un message, « @prénom » des membres mentionnés mis en valeur.
function Body({ text, names, mine }) {
  if (!text) return null;
  const sorted = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!sorted.length) return <p className="whitespace-pre-line break-words">{text}</p>;
  const re = new RegExp(`(@(?:${sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'gi');
  return (
    <p className="whitespace-pre-line break-words">
      {text.split(re).map((part, i) => (i % 2
        ? <strong key={i} className={mine ? 'text-white underline' : 'text-teal-700 dark:text-teal-300'}>{part}</strong>
        : part))}
    </p>
  );
}

// Tchat général : tous les membres, en temps réel. Réponses, @mentions et photos ;
// signalable et modéré comme le reste du site.
export default function Chat({ go, back }) {
  const { currentUser, getUser, users, isStaff } = useApp();
  const [list, setList] = useState(null);
  const [more, setMore] = useState(false);
  const [authors, setAuthors] = useState({});
  const [text, setText] = useDraft('chat', '');
  const [replyTo, setReplyTo] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [online, setOnline] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  // membres qui écrivent en ce moment (signal reçu il y a moins de 4 secondes)
  const chatChannel = useRef(null);
  const [typers, setTypers] = useState({});
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!Object.keys(typers).length) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [typers]);
  const bottom = useRef(null);
  const atBottom = useRef(true);
  const input = useRef(null);

  // nom et photo des auteurs pas encore chargés par le site
  const known = (id) => getUser(id) || authors[id];
  // le prénom affiché vient du site quand on le connaît (pas seulement de celui qui envoie le signal)
  const typing = Object.entries(typers).filter(([, x]) => Date.now() - x.at < 4000)
    .map(([id, x]) => ({ ...x, name: known(id)?.name || x.name })).filter((x) => x.name);
  const loadAuthors = async (rows) => {
    const ids = [...new Set(rows.map((m) => m.author_id))].filter((id) => !getUser(id) && !authors[id]);
    if (!ids.length) return;
    const { data } = await supabase.from('profiles').select('id, name, avatar_url').in('id', ids);
    if (data) setAuthors((prev) => ({ ...prev, ...Object.fromEntries(data.map((p) => [p.id, { id: p.id, name: p.name, avatarUrl: p.avatar_url }])) }));
  };

  useEffect(() => {
    let alive = true;
    supabase.from('chat_messages').select(FIELDS).order('created_at', { ascending: false }).limit(PAGE)
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) { setList([]); setError(t('Tchat indisponible pour le moment.')); return; }
        const rows = (data || []).sort(byDate);
        setList(rows);
        setMore((data || []).length === PAGE);
        loadAuthors(rows);
      });
    const channel = supabase.channel('chat-general')
      // « … écrit » : simple signal temps réel, rien n'est enregistré
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload?.from || payload.from === currentUser.id) return;
        setTypers((prev) => ({ ...prev, [payload.from]: { name: String(payload.name || '').slice(0, 50), voice: payload.kind === 'voice', at: Date.now() } }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, (p) => {
        const id = p.new?.id || p.old?.id;
        setList((prev) => {
          const rest = (prev || []).filter((m) => m.id !== id);
          return p.eventType === 'DELETE' || !(p.new?.body || p.new?.photo_url || p.new?.audio_path) ? rest : [...rest, p.new].sort(byDate);
        });
        if (p.new?.author_id) {
          loadAuthors([p.new]);
          setTypers((prev) => { const next = { ...prev }; delete next[p.new.author_id]; return next; });
        }
      })
      .subscribe();
    chatChannel.current = channel;
    // membres en ligne sur tout le site (actifs ces 5 dernières minutes)
    const count = () => supabase.rpc('online_count').then(({ data }) => alive && typeof data === 'number' && setOnline(data), () => {});
    count();
    const timer = setInterval(count, 60_000);
    return () => { alive = false; clearInterval(timer); supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // reste en bas quand un message arrive, sauf si on relit les anciens
  useEffect(() => { if (atBottom.current) bottom.current?.scrollIntoView?.({ block: 'end' }); }, [list?.length]);
  useEffect(() => {
    const onScroll = () => { atBottom.current = window.innerHeight + window.scrollY >= document.body.scrollHeight - 200; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // membres qu'on peut mentionner : auteurs du tchat et membres chargés par le site
  const people = useMemo(() => {
    const map = new Map();
    for (const u of [...users, ...Object.values(authors)]) if (u?.id && u.id !== currentUser.id && u.name) map.set(u.id, u.name);
    return [...map].map(([id, name]) => ({ id, name }));
  }, [users, authors, currentUser.id]);
  const namesById = useMemo(() => Object.fromEntries([...people.map((p) => [p.id, p.name]), [currentUser.id, currentUser.name]]), [people, currentUser]);

  // « @ » en cours de frappe en fin de message → suggestions
  const mentionQuery = /(?:^|\s)@([^\s@]{0,20})$/.exec(text)?.[1];
  const suggestions = mentionQuery == null ? [] : people.filter((p) => fold(p.name).startsWith(fold(mentionQuery))).slice(0, 5);
  const pickMention = (p) => {
    setText(text.replace(/@([^\s@]{0,20})$/, `@${p.name} `));
    input.current?.focus();
  };

  const loadOlder = async () => {
    const oldest = list?.[0]?.created_at;
    if (!oldest) return;
    atBottom.current = false;
    const { data } = await supabase.from('chat_messages').select(FIELDS).lt('created_at', oldest)
      .order('created_at', { ascending: false }).limit(PAGE);
    const rows = data || [];
    setMore(rows.length === PAGE);
    setList((prev) => [...rows.filter((r) => !(prev || []).some((m) => m.id === r.id)), ...(prev || [])].sort(byDate));
    loadAuthors(rows);
  };

  const [recording, setRecording] = useState(false);
  // je signale que j'écris (au plus toutes les 2 secondes) ou que j'enregistre un vocal
  const lastPing = useRef(0);
  const ping = (kind) => {
    if (Date.now() - lastPing.current < 2000) return;
    lastPing.current = Date.now();
    chatChannel.current?.send({ type: 'broadcast', event: 'typing', payload: { from: currentUser.id, name: currentUser.name, kind } });
  };
  useEffect(() => {
    if (!recording) return undefined;
    ping('voice');
    const timer = setInterval(() => ping('voice'), 2000);
    return () => clearInterval(timer);
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps
  // voice : message vocal enregistré (voir lib/voice.js)
  const send = async (e, voice = null) => {
    e?.preventDefault();
    const body = voice ? '' : text.trim();
    if ((!body && !file && !voice) || sending) return;
    setSending(true);
    atBottom.current = true;
    try {
      const photo_url = file && !voice ? await uploadPhoto(currentUser.id, file) : null;
      const audio_path = voice ? await uploadVoice(currentUser.id, voice) : null;
      const lower = fold(body);
      const mentions = people.filter((p) => lower.includes(`@${fold(p.name)}`)).map((p) => p.id).slice(0, 5);
      const { data, error: err } = await supabase.from('chat_messages')
        .insert({ author_id: currentUser.id, body, photo_url, audio_path, audio_seconds: voice?.seconds ?? null, reply_to: replyTo?.id || null, mentions })
        .select(FIELDS).single();
      if (err) throw err;
      setError(null);
      if (!voice) { setText(''); setFile(null); }
      setReplyTo(null);
      setList((prev) => [...(prev || []).filter((m) => m.id !== data.id), data].sort(byDate));
    } catch (err) {
      setError(friendlyError(err));
    }
    setSending(false);
  };

  const remove = async (m) => {
    if (!window.confirm(t('Supprimer ce message ?'))) return;
    const { error: err } = await supabase.from('chat_messages').delete().eq('id', m.id);
    if (err) return setError(friendlyError(err));
    if (m.photo_url) deletePublicPhoto(m.photo_url).catch(() => {});
    if (m.audio_path && m.author_id === currentUser.id) deleteVoice(m.audio_path).catch(() => {});
    setList((prev) => (prev || []).filter((x) => x.id !== m.id));
  };

  const reply = (m) => {
    setReplyTo(m);
    input.current?.focus();
  };

  return (
    <div className="space-y-3 pb-32">
      <button onClick={() => back('discover')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold text-stone-800">💬 {t('Tchat général')}</h1>
          {online != null && online > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-200">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {t(online > 1 ? '{n} membres en ligne' : '{n} membre en ligne', { n: online })}
            </span>
          )}
        </div>
        <p className="text-sm text-stone-500">
          {t('Ouvert à tous les membres d’Cyclami. Reste bienveillant : pas de pub, pas de vente d’animaux, pas d’infos personnelles. Un message déplacé ? Signale-le avec le drapeau.')}
        </p>
      </div>

      {more && (
        <button className="mx-auto block text-sm font-semibold text-teal-600" onClick={loadOlder}>{t('Voir les messages plus anciens')}</button>
      )}
      {list === null && <p className="text-sm text-stone-400">{t('Chargement…')}</p>}
      {list?.length === 0 && !error && <p className="card text-sm text-stone-500">{t('Personne n’a encore écrit. Lance la conversation 👋')}</p>}

      <div className="space-y-2">
        {list?.map((m) => {
          const mine = m.author_id === currentUser.id;
          const u = known(m.author_id);
          const parent = m.reply_to && list.find((x) => x.id === m.reply_to);
          const mentionsMe = (m.mentions || []).includes(currentUser.id);
          const names = (m.mentions || []).map((id) => namesById[id] || known(id)?.name);
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              {!mine && (
                <button onClick={() => go('user', { userId: m.author_id })} aria-label={u?.name || t('Membre')}>
                  <UserAvatar user={u} size="sm" />
                </button>
              )}
              <div className={`min-w-0 max-w-[80%] space-y-1 rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-teal-500 text-white'
                : `bg-white text-stone-700 shadow-sm dark:bg-stone-800 dark:text-stone-100 ${mentionsMe ? 'ring-2 ring-teal-300' : ''}`}`}>
                {!mine && (
                  <button className="flex items-center text-xs font-semibold text-teal-600" onClick={() => go('user', { userId: m.author_id })}>
                    {u?.name || t('Membre')} <StaffBadge userId={m.author_id} />
                  </button>
                )}
                {m.reply_to && (
                  <div className={`rounded-lg border-l-4 px-2 py-1 text-xs ${mine ? 'border-teal-200 bg-teal-600/40 text-teal-50' : 'border-teal-300 bg-emerald-50 text-stone-500 dark:bg-stone-700 dark:text-stone-300'}`}>
                    {parent ? <><strong>{known(parent.author_id)?.name || t('Membre')}</strong> · {excerpt(parent)}</> : t('Réponse à un message plus ancien')}
                  </div>
                )}
                {m.photo_url && (
                  <a href={m.photo_url} target="_blank" rel="noreferrer">
                    <img src={m.photo_url} alt={t('Photo partagée dans le tchat')} loading="lazy" className="max-h-64 rounded-xl bg-emerald-100 object-contain" />
                  </a>
                )}
                {m.audio_path && <VoicePlayer path={m.audio_path} seconds={m.audio_seconds} mine={mine} />}
                <Body text={m.body} names={names} mine={mine} />
                <div className={`flex items-center gap-2 text-[11px] ${mine ? 'text-teal-100' : 'text-stone-400'}`}>
                  <span>{timeAgo(m.created_at)}</span>
                  {!m.hidden_at && (
                    <button onClick={() => reply(m)} aria-label={t('Répondre à ce message')} className={mine ? 'hover:text-white' : 'hover:text-teal-600'}>
                      <CornerUpLeft size={12} />
                    </button>
                  )}
                  {!mine && <ReportButton type="chat_message" id={m.id} userId={m.author_id} size={12} className="!p-0.5" />}
                  {(mine || isStaff) && (
                    <button onClick={() => remove(m)} aria-label={t('Supprimer ce message')} className={mine ? 'text-teal-100 hover:text-white' : 'hover:text-red-600'}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                {(m.hidden_at || (isStaff && !mine)) && <ModerationBar type="chat_message" id={m.id} hidden={!!m.hidden_at} isAuthor={mine} />}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form onSubmit={send}
        className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-2xl space-y-1.5 border-t border-emerald-100 bg-emerald-50/95 px-4 py-2 backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="listbox" aria-label={t('Mentionner un membre')}>
            {suggestions.map((p) => (
              <button key={p.id} type="button" role="option" aria-selected="false" onClick={() => pickMention(p)}
                className="chip bg-white text-stone-700 ring-emerald-200">@{p.name}</button>
            ))}
          </div>
        )}
        {typing.length > 0 && (
          <TypingBubble>
            {typing.length > 2 ? t('Plusieurs membres écrivent…')
              : typing.length === 2 ? t('{a} et {b} écrivent…', { a: typing[0].name, b: typing[1].name })
              : typing[0].voice ? t('{name} enregistre un message vocal…', { name: typing[0].name })
              : t('{name} est en train d’écrire…', { name: typing[0].name })}
          </TypingBubble>
        )}
        {replyTo && (
          <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-xs text-stone-500 ring-1 ring-emerald-100 dark:bg-stone-800">
            <CornerUpLeft size={12} className="shrink-0 text-teal-600" />
            <span className="min-w-0 flex-1 truncate">{t('Réponse à {name}', { name: known(replyTo.author_id)?.name || t('Membre') })} · {excerpt(replyTo)}</span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label={t('Annuler la réponse')}><X size={14} /></button>
          </div>
        )}
        {preview && (
          <div className="flex items-center gap-2 text-xs text-stone-500">
            <img src={preview} alt="" className="h-12 w-12 rounded-lg object-cover" />
            <button type="button" className="underline" onClick={() => setFile(null)}>{t('Retirer la photo')}</button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {!recording && (
            <>
              <label className="btn-ghost cursor-pointer px-3" aria-label={t('Ajouter une photo')} title={t('Ajouter une photo')}>
                <ImagePlus size={16} />
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = ''; }} />
              </label>
              <MessageInput ref={input} className="input py-2 text-sm" placeholder={t('Écrire… (@ pour mentionner)')} maxLength={500}
                value={text} onChange={(e) => { setText(e.target.value); if (e.target.value) ping('text'); }} aria-label={t('Ton message')} />
            </>
          )}
          {canRecord() && (recording || (!text.trim() && !file))
            ? <VoiceRecorder onSend={(voice) => send(null, voice)} onError={setError} onActive={setRecording} disabled={sending} />
            : <button className="btn-primary px-3" disabled={sending || (!text.trim() && !file)} aria-label={t('Envoyer')}><Send size={16} /></button>}
        </div>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
