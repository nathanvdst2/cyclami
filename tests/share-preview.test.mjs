// node tests/share-preview.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import share, { withPreview } from '../netlify/edge-functions/share.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const out = withPreview(html, { title: 'Tour du lac <b>', description: '📅 14/10 · 📍 Genval', image: 'https://cyclami-photos.x.workers.dev/u/p.jpg' }, 'https://cyclami.com/b/1');
assert.match(out, /<meta property="og:title" content="Tour du lac &lt;b&gt;" \/>/);
assert.match(out, /<meta property="og:image" content="https:\/\/cyclami-photos.x.workers.dev\/u\/p.jpg" \/>/);
assert.match(out, /<meta property="og:url" content="https:\/\/cyclami.com\/b\/1" \/>/);
assert.match(out, /<title>Tour du lac &lt;b&gt; · Cyclami<\/title>/);
assert.ok(!out.includes('og:image:width'));
const ext = withPreview(html, { title: 'X', image: 'https://evil.example/pixel.gif' }, 'https://cyclami.com/a/1');
assert.ok(!ext.includes('evil.example'), 'image externe ignorée');

// fonction complète avec un faux Supabase
globalThis.fetch = async () => new Response(JSON.stringify({ title: '🚨 Perdu : Rex', description: '📍 Ixelles' }), { status: 200 });
const ctx = { next: async () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) };
const res = await share(new Request('https://cyclami.com/p/0b8f6d3e-1111-4222-8333-944445555666'), ctx);
assert.match(await res.text(), /og:title" content="🚨 Perdu : Rex"/);
const other = await share(new Request('https://cyclami.com/discover'), ctx);
assert.match(await other.text(), /Ne promène plus ton compagnon tout seul/);

// pages publiques : contenu écrit dans la page pour Google, et plan du site
const LISTING = { id: '0b8f6d3e-1111-4222-8333-944445555666', title: 'Mimi <3', species: 'chat', breed: 'Européenne', city: 'Namur',
  shelter_id: '1b8f6d3e-1111-4222-8333-944445555666', shelter_name: 'Refuge Test', price_cents: 15000, description: 'Douce',
  shelter: { id: '1b8f6d3e-1111-4222-8333-944445555666', name: 'Refuge Test', approval_number: 'HK123' }, photo_urls: [] };
const RIDE = { id: '2b8f6d3e-1111-4222-8333-944445555666', title: 'Tour du lac', place: 'Lac de Genval', starts_at: '2026-10-20T08:00:00Z', duration: 60, description: '' };
globalThis.fetch = async (url) => {
  const name = String(url).split('/rpc/')[1];
  const data = { public_listings: [LISTING], public_shelters: [{ id: LISTING.shelter_id, name: 'Refuge Test', address: 'Rue X 1, Namur' }],
    public_rides: [RIDE], public_listing: LISTING, public_ride: RIDE }[name];
  return new Response(JSON.stringify(data ?? null), { status: 200 });
};
let page = await (await share(new Request('https://cyclami.com/adoptions'), ctx)).text();
assert.match(page, /<title>Animaux à adopter en refuge · Cyclami<\/title>/);
assert.match(page, /<a href="\/a\/0b8f6d3e-1111-4222-8333-944445555666">Mimi &lt;3<\/a>/, 'liste des animaux écrite dans la page');
assert.match(page, /<link rel="canonical" href="https:\/\/cyclami.com\/adoptions" \/>/);
page = await (await share(new Request('https://cyclami.com/b/2b8f6d3e-1111-4222-8333-944445555666'), ctx)).text();
assert.match(page, /"@type":"Event"/, 'données structurées de la sortie');
page = await (await share(new Request('https://cyclami.com/adoptions/namur'), ctx)).text();
assert.match(page, /<title>Animaux à adopter à Namur · Cyclami<\/title>/, 'page par ville');
const map = await (await share(new Request('https://cyclami.com/sitemap.xml'), ctx)).text();
assert.match(map, /<loc>https:\/\/cyclami.com\/a\/0b8f6d3e-1111-4222-8333-944445555666<\/loc>/);
assert.match(map, /<loc>https:\/\/cyclami.com\/adoptions\/namur<\/loc>/);
assert.match(map, /<loc>https:\/\/cyclami.com\/refuge\/1b8f6d3e-1111-4222-8333-944445555666<\/loc>/);
assert.match(map, /<loc>https:\/\/cyclami.com\/nl\/a\/0b8f6d3e-1111-4222-8333-944445555666<\/loc>/, 'version néerlandaise dans le plan du site');
assert.match(map, /hreflang="en" href="https:\/\/cyclami.com\/en\/adoptions"/);
// pages en néerlandais et en anglais, avec les autres versions signalées à Google
page = await (await share(new Request('https://cyclami.com/nl/adoptions'), ctx)).text();
assert.match(page, /<html lang="nl">/);
assert.match(page, /<title>Dieren ter adoptie in asielen · Cyclami<\/title>/);
assert.match(page, /<a href="\/nl\/a\/0b8f6d3e-1111-4222-8333-944445555666">/, 'liens dans la même langue');
assert.match(page, /<link rel="alternate" hreflang="fr" href="https:\/\/cyclami.com\/adoptions" \/>/);
assert.match(page, /<link rel="alternate" hreflang="x-default" href="https:\/\/cyclami.com\/adoptions" \/>/);
assert.match(page, /<link rel="canonical" href="https:\/\/cyclami.com\/nl\/adoptions" \/>/);
page = await (await share(new Request('https://cyclami.com/en/a/0b8f6d3e-1111-4222-8333-944445555666'), ctx)).text();
assert.match(page, /Cat \(Européenne\) to adopt at Refuge Test, Namur\. €150 adoption fee\./);
page = await (await share(new Request('https://cyclami.com/'), ctx)).text();
assert.match(page, /<link rel="alternate" hreflang="nl" href="https:\/\/cyclami.com\/nl" \/>/, 'accueil : versions des autres langues');
assert.match(page, /<title>Cyclami — Rencontres et sorties entre chiens, chats et maîtres<\/title>/, 'accueil : titre sans « · Cyclami » en double');
assert.match(page, /"@type":"FAQPage"/, 'accueil : questions fréquentes pour Google');
assert.match(page, /\.js #ssr\{visibility:hidden\}/, 'texte pour Google invisible pour les visiteurs pendant le chargement');
assert.match(page, /<h2>Cyclami, c’est une appli de rencontre \?<\/h2>/);
// les questions écrites pour Google sont bien celles affichées sur la page d'accueil
const landing = fs.readFileSync(new URL('../src/pages/Landing.jsx', import.meta.url), 'utf8');
const faq = [...page.matchAll(/<h2>([^<]+)<\/h2>\n<p>([^<]+)<\/p>/g)].map((x) => [x[1], x[2]]);
assert.equal(faq.length, 9);
for (const [q, a] of faq) {
  assert.ok(landing.includes(`['${q}', '${a}']`), `question absente de Landing.jsx ou différente : ${q}`);
}
page = await (await share(new Request('https://cyclami.com/en'), ctx)).text();
assert.match(page, /<title>Cyclami — Meet-ups and rides for dogs, cats and their owners<\/title>/);
assert.match(page, /og:locale" content="en_GB"/);
page = await (await share(new Request('https://cyclami.com/nl/refuges'), ctx)).text();
assert.match(page, /<title>Asielen: laat uw dieren gratis adopteren · Cyclami<\/title>/, 'page d’inscription des refuges');
// pages par ville : sorties et rencontres entre chiens, animaux perdus
const fetchCity = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const name = String(url).split('/rpc/')[1];
  if (name === 'public_city') return new Response(JSON.stringify({ members: 12, dogs: 9, cats: 2, pets: 11, breeds: ['Labrador'], rides: [RIDE], lost_active: 1, shelters: [] }));
  if (name === 'public_lost_alerts') {
    const args = JSON.parse(opts.body);
    return new Response(JSON.stringify(args.p_lat ? [] : [{ id: '3b8f6d3e-1111-4222-8333-944445555666', kind: 'perdu', name: 'Filou', species: 'chat', place: 'Jambes', seen_at: RIDE.starts_at, status: 'active', solved: false, lat: 50.5, lng: 4.9 }]));
  }
  return fetchCity(url, opts);
};
page = await (await share(new Request('https://cyclami.com/sorties/namur'), ctx)).text();
assert.match(page, /<title>Sorties et rencontres entre chiens à Namur · Cyclami<\/title>/);
assert.match(page, /12 membres et 9 chiens à moins de 15 km/);
assert.match(page, /<a href="\/sorties\/charleroi">/, 'liens vers les villes voisines');
assert.match(page, /"@type":"Event"/);
page = await (await share(new Request('https://cyclami.com/nl/sorties/gand'), ctx)).text();
assert.match(page, /<title>Wandelen en kennismaken met honden in Gent · Cyclami<\/title>/);
const unknown = await share(new Request('https://cyclami.com/sorties/atlantide'), ctx);
assert.equal(unknown.status, 404, 'ville inconnue : 404');
page = await (await share(new Request('https://cyclami.com/perdus'), ctx)).text();
assert.match(page, /Perdu : Filou/);
assert.match(page, /<a href="\/perdus\/namur">/, 'villes qui ont des alertes');
page = await (await share(new Request('https://cyclami.com/perdus/liege'), ctx)).text();
assert.match(page, /<meta name="robots" content="noindex" \/>/, 'ville sans alerte : pas dans Google');
const map2 = await (await share(new Request('https://cyclami.com/sitemap.xml'), ctx)).text();
assert.match(map2, /<loc>https:\/\/cyclami.com\/sorties\/bruxelles<\/loc>/);
assert.match(map2, /<loc>https:\/\/cyclami.com\/nl\/sorties\/bruxelles<\/loc>/);
assert.match(map2, /<loc>https:\/\/cyclami.com\/perdus\/namur<\/loc>/);
assert.ok(!map2.includes('/perdus/liege'), 'pages vides absentes du plan du site');
console.log('✅ aperçu des liens partagés : tous les tests passent');
