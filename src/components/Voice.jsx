import { useEffect, useRef, useState } from 'react';
import { Headphones, Mic, Pause, Play, Send, Trash2 } from 'lucide-react';
import { VOICE_MAX_SECONDS, canRecord, duration, startRecording, voiceUrl } from '../lib/voice.js';
import { t } from '../i18n/index.js';

// Lecteur d'un message vocal : lecture / pause, barre d'avancement et durée.
// status (messages privés) : 'played' (écouté par le destinataire), 'sent' (pas encore), 'new' (reçu, pas encore écouté).
// onPlay : appelé à la première écoute.
export function VoicePlayer({ path, seconds, mine, status = null, onPlay }) {
  const audio = useRef(null);
  const [state, setState] = useState('idle'); // idle | loading | playing | paused | error
  const [pos, setPos] = useState(0);

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = async () => {
    if (state === 'playing') { audio.current.pause(); return; }
    try {
      if (!audio.current) {
        setState('loading');
        const a = new Audio(await voiceUrl(path));
        a.ontimeupdate = () => setPos(a.currentTime);
        a.onplay = () => { setState('playing'); onPlay?.(); };
        a.onpause = () => setState('paused');
        a.onended = () => { setState('idle'); setPos(0); };
        a.onerror = () => setState('error');
        audio.current = a;
      }
      await audio.current.play();
    } catch {
      setState('error');
    }
  };

  const total = seconds || 1;
  const pct = Math.min(100, (pos / total) * 100);
  return (
    <div className="flex min-w-[11rem] items-center gap-2 py-0.5">
      <button type="button" onClick={toggle} disabled={state === 'loading'}
        aria-label={state === 'playing' ? t('Pause') : t('Écouter le message vocal')}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-white text-teal-600' : 'bg-teal-500 text-white'} ${state === 'loading' ? 'animate-pulse' : ''}`}>
        {state === 'playing' ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <span className="flex-1">
        <span className={`block h-1.5 overflow-hidden rounded-full ${mine ? 'bg-teal-300' : 'bg-emerald-100'}`}>
          <span className={`block h-full rounded-full ${mine ? 'bg-white' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
        </span>
        <span className={`mt-1 flex items-center gap-1.5 text-[11px] ${mine ? 'text-teal-50' : 'text-stone-500'}`}>
          {state === 'error' ? t('Lecture impossible') : `🎤 ${duration(state === 'idle' ? total : pos)}`}
          {status === 'played' && (
            <span className="flex items-center gap-0.5 font-bold text-white"><Headphones size={12} strokeWidth={2.75} /> {t('Écouté')}</span>
          )}
          {status === 'sent' && <span className="opacity-80">· {t('Pas encore écouté')}</span>}
          {status === 'new' && (
            <span className="flex items-center gap-1 font-bold text-teal-600">
              <span className="h-2 w-2 rounded-full bg-teal-500" aria-hidden="true" /> {t('Nouveau')}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

// Bouton micro : un appui pour enregistrer (2 minutes au plus), puis « envoyer » ou la corbeille.
// Pendant l'enregistrement, la barre prend toute la largeur (onActive prévient la page).
export function VoiceRecorder({ onSend, onError, onActive, disabled }) {
  const rec = useRef(null);
  const [elapsed, setElapsed] = useState(null); // null : pas d'enregistrement
  const [sending, setSending] = useState(false);

  useEffect(() => () => rec.current?.cancel(), []);
  useEffect(() => {
    if (elapsed === null) return undefined;
    const id = setInterval(() => {
      // l'enregistrement peut déjà être arrêté (envoi en cours) : l'intervalle s'arrête au prochain rendu
      if (!rec.current) return;
      const s = Math.floor((Date.now() - rec.current.started) / 1000);
      setElapsed(s);
      if (s >= VOICE_MAX_SECONDS) finish();
    }, 250);
    return () => clearInterval(id);
  }, [elapsed === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canRecord()) return null;

  const start = async () => {
    try {
      rec.current = await startRecording();
      setElapsed(0);
      onActive?.(true);
    } catch {
      onError?.(t('Impossible d’utiliser le micro : autorise-le dans les réglages du navigateur.'));
    }
  };
  const stopUi = () => { setElapsed(null); onActive?.(false); };
  const cancel = () => { rec.current?.cancel(); rec.current = null; stopUi(); };
  async function finish() {
    if (!rec.current || sending) return;
    const r = rec.current;
    rec.current = null;
    setSending(true);
    const voice = await r.stop();
    stopUi();
    if (voice.blob.size > 0 && (Date.now() - r.started) >= 800) await onSend(voice);
    setSending(false);
  }

  if (elapsed === null) {
    return (
      <button type="button" className="btn-ghost px-3" onClick={start} disabled={disabled || sending}
        aria-label={t('Enregistrer un message vocal')} title={t('Enregistrer un message vocal')}>
        <Mic size={18} className={sending ? 'animate-pulse' : ''} />
      </button>
    );
  }
  return (
    <div className="flex flex-1 items-center gap-2" role="status" aria-live="polite">
      <button type="button" className="btn-ghost px-3 text-red-600" onClick={cancel} aria-label={t('Annuler l’enregistrement')}>
        <Trash2 size={18} />
      </button>
      <span className="flex flex-1 items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
        {t('Enregistrement vocal…')} {duration(elapsed)}
        <span className="ml-auto text-xs font-normal text-red-500">{duration(VOICE_MAX_SECONDS)}</span>
      </span>
      <button type="button" className="btn-primary" onClick={finish} aria-label={t('Envoyer le message vocal')}>
        <Send size={18} />
      </button>
    </div>
  );
}
