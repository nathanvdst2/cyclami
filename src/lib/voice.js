// Messages vocaux : enregistrement avec le micro du téléphone, envoi dans le stockage privé « voice-notes »
// (messages privés et tchat général), lecture via un lien temporaire.
import { supabase } from './supabase.js';

export const VOICE_BUCKET = 'voice-notes';
export const VOICE_MAX_SECONDS = 120;

// Format accepté par le navigateur : Opus en WebM (Chrome, Firefox, Android), sinon AAC en MP4 (iPhone).
const FORMATS = [['audio/webm;codecs=opus', 'webm'], ['audio/webm', 'webm'], ['audio/mp4', 'm4a'], ['audio/ogg;codecs=opus', 'ogg']];

export const canRecord = () => typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia;

function pickFormat() {
  const found = FORMATS.find(([type]) => window.MediaRecorder.isTypeSupported?.(type));
  return found || ['', 'webm'];
}

// Démarre l'enregistrement. Renvoie { stop(): Promise<{ blob, seconds, ext, type }>, cancel() }.
export async function startRecording() {
  // haute qualité : 48 kHz, sans le filtre anti-bruit ni l'annulation d'écho (inutile pendant un enregistrement)
  // qui étouffent la voix ; le volume reste réglé automatiquement
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { sampleRate: 48000, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
  });
  const [type, ext] = pickFormat();
  // 128 kb/s : qualité proche d'un enregistrement studio pour la voix (2 minutes ≈ 2 Mo)
  const recorder = new window.MediaRecorder(stream, { ...(type && { mimeType: type }), audioBitsPerSecond: 128000 });
  const chunks = [];
  const started = Date.now();
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  recorder.start(250);
  const release = () => stream.getTracks().forEach((track) => track.stop());
  let done = null;
  return {
    started,
    stop: () => {
      if (!done) {
        done = new Promise((resolve) => {
          recorder.onstop = () => {
            release();
            const base = (recorder.mimeType || type || 'audio/webm').split(';')[0];
            const seconds = Math.min(VOICE_MAX_SECONDS, Math.max(1, Math.round((Date.now() - started) / 1000)));
            resolve({ blob: new Blob(chunks, { type: base }), seconds, ext: base === 'audio/mp4' ? 'm4a' : ext, type: base });
          };
          if (recorder.state !== 'inactive') recorder.stop(); else recorder.onstop();
        });
      }
      return done;
    },
    cancel: () => {
      recorder.onstop = release;
      if (recorder.state !== 'inactive') recorder.stop(); else release();
    },
  };
}

// Envoie le vocal dans le dossier du membre ; renvoie son chemin.
export async function uploadVoice(userId, { blob, ext, type }) {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(VOICE_BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) throw error;
  return path;
}

// Lien d'écoute (valable 1 h), gardé en mémoire.
const links = new Map();
export async function voiceUrl(path) {
  const cached = links.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(VOICE_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  links.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60000 });
  return data.signedUrl;
}

export const deleteVoice = (path) => supabase.storage.from(VOICE_BUCKET).remove([path]);

export const duration = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
