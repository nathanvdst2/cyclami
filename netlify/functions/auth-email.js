// POST /api/auth-email — e-mails de connexion aux couleurs de Cyclami (FR / NL / EN), envoyés via Brevo.
// Facultatif : « Send Email Hook » de Supabase (Authentication → Hooks). Sans lui, Supabase envoie
// ses propres e-mails (par le SMTP Brevo configuré dans Authentication → Emails → SMTP Settings).
// Supabase signe chaque appel (norme Standard Webhooks) avec le secret SUPABASE_AUTH_HOOK_SECRET (« v1,whsec_… »).
import { emailConfigured, emailHtml, env, json, sameSecret, sendBrevo, siteUrl, supabaseUrl } from '../lib/shared.js';

export const AUTH_TEXT = {
  fr: {
    signup: ['Confirme ton adresse e-mail', 'Bienvenue sur Cyclami ! Clique sur le bouton pour confirmer ton adresse e-mail et activer ton compte. Ensuite, place aux sorties à vélo avec des cyclistes de ton niveau.', 'Confirmer mon adresse'],
    recovery: ['Choisis un nouveau mot de passe', 'Tu as demandé à changer ton mot de passe. Clique sur le bouton pour en choisir un nouveau. Si ce n’est pas toi, ignore simplement cet e-mail.', 'Changer mon mot de passe'],
    magiclink: ['Ton lien de connexion', 'Clique sur le bouton pour te connecter à Cyclami.', 'Me connecter'],
    invite: ['Tu es invité sur Cyclami', 'On t’invite à rejoindre Cyclami, le site pour trouver des cyclistes de ton niveau près de chez toi et rouler ensemble. Clique sur le bouton pour créer ton compte.', 'Rejoindre Cyclami'],
    email_change: ['Confirme ta nouvelle adresse e-mail', 'Clique sur le bouton pour confirmer le changement d’adresse e-mail de ton compte Cyclami. Si ce n’est pas toi, ignore cet e-mail.', 'Confirmer le changement'],
    reauthentication: ['Ton code de confirmation', 'Voici ton code de confirmation Cyclami : {code}', 'Ouvrir Cyclami'],
    footer: 'E-mail envoyé automatiquement par Cyclami —',
    code: 'Code',
  },
  nl: {
    signup: ['Bevestig je e-mailadres', 'Welkom bij Cyclami! Klik op de knop om je e-mailadres te bevestigen en je account te activeren. Daarna kun je fietsen met fietsers van jouw niveau.', 'Mijn adres bevestigen'],
    recovery: ['Kies een nieuw wachtwoord', 'Je hebt gevraagd om je wachtwoord te wijzigen. Klik op de knop om een nieuw wachtwoord te kiezen. Was jij dit niet? Negeer dan deze e-mail.', 'Wachtwoord wijzigen'],
    magiclink: ['Je inloglink', 'Klik op de knop om in te loggen op Cyclami.', 'Inloggen'],
    invite: ['Je bent uitgenodigd op Cyclami', 'Je bent uitgenodigd om lid te worden van Cyclami, de site om fietsers van jouw niveau in de buurt te vinden en samen te rijden. Klik op de knop om je account aan te maken.', 'Lid worden'],
    email_change: ['Bevestig je nieuwe e-mailadres', 'Klik op de knop om de wijziging van het e-mailadres van je Cyclami-account te bevestigen. Was jij dit niet? Negeer dan deze e-mail.', 'Wijziging bevestigen'],
    reauthentication: ['Je bevestigingscode', 'Hier is je Cyclami-bevestigingscode: {code}', 'Cyclami openen'],
    footer: 'Automatisch verzonden door Cyclami —',
    code: 'Code',
  },
  en: {
    signup: ['Confirm your email address', 'Welcome to Cyclami! Click the button to confirm your email address and activate your account. Then get out riding with cyclists at your level.', 'Confirm my address'],
    recovery: ['Choose a new password', 'You asked to change your password. Click the button to choose a new one. If this wasn’t you, simply ignore this email.', 'Change my password'],
    magiclink: ['Your sign-in link', 'Click the button to sign in to Cyclami.', 'Sign in'],
    invite: ['You’re invited to Cyclami', 'You’ve been invited to join Cyclami, the site for finding cyclists at your level nearby and riding together. Click the button to create your account.', 'Join Cyclami'],
    email_change: ['Confirm your new email address', 'Click the button to confirm the email address change for your Cyclami account. If this wasn’t you, ignore this email.', 'Confirm the change'],
    reauthentication: ['Your confirmation code', 'Here is your Cyclami confirmation code: {code}', 'Open Cyclami'],
    footer: 'Sent automatically by Cyclami —',
    code: 'Code',
  },
};

const b64decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64encode = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function verifyStandardWebhook(req, body, secret) {
  const id = req.headers.get('webhook-id');
  const timestamp = req.headers.get('webhook-timestamp');
  const signatures = req.headers.get('webhook-signature') || '';
  if (!id || !timestamp || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // 5 minutes max
  let raw;
  try { raw = b64decode(secret.trim().replace(/^v1,/, '').replace(/^whsec_/, '')); } catch { return false; }
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = b64encode(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return signatures.split(' ').some((s) => sameSecret(s.split(',')[1] || '', expected));
}

export default async (req) => {
  const fail = (status, message) => json({ error: { http_code: status, message } }, status);
  if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
  const body = await req.text();
  if (!(await verifyStandardWebhook(req, body, env('SUPABASE_AUTH_HOOK_SECRET')))) return fail(401, 'Signature invalide');
  if (!emailConfigured()) return fail(503, 'Envoi d’e-mails non configuré');
  let payload;
  try { payload = JSON.parse(body); } catch { return fail(400, 'Requête illisible'); }
  const { user, email_data: d } = payload || {};
  const type = d?.email_action_type;
  const lang = ['nl', 'en'].includes(user?.user_metadata?.lang) ? user.user_metadata.lang : 'fr';
  const t = AUTH_TEXT[lang];
  const kind = { email: 'magiclink', email_change_current: 'email_change', email_change_new: 'email_change' }[type] || type;
  if (!t[kind] || !Array.isArray(t[kind])) return fail(400, `Type d’e-mail inconnu : ${type}`);
  const name = user?.user_metadata?.name || '';
  const site = d.site_url || siteUrl();
  const link = (hash) => `${supabaseUrl()}/auth/v1/verify?token=${encodeURIComponent(hash)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(d.redirect_to || site)}`;

  // Changement d'adresse sécurisé : un e-mail à l'ancienne adresse (token_hash_new) et un à la nouvelle (token_hash).
  const messages = [];
  if (kind === 'email_change') {
    if (d.token_hash_new && user.email) messages.push({ to: user.email, hash: d.token_hash_new, code: d.token_new });
    messages.push({ to: user.new_email || user.email, hash: d.token_hash, code: d.token });
  } else {
    messages.push({ to: user.email, hash: d.token_hash, code: d.token });
  }

  for (const m of messages) {
    const [subject, rawText, button] = t[kind];
    const text = rawText.replace('{code}', m.code || '');
    const url = kind === 'reauthentication' ? site : link(m.hash);
    const res = await sendBrevo({
      to: m.to, name, subject,
      html: emailHtml({ name, text, url, button, lang, footer: t.footer }),
      text: `${text}\n\n${kind === 'reauthentication' ? '' : `${url}\n\n`}${t.code} : ${m.code || ''}`,
      tag: `cyclami-auth-${kind}`,
    });
    if (!res.ok) return fail(502, `Brevo a refusé l’envoi (${res.status})`);
  }
  return json({});
};

export const config = { path: '/api/auth-email' };
