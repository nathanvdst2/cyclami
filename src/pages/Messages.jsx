import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Send, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { supabase } from '../lib/supabase.js';
import { MAX_INPUT_BYTES } from '../utils/image.js';
import { timeAgo } from '../utils/geo.js';
import UserAvatar from '../components/UserAvatar.jsx';
import UserActions from '../components/UserActions.jsx';
import StaffBadge from '../components/StaffBadge.jsx';
import { locale, t } from '../i18n/index.js';
import Presence, { OnlineDot } from '../components/Presence.jsx';
import { EmptyState } from '../components/Illustration.jsx';
import { VoicePlayer, VoiceRecorder } from '../components/Voice.jsx';
import { canRecord } from '../lib/voice.js';
import { ReadTicks, TypingBubble } from '../components/Typing.jsx';
import VerifiedBadge from '../components/VerifiedBadge.jsx';

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🚴'];
import { useDraft } from '../lib/persist.js';
import MessageInput from '../components/MessageInput.jsx';

// Séparateur de jour dans une conversation : « Aujourd’hui », « Hier » ou la date complète.
function dayLabel(at) {
  const d = new Date(at);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return t('Aujourd’hui');
  if (d.toDateString() === yesterday.toDateString()) return t('Hier');
  return d.toLocaleDateString(locale(), {
    weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' }),
  });
}

export default function Messages({ go, params }) {
  const { getUser, blockedIds, actions, currentUser } = useApp();
  const other = params.userId ? getUser(params.userId) : null;

  if (other && !blockedIds.has(other.id)) {
    return <Conversation key={other.id} other={other} draft={params.draft} go={go} />;
  }

  const conversations = actions.listConversations();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-stone-800">{t('Messages')}</h1>
      <button onClick={() => go('chat')} className="card flex w-full items-center gap-3 text-left ring-2 ring-teal-100 hover:ring-teal-200">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-100 text-2xl">💬</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-stone-800">{t('Tchat général')}</span>
          <span className="block truncate text-sm text-stone-500">{t('Discute avec tous les membres d’Cyclami')}</span>
        </span>
      </button>
      {conversations.length === 0 && (
        <EmptyState name="messages-vide">
          {t('Pas encore de conversation.')}{' '}
          <button className="font-semibold text-teal-600" onClick={() => go('discover')}>
            {t('Trouve un compagnon de sortie')}
          </button>
        </EmptyState>
      )}
      <div className="space-y-2">
        {conversations.map(({ otherId, last, unread }) => {
          const u = getUser(otherId);
          if (!u) return null;
          return (
            <button key={otherId} onClick={() => go('messages', { userId: otherId })}
              className="card flex w-full items-center gap-3 text-left hover:ring-teal-200">
              <span className="relative shrink-0"><UserAvatar user={u} size="md" /><OnlineDot lastSeen={u.lastSeen} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex justify-between">
                  <span className={`text-stone-800 ${unread ? 'font-extrabold' : 'font-bold'}`}>{u.name}<StaffBadge userId={u.id} /></span>
                  <span className="text-xs text-stone-400">{timeAgo(last.at)}</span>
                </span>
                <span className={`flex items-center gap-1 text-sm ${unread ? 'font-semibold text-stone-800' : 'text-stone-500'}`}>
                  {last.from === currentUser.id && <ReadTicks read={last.read} className={`shrink-0 ${last.read ? 'text-teal-600' : 'text-stone-400'}`} />}
                  <span className="truncate">{last.text}</span>
                </span>
              </span>
              {unread > 0 && <span className="rounded-full bg-red-500 px-2 text-xs font-bold text-white">{unread}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// « Lu aujourd’hui à 17:01 », « Lu hier à 22:10 », « Lu le 12/10 à 09:30 »
function readLabel(at) {
  const d = new Date(at);
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d >= today) return t('Lu aujourd’hui à {time}', { time });
  if (d >= new Date(today.getTime() - 86400000)) return t('Lu hier à {time}', { time });
  const date = d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' }) });
  return t('Lu le {date} à {time}', { date, time });
}

function Conversation({ other, draft, go }) {
  const { currentUser, actions } = useApp();
  const [text, setText] = useDraft(`message:${other.id}`, draft || '');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const messages = actions.getConversation(other.id);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) return setError(t('Image trop lourde (25 Mo maximum).'));
    setError(null);
    setPhotoFile(file);
    setPreview(URL.createObjectURL(file));
  };
  const clearPhoto = () => { setPhotoFile(null); setPreview(null); };
  const endRef = useRef(null);
  const [recording, setRecording] = useState(false);

  // réactions : appui long (téléphone) ou clic droit pour choisir, double-clic pour ❤️
  const [picker, setPicker] = useState(null);
  const pressTimer = useRef(null);
  const pressHandlers = (id) => ({
    onTouchStart: () => { clearTimeout(pressTimer.current); pressTimer.current = setTimeout(() => setPicker(id), 450); },
    onTouchEnd: () => clearTimeout(pressTimer.current),
    onTouchMove: () => clearTimeout(pressTimer.current),
  });
  useEffect(() => {
    if (!picker) return undefined;
    const close = (e) => { if (!e.target.closest?.('[data-reactions]')) setPicker(null); };
    const timer = setTimeout(() => document.addEventListener('pointerdown', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('pointerdown', close); };
  }, [picker]);
  const react = async (id, emoji) => {
    setPicker(null);
    const err = await actions.reactMessage(id, emoji);
    if (err) setError(err);
  };

  // « … est en train d'écrire » : simple signal temps réel, rien n'est enregistré.
  const [otherTyping, setOtherTyping] = useState(false);
  const typingChannel = useRef(null);
  // statut en ligne de l'autre membre, mis à jour chaque minute
  const [lastSeen, setLastSeen] = useState(other.lastSeen);
  const [, setTick] = useState(0);
  useEffect(() => {
    const load = () => { actions.lastSeenOf(other.id).then(setLastSeen).catch(() => {}); setTick((n) => n + 1); };
    const timer = setInterval(load, 60_000);
    load();
    return () => clearInterval(timer);
  }, [other.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastTypingSent = useRef(0);
  useEffect(() => {
    const room = [currentUser.id, other.id].sort().join(':');
    let hideTimer;
    const channel = supabase.channel(`typing:${room}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.from !== other.id) return;
        setOtherTyping(payload.kind === 'voice' ? 'voice' : 'text');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setOtherTyping(false), 3500);
      })
      .subscribe();
    typingChannel.current = channel;
    return () => { clearTimeout(hideTimer); supabase.removeChannel(channel); };
  }, [currentUser.id, other.id]);

  // pendant un enregistrement vocal, l'autre voit « enregistre un message vocal… »
  useEffect(() => {
    if (!recording) return undefined;
    const ping = () => typingChannel.current?.send({ type: 'broadcast', event: 'typing', payload: { from: currentUser.id, kind: 'voice' } });
    ping();
    const timer = setInterval(ping, 2000);
    return () => clearInterval(timer);
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps
  // le message est arrivé : plus d'indicateur
  useEffect(() => { setOtherTyping(false); }, [messages.length]);

  const onType = (value) => {
    setText(value);
    if (value && Date.now() - lastTypingSent.current > 2000) {
      lastTypingSent.current = Date.now();
      typingChannel.current?.send({ type: 'broadcast', event: 'typing', payload: { from: currentUser.id } });
    }
  };

  // Mon dernier message lu par l'autre → « Vu »
  const lastMine = [...messages].reverse().find((m) => m.from === currentUser.id);
  const lastIsMine = messages.length > 0 && messages[messages.length - 1].from === currentUser.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    actions.markRead(other.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    if ((!text.trim() && !photoFile) || sending) return;
    setSending(true);
    const err = await actions.sendMessage(other.id, text.trim(), photoFile);
    setSending(false);
    if (err) setError((err === 'Action non autorisée.' || err === t('Action non autorisée.')) ? t('Impossible d’envoyer un message à ce membre.') : err);
    else { setText(''); setError(null); clearPhoto(); }
  };
  const sendVoice = async (voice) => {
    setSending(true);
    const err = await actions.sendMessage(other.id, '', null, voice);
    setSending(false);
    setError(err || null);
  };
  const showMic = canRecord() && (recording || (!text.trim() && !photoFile));

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-emerald-100 pb-3">
        <button onClick={() => go('messages')} aria-label={t('Retour')}><ArrowLeft size={20} /></button>
        <button className="flex flex-1 items-center gap-3 text-left" onClick={() => go('user', { userId: other.id })}>
          <span className="relative shrink-0"><UserAvatar user={other} size="md" className="!h-10 !w-10" /><OnlineDot lastSeen={lastSeen} /></span>
          <span>
            <span className="block font-bold text-stone-800">{other.name}<VerifiedBadge user={other} compact /><StaffBadge userId={other.id} /></span>
            {otherTyping
              ? <span className="block text-xs font-semibold text-teal-600">{otherTyping === 'voice' ? t('enregistre un vocal…') : t('écrit…')}</span>
              : lastSeen
              ? <Presence lastSeen={lastSeen} className="block" />
              : <span className="block text-xs text-stone-500">{t('avec {pets} · voir le profil', { pets: other.pets.map((p) => p.name).join(', ') })}</span>}
          </span>
        </button>
        <UserActions user={other} conversation onBlocked={() => go('messages')} />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-4">
        {messages.length === 0 && (
          <div className="space-y-2 text-center text-sm text-stone-400">
            <p>{t('Dis bonjour à {name} et propose une sortie', { name: other.name })} 🚴</p>
            <p className="text-xs">
              🛡️ {t('Premier rendez-vous dans un lieu public, et ne partage pas ton adresse.')}{' '}
              <button className="underline" onClick={() => go('legal', { doc: 'safety', back: 'messages' })}>{t('Conseils')}</button>
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.from === currentUser.id;
          const day = new Date(m.at).toDateString();
          const newDay = i === 0 || new Date(messages[i - 1].at).toDateString() !== day;
          return (
            <Fragment key={m.id}>
            {newDay && (
              <div className="py-1 text-center">
                <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-stone-600">{dayLabel(m.at)}</span>
              </div>
            )}
            <div className={`flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>
              {!mine && <UserAvatar user={other} size="sm" />}
              <div className={`relative max-w-[75%] ${(m.myReaction || m.theirReaction) ? 'mb-3' : ''}`}>
              {picker === m.id && (
                <div data-reactions className={`absolute bottom-full z-10 mb-1 flex gap-1 rounded-full bg-white px-2 py-1 shadow-lg ring-1 ring-emerald-200 ${mine ? 'right-0' : 'left-0'}`}>
                  {REACTIONS.map((e) => (
                    <button key={e} type="button" onClick={() => react(m.id, e)} aria-label={t('Réagir {emoji}', { emoji: e })}
                      className={`rounded-full px-1 text-xl transition hover:scale-125 ${m.myReaction === e ? 'bg-teal-100' : ''}`}>{e}</button>
                  ))}
                </div>
              )}
              <div className={`select-none whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm [-webkit-touch-callout:none] ${mine ? 'rounded-br-sm bg-teal-500 text-white' : 'rounded-bl-sm bg-white text-stone-700 ring-1 ring-emerald-100'}`}
                title={new Date(m.at).toLocaleString(locale())} {...pressHandlers(m.id)}
                onDoubleClick={() => react(m.id, '❤️')} onContextMenu={(e) => { e.preventDefault(); setPicker(m.id); }}>
                {m.photoUrl ? (
                  <a href={m.photoUrl} target="_blank" rel="noreferrer">
                    <img src={m.photoUrl} alt={t('Photo')} loading="lazy" className={`max-h-64 rounded-xl bg-emerald-100 object-contain ${m.text ? 'mb-1' : ''}`} />
                  </a>
                ) : m.hasPhoto && <div className="mb-1 h-32 w-40 animate-pulse rounded-xl bg-black/10" />}
                {m.audioPath && (
                  <VoicePlayer path={m.audioPath} seconds={m.audioSeconds} mine={mine}
                    status={mine ? (m.audioPlayedAt ? 'played' : 'sent') : m.audioPlayedAt ? null : 'new'}
                    onPlay={() => !mine && !m.audioPlayedAt && actions.markVoicePlayed(m.id)} />
                )}
                {m.text}
                <span className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-teal-100' : 'text-stone-400'}`}>
                  {new Date(m.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
                  {mine && <ReadTicks read={!!m.readAt} className={m.readAt ? 'text-white' : ''} />}
                </span>
              </div>
              {(m.myReaction || m.theirReaction) && (
                <button type="button" onClick={() => setPicker(m.id)}
                  className={`absolute -bottom-3 flex gap-0.5 rounded-full bg-white px-1.5 py-px text-sm shadow ring-1 ring-emerald-200 ${mine ? 'left-1' : 'right-1'}`}
                  aria-label={t('Réactions')}>
                  {[...new Set([m.theirReaction, m.myReaction].filter(Boolean))].map((e) => <span key={e}>{e}</span>)}
                  {m.myReaction && m.theirReaction && m.myReaction === m.theirReaction && <span className="text-[10px] text-stone-500">2</span>}
                </button>
              )}
              </div>
            </div>
            </Fragment>
          );
        })}
        {lastIsMine && lastMine?.readAt && (
          <p className="flex items-center justify-end gap-1 pr-1 text-xs font-semibold text-teal-600 dark:text-teal-400">
            <ReadTicks read /><span>{readLabel(lastMine.readAt)}</span>
          </p>
        )}
        {otherTyping && (
          <TypingBubble>
            {otherTyping === 'voice'
              ? t('{name} enregistre un message vocal…', { name: other.name })
              : t('{name} est en train d’écrire…', { name: other.name })}
          </TypingBubble>
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="pb-1 text-sm text-red-600">{error}</p>}
      {preview && (
        <div className="relative w-fit">
          <img src={preview} alt={t('Aperçu')} className="h-24 rounded-xl bg-emerald-100 object-contain" />
          <button type="button" onClick={clearPhoto} className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow" aria-label={t('Retirer la photo')}>
            <X size={14} />
          </button>
        </div>
      )}
      <form onSubmit={send} className="flex items-end gap-2 pt-2">
        {!recording && (
          <>
            <label className="btn-ghost cursor-pointer px-3" aria-label={t('Envoyer une photo')}>
              <Camera size={18} />
              <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            </label>
            <MessageInput className="input" placeholder={t('Ton message…')} maxLength={2000} value={text} onChange={(e) => onType(e.target.value)} autoFocus aria-label={t('Ton message…')} />
          </>
        )}
        {showMic
          ? <VoiceRecorder onSend={sendVoice} onError={setError} onActive={setRecording} disabled={sending} />
          : <button className="btn-primary" disabled={sending || (!text.trim() && !photoFile)} aria-label={t('Envoyer')}><Send size={18} /></button>}
      </form>
    </div>
  );
}
