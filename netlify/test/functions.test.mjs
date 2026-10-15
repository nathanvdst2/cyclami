// Test des fonctions Netlify (/api/*) sans Netlify : Netlify Blobs, Brevo, Supabase et
// services push simulés. Usage : node netlify/test/functions.test.mjs   (ou npm run test:functions)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stores } from '../lib/shared.js';
import notify from '../functions/notify.js';
import emailQuota from '../functions/email-quota.js';
import push, { config as pushConfig, resetVapidCache } from '../functions/push.js';
import authEmail from '../functions/auth-email.js';
import places from '../functions/places.js';

// --- simulations ---
const blobs = new Map(); // "magasin/clé" → { value, metadata }
stores.get = (name) => ({
  async get(key, opts) {
    const o = blobs.get(`${name}/${key}`);
    if (!o) return null;
    return opts?.type === 'json' ? JSON.parse(o.value) : o.value;
  },
  async getWithMetadata(key) {
    const o = blobs.get(`${name}/${key}`);
    return o ? { data: o.value, metadata: o.metadata, etag: '"e"' } : null;
  },
  async set(key, value, opts) { blobs.set(`${name}/${key}`, { value: String(value), metadata: opts?.metadata || {} }); return { modified: true }; },
  async setJSON(key, value, opts) {
    if (opts?.onlyIfNew && blobs.has(`${name}/${key}`)) return { modified: false };
    blobs.set(`${name}/${key}`, { value: JSON.stringify(value), metadata: opts?.metadata || {} });
    return { modified: true };
  },
});

const brevoCalls = [];
const pushCalls = [];
let overpassCalls = 0;
let overpassDown = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('/interpreter')) {
    overpassCalls += 1;
    if (overpassDown || u.includes('overpass-api.de')) return new Response('busy', { status: 429 }); // un miroir en panne
    return new Response(JSON.stringify({ elements: [
      { type: 'way', id: 7, center: { lat: 50.7123456, lon: 4.3987654 }, tags: { shop: 'bicycle', name: 'Vélo Service' } },
      { type: 'node', id: 8, lat: 50.71, lon: 4.4, tags: { amenity: 'bicycle_repair_station', name: 'Borne', phone: '+32 2 000 00 00' } },
      { type: 'node', id: 9, lat: 50.711, lon: 4.401, tags: { amenity: 'drinking_water' } },
      { type: 'node', id: 10, lat: 50.712, lon: 4.402, tags: { amenity: 'compressed_air' } },
      { type: 'node', id: 11, lat: 50.713, lon: 4.403, tags: { amenity: 'bench' } }, // ignoré
    ] }));
  }
  if (u.startsWith('https://push.example/')) {
    pushCalls.push({ url: u, headers: init.headers, body: init.body });
    return new Response('', { status: u.endsWith('/gone') ? 410 : 201 });
  }
  if (u === 'https://api.brevo.com/v3/account') {
    return new Response(JSON.stringify({ plan: [{ type: 'free', creditsType: 'sendLimit', credits: 212 }] }));
  }
  if (u.endsWith('/rest/v1/rpc/is_admin')) {
    assert.equal(init.headers.apikey, 'sb_publishable_test');
    return new Response(init.headers.Authorization === 'Bearer jeton-admin' ? 'true' : 'false');
  }
  if (u.startsWith('https://api.brevo.com/')) {
    brevoCalls.push({ headers: init.headers, body: JSON.parse(init.body) });
    return new Response('{"messageId":"x"}', { status: 201 });
  }
  throw new Error(`appel réseau inattendu : ${u}`);
};

Object.assign(process.env, {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  BREVO_API_KEY: 'brevo-key\n', SENDER_EMAIL: 'noreply@test.fr', SENDER_NAME: 'Cyclami',
});
delete process.env.NOTIFY_SECRET;
delete process.env.VAPID_PRIVATE_JWK;
delete process.env.SITE_URL;
// même calcul que la GitHub Action : sha256("cyclami-notify:" + clé Brevo sans espaces)
const SECRET = createHash('sha256').update('cyclami-notify:brevo-key').digest('hex');
const pending = [];
const context = { waitUntil: (p) => pending.push(p) };
let r;

// ---- e-mails de notification ----
const notifyReq = (secret, body, method = 'POST') => notify(new Request('https://cyclami.test/api/notify', {
  method,
  headers: { 'Content-Type': 'application/json', ...(secret && { Authorization: `Bearer ${secret}` }) },
  ...(method === 'POST' && { body: JSON.stringify(body) }),
}), context);
const mail = { to: 'carl@x.fr', name: 'Carl <script>', subject: 'Bob rejoint ta sortie', text: 'Bob a rejoint <b>ta sortie</b>', link: '/', kind: 'ride_join' };

assert.equal((await notifyReq(SECRET, null, 'GET')).status, 405, 'GET refusé');
r = await notifyReq(null, mail);
assert.equal(r.status, 401, 'e-mail sans clé refusé');
r = await notifyReq('mauvaise-cle-123456', mail);
assert.equal(r.status, 401, 'e-mail avec mauvaise clé refusé');
assert.equal(brevoCalls.length, 0);
r = await notifyReq(SECRET, { to: 'carl@x.fr' });
assert.equal(r.status, 400, 'e-mail incomplet refusé');
r = await notifyReq(SECRET, mail);
assert.equal(r.status, 200, 'e-mail envoyé');
assert.equal(brevoCalls.length, 1);
const sent = brevoCalls[0];
assert.equal(sent.headers['api-key'], 'brevo-key', 'clé Brevo nettoyée');
assert.equal(sent.body.to[0].email, 'carl@x.fr');
assert.equal(sent.body.sender.email, 'noreply@test.fr');
assert.equal(sent.body.sender.name, 'Cyclami');
assert.deepEqual(sent.body.tags, ['cyclami-ride_join']);
assert.ok(!sent.body.htmlContent.includes('<script>') && sent.body.htmlContent.includes('&lt;b&gt;'), 'contenu échappé');
assert.ok(sent.body.htmlContent.includes('https://cyclami.netlify.app/'), 'lien vers le site (SITE_URL par défaut)');
assert.ok(sent.body.htmlContent.includes('Ouvrir Cyclami'), 'bouton en français par défaut');
assert.ok(sent.body.htmlContent.includes('#0f766e'), 'couleurs Cyclami');
r = await notifyReq(SECRET, { ...mail, lang: 'nl', from: 'club@autre-domaine.com' });
assert.ok(brevoCalls[1].body.htmlContent.includes('Cyclami openen'), 'e-mail en néerlandais');
assert.equal(brevoCalls[1].body.sender.email, 'noreply@test.fr', 'expéditeur d’un autre domaine refusé');
process.env.BREVO_API_KEY = '';
process.env.NOTIFY_SECRET = SECRET;
r = await notifyReq(SECRET, mail);
assert.equal(r.status, 503, 'pas de clé Brevo : envoi désactivé');
process.env.BREVO_API_KEY = 'brevo-key';
delete process.env.NOTIFY_SECRET;

// ---- quota d'e-mails Brevo (administrateurs seulement) ----
const quota = (token) => emailQuota(new Request('https://cyclami.test/api/email-quota', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
}), context);
assert.equal((await quota(null)).status, 401, 'quota sans connexion refusé');
assert.equal((await quota('jeton-membre')).status, 403, 'quota refusé à un membre');
r = await quota('jeton-admin');
assert.deepEqual(await r.json(), { type: 'free', credits: 212 }, 'crédits restants pour l’administrateur');

// ---- e-mails de connexion (crochet Supabase signé) ----
const HOOK_KEY = Buffer.from('cle-secrete-du-crochet-supabase!').toString('base64');
process.env.SUPABASE_AUTH_HOOK_SECRET = `v1,whsec_${HOOK_KEY}`;
async function hook(payload, { key = HOOK_KEY, age = 0 } = {}) {
  const body = JSON.stringify(payload);
  const id = 'msg_1';
  const ts = String(Math.floor(Date.now() / 1000) - age);
  const k = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Buffer.from(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${id}.${ts}.${body}`))).toString('base64');
  return authEmail(new Request('https://cyclami.test/api/auth-email', {
    method: 'POST', body, headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` },
  }), context);
}
const signup = {
  user: { email: 'dora@x.fr', user_metadata: { name: 'Dora' } },
  email_data: { token: '123456', token_hash: 'abc', email_action_type: 'signup', redirect_to: 'https://cyclami.netlify.app', site_url: 'https://cyclami.netlify.app' },
};
brevoCalls.length = 0;
assert.equal((await hook(signup, { key: Buffer.from('mauvaise-cle-du-crochet-supabase').toString('base64') })).status, 401, 'signature refusée');
assert.equal((await hook(signup, { age: 3600 })).status, 401, 'appel trop ancien refusé');
assert.equal(brevoCalls.length, 0);
r = await hook(signup);
assert.equal(r.status, 200, 'e-mail de confirmation envoyé');
assert.equal(brevoCalls[0].body.to[0].email, 'dora@x.fr');
assert.equal(brevoCalls[0].body.subject, 'Confirme ton adresse e-mail');
assert.ok(brevoCalls[0].body.htmlContent.includes('https://x.supabase.co/auth/v1/verify?token=abc&amp;type=signup&amp;redirect_to=https%3A%2F%2Fcyclami.netlify.app'), 'lien de confirmation');
assert.ok(brevoCalls[0].body.textContent.includes('123456'), 'code dans la version texte');
r = await hook({ user: { email: 'eva@x.fr', user_metadata: { lang: 'nl' } }, email_data: { ...signup.email_data, email_action_type: 'recovery' } });
assert.equal(brevoCalls[1].body.subject, 'Kies een nieuw wachtwoord', 'e-mail en néerlandais');
r = await hook({ user: { email: 'finn@x.fr', user_metadata: { lang: 'en' } }, email_data: { ...signup.email_data, email_action_type: 'magiclink' } });
assert.equal(brevoCalls[2].body.subject, 'Your sign-in link', 'e-mail en anglais');
r = await hook({ user: { email: 'old@x.fr', new_email: 'new@x.fr', user_metadata: {} },
  email_data: { ...signup.email_data, email_action_type: 'email_change', token_hash_new: 'def', token_new: '654321' } });
assert.equal(r.status, 200);
assert.deepEqual(brevoCalls.slice(3).map((c) => c.body.to[0].email), ['old@x.fr', 'new@x.fr'], 'changement d’adresse : deux e-mails');
r = await hook({ user: { email: 'x@x.fr', user_metadata: {} }, email_data: { ...signup.email_data, email_action_type: 'footer' } });
assert.equal(r.status, 400, 'type d’e-mail inconnu refusé');
delete process.env.SUPABASE_AUTH_HOOK_SECRET;
assert.equal((await hook(signup)).status, 401, 'crochet non configuré : refusé');

// ---- notifications push : clé VAPID créée et gardée, chiffrement aes128gcm déchiffrable ----
assert.deepEqual(pushConfig.path, ['/api/push', '/api/push/key']);
const subtle = crypto.subtle;
const b64u = (b) => Buffer.from(b).toString('base64url');
const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const sub = { endpoint: 'https://push.example/abc', p256dh: b64u(uaPub), auth: b64u(authSecret) };

const keyReq = () => push(new Request('https://cyclami.test/api/push/key'), context);
assert.ok(!blobs.has('cyclami-secrets/vapid-private-jwk'));
r = await keyReq();
assert.equal(r.status, 200);
const { key: pubKey } = await r.json();
assert.equal(Buffer.from(pubKey, 'base64url').length, 65, 'clé publique VAPID');
assert.ok(blobs.has('cyclami-secrets/vapid-private-jwk'), 'paire de clés gardée dans Netlify Blobs');
resetVapidCache(); // nouvelle instance de la fonction : même clé relue dans Netlify Blobs
assert.equal((await (await keyReq()).json()).key, pubKey, 'clé stable d’un appel à l’autre');
const storedJwk = JSON.parse(blobs.get('cyclami-secrets/vapid-private-jwk').value);
const vapidPublic = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: storedJwk.x, y: storedJwk.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

const pushReq = (secret, body) => push(new Request('https://cyclami.test/api/push', {
  method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(body),
}), context);
assert.equal((await pushReq('mauvaise-cle-123456', { subscriptions: [sub], title: 'x' })).status, 401);
assert.equal((await pushReq(SECRET, { subscriptions: [sub] })).status, 400, 'message sans titre refusé');
r = await pushReq(SECRET, { subscriptions: [sub, { ...sub, endpoint: 'https://push.example/gone' }, { ...sub, endpoint: 'http://non-securise' }], title: 'Bob t’a écrit', body: 'Nouveau message', url: '/', tag: 'm:1' });
assert.equal(r.status, 200);
const pushRes = await r.json();
assert.equal(pushRes.sent, 1);
assert.deepEqual(pushRes.gone, ['https://push.example/gone'], 'abonnement expiré signalé');

// déchiffrement côté « navigateur » (RFC 8291)
const pushCall = pushCalls[0];
assert.equal(pushCall.headers['Content-Encoding'], 'aes128gcm');
const body = new Uint8Array(pushCall.body);
const salt = body.slice(0, 16);
const idlen = body[20];
const asPub = body.slice(21, 21 + idlen);
const cipher = body.slice(21 + idlen);
const hk = async (s, ikm, info, len) => new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info },
  await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, ua.privateKey, 256));
const te = new TextEncoder();
const ikm = await hk(authSecret, shared, Buffer.concat([te.encode('WebPush: info\0'), uaPub, asPub]), 32);
const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
const nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cipher));
assert.equal(plain[plain.length - 1], 2, 'délimiteur de fin');
assert.deepEqual(JSON.parse(new TextDecoder().decode(plain.slice(0, -1))), { title: 'Bob t’a écrit', body: 'Nouveau message', url: '/', tag: 'm:1' });

// en-tête VAPID : JWT signé par la clé du site, pour l'origine du service push
const [, t, k] = pushCall.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
assert.equal(k, pubKey);
const [h64, p64, s64] = t.split('.');
const claims = JSON.parse(Buffer.from(p64, 'base64url'));
assert.equal(claims.aud, 'https://push.example');
assert.equal(claims.sub, 'mailto:noreply@test.fr');
assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapidPublic, Buffer.from(s64, 'base64url'), te.encode(`${h64}.${p64}`)), 'signature VAPID');

// ---- lieux utiles : miroirs Overpass, cache par zone dans Netlify Blobs ----
const placesReq = (q) => places(new Request(`https://cyclami.test/api/places?${q}`), context);
assert.equal((await placesReq('lat=abc&lng=4')).status, 400, 'position invalide');
assert.equal((await placesReq('lng=4')).status, 400, 'position manquante');
r = await placesReq('lat=50.712&lng=4.401');
assert.equal(r.status, 200, 'lieux renvoyés malgré un miroir en panne');
const found = await r.json();
assert.deepEqual(found.map((p) => p.kind), ['shop', 'repair', 'water', 'pump'], 'types de lieux pour cyclistes');
assert.deepEqual(found[0], { id: 'w7', lat: 50.71235, lng: 4.39877, kind: 'shop', name: 'Vélo Service', phone: '', hours: '' });
assert.equal(found[1].phone, '+32 2 000 00 00');
await Promise.all(pending);
assert.ok(blobs.has('cyclami-places/v1/50.70_4.40'), 'zone gardée dans Netlify Blobs');
const before = overpassCalls;
r = await placesReq('lat=50.698&lng=4.399'); // même zone
assert.equal(r.status, 200);
assert.equal((await r.json()).length, 4);
assert.equal(overpassCalls, before, 'deuxième appel servi par le cache');
// zone ancienne : servie tout de suite, rafraîchie en arrière-plan
blobs.get('cyclami-places/v1/50.70_4.40').metadata.at = Date.now() - 20 * 86400000;
pending.length = 0;
r = await placesReq('lat=50.70&lng=4.40');
assert.equal((await r.json()).length, 4);
await Promise.all(pending);
assert.ok(overpassCalls > before, 'zone ancienne rafraîchie en arrière-plan');
assert.ok(Date.now() - blobs.get('cyclami-places/v1/50.70_4.40').metadata.at < 60000);
// OpenStreetMap indisponible et rien en cache : erreur claire
overpassDown = true;
r = await placesReq('lat=48.85&lng=2.35');
assert.equal(r.status, 502);
overpassDown = false;

console.log('✅ fonctions Netlify (e-mails, push, lieux, quota) : tous les tests passent');
