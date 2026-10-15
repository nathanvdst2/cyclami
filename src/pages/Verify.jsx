import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { VIRTUAL_CAMERA_RE, verifyAction } from '../data/verification.js';
import { t } from '../i18n/index.js';

const STEP_MS = 3500; // durée de chaque geste
const CODE_MS = 4500; // durée pour dire le code
const COUNTDOWN = 3;

// format vidéo accepté par le navigateur (WebM sur Android / ordinateur, MP4 sur iPhone)
function pickFormat() {
  const list = [['video/webm;codecs=vp9,opus', 'webm'], ['video/webm;codecs=vp8,opus', 'webm'], ['video/webm', 'webm'], ['video/mp4', 'mp4']];
  return list.find(([type]) => window.MediaRecorder?.isTypeSupported?.(type)) || ['', 'webm'];
}

// « Profil vérifié » : courte vidéo filmée en direct, gestes et code tirés au hasard par le serveur,
// contrôlée à la main par l'équipe puis supprimée. Pas d'envoi de fichier : seulement la caméra.
export default function Verify({ back }) {
  const { currentUser, actions } = useApp();
  const [latest, setLatest] = useState(undefined);
  const [step, setStep] = useState('intro'); // intro | camera | countdown | recording | review | sending | sent
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [phase, setPhase] = useState(null); // { index, count }
  const [video, setVideo] = useState(null); // { blob, url, ext, type }
  const videoEl = useRef(null);
  const stream = useRef(null);
  const recorder = useRef(null);
  const signals = useRef({});
  const timers = useRef([]);

  useEffect(() => { actions.verification.latest().then(setLatest).catch(() => setLatest(null)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const stopCamera = () => {
    timers.current.forEach(clearTimeout);
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  };
  useEffect(() => stopCamera, []);
  useEffect(() => () => video?.url && URL.revokeObjectURL(video.url), [video]);
  useEffect(() => {
    if (videoEl.current && stream.current && ['camera', 'countdown', 'recording'].includes(step)) videoEl.current.srcObject = stream.current;
  }, [step]);

  const openCamera = async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } }, audio: true });
      stream.current = s;
      const track = s.getVideoTracks()[0];
      const settings = track.getSettings?.() || {};
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      // indices pour l'équipe (aucune donnée biométrique) : nom de la caméra, caméra virtuelle ?
      signals.current = {
        camera: track.label || '', virtual_camera: VIRTUAL_CAMERA_RE.test(track.label || ''),
        cameras: devices.filter((d) => d.kind === 'videoinput').length,
        width: settings.width || null, height: settings.height || null, fps: settings.frameRate ? Math.round(settings.frameRate) : null,
        ua: navigator.userAgent.slice(0, 200), hidden_during_recording: 0,
      };
      setStep('camera');
    } catch {
      setError(t('Impossible d’ouvrir la caméra : autorise la caméra et le micro dans les réglages du navigateur.'));
    }
  };

  const record = async () => {
    setError(null);
    let ch;
    try { ch = await actions.verification.start(); } catch (e) { setError(e.message); return; }
    setChallenge(ch);
    setStep('countdown');
    for (let i = COUNTDOWN; i > 0; i--) {
      setPhase({ index: -1, count: i });
      await new Promise((r) => { timers.current.push(setTimeout(r, 1000)); });
    }
    const [type, ext] = pickFormat();
    const chunks = [];
    const rec = new window.MediaRecorder(stream.current, { ...(type && { mimeType: type }), videoBitsPerSecond: 1_200_000 });
    recorder.current = rec;
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const startedAt = Date.now();
    const onHidden = () => { if (document.visibilityState === 'hidden') signals.current.hidden_during_recording += 1; };
    document.addEventListener('visibilitychange', onHidden);
    rec.onstop = () => {
      document.removeEventListener('visibilitychange', onHidden);
      const base = (rec.mimeType || type || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: base });
      signals.current = { ...signals.current, duration_ms: Date.now() - startedAt, bytes: blob.size, mime: base };
      setVideo({ blob, url: URL.createObjectURL(blob), ext: base === 'video/mp4' ? 'mp4' : ext, type: base });
      stopCamera();
      setStep('review');
    };
    rec.start(500);
    setStep('recording');
    const steps = [...ch.actions, 'code'];
    let at = 0;
    steps.forEach((s, i) => {
      timers.current.push(setTimeout(() => setPhase({ index: i, count: null }), at));
      at += s === 'code' ? CODE_MS : STEP_MS;
    });
    timers.current.push(setTimeout(() => rec.state !== 'inactive' && rec.stop(), at));
  };

  const restart = () => { setVideo(null); setChallenge(null); setPhase(null); openCamera(); };
  const send = async () => {
    setStep('sending');
    const err = await actions.verification.submit(challenge.id, video, signals.current);
    if (err) { setError(err); setStep('review'); return; }
    setStep('sent');
  };

  const current = challenge && phase?.index >= 0 ? [...challenge.actions, 'code'][phase.index] : null;

  if (currentUser.verifiedAt) {
    return (
      <Shell back={back}>
        <section className="card space-y-2 text-center ring-2 ring-green-200">
          <ShieldCheck size={48} className="mx-auto text-green-600" />
          <p className="text-lg font-extrabold text-stone-800">{t('Ton profil est vérifié')}</p>
          <p className="text-sm text-stone-500">{t('Le badge « Profil vérifié » est visible sur ton profil. La vidéo a été supprimée.')}</p>
        </section>
      </Shell>
    );
  }
  if (step === 'sent' || latest?.status === 'submitted') {
    return (
      <Shell back={back}>
        <section className="card space-y-2 text-center">
          <div className="text-5xl">⏳</div>
          <p className="text-lg font-extrabold text-stone-800">{t('Vidéo envoyée, merci !')}</p>
          <p className="text-sm text-stone-500">{t('L’équipe la regarde rapidement (en général sous 48 h). Tu reçois une notification dès la décision, puis la vidéo est supprimée.')}</p>
        </section>
      </Shell>
    );
  }

  return (
    <Shell back={back}>
      {latest?.status === 'rejected' && step === 'intro' && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {latest.reason ? t('Dernière vérification refusée : {reason}. Tu peux réessayer.', { reason: latest.reason }) : t('Dernière vérification refusée. Tu peux réessayer.')}
        </p>
      )}
      {step === 'intro' && (
        <section className="card space-y-3">
          <p className="text-sm text-stone-600">{t('Le badge « Profil vérifié » montre aux autres membres qu’une vraie personne se cache derrière ton profil. Ça rassure avant une première sortie ensemble.')}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
            <li>{t('Tu te filmes une quinzaine de secondes avec la caméra de ton téléphone, dans l’appli.')}</li>
            <li>{t('Des gestes et un code, tirés au hasard au moment même, s’affichent : fais les gestes et dis le code à voix haute.')}</li>
            <li>{t('Une personne de l’équipe regarde la vidéo et la compare à ton profil. Aucune reconnaissance faciale automatique.')}</li>
          </ol>
          <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            🔒 {t('Ta vidéo est privée : seule l’administration peut la voir. Elle est supprimée dès la décision. Aucune pièce d’identité n’est demandée. Facultatif : tu peux utiliser Cyclami sans être vérifié.')}
          </div>
          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" className="mt-0.5 accent-teal-500" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            {t('J’accepte que ma vidéo soit enregistrée et regardée par l’équipe de Cyclami pour vérifier mon profil, puis supprimée.')}
          </label>
          <button className="btn-primary w-full" disabled={!consent} onClick={openCamera}><Camera size={16} /> {t('Ouvrir la caméra')}</button>
        </section>
      )}

      {['camera', 'countdown', 'recording'].includes(step) && (
        <section className="card space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={videoEl} autoPlay muted playsInline className="aspect-[3/4] w-full -scale-x-100 object-cover" />
            {step === 'countdown' && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-8xl font-extrabold text-white">{phase?.count}</div>
            )}
            {step === 'recording' && (
              <>
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
                </span>
                {current && (
                  <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/95 px-4 py-3 text-center shadow-lg">
                    {current === 'code' ? (
                      <>
                        <div className="text-sm font-semibold text-stone-600">{t('Dis à voix haute :')}</div>
                        <div className="font-mono text-4xl font-extrabold tracking-[0.3em] text-teal-600">{challenge.code}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-4xl">{verifyAction(current).emoji}</div>
                        <div className="text-lg font-extrabold text-stone-800">{verifyAction(current).label}</div>
                      </>
                    )}
                    <div className="mt-1 text-xs text-stone-400">{phase.index + 1} / {challenge.actions.length + 1}</div>
                  </div>
                )}
              </>
            )}
          </div>
          {step === 'camera' && (
            <>
              <p className="text-sm text-stone-600">{t('Place ton visage dans le cadre, bien éclairé, sans lunettes de soleil. Les consignes apparaissent pendant l’enregistrement.')}</p>
              <button className="btn-primary w-full" onClick={record}>⏺ {t('Commencer l’enregistrement')}</button>
            </>
          )}
        </section>
      )}

      {(step === 'review' || step === 'sending') && video && (
        <section className="card space-y-3">
          <video src={video.url} controls playsInline className="aspect-[3/4] w-full rounded-2xl bg-black object-cover" />
          <p className="text-sm text-stone-600">{t('Vérifie que ton visage, les gestes et le code s’entendent bien.')}</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={send} disabled={step === 'sending'}>
              <Send size={16} /> {step === 'sending' ? t('Envoi…') : t('Envoyer à l’équipe')}
            </button>
            <button className="btn-ghost" onClick={restart} disabled={step === 'sending'}><RotateCcw size={16} /> {t('Recommencer')}</button>
          </div>
        </section>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Shell>
  );
}

function Shell({ back, children }) {
  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('profile')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-stone-800"><ShieldCheck className="text-green-600" /> {t('Faire vérifier mon profil')}</h1>
      {children}
    </div>
  );
}
