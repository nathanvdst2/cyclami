// node tests/share-preview.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Supabase simulé : la fonction lit son adresse dans les variables d'environnement.
process.env.SUPABASE_URL = 'https://projet-test.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
const { default: share, withPreview } = await import('../netlify/edge-functions/share.js');
const PHOTO = 'https://projet-test.supabase.co/storage/v1/object/public/photos/u/p.jpg';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const out = withPreview(html, { title: 'Tour du lac <b>', description: '📅 14/10 · 📍 Genval', image: PHOTO }, 'https://cyclami.com/s/1');
assert.match(out, /<meta property="og:title" content="Tour du lac &lt;b&gt;" \/>/);
assert.ok(out.includes(`<meta property="og:image" content="${PHOTO}" />`), 'photo du site acceptée comme image d’aperçu');
assert.match(out, /<meta property="og:url" content="https:\/\/cyclami.com\/s\/1" \/>/);
assert.match(out, /<title>Tour du lac &lt;b&gt; · Cyclami<\/title>/);
assert.ok(!out.includes('og:image:width'));
const ext = withPreview(html, { title: 'X', image: 'https://evil.example/pixel.gif' }, 'https://cyclami.com/g/1');
assert.ok(!ext.includes('evil.example'), 'image externe ignorée');

// aperçu d'un lien réservé aux membres (sujet du forum, club, profil) avec un faux Supabase
const ID = '0b8f6d3e-1111-4222-8333-944445555666';
let previewArgs = null;
globalThis.fetch = async (url, opts) => {
  previewArgs = JSON.parse(opts.body);
  return new Response(JSON.stringify({ title: '💬 Quel braquet pour la Redoute ?', description: 'Je prépare Liège-Bastogne-Liège…', image: PHOTO }), { status: 200 });
};
const ctx = { next: async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) };
let page = await (await share(new Request(`https://cyclami.com/f/${ID}`), ctx)).text();
assert.match(page, /og:title" content="💬 Quel braquet pour la Redoute \?"/);
assert.deepEqual(previewArgs, { p_kind: 'f', p_id: ID });
assert.ok(!page.includes('rel="canonical"'), 'page réservée aux membres : pas d’adresse canonique');
page = await (await share(new Request(`https://cyclami.com/p/${ID}`), ctx)).text();
assert.ok(!page.includes(PHOTO), 'profil : jamais de photo dans l’aperçu');
const other = await share(new Request('https://cyclami.com/discover'), ctx);
assert.equal(await other.text(), html, 'autres adresses : page de l’application inchangée');

// pages publiques : contenu écrit dans la page pour Google, et plan du site
const RIDE = { id: '2b8f6d3e-1111-4222-8333-944445555666', title: 'Tour du lac <3', place: 'Lac de Genval', starts_at: '2026-10-20T08:00:00Z',
  duration: 150, description: 'Café à mi-parcours', ride_type: 'route', level: 'intermediaire', avg_speed: 25, distance_km: 62.5,
  elevation_m: 480, no_drop: true, max_participants: 8, participants: 3, lat: 50.73, lng: 4.51 };
const GROUP = { id: '4b8f6d3e-1111-4222-8333-944445555666', name: 'Les Rouleurs du Condroz', emoji: '🚴', city: 'Namur', member_count: 12 };
const calls = [];
globalThis.fetch = async (url, opts) => {
  const name = String(url).split('/rpc/')[1];
  calls.push(String(url));
  assert.equal(opts.headers.apikey, 'sb_publishable_test', 'clé publique envoyée');
  const data = {
    public_rides: [RIDE], public_ride: RIDE,
    public_city: { members: 12, rides: [RIDE], groups: [GROUP], levels: { intermediaire: 7 } },
  }[name];
  return new Response(JSON.stringify(data ?? null), { status: 200 });
};
page = await (await share(new Request('https://cyclami.com/sorties'), ctx)).text();
assert.ok(calls[0].startsWith('https://projet-test.supabase.co/rest/v1/rpc/'), 'adresse Supabase lue dans l’environnement');
assert.match(page, /<title>Sorties vélo à venir · Cyclami<\/title>/);
assert.match(page, /<a href="\/s\/2b8f6d3e-1111-4222-8333-944445555666">Tour du lac &lt;3<\/a>/, 'liste des sorties écrite dans la page');
assert.match(page, /Route · Intermédiaire · 62,5 km · 480 m D\+ · 25 km\/h · pas de lâchage/, 'type, niveau, distance, dénivelé, allure');
assert.match(page, /<link rel="canonical" href="https:\/\/cyclami.com\/sorties" \/>/);
assert.match(page, /<a href="\/sorties\/namur">Sorties vélo et cyclistes à Namur<\/a>/, 'liens vers les pages par ville');
assert.match(page, /chacun roule sous sa propre responsabilité/, 'avertissement de sécurité routière');
page = await (await share(new Request('https://cyclami.com/s/2b8f6d3e-1111-4222-8333-944445555666'), ctx)).text();
assert.match(page, /"@type":"Event"/, 'données structurées de la sortie');
assert.match(page, /"url":"https:\/\/cyclami.com\/s\/2b8f6d3e-1111-4222-8333-944445555666"/);
assert.match(page, /<title>🚴 Tour du lac &lt;3 · Cyclami<\/title>/);
assert.match(page, /og:description" content="📅 [^"]+ · 📍 Lac de Genval · Route · Intermédiaire/);
page = await (await share(new Request('https://cyclami.com/en/s/2b8f6d3e-1111-4222-8333-944445555666'), ctx)).text();
assert.match(page, /Road · Intermediate · 62.5 km · 480 m elevation gain · 25 km\/h · no-drop/);
assert.match(page, /— Group bike ride on Cyclami\./);

// pages par ville : sorties vélo et cyclistes
page = await (await share(new Request('https://cyclami.com/sorties/namur'), ctx)).text();
assert.match(page, /<title>Sorties vélo et cyclistes à Namur · Cyclami<\/title>/);
assert.match(page, /12 cyclistes à moins de 15 km, 1 sorties prévues, 1 clubs et groupes\./);
assert.match(page, /<a href="\/g\/4b8f6d3e-1111-4222-8333-944445555666">Les Rouleurs du Condroz<\/a>/, 'clubs de la ville');
page = await (await share(new Request('https://cyclami.com/nl/sorties/namur'), ctx)).text();
assert.match(page, /<title>Fietstochten en fietsers in Namen · Cyclami<\/title>/);
assert.match(page, /<a href="\/nl\/s\/2b8f6d3e/, 'liens dans la même langue');
let res = await share(new Request('https://cyclami.com/sorties/atlantide'), ctx);
assert.equal(res.status, 404, 'ville inconnue : code 404');

// plan du site
const map = await (await share(new Request('https://cyclami.com/sitemap.xml'), ctx)).text();
assert.match(map, /<loc>https:\/\/cyclami.com\/s\/2b8f6d3e-1111-4222-8333-944445555666<\/loc>/);
assert.match(map, /<loc>https:\/\/cyclami.com\/nl\/s\/2b8f6d3e-1111-4222-8333-944445555666<\/loc>/, 'version néerlandaise dans le plan du site');
assert.match(map, /<loc>https:\/\/cyclami.com\/sorties\/bruxelles<\/loc>/);
assert.match(map, /<loc>https:\/\/cyclami.com\/en\/sorties\/bruxelles<\/loc>/);
assert.match(map, /hreflang="en" href="https:\/\/cyclami.com\/en\/sorties"/);
assert.match(map, /<loc>https:\/\/cyclami.com\/mentions-legales<\/loc>/);
assert.ok(!/adoptions|refuge|perdus|\/a\/|\/b\//.test(map), 'plus aucune ancienne page dans le plan du site');

// pages en néerlandais et en anglais, avec les autres versions signalées à Google
page = await (await share(new Request('https://cyclami.com/nl/sorties'), ctx)).text();
assert.match(page, /<html lang="nl">/);
assert.match(page, /<title>Komende fietstochten · Cyclami<\/title>/);
assert.match(page, /<link rel="alternate" hreflang="fr" href="https:\/\/cyclami.com\/sorties" \/>/);
assert.match(page, /<link rel="alternate" hreflang="x-default" href="https:\/\/cyclami.com\/sorties" \/>/);
assert.match(page, /<link rel="canonical" href="https:\/\/cyclami.com\/nl\/sorties" \/>/);

// page d'accueil
page = await (await share(new Request('https://cyclami.com/'), ctx)).text();
assert.match(page, /<link rel="alternate" hreflang="nl" href="https:\/\/cyclami.com\/nl" \/>/, 'accueil : versions des autres langues');
assert.match(page, /<title>Cyclami — Trouve des cyclistes de ton niveau et roulez ensemble<\/title>/, 'accueil : titre sans « · Cyclami » en double');
assert.match(page, /"@type":"FAQPage"/, 'accueil : questions fréquentes pour Google');
assert.match(page, /\.js #ssr\{visibility:hidden\}/, 'texte pour Google invisible pour les visiteurs pendant le chargement');
assert.match(page, /<h2>Cyclami, c’est quoi \?<\/h2>/);
// les questions écrites pour Google sont bien celles affichées sur la page d'accueil (et leurs traductions)
const landing = fs.readFileSync(new URL('../src/pages/Landing.jsx', import.meta.url), 'utf8');
const faq = [...page.matchAll(/<h2>([^<]+)<\/h2>\n<p>([^<]+)<\/p>/g)].map((x) => [x[1], x[2]]);
assert.equal(faq.length, 9);
for (const [q, a] of faq) {
  assert.ok(landing.includes(`['${q}', '${a}']`), `question absente de Landing.jsx ou différente : ${q}`);
}
for (const lang of ['nl', 'en']) {
  const dict = (await import(`../src/i18n/${lang}/Landing.js`)).default;
  const local = await (await share(new Request(`https://cyclami.com/${lang}`), ctx)).text();
  const qa = [...local.matchAll(/<h2>([^<]+)<\/h2>\n<p>([^<]+)<\/p>/g)].map((x) => [x[1], x[2]].map((s) => s.replace(/&quot;/g, '"')));
  assert.equal(qa.length, 9);
  faq.forEach(([q, a], i) => {
    assert.equal(dict[q], qa[i][0], `${lang} : question traduite différemment dans Landing.js : ${q}`);
    assert.equal(dict[a], qa[i][1], `${lang} : réponse traduite différemment dans Landing.js : ${q}`);
  });
}
page = await (await share(new Request('https://cyclami.com/en'), ctx)).text();
assert.match(page, /<title>Cyclami — Find cyclists of your level and ride together<\/title>/);
assert.match(page, /og:locale" content="en_GB"/);
// plus aucune trace des anciennes pages
for (const old of ['/adoptions', '/refuges', '/perdus', `/a/${ID}`, `/b/${ID}`]) {
  res = await share(new Request(`https://cyclami.com${old}`), ctx);
  assert.equal(await res.text(), html, `${old} : plus de page publique`);
}

// base pas encore configurée : la page de l'application est servie telle quelle
delete process.env.SUPABASE_URL;
globalThis.fetch = async () => { throw new Error('aucun appel attendu'); };
page = await (await share(new Request('https://cyclami.com/sorties'), ctx)).text();
assert.equal(page, html);
console.log('✅ aperçu des liens partagés : tous les tests passent');
