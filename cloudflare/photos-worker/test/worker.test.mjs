// Test du service photos sans Cloudflare : stockage R2, cache et Supabase simulés.
// Usage : node cloudflare/photos-worker/test/worker.test.mjs
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const TOKENS = { 'token-alice': ALICE, 'token-bob': BOB, 'token-modo': '33333333-3333-4333-8333-333333333333' };

// --- simulations ---
const store = new Map();
const PHOTOS = {
  async put(key, body, opts) { store.set(key, { body, contentType: opts?.httpMetadata?.contentType, meta: opts?.customMetadata }); },
  async get(key) {
    const o = store.get(key);
    return o && { body: o.body, httpMetadata: { contentType: o.contentType }, customMetadata: o.meta, httpEtag: '"e"' };
  },
  async delete(keys) { [].concat(keys).forEach((k) => store.delete(k)); },
  async head(key) { const o = store.get(key); return o && { customMetadata: o.meta }; },
  async list({ prefix }) { return { objects: [...store.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, customMetadata: store.get(key).meta })), truncated: false }; },
};
const cacheMap = new Map();
globalThis.caches = { default: {
  async match(u) { return cacheMap.get(u)?.clone(); },
  async put(u, r) { cacheMap.set(u, r); },
  async delete(u) { return cacheMap.delete(u); },
} };
const brevoCalls = [];
const pushCalls = [];
const inboundCalls = [];
let overpassCalls = 0;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('/interpreter')) {
    overpassCalls += 1;
    if (String(url).includes('overpass-api.de')) return new Response('busy', { status: 429 }); // un miroir en panne
    return new Response(JSON.stringify({ elements: [
      { type: 'way', id: 7, center: { lat: 50.7123456, lon: 4.3987654 }, tags: { leisure: 'dog_park', name: 'Caniparc' } },
      { type: 'node', id: 8, lat: 50.71, lon: 4.4, tags: { amenity: 'veterinary', name: 'Véto', phone: '+32 2 000 00 00' } },
    ] }));
  }
  if (String(url).startsWith('https://push.example/')) {
    pushCalls.push({ url: String(url), headers: init.headers, body: init.body });
    return new Response('', { status: String(url).endsWith('/gone') ? 410 : 201 });
  }
  if (String(url) === 'https://api.brevo.com/v3/account') {
    return new Response(JSON.stringify({ plan: [{ type: 'free', creditsType: 'sendLimit', credits: 212 }] }));
  }
  if (String(url).endsWith('/rest/v1/rpc/is_staff')) {
    return new Response(init.headers.Authorization === 'Bearer token-modo' ? 'true' : 'false');
  }
  if (String(url).endsWith('/rest/v1/rpc/is_admin')) {
    return new Response(init.headers.Authorization === 'Bearer jeton-admin' ? 'true' : 'false');
  }
  if (String(url).startsWith('https://api.brevo.com/')) {
    brevoCalls.push({ headers: init.headers, body: JSON.parse(init.body) });
    return new Response('{"messageId":"x"}', { status: 201 });
  }
  if (String(url).endsWith('/rest/v1/rpc/receive_shelter_email')) {
    const b = JSON.parse(init.body);
    inboundCalls.push({ headers: init.headers, body: b });
    return b.p_from_email === 'panne@refuge.be' ? new Response('{"message":"boom"}', { status: 500 }) : new Response('{"stored":true}', { status: 200 });
  }
  assert.ok(String(url).endsWith('/auth/v1/user'));
  const id = TOKENS[(init.headers.Authorization || '').replace('Bearer ', '')];
  return id ? new Response(JSON.stringify({ id })) : new Response('{}', { status: 401 });
};
const env = {
  PHOTOS, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k', ALLOWED_ORIGINS: 'https://cyclami.netlify.app',
  NOTIFY_SECRET: 'secret-partage-123', BREVO_API_KEY: 'brevo-key', SENDER_EMAIL: 'notifications@test.fr', SENDER_NAME: 'Cyclami',
};
const pending = [];
const ctx = { waitUntil: (p) => pending.push(p) };
const call = (method, path, { token, body, type } = {}) => worker.fetch(new Request(`https://photos.test/${path}`, {
  method,
  headers: { Origin: 'https://cyclami.netlify.app', ...(token && { Authorization: `Bearer ${token}` }), ...(type && { 'Content-Type': type }) },
  body,
}), env, ctx);

const img = new Uint8Array(1000).fill(7);
img.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
img.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
const png = new Uint8Array(1000).fill(7);
png.set([0x89, 0x50, 0x4e, 0x47], 0);
let r;

r = await call('POST', 'upload', { body: img, type: 'image/webp' });
assert.equal(r.status, 401, 'envoi sans connexion refusé');

r = await call('POST', 'upload', { token: 'faux', body: img, type: 'image/webp' });
assert.equal(r.status, 401, 'faux jeton refusé');

r = await call('POST', 'upload', { token: 'token-alice', body: 'x', type: 'text/html' });
assert.equal(r.status, 415, 'fichier non image refusé');

r = await call('POST', 'upload', { token: 'token-alice', body: new TextEncoder().encode('<html><script>alert(1)</script>'), type: 'image/jpeg' });
assert.equal(r.status, 415, 'une page web déguisée en image est refusée');

r = await call('POST', 'upload', { token: 'token-alice', body: new Uint8Array(11 * 1024 * 1024), type: 'image/jpeg' });
assert.equal(r.status, 413, 'image trop lourde refusée');

r = await call('POST', 'upload', { token: 'token-alice', body: img, type: 'image/webp' });
assert.equal(r.status, 201, 'envoi OK');
const { url, key } = await r.json();
assert.ok(key.startsWith(`${ALICE}/`) && url === `https://photos.test/${key}`, 'rangée dans le dossier d’Alice');
assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://cyclami.netlify.app');

r = await call('GET', key);
assert.equal(r.status, 200, 'photo affichée sans connexion');
assert.equal(r.headers.get('Content-Type'), 'image/webp');
assert.equal(r.headers.get('X-Content-Type-Options'), 'nosniff');
assert.equal((await r.arrayBuffer()).byteLength, 1000);
await Promise.all(pending);
assert.ok(cacheMap.has(`https://photos.test/${key}`), 'photo mise en cache');

r = await call('GET', '../secret.txt');
assert.equal(r.status, 404, 'chemin invalide refusé');

r = await call('DELETE', key, { token: 'token-bob' });
assert.equal(r.status, 403, 'Bob ne peut pas supprimer la photo d’Alice');
assert.ok(store.has(key));

r = await call('DELETE', key, { token: 'token-alice' });
assert.equal(r.status, 200, 'Alice supprime sa photo');
assert.ok(!store.has(key) && !cacheMap.has(`https://photos.test/${key}`));

// l'équipe de modération efface une photo retirée d'un autre membre
r = await call('POST', 'upload', { token: 'token-alice', body: png, type: 'image/png' });
const flagged = (await r.json()).key;
r = await call('DELETE', flagged, { token: 'token-modo' });
assert.equal(r.status, 200, 'un modérateur efface une photo signalée');
assert.ok(!store.has(flagged));

await call('POST', 'upload', { token: 'token-alice', body: png, type: 'image/png' });
await call('POST', 'upload', { token: 'token-alice', body: png, type: 'image/png' });
await call('POST', 'upload', { token: 'token-bob', body: png, type: 'image/png' });
r = await call('DELETE', 'mine', { token: 'token-alice' });
assert.deepEqual(await r.json(), { deleted: 2 }, 'suppression de toutes les photos d’Alice');
assert.equal(store.size, 1, 'la photo de Bob reste');

r = await call('OPTIONS', 'upload');
assert.equal(r.status, 204, 'pré-requête CORS');

// ---- e-mails de notification ----
const notify = (secret, body) => worker.fetch(new Request('https://photos.test/notify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(secret && { Authorization: `Bearer ${secret}` }) },
  body: JSON.stringify(body),
}), env, ctx);
const mail = { to: 'carl@x.fr', name: 'Carl <script>', subject: 'Bob rejoint ta sortie', text: 'Bob a rejoint <b>ta sortie</b>', link: '/', kind: 'ride_join' };

r = await notify(null, mail);
assert.equal(r.status, 401, 'e-mail sans clé refusé');
r = await notify('mauvaise-cle-123456', mail);
assert.equal(r.status, 401, 'e-mail avec mauvaise clé refusé');
assert.equal(brevoCalls.length, 0);
r = await notify('secret-partage-123', { to: 'carl@x.fr' });
assert.equal(r.status, 400, 'e-mail incomplet refusé');
r = await notify('secret-partage-123', mail);
assert.equal(r.status, 200, 'e-mail envoyé');
assert.equal(brevoCalls.length, 1);
const sent = brevoCalls[0];
assert.equal(sent.headers['api-key'], 'brevo-key');
assert.equal(sent.body.to[0].email, 'carl@x.fr');
assert.equal(sent.body.sender.email, 'notifications@test.fr');
assert.ok(!sent.body.htmlContent.includes('<script>') && sent.body.htmlContent.includes('&lt;b&gt;'), 'contenu échappé');
assert.ok(sent.body.htmlContent.includes('https://cyclami.com/'), 'lien vers le site');
assert.ok(sent.body.htmlContent.includes('Ouvrir Cyclami'), 'bouton en français par défaut');
const off = await worker.fetch(new Request('https://photos.test/notify', {
  method: 'POST', headers: { Authorization: 'Bearer secret-partage-123' }, body: JSON.stringify(mail),
}), { ...env, BREVO_API_KEY: '' }, ctx);
assert.equal(off.status, 503, 'pas de clé Brevo : envoi désactivé');

// ---- réponses des refuges (Brevo inbound → base) ----
const { inboundKey } = await import('../src/index.js');
const KEY_IN = await inboundKey(env);
const inbound = (key, body) => worker.fetch(new Request(`https://photos.test/inbound?key=${key}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), env, ctx);
const reply = { items: [{
  MessageId: '<abc@mail>', Subject: 'Re: Proposition', From: { Name: 'Marie', Address: 'marie@refuge.be' },
  To: [{ Name: null, Address: 'refuge-0123456789abcdef0123456789abcdef@reply.cyclami.com' }],
  ExtractedMarkdownMessage: 'Bonjour, c’est gratuit ?', RawTextBody: 'Bonjour, c’est gratuit ?\n> ancien message', SpamScore: 0.4,
}, { From: { Address: 'spam@x.io' }, To: [{ Address: 'a@b.c' }], RawTextBody: 'promo', SpamScore: 9 }] };
r = await inbound('mauvaise', reply);
assert.equal(r.status, 401, 'réception sans bonne clé refusée');
assert.equal(inboundCalls.length, 0);
r = await inbound(KEY_IN, reply);
assert.deepEqual(await r.json(), { received: 2, stored: 2 }, 'toutes les réponses transmises, même notées indésirables');
assert.equal(inboundCalls[1].body.p_from_email, 'spam@x.io');
const got = inboundCalls[0].body;
assert.equal(got.p_secret, 'secret-partage-123');
assert.equal(got.p_from_email, 'marie@refuge.be');
assert.ok(got.p_to.includes('refuge-0123456789abcdef0123456789abcdef@reply.cyclami.com'));
assert.equal(got.p_body, 'Bonjour, c’est gratuit ?', 'message sans la citation');
assert.equal(inboundCalls[0].headers.apikey, 'k');
const errLog = console.error; console.error = () => {};
r = await inbound(KEY_IN, { items: [{ From: { Address: 'panne@refuge.be' }, To: [{ Address: 'a@b.c' }], RawTextBody: 'x' }] });
console.error = errLog;
assert.equal(r.status, 502, 'échec d’enregistrement signalé (Brevo réessaie)');

// ---- quota d'e-mails Brevo (administrateurs seulement) ----
const quota = (token) => worker.fetch(new Request('https://photos.test/email-quota', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
}), env, ctx);
assert.equal((await quota(null)).status, 401, 'quota sans connexion refusé');
assert.equal((await quota('jeton-membre')).status, 403, 'quota refusé à un membre');
r = await quota('jeton-admin');
assert.deepEqual(await r.json(), { type: 'free', credits: 212 }, 'crédits restants pour l’administrateur');

// ---- e-mails de connexion (crochet Supabase signé) ----
const HOOK_KEY = Buffer.from('cle-secrete-du-crochet-supabase!').toString('base64');
const hookEnv = { ...env, AUTH_HOOK_SECRET: `v1,whsec_${HOOK_KEY}` };
async function hook(payload, { key = HOOK_KEY, age = 0 } = {}) {
  const body = JSON.stringify(payload);
  const id = 'msg_1';
  const ts = String(Math.floor(Date.now() / 1000) - age);
  const k = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = Buffer.from(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${id}.${ts}.${body}`))).toString('base64');
  return worker.fetch(new Request('https://photos.test/auth-email', {
    method: 'POST', body, headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` },
  }), hookEnv, ctx);
}
const signup = {
  user: { email: 'dora@x.fr', user_metadata: { name: 'Dora' } },
  email_data: { token: '123456', token_hash: 'abc', email_action_type: 'signup', redirect_to: 'https://cyclami.com', site_url: 'https://cyclami.com' },
};
brevoCalls.length = 0;
assert.equal((await hook(signup, { key: Buffer.from('mauvaise-cle-du-crochet-supabase').toString('base64') })).status, 401, 'signature refusée');
assert.equal((await hook(signup, { age: 3600 })).status, 401, 'appel trop ancien refusé');
assert.equal(brevoCalls.length, 0);
r = await hook(signup);
assert.equal(r.status, 200, 'e-mail de confirmation envoyé');
assert.equal(brevoCalls[0].body.to[0].email, 'dora@x.fr');
assert.equal(brevoCalls[0].body.subject, 'Confirme ton adresse e-mail');
assert.ok(brevoCalls[0].body.htmlContent.includes('https://x.supabase.co/auth/v1/verify?token=abc&amp;type=signup&amp;redirect_to=https%3A%2F%2Fcyclami.com'), 'lien de confirmation');
r = await hook({ user: { email: 'eva@x.fr', user_metadata: { lang: 'nl' } }, email_data: { ...signup.email_data, email_action_type: 'recovery' } });
assert.equal(brevoCalls[1].body.subject, 'Kies een nieuw wachtwoord', 'e-mail en néerlandais');
r = await hook({ user: { email: 'old@x.fr', new_email: 'new@x.fr', user_metadata: {} },
  email_data: { ...signup.email_data, email_action_type: 'email_change', token_hash_new: 'def', token_new: '654321' } });
assert.equal(r.status, 200);
assert.deepEqual(brevoCalls.slice(2).map((c) => c.body.to[0].email), ['old@x.fr', 'new@x.fr'], 'changement d’adresse : deux e-mails');

// ---- notifications push : chiffrement aes128gcm déchiffrable, signature VAPID valide ----
const subtle = crypto.subtle;
const b64u = (b) => Buffer.from(b).toString('base64url');
const vapid = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pushEnv = { ...env, VAPID_PRIVATE_JWK: JSON.stringify(await subtle.exportKey('jwk', vapid.privateKey)) };
const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPub = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));
const sub = { endpoint: 'https://push.example/abc', p256dh: b64u(uaPub), auth: b64u(authSecret) };

r = await worker.fetch(new Request('https://photos.test/push/key'), pushEnv, ctx);
const { key: pubKey } = await r.json();
assert.equal(Buffer.from(pubKey, 'base64url').length, 65, 'clé publique VAPID');

const push = (secret, body) => worker.fetch(new Request('https://photos.test/push', {
  method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(body),
}), pushEnv, ctx);
assert.equal((await push('mauvaise-cle-123456', { subscriptions: [sub], title: 'x' })).status, 401);
r = await push('secret-partage-123', { subscriptions: [sub, { ...sub, endpoint: 'https://push.example/gone' }], title: 'Bob t’a écrit', body: 'Nouveau message', url: '/', tag: 'm:1' });
assert.equal(r.status, 200);
const pushRes = await r.json();
assert.equal(pushRes.sent, 1);
assert.deepEqual(pushRes.gone, ['https://push.example/gone'], 'abonnement expiré signalé');

// déchiffrement côté « navigateur » (RFC 8291)
const pushCall = pushCalls[0];
assert.equal(pushCall.headers["Content-Encoding"], 'aes128gcm');
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

// en-tête VAPID : JWT signé par la clé du service, pour l'origine du service push
const [, t, k] = pushCall.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
assert.equal(k, pubKey);
const [h64, p64, s64] = t.split('.');
assert.equal(JSON.parse(Buffer.from(p64, 'base64url')).aud, 'https://push.example');
assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.publicKey, Buffer.from(s64, 'base64url'), te.encode(`${h64}.${p64}`)), 'signature VAPID');

// ---- lieux utiles : miroirs Overpass, cache par zone ----
const places = (q) => worker.fetch(new Request(`https://photos.test/places?${q}`), env, ctx);
assert.equal((await places('lat=abc&lng=4')).status, 400, 'position invalide');
r = await places('lat=52.372&lng=4.901'); // Amsterdam : hors régions pré-remplies → OpenStreetMap en direct
assert.equal(r.status, 200, 'lieux renvoyés malgré un miroir en panne');
const found = await r.json();
assert.equal(found.length, 2);
assert.deepEqual(found[0], { id: 'w7', lat: 50.71235, lng: 4.39877, kind: 'dog_park', name: 'Caniparc', phone: '', hours: '' });
assert.equal(found[1].kind, 'vet');
await new Promise((ok) => setTimeout(ok, 0));
const before = overpassCalls;
r = await places('lat=52.374&lng=4.899'); // même zone
assert.equal(r.status, 200);
assert.equal(overpassCalls, before, 'deuxième appel servi par le cache');
// import en lot : zones pré-remplies, servies sans interroger OpenStreetMap
const imp = (secret, body) => worker.fetch(new Request('https://photos.test/places/import', {
  method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify(body),
}), env, ctx);
assert.equal((await imp('mauvaise-cle-123456', { cells: { '50.85_4.35': [] } })).status, 401);
r = await imp('secret-partage-123', { cells: { '50.85_4.35': [{ id: 'n9', lat: 50.85, lng: 4.35, kind: 'park', name: 'Parc de Bruxelles', phone: '', hours: '' }], '50.90_4.35': [] }, tiles: ['50_4'] });
assert.equal(r.status, 200);
r = await places('lat=50.851&lng=4.349');
assert.equal((await r.json())[0].name, 'Parc de Bruxelles');
r = await places('lat=50.9&lng=4.35');
assert.deepEqual(await r.json(), [], 'zone vide importée');
assert.equal(overpassCalls, before, 'aucun appel à OpenStreetMap pour les zones importées');
r = await places('lat=50.60&lng=4.70'); // même carreau 50_4, zone sans lieu
assert.deepEqual(await r.json(), [], 'zone vide d’un carreau importé');
assert.equal(overpassCalls, before, 'pas d’appel en direct dans un carreau importé');
r = await worker.fetch(new Request('https://photos.test/places/tiles'), env, ctx);
assert.ok((await r.json())['50_4'] > 0, 'liste des carreaux importés');
r = await places('lat=48.85&lng=2.35'); // Paris : carreau pas encore importé → OpenStreetMap en direct
assert.equal(r.status, 200);
assert.equal(overpassCalls, before + 3, 'carreau non importé : appel en direct (3 miroirs)');

console.log('✅ service photos et e-mails : tous les tests passent');
