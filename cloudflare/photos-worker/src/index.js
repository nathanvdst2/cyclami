// Cyclami — service photos (Cloudflare Worker + stockage R2) et envoi des e-mails
//
//   POST   /notify            e-mail de notification (appelé par la base, clé partagée)
//   POST   /inbound?key=…     réponse d'un refuge reçue par Brevo, transmise à la base
//   POST   /auth-email        e-mails de connexion (crochet Supabase Auth, signé)
//   GET    /places?lat=&lng=  lieux utiles OpenStreetMap autour d'un point (cache 7 jours)
//   POST   /push              notifications push (appelé par la base, clé partagée) ; GET /push/key : clé publique
//   POST   /upload            envoie une photo (membre connecté)  → { url }
//   GET    /<membre>/<photo>  affiche une photo (public, mis en cache)
//   DELETE /<membre>/<photo>  supprime une de SES photos (ou n'importe laquelle pour l'équipe de modération)
//   DELETE /mine              supprime toutes SES photos (suppression de compte)
//
// L'identité est vérifiée auprès de Supabase avec le jeton de connexion du membre :
// personne ne peut déposer ou supprimer une photo dans le dossier de quelqu'un d'autre.

const MAX_BYTES = 10 * 1024 * 1024;
const SITE_URL = 'https://cyclami.com';
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;
const MAX_PHOTOS_PER_MEMBER = 500;

// Vérifie que le fichier est vraiment une image du format annoncé (pas une page web déguisée).
function looksLike(type, bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b[0] === 0x89 && ascii(1, 4) === 'PNG';
  if (type === 'image/gif') return ascii(0, 4) === 'GIF8';
  if (type === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  return false;
}

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, 'Content-Type': 'application/json' },
});

// Renvoie l'identifiant du membre connecté, ou null.
async function currentUserId(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === 'string' ? user.id : null;
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Comparaison à durée constante (pour la clé partagée avec la base).
function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function emailHtml({ name, text, link, url, button, footer, hello: greeting, lang = 'fr' }) {
  const L = { fr: 'fr', nl: 'nl', en: 'en' }[lang] || 'fr';
  button = button || { fr: 'Ouvrir Cyclami', nl: 'Cyclami openen', en: 'Open Cyclami' }[L];
  const href = url || `${SITE_URL}${link && link.startsWith('/') ? link : '/'}`;
  const hello = { fr: 'Bonjour', nl: 'Hallo', en: 'Hello' }[L];
  const foot = footer ?? {
    fr: 'Tu reçois cet e-mail car tu es membre d’Cyclami. Pour ne plus recevoir ces e-mails : Profil → Notifications par e-mail sur',
    nl: 'Je ontvangt deze e-mail omdat je lid bent van Cyclami. Geen e-mails meer? Profiel → Meldingen per e-mail op',
    en: 'You’re receiving this email because you’re an Cyclami member. To stop these emails: Profile → Email notifications on',
  }[L];
  return `<!doctype html><html lang="${L}"><body style="margin:0;background:#fffbeb;font-family:Arial,sans-serif;color:#292524">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
    <tr><td style="background:#f97316;padding:16px 24px;color:#ffffff;font-size:22px;font-weight:bold">🐾 Cyclami</td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 12px">${greeting ? escapeHtml(greeting) : `${hello}${name ? ` ${escapeHtml(name)}` : ''},`}</p>
      <p style="margin:0 0 20px;line-height:1.5">${escapeHtml(text).replace(/\n/g, '<br>')}</p>
      <a href="${escapeHtml(href)}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:bold">${escapeHtml(button)}</a>
    </td></tr>
    <tr><td style="padding:16px 24px;font-size:12px;color:#78716c;border-top:1px solid #fde68a">
      ${escapeHtml(foot)} <a href="${SITE_URL}" style="color:#ea580c">${SITE_URL.replace('https://', '')}</a>.
    </td></tr>
  </table></td></tr></table></body></html>`;
}

// Expéditeur : par défaut SENDER_EMAIL ; une autre adresse n'est acceptée que sur le même domaine (déjà authentifié chez Brevo).
function senderFor(env, from) {
  const domain = (env.SENDER_EMAIL || '').split('@')[1];
  const ok = from && domain && /^[^@\s]+@[^@\s]+$/.test(from) && from.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
  return ok ? from : env.SENDER_EMAIL;
}

async function sendBrevo(env, { to, name, subject, html, text, tag, replyTo, from }) {
  return fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: senderFor(env, from), name: env.SENDER_NAME || 'Cyclami' },
      to: [{ email: to, name: name || undefined }],
      subject: String(subject).slice(0, 200),
      htmlContent: html,
      textContent: text,
      tags: [tag],
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
    }),
  });
}

// E-mail demandé par la base (déclencheur) : vérifie la clé partagée puis envoie via Brevo.
async function sendNotificationEmail(request, env, headers) {
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!sameSecret(auth, env.NOTIFY_SECRET)) return json({ error: 'Non autorisé' }, 401, headers);
  if (!env.BREVO_API_KEY || !env.SENDER_EMAIL) return json({ error: 'Envoi d’e-mails non configuré' }, 503, headers);
  const msg = await request.json().catch(() => null);
  if (!msg?.to || !msg?.subject || !msg?.text) return json({ error: 'E-mail incomplet' }, 400, headers);
  const res = await sendBrevo(env, {
    to: msg.to, name: msg.name, subject: msg.subject, html: emailHtml(msg),
    text: `${msg.hello ? `${msg.hello}\n\n` : ''}${msg.text}\n\nCyclami : ${SITE_URL}`, tag: `cyclami-${msg.kind || 'notification'}`,
    replyTo: /^[^@\s]+@[^@\s]+$/.test(msg.reply_to || '') ? msg.reply_to : undefined,
    from: msg.from,
  });
  if (!res.ok) return json({ error: 'Brevo a refusé l’envoi', status: res.status, detail: await res.text() }, 502, headers);
  return json({ sent: true }, 200, headers);
}

// ---- Quota d'e-mails Brevo (administrateurs) ----
// Crédits d'envoi restants (formule gratuite : environ 300 e-mails par jour pour tout le site).
async function emailQuota(request, env, headers) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Non autorisé' }, 401, headers);
  const admin = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_admin`, {
    method: 'POST', headers: { Authorization: auth, apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!admin.ok || (await admin.json().catch(() => false)) !== true) return json({ error: 'Réservé aux administrateurs' }, 403, headers);
  if (!env.BREVO_API_KEY) return json({ error: 'Envoi d’e-mails non configuré' }, 503, headers);
  const res = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': env.BREVO_API_KEY, Accept: 'application/json' } });
  if (!res.ok) return json({ error: 'Brevo indisponible', status: res.status }, 502, headers);
  const account = await res.json();
  const plans = Array.isArray(account.plan) ? account.plan : [];
  const plan = plans.find((x) => x.creditsType === 'sendLimit') || plans[0] || {};
  return json({ type: plan.type || null, credits: typeof plan.credits === 'number' ? plan.credits : null }, 200, { ...headers, 'Cache-Control': 'no-store' });
}

// ---- Réponses des refuges (réception « inbound » de Brevo) ----
// Brevo reçoit les e-mails envoyés au domaine de réception et les poste ici (POST /inbound?key=…).
// La clé est dérivée de la clé Brevo : sha256("cyclami-inbound:" + BREVO_API_KEY), même calcul dans le workflow.
export async function inboundKey(env) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`cyclami-inbound:${env.BREVO_API_KEY || ''}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const addresses = (v) => (Array.isArray(v) ? v : v ? [v] : [])
  .map((x) => (typeof x === 'string' ? x : x?.Address || x?.address || ''))
  .flatMap((x) => String(x).match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []);

async function receiveInbound(request, env, headers) {
  const url = new URL(request.url);
  if (!env.BREVO_API_KEY || !env.NOTIFY_SECRET || !sameSecret(url.searchParams.get('key') || '', await inboundKey(env))) {
    return json({ error: 'Non autorisé' }, 401, headers);
  }
  const payload = await request.json().catch(() => null);
  const items = Array.isArray(payload?.items) ? payload.items : payload ? [payload] : [];
  // Aucun filtre « indésirable » : une réponse de refuge est toujours enregistrée.
  let stored = 0;
  const failed = [];
  for (const it of items.slice(0, 20)) {
    const from = addresses(it.From)[0] || '';
    if (!from) continue;
    const to = [...new Set([...addresses(it.To), ...addresses(it.Cc), ...addresses(it.Recipients),
      ...addresses(it.Headers?.To), ...addresses(it.Headers?.['Delivered-To'])])].slice(0, 20);
    const body = String(it.ExtractedMarkdownMessage || it.RawTextBody || '').trim()
      || String(it.RawHtmlBody || '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/receive_shelter_email`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_secret: env.NOTIFY_SECRET, p_to: to, p_from_email: from, p_from_name: it.From?.Name || '',
        p_subject: String(it.Subject || '').slice(0, 300), p_body: body.slice(0, 20000), p_message_id: it.MessageId || null,
      }),
    });
    if (res.ok) stored += 1;
    else failed.push({ from, status: res.status, detail: (await res.text()).slice(0, 300) });
  }
  // en cas d'échec, erreur visible dans les journaux et code 502 : Brevo renvoie le message plus tard
  if (failed.length) {
    console.error('inbound: réponse non enregistrée', JSON.stringify(failed));
    return json({ received: items.length, stored, failed: failed.length }, 502, headers);
  }
  return json({ received: items.length, stored }, 200, headers);
}

// ---- Notifications push (Web Push : RFC 8291 chiffrement, RFC 8292 VAPID) ----
// VAPID_PRIVATE_JWK : clé ECDSA P-256 au format JWK (secret du service, créée par le workflow).
const enc = (str) => new TextEncoder().encode(str);
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDecode = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

export function vapidPublicKey(env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  return b64u(concat(new Uint8Array([4]), b64uDecode(jwk.x), b64uDecode(jwk.y)));
}

async function vapidAuthorization(endpoint, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:contact@cyclami.com',
  })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${vapidPublicKey(env)}`;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// Chiffre le message pour un abonnement (contenu « aes128gcm »).
export async function encryptPush(sub, plaintext) {
  const uaPublic = b64uDecode(sub.p256dh);
  const authSecret = b64uDecode(sub.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc('WebPush: info\0'), uaPublic, localPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // taille d'enregistrement 4096
  return concat(salt, rs, new Uint8Array([localPublic.length]), localPublic, cipher);
}

// Appelé par la base : { subscriptions: [{endpoint, p256dh, auth}], title, body, url, tag }
async function sendPush(request, env, headers) {
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!sameSecret(auth, env.NOTIFY_SECRET)) return json({ error: 'Non autorisé' }, 401, headers);
  if (!env.VAPID_PRIVATE_JWK) return json({ error: 'Notifications push non configurées' }, 503, headers);
  const msg = await request.json().catch(() => null);
  if (!Array.isArray(msg?.subscriptions) || !msg.title) return json({ error: 'Message incomplet' }, 400, headers);
  const payload = enc(JSON.stringify({
    title: String(msg.title).slice(0, 120), body: String(msg.body || '').slice(0, 300), url: msg.url || '/', tag: msg.tag || undefined,
  }));
  const gone = [];
  let sent = 0;
  for (const sub of msg.subscriptions.slice(0, 20)) {
    try {
      if (!/^https:\/\//.test(sub.endpoint)) continue;
      const res = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          Authorization: await vapidAuthorization(sub.endpoint, env),
          'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal',
        },
        body: await encryptPush(sub, payload),
      });
      if (res.status === 404 || res.status === 410) gone.push(sub.endpoint);
      else if (res.ok) sent += 1;
    } catch { /* abonnement invalide : ignoré */ }
  }
  return json({ sent, gone }, 200, headers);
}

// ---- E-mails de connexion (crochet « Send Email » de Supabase Auth) ----
// Supabase signe chaque appel (norme Standard Webhooks) avec le secret AUTH_HOOK_SECRET (« v1,whsec_… »).
const AUTH_TEXT = {
  fr: {
    signup: ['Confirme ton adresse e-mail', 'Bienvenue sur Cyclami ! Clique sur le bouton pour confirmer ton adresse e-mail et activer ton compte.', 'Confirmer mon adresse'],
    recovery: ['Choisis un nouveau mot de passe', 'Tu as demandé à changer ton mot de passe. Clique sur le bouton pour en choisir un nouveau. Si ce n’est pas toi, ignore simplement cet e-mail.', 'Changer mon mot de passe'],
    magiclink: ['Ton lien de connexion', 'Clique sur le bouton pour te connecter à Cyclami.', 'Me connecter'],
    invite: ['Tu es invité sur Cyclami', 'On t’invite à rejoindre Cyclami, le site pour promener son animal à plusieurs. Clique sur le bouton pour créer ton compte.', 'Rejoindre Cyclami'],
    email_change: ['Confirme ta nouvelle adresse e-mail', 'Clique sur le bouton pour confirmer le changement d’adresse e-mail de ton compte Cyclami. Si ce n’est pas toi, ignore cet e-mail.', 'Confirmer le changement'],
    reauthentication: ['Ton code de confirmation', 'Voici ton code de confirmation Cyclami : {code}', 'Ouvrir Cyclami'],
    footer: 'E-mail envoyé automatiquement par Cyclami —',
    code: 'Code',
  },
  nl: {
    signup: ['Bevestig je e-mailadres', 'Welkom bij Cyclami! Klik op de knop om je e-mailadres te bevestigen en je account te activeren.', 'Mijn adres bevestigen'],
    recovery: ['Kies een nieuw wachtwoord', 'Je hebt gevraagd om je wachtwoord te wijzigen. Klik op de knop om een nieuw wachtwoord te kiezen. Was jij dit niet? Negeer dan deze e-mail.', 'Wachtwoord wijzigen'],
    magiclink: ['Je inloglink', 'Klik op de knop om in te loggen op Cyclami.', 'Inloggen'],
    invite: ['Je bent uitgenodigd op Cyclami', 'Je bent uitgenodigd om lid te worden van Cyclami, de site om samen met je dier te wandelen. Klik op de knop om je account aan te maken.', 'Lid worden'],
    email_change: ['Bevestig je nieuwe e-mailadres', 'Klik op de knop om de wijziging van het e-mailadres van je Cyclami-account te bevestigen. Was jij dit niet? Negeer dan deze e-mail.', 'Wijziging bevestigen'],
    reauthentication: ['Je bevestigingscode', 'Hier is je Cyclami-bevestigingscode: {code}', 'Cyclami openen'],
    footer: 'Automatisch verzonden door Cyclami —',
    code: 'Code',
  },
  en: {
    signup: ['Confirm your email address', 'Welcome to Cyclami! Click the button to confirm your email address and activate your account.', 'Confirm my address'],
    recovery: ['Choose a new password', 'You asked to change your password. Click the button to choose a new one. If this wasn’t you, simply ignore this email.', 'Change my password'],
    magiclink: ['Your sign-in link', 'Click the button to sign in to Cyclami.', 'Sign in'],
    invite: ['You’re invited to Cyclami', 'You’ve been invited to join Cyclami, the site for riding your pet together. Click the button to create your account.', 'Join Cyclami'],
    email_change: ['Confirm your new email address', 'Click the button to confirm the email address change for your Cyclami account. If this wasn’t you, ignore this email.', 'Confirm the change'],
    reauthentication: ['Your confirmation code', 'Here is your Cyclami confirmation code: {code}', 'Open Cyclami'],
    footer: 'Sent automatically by Cyclami —',
    code: 'Code',
  },
};

const b64decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64encode = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function verifyStandardWebhook(request, body, secret) {
  const id = request.headers.get('webhook-id');
  const timestamp = request.headers.get('webhook-timestamp');
  const signatures = request.headers.get('webhook-signature') || '';
  if (!id || !timestamp || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false; // 5 minutes max
  const key = await crypto.subtle.importKey(
    'raw', b64decode(secret.replace(/^v1,/, '').replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const expected = b64encode(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return signatures.split(' ').some((s) => sameSecret(s.split(',')[1] || '', expected));
}

async function sendAuthEmail(request, env, headers) {
  const body = await request.text();
  const fail = (status, message) => json({ error: { http_code: status, message } }, status, headers);
  if (!(await verifyStandardWebhook(request, body, env.AUTH_HOOK_SECRET))) return fail(401, 'Signature invalide');
  if (!env.BREVO_API_KEY || !env.SENDER_EMAIL) return fail(503, 'Envoi d’e-mails non configuré');
  const { user, email_data: d } = JSON.parse(body);
  const type = d?.email_action_type;
  const lang = ['nl', 'en'].includes(user?.user_metadata?.lang) ? user.user_metadata.lang : 'fr';
  const t = AUTH_TEXT[lang];
  const kind = { email: 'magiclink', email_change_current: 'email_change', email_change_new: 'email_change' }[type] || type;
  if (!t[kind]) return fail(400, `Type d’e-mail inconnu : ${type}`);
  const name = user?.user_metadata?.name || '';
  const site = d.site_url || SITE_URL;
  const link = (hash) => `${env.SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(hash)}&type=${encodeURIComponent(type)}&redirect_to=${encodeURIComponent(d.redirect_to || site)}`;

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
    const res = await sendBrevo(env, {
      to: m.to, name, subject,
      html: emailHtml({ name, text, url, button, lang, footer: t.footer }),
      text: `${text}\n\n${kind === 'reauthentication' ? '' : `${url}\n\n`}${t.code} : ${m.code || ''}`,
      tag: `cyclami-auth-${kind}`,
    });
    if (!res.ok) return fail(502, `Brevo a refusé l’envoi (${res.status})`);
  }
  return json({}, 200, headers);
}

// ---- Lieux utiles (OpenStreetMap / Overpass), mis en cache par zone de 0,05° pendant 7 jours ----
// GET /places?lat=50.70&lng=4.40 → [{ id, lat, lng, kind, name, phone, hours }]
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const PLACE_QUERIES = [
  'nwr["leisure"="dog_park"]', 'nwr["leisure"="park"]["name"]', 'node["amenity"="drinking_water"]',
  'nwr["amenity"="veterinary"]', 'nwr["shop"="pet"]',
];
const CELL = 0.05;
// Carreaux de 1° pré-remplis par le workflow « Lieux » (scripts/import-places.mjs) : un carreau marqué
// comme importé ne contient que les zones non vides ; une zone absente y signifie « aucun lieu ».
// Le carreau d'une zone est celui de son centre arrondi (même règle que le script).
const tileOf = (clat, clng) => `${Math.floor(Number(clat) + 1e-9)}_${Math.floor(Number(clng) + 1e-9)}`;
const placeKind = (tags) => (tags.leisure === 'dog_park' ? 'dog_park'
  : tags.leisure === 'park' ? 'park'
    : tags.amenity === 'drinking_water' ? 'water'
      : tags.amenity === 'veterinary' ? 'vet' : 'pet_shop');

async function fetchOverpass(lat, lng) {
  // exactement la zone (même découpage que l'import) : pas de plafond qui couperait les lieux d'une ville dense
  const h = CELL / 2;
  const box = `[bbox:${(lat - h).toFixed(3)},${(lng - h).toFixed(3)},${(lat + h).toFixed(3)},${(lng + h).toFixed(3)}]`;
  const body = new URLSearchParams({ data: `[out:json][timeout:25]${box};(${PLACE_QUERIES.map((q) => `${q};`).join('')});out center;` });
  // le premier serveur qui répond gagne
  const json = await Promise.any(OVERPASS_MIRRORS.map(async (url) => {
    // 28 s max par serveur : un serveur muet ne bloque plus la réponse
    const res = await fetch(url, { method: 'POST', body, headers: { 'User-Agent': 'Cyclami (contact@cyclami.com)' }, signal: AbortSignal.timeout(28000) });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const data = await res.json();
    // délai dépassé : liste incomplète, à ne pas garder en cache
    if (/error|timed out|out of memory/i.test(data.remark || '')) throw new Error('overpass incomplet');
    return data;
  }));
  return json.elements.map((e) => ({
    id: `${e.type[0]}${e.id}`,
    lat: Math.round((e.lat ?? e.center?.lat) * 1e5) / 1e5,
    lng: Math.round((e.lon ?? e.center?.lon) * 1e5) / 1e5,
    kind: placeKind(e.tags || {}),
    name: e.tags?.name || '',
    phone: e.tags?.phone || e.tags?.['contact:phone'] || '',
    hours: e.tags?.opening_hours || '',
  })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

async function getPlaces(url, headers, env, ctx) {
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
    return json({ error: 'Position invalide' }, 400, headers);
  }
  const clat = (Math.round(lat / CELL) * CELL).toFixed(2);
  const clng = (Math.round(lng / CELL) * CELL).toFixed(2);
  const reply = (body) => new Response(body, { headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400' } });
  // cache durable dans R2 (le cache HTTP de Cloudflare ne fonctionne pas sur *.workers.dev)
  const key = `_places/v1/${clat}_${clng}.json`;
  const stored = await env.PHOTOS.get(key);
  // avant le 14/10/2026, les zones demandées en direct pouvaient être tronquées (600 lieux au plus)
  const at = Number(stored?.customMetadata?.at || 0);
  const fresh = stored && at > Date.UTC(2026, 9, 14) && Date.now() - at < 10 * 86400000;
  if (fresh) return reply(stored.body);
  // ancienne version : servie tout de suite (carte rapide), mise à jour en arrière-plan pour la prochaine visite
  if (stored) {
    const body = await stored.text();
    ctx.waitUntil(fetchOverpass(Number(clat), Number(clng)).then((places) => env.PHOTOS.put(key, JSON.stringify(places), {
      httpMetadata: { contentType: 'application/json' }, customMetadata: { at: String(Date.now()) },
    })).catch(() => {}));
    return reply(body);
  }
  if (!stored) {
    const marker = await env.PHOTOS.head(`_places/v1/tile_${tileOf(clat, clng)}`);
    const imported = Number(marker?.customMetadata?.at || 0);
    if (imported > Date.UTC(2026, 9, 14) && Date.now() - imported < 30 * 86400000) return reply('[]');
  }
  let body;
  try {
    body = JSON.stringify(await fetchOverpass(Number(clat), Number(clng)));
  } catch {
    if (stored) return reply(stored.body); // ancienne version plutôt que rien
    return json({ error: 'Lieux indisponibles pour le moment' }, 502, headers);
  }
  ctx.waitUntil(env.PHOTOS.put(key, body, { httpMetadata: { contentType: 'application/json' }, customMetadata: { at: String(Date.now()) } }));
  return reply(body);
}

// Import en lot (workflow « Lieux ») : { cells: { "50.70_4.40": [lieux…] }, tiles: ["50_4"] }, clé partagée.
async function importPlaces(request, env, headers) {
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
  if (!sameSecret(auth, env.NOTIFY_SECRET)) return json({ error: 'Non autorisé' }, 401, headers);
  const { cells, tiles } = await request.json().catch(() => ({}));
  const entries = Object.entries(cells || {});
  if (entries.length > 400 || (tiles || []).length > 20) return json({ error: 'Envoi trop gros' }, 400, headers);
  const at = String(Date.now());
  for (const [key, places] of entries) {
    if (!/^-?\d{1,2}\.\d{2}_-?\d{1,3}\.\d{2}$/.test(key) || !Array.isArray(places)) continue;
    await env.PHOTOS.put(`_places/v1/${key}.json`, JSON.stringify(places.slice(0, 2000)), {
      httpMetadata: { contentType: 'application/json' }, customMetadata: { at },
    });
  }
  for (const tile of tiles || []) {
    if (/^-?\d{1,2}_-?\d{1,3}$/.test(tile)) await env.PHOTOS.put(`_places/v1/tile_${tile}`, at, { customMetadata: { at } });
  }
  return json({ imported: entries.length, tiles: (tiles || []).length }, 200, headers);
}

// Date du dernier import de chaque carreau : { "50_4": 1760000000000, … }
async function listPlaceTiles(env, headers) {
  const out = {};
  let cursor;
  do {
    const page = await env.PHOTOS.list({ prefix: '_places/v1/tile_', cursor, include: ['customMetadata'] });
    for (const o of page.objects) out[o.key.slice('_places/v1/tile_'.length)] = Number(o.customMetadata?.at || 0);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json(out, 200, headers);
}

export default {
  async fetch(request, env, ctx) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

    try {
      if (request.method === 'POST' && path === 'notify') return await sendNotificationEmail(request, env, headers);
      if (request.method === 'POST' && path === 'inbound') return await receiveInbound(request, env, headers);
      if (request.method === 'POST' && path === 'auth-email') return await sendAuthEmail(request, env, headers);
      if (request.method === 'POST' && path === 'push') return await sendPush(request, env, headers);
      if (request.method === 'GET' && path === 'places') return await getPlaces(url, headers, env, ctx);
      if (request.method === 'POST' && path === 'places/import') return await importPlaces(request, env, headers);
      if (request.method === 'GET' && path === 'places/tiles') return await listPlaceTiles(env, headers);
      if (request.method === 'GET' && path === 'email-quota') return await emailQuota(request, env, headers);
      if (request.method === 'GET' && path === 'push/key') {
        if (!env.VAPID_PRIVATE_JWK) return json({ error: 'Notifications push non configurées' }, 503, headers);
        return json({ key: vapidPublicKey(env) }, 200, { ...headers, 'Cache-Control': 'public, max-age=3600' });
      }

      // ---- Afficher une photo (public) ----
      if (request.method === 'GET') {
        if (!KEY_RE.test(path)) return new Response('Introuvable', { status: 404, headers });
        const cache = caches.default;
        const cached = await cache.match(request.url);
        if (cached) return cached;
        const object = await env.PHOTOS.get(path);
        if (!object) return new Response('Introuvable', { status: 404, headers });
        const response = new Response(object.body, {
          headers: {
            ...headers,
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
            // le nom de fichier est unique : la photo ne change jamais
            'Cache-Control': 'public, max-age=31536000, immutable',
            ETag: object.httpEtag,
          },
        });
        ctx.waitUntil(cache.put(request.url, response.clone()));
        return response;
      }

      const userId = await currentUserId(request, env);
      if (!userId) return json({ error: 'Connexion requise' }, 401, headers);

      // ---- Envoyer une photo ----
      if (request.method === 'POST' && path === 'upload') {
        const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        const ext = TYPES[type];
        if (!ext) return json({ error: 'Format d’image non accepté' }, 415, headers);
        const length = Number(request.headers.get('Content-Length') || 0);
        if (length > MAX_BYTES) return json({ error: 'Image trop lourde (10 Mo maximum)' }, 413, headers);
        const body = await request.arrayBuffer();
        if (body.byteLength === 0) return json({ error: 'Image vide' }, 400, headers);
        if (body.byteLength > MAX_BYTES) return json({ error: 'Image trop lourde (10 Mo maximum)' }, 413, headers);
        if (!looksLike(type, body)) return json({ error: 'Format d’image non accepté' }, 415, headers);
        const mine = await env.PHOTOS.list({ prefix: `${userId}/`, limit: MAX_PHOTOS_PER_MEMBER });
        if (mine.truncated || mine.objects.length >= MAX_PHOTOS_PER_MEMBER) {
          return json({ error: 'Tu as atteint la limite de photos : supprime d’anciennes photos pour en ajouter.' }, 429, headers);
        }
        const key = `${userId}/${crypto.randomUUID()}.${ext}`;
        await env.PHOTOS.put(key, body, { httpMetadata: { contentType: type } });
        return json({ url: `${url.origin}/${key}`, key }, 201, headers);
      }

      // ---- Supprimer toutes mes photos ----
      if (request.method === 'DELETE' && path === 'mine') {
        let cursor;
        let deleted = 0;
        do {
          const page = await env.PHOTOS.list({ prefix: `${userId}/`, cursor });
          const keys = page.objects.map((o) => o.key);
          if (keys.length) await env.PHOTOS.delete(keys);
          deleted += keys.length;
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
        return json({ deleted }, 200, headers);
      }

      // ---- Supprimer toutes les photos d'un membre (compte supprimé par un administrateur) ----
      const member = path.match(/^user\/([0-9a-f-]{36})$/);
      if (request.method === 'DELETE' && member) {
        const admin = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_admin`, {
          method: 'POST', headers: { Authorization: request.headers.get('Authorization') || '', apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}',
        }).then((r) => (r.ok ? r.json() : false)).catch(() => false);
        if (admin !== true) return json({ error: 'Réservé aux administrateurs' }, 403, headers);
        let cursor;
        let deleted = 0;
        do {
          const page = await env.PHOTOS.list({ prefix: `${member[1]}/`, cursor });
          const keys = page.objects.map((o) => o.key);
          if (keys.length) await env.PHOTOS.delete(keys);
          deleted += keys.length;
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
        return json({ deleted }, 200, headers);
      }

      // ---- Supprimer une de mes photos ----
      if (request.method === 'DELETE' && KEY_RE.test(path)) {
        // l'équipe de modération peut effacer une photo retirée (photo de profil inappropriée…)
        if (!path.startsWith(`${userId}/`)) {
          const staff = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_staff`, {
            method: 'POST', headers: { Authorization: request.headers.get('Authorization') || '', apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' }, body: '{}',
          }).then((r) => (r.ok ? r.json() : false)).catch(() => false);
          if (staff !== true) return json({ error: 'Ce n’est pas ta photo' }, 403, headers);
        }
        await env.PHOTOS.delete(path);
        await caches.default.delete(`${url.origin}/${path}`);
        return json({ deleted: 1 }, 200, headers);
      }

      return json({ error: 'Requête inconnue' }, 404, headers);
    } catch (e) {
      return json({ error: 'Erreur du service photos' }, 500, headers);
    }
  },
};
