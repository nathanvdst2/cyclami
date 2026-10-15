// Outils communs aux fonctions Netlify de Cyclami (netlify/functions/*).
// Ce dossier n'est pas dans netlify/functions : Netlify n'en fait pas une fonction à part,
// il est simplement inclus dans chaque fonction qui l'importe.
import { getStore } from '@netlify/blobs';

// Variables d'environnement (Netlify → Site configuration → Environment variables).
export const env = (name, fallback = '') => {
  const v = globalThis.Netlify?.env?.get?.(name) ?? process.env[name];
  return v == null || v === '' ? fallback : String(v);
};
export const siteUrl = () => env('SITE_URL', 'https://cyclami.netlify.app').replace(/\/+$/, '');
export const supabaseUrl = () => env('SUPABASE_URL', env('VITE_SUPABASE_URL')).replace(/\/+$/, '');
export const supabaseKey = () => env('SUPABASE_PUBLISHABLE_KEY', env('VITE_SUPABASE_PUBLISHABLE_KEY'));
// Clé Brevo sans espaces ni retour à la ligne parasites (copier-coller), comme dans la GitHub Action.
export const brevoKey = () => env('BREVO_API_KEY').replace(/\s+/g, '');

// Stockage Netlify Blobs (remplaçable dans les tests).
export const stores = {
  get: (name) => getStore({ name, consistency: 'strong' }),
};

export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
});

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Comparaison à durée constante (clés partagées).
export function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Clé partagée avec la base (private.settings.notify_secret) :
// sha256("cyclami-notify:" + BREVO_API_KEY) en hexadécimal, même calcul que la GitHub Action
// « Base de données Supabase ». NOTIFY_SECRET peut la remplacer si besoin.
export async function notifySecret() {
  if (env('NOTIFY_SECRET')) return env('NOTIFY_SECRET');
  const key = brevoKey();
  return key ? sha256Hex(`cyclami-notify:${key}`) : '';
}

export async function checkNotifySecret(req) {
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  return sameSecret(auth, await notifySecret());
}

// Le membre connecté (jeton Supabase) est-il administrateur ?
export async function isAdmin(req) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || !supabaseUrl()) return false;
  const res = await fetch(`${supabaseUrl()}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: supabaseKey(), 'Content-Type': 'application/json' },
    body: '{}',
  }).catch(() => null);
  return Boolean(res?.ok) && (await res.json().catch(() => false)) === true;
}

// ---- E-mails (Brevo) ----
const TEAL = '#0f766e';

export function emailHtml({ name, text, link, url, button, footer, hello: greeting, lang = 'fr' }) {
  const SITE = siteUrl();
  const L = { fr: 'fr', nl: 'nl', en: 'en' }[lang] || 'fr';
  const label = button || { fr: 'Ouvrir Cyclami', nl: 'Cyclami openen', en: 'Open Cyclami' }[L];
  const href = url || `${SITE}${link && link.startsWith('/') ? link : '/'}`;
  const hello = { fr: 'Bonjour', nl: 'Hallo', en: 'Hello' }[L];
  const foot = footer ?? {
    fr: 'Tu reçois cet e-mail car tu es membre de Cyclami. Pour ne plus recevoir ces e-mails : Profil → Notifications par e-mail sur',
    nl: 'Je ontvangt deze e-mail omdat je lid bent van Cyclami. Geen e-mails meer? Profiel → Meldingen per e-mail op',
    en: 'You’re receiving this email because you’re a Cyclami member. To stop these emails: Profile → Email notifications on',
  }[L];
  return `<!doctype html><html lang="${L}"><body style="margin:0;background:#ecfdf5;font-family:Arial,sans-serif;color:#1c2b27">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:${TEAL};padding:16px 24px;color:#ffffff;font-size:22px;font-weight:bold">🚴 Cyclami</td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 12px">${greeting ? escapeHtml(greeting) : `${hello}${name ? ` ${escapeHtml(name)}` : ''},`}</p>
      <p style="margin:0 0 20px;line-height:1.5">${escapeHtml(text).replace(/\n/g, '<br>')}</p>
      <a href="${escapeHtml(href)}" style="display:inline-block;background:${TEAL};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold">${escapeHtml(label)}</a>
    </td></tr>
    <tr><td style="padding:16px 24px;font-size:12px;color:#57706a;border-top:1px solid #a7f3d0">
      ${escapeHtml(foot)} <a href="${escapeHtml(SITE)}" style="color:${TEAL}">${escapeHtml(SITE.replace(/^https?:\/\//, ''))}</a>.
    </td></tr>
  </table></td></tr></table></body></html>`;
}

// Expéditeur : SENDER_EMAIL ; une autre adresse n'est acceptée que sur le même domaine (déjà authentifié chez Brevo).
export function senderFor(from) {
  const sender = env('SENDER_EMAIL');
  const domain = sender.split('@')[1];
  const ok = from && domain && /^[^@\s]+@[^@\s]+$/.test(from) && from.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
  return ok ? from : sender;
}

export const emailConfigured = () => Boolean(brevoKey() && env('SENDER_EMAIL'));

export function sendBrevo({ to, name, subject, html, text, tag, replyTo, from }) {
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': brevoKey(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderFor(from), name: env('SENDER_NAME', 'Cyclami') },
      to: [{ email: to, name: name || undefined }],
      subject: String(subject).slice(0, 200),
      htmlContent: html,
      textContent: text,
      tags: [tag],
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    }),
  });
}
