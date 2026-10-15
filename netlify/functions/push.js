// Notifications push (Web Push : chiffrement RFC 8291, signature VAPID RFC 8292).
//   GET  /api/push/key  → { key } : clé publique VAPID (pour l'abonnement du navigateur)
//   POST /api/push      ← la base de données (clé partagée) :
//                         { subscriptions: [{ endpoint, p256dh, auth }], title, body, url, tag }
// La paire de clés VAPID est créée automatiquement au premier appel et gardée dans Netlify Blobs
// (magasin « cyclami-secrets »). VAPID_PRIVATE_JWK (variable d'environnement) peut l'imposer.
import { checkNotifySecret, env, json, stores } from '../lib/shared.js';

const enc = (str) => new TextEncoder().encode(str);
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDecode = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

const VAPID_KEY = 'vapid-private-jwk';
let cachedJwk = null;

// Clé privée VAPID (JWK ECDSA P-256) : variable d'environnement, sinon Netlify Blobs, sinon créée.
export async function vapidJwk() {
  if (env('VAPID_PRIVATE_JWK')) return JSON.parse(env('VAPID_PRIVATE_JWK'));
  if (cachedJwk) return cachedJwk;
  const store = stores.get('cyclami-secrets');
  let jwk = await store.get(VAPID_KEY, { type: 'json' });
  if (!jwk) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const fresh = await crypto.subtle.exportKey('jwk', pair.privateKey);
    // onlyIfNew : si deux appels créent une clé en même temps, une seule est gardée
    await store.setJSON(VAPID_KEY, fresh, { onlyIfNew: true });
    jwk = (await store.get(VAPID_KEY, { type: 'json' })) || fresh;
  }
  cachedJwk = jwk;
  return jwk;
}

export const resetVapidCache = () => { cachedJwk = null; };

export const vapidPublicKey = (jwk) => b64u(concat(new Uint8Array([4]), b64uDecode(jwk.x), b64uDecode(jwk.y)));

async function vapidAuthorization(endpoint, jwk) {
  const { d, x, y, kty, crv } = jwk;
  const key = await crypto.subtle.importKey('jwk', { d, x, y, kty, crv }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const contact = env('SENDER_EMAIL') || `contact@${new URL(env('SITE_URL', 'https://cyclami.com')).hostname}`;
  const body = b64u(enc(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: `mailto:${contact}`,
  })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${vapidPublicKey(jwk)}`;
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

async function sendPush(req) {
  if (!(await checkNotifySecret(req))) return json({ error: 'Non autorisé' }, 401);
  const msg = await req.json().catch(() => null);
  if (!Array.isArray(msg?.subscriptions) || !msg.title) return json({ error: 'Message incomplet' }, 400);
  const jwk = await vapidJwk();
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
          Authorization: await vapidAuthorization(sub.endpoint, jwk),
          'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal',
        },
        body: await encryptPush(sub, payload),
      });
      if (res.status === 404 || res.status === 410) gone.push(sub.endpoint);
      else if (res.ok) sent += 1;
    } catch { /* abonnement invalide : ignoré */ }
  }
  return json({ sent, gone });
}

export default async (req) => {
  const { pathname } = new URL(req.url);
  try {
    if (pathname.replace(/\/+$/, '').endsWith('/push/key')) {
      if (req.method !== 'GET') return json({ error: 'Méthode non autorisée' }, 405, { Allow: 'GET' });
      return json({ key: vapidPublicKey(await vapidJwk()) }, 200, { 'Cache-Control': 'public, max-age=3600' });
    }
    if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405, { Allow: 'POST' });
    return await sendPush(req);
  } catch (e) {
    console.error('push :', e?.message || e);
    return json({ error: 'Notifications push indisponibles' }, 503);
  }
};

export const config = { path: ['/api/push', '/api/push/key'] };
