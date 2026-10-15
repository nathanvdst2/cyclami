// Test de fumée : ouvre le site construit (dist/) dans Chromium, avec une fausse base Supabase
// et de fausses fonctions /api/*, parcourt toutes les pages et échoue à la moindre erreur JavaScript.
// Usage : npm run build && npm run test:smoke        (captures d'écran : SHOTS_DIR=dossier)
// Si dist/ a été construit sans VITE_SUPABASE_URL, une copie de test est reconstruite automatiquement
// avec un projet Supabase fictif (aucune vraie base n'est contactée).
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let DIST = path.resolve(process.argv[2] || 'dist');
const OUT = process.env.SHOTS_DIR || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });

// ---- Adresse Supabase compilée dans le site (la session de test en dépend) ----
const supabaseHostIn = (dir) => {
  const assets = path.join(dir, 'assets');
  if (!fs.existsSync(assets)) return null;
  for (const f of fs.readdirSync(assets).filter((x) => x.endsWith('.js'))) {
    const m = fs.readFileSync(path.join(assets, f), 'utf8').match(/https:\/\/([a-z0-9-]+)\.supabase\.co/);
    if (m) return m[1];
  }
  return null;
};
let REF = supabaseHostIn(DIST);
if (!REF) {
  const testDist = path.resolve('node_modules/.cache/cyclami-smoke-dist');
  console.log(`ℹ️  ${DIST} construit sans VITE_SUPABASE_URL : construction d'une copie de test dans ${testDist}…`);
  execSync(`npx vite build --outDir "${testDist}" --emptyOutDir --logLevel error`, {
    stdio: 'inherit',
    env: { ...process.env, VITE_SUPABASE_URL: 'https://cyclami-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
  });
  DIST = testDist;
  REF = supabaseHostIn(DIST);
  if (!REF) throw new Error('adresse Supabase introuvable dans le site construit');
}
const AUTH_KEY = `sb-${REF}-auth-token`;

const ORIGIN = 'https://cyclami.test';
const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000002';
const now = Date.now();
const iso = (ms) => new Date(now + ms).toISOString();
const day = (ms) => new Date(now + ms).toLocaleDateString('fr-CA');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(now / 1000) + 3600 * 24;
const jwtFor = (sub, email) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, exp, role: 'authenticated', aud: 'authenticated', email })}.sig`;
const user = { id: ME, email: 'moi@test.fr', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: iso(-1e9) };
const session = { access_token: jwtFor(ME, 'moi@test.fr'), refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user };
const PHOTO = `https://${REF}.supabase.co/storage/v1/object/public/photos/${BOB}/velo.webp`;
// petit tracé GPX simplifié autour du lac Daumesnil
const ROUTE = Array.from({ length: 24 }, (_, i) => [48.833 + 0.004 * Math.sin(i / 3.8), 2.41 + 0.006 * Math.cos(i / 3.8)]);

const T = {
  profiles: [
    { id: ME, name: 'Nathan', city: 'Paris 11e', bio: 'Rouleur du dimanche', availability: ['Matin'], lat: 48.86, lng: 2.37, created_at: iso(-1e9), xp: 180,
      disciplines: ['route', 'vtt_gravel'], level: 'intermediaire', usual_speed: 24, lang: 'fr' },
    { id: BOB, name: 'Bob', city: 'Paris 20e', bio: 'Sorties gravel <b>html</b>', availability: ['Soir'], lat: 48.87, lng: 2.39, created_at: iso(-2e9), xp: 640,
      last_seen_at: iso(-30e3), show_presence: true, disciplines: ['route'], level: 'confirme', usual_speed: 27, lang: 'fr' },
  ],
  bikes: [
    { id: 'bk1', owner_id: ME, name: 'Mon Canyon', kind: 'route', brand: 'Canyon', photo_url: null, created_at: iso(-1e9) },
    { id: 'bk2', owner_id: BOB, name: 'Gravel du dimanche', kind: 'gravel', brand: '<img src=x onerror=alert(1)>', photo_url: PHOTO, created_at: iso(-1e9) },
  ],
  rides: [
    { id: 'w0', host_id: BOB, title: 'Sortie passée', place: 'Bois de Vincennes', starts_at: iso(-2 * 86400e3), duration: 120, max_participants: 8, description: '', lat: 48.83, lng: 2.43, created_at: iso(-5e8),
      ride_type: 'route', level: 'intermediaire', avg_speed: 24, distance_km: 45, elevation_m: 220, no_drop: true, route: null },
    { id: 'w1', host_id: BOB, title: 'Tour du lac', place: 'Lac Daumesnil', starts_at: iso(86400e3), duration: 90, max_participants: 8, description: 'Rythme régulier, pause café', lat: 48.83, lng: 2.41, created_at: iso(-1e6),
      series_id: 's1', group_id: 'g1', ride_type: 'route', level: 'intermediaire', avg_speed: 25.5, distance_km: 42, elevation_m: 310, no_drop: true, route: ROUTE },
    { id: 'w3', host_id: BOB, title: 'Tour du lac', place: 'Lac Daumesnil', starts_at: iso(8 * 86400e3), duration: 90, max_participants: 8, description: 'Rythme régulier, pause café', lat: 48.83, lng: 2.41, created_at: iso(-1e6),
      series_id: 's1', ride_type: 'route', level: 'intermediaire', avg_speed: 25.5, distance_km: 42, elevation_m: 310, no_drop: true, route: ROUTE },
    { id: 'w2', host_id: ME, title: 'Gravel en forêt', place: 'Forêt de Bondy', starts_at: iso(2 * 86400e3), duration: 150, max_participants: 6, description: '', lat: null, lng: null, created_at: iso(-1e6),
      ride_type: 'vtt_gravel', level: 'debutant', avg_speed: 16, distance_km: 30, elevation_m: 150, no_drop: false, route: null },
  ],
  ride_participants: [{ ride_id: 'w1', user_id: BOB }, { ride_id: 'w2', user_id: ME }, { ride_id: 'w2', user_id: BOB }, { ride_id: 'w0', user_id: ME }, { ride_id: 'w0', user_id: BOB }],
  ride_messages: [{ id: 'wm1', ride_id: 'w2', author_id: BOB, body: 'On se retrouve au parking de la forêt ?', created_at: iso(-3600e3) }],
  ride_reviews: [{ id: 'rv1', ride_id: 'w0', reviewer_id: BOB, reviewee_id: ME, comment: 'Super rythme, très régulier', created_at: iso(-3600e3) }],
  ride_tracks: [
    { id: 'tr1', user_id: ME, ride_id: 'w0', started_at: iso(-2 * 86400e3), duration_s: 6300, distance_m: 45200, avg_speed: 25.8, max_speed: 48.2, created_at: iso(-2 * 86400e3) },
    { id: 'tr2', user_id: ME, ride_id: null, started_at: iso(-4 * 86400e3), duration_s: 3600, distance_m: 21500, avg_speed: 21.5, max_speed: 39, created_at: iso(-4 * 86400e3) },
  ],
  feedback: [{ id: 'fb1', user_id: BOB, kind: 'bug', body: 'La carte ne se charge pas sur mon iPhone', page: 'discover', device: { ua: 'Mozilla/5.0 (iPhone)', screen: '390x844', lang: 'fr', standalone: 'true' }, photo_url: null, status: 'new', created_at: iso(-7200e3) }],
  chat_messages: [
    { id: 'cm0', author_id: BOB, body: '', audio_path: `${BOB}/11111111-1111-4111-8111-111111111111.webm`, audio_seconds: 9, hidden_at: null, created_at: iso(-900e3) },
    { id: 'cm1', author_id: BOB, body: 'Quelqu’un roule vers Chantilly samedi ?', hidden_at: null, created_at: iso(-1800e3) },
  ],
  place_reviews: [{ place_id: 'n2', user_id: BOB, rating: 4, body: 'Borne bien équipée, pompe qui marche', updated_at: iso(-86400e3) }],
  place_favorites: [],
  forum_topics: [
    { id: 'ft1', author_id: BOB, category: 'conseils', title: 'Quelle pression pour des pneus de 28 mm ?', body: 'Je pèse 75 kg.', pinned: true, locked: false, reply_count: 1, last_reply_at: iso(-3600e3), hidden_at: null, created_at: iso(-7200e3), updated_at: iso(-7200e3) },
  ],
  forum_replies: [{ id: 'fr1', topic_id: 'ft1', author_id: ME, body: 'Autour de 5,5 bars à l’arrière.', hidden_at: null, created_at: iso(-3600e3) }],
  groups: [
    { id: 'g1', owner_id: BOB, name: 'Les Rouleurs de l’Est parisien', description: 'Sorties route le samedi matin', emoji: '🚴', city: 'Paris 20e', lat: 48.87, lng: 2.39, member_count: 2, hidden_at: null, created_at: iso(-5e8) },
    { id: 'g2', owner_id: BOB, name: 'Gravel Ixelles', description: '', emoji: '🚵', city: 'Ixelles', lat: 50.83, lng: 4.37, member_count: 1, hidden_at: null, created_at: iso(-5e8) },
  ],
  group_members: [
    { group_id: 'g1', user_id: BOB, role: 'owner', joined_at: iso(-5e8) },
    { group_id: 'g1', user_id: ME, role: 'member', joined_at: iso(-1e8) },
    { group_id: 'g2', user_id: BOB, role: 'owner', joined_at: iso(-5e8) },
  ],
  group_messages: [
    { id: 'gm1', group_id: 'g1', author_id: BOB, body: 'Départ samedi 8 h 30 au lac !', photo_url: null, hidden_at: null, created_at: iso(-3600e3) },
    { id: 'gm2', group_id: 'g1', author_id: BOB, body: '', photo_url: PHOTO, hidden_at: null, created_at: iso(-1800e3) },
  ],
  client_errors: [{ id: 'ce1', message: 'TypeError: undefined is not an object', stack: 'at Discover', page: 'discover', user_agent: 'Safari', count: 3, first_at: iso(-7200e3), last_at: iso(-60e3) }],
  hazards: [
    { id: 'hz1', author_id: BOB, kind: 'nid_de_poule', description: 'Gros nid-de-poule dans la descente, côté droit.', photo_url: null, place: 'Avenue de Gravelle', lat: 48.828, lng: 2.42, expires_at: iso(5 * 86400e3), resolved_at: null, hidden_at: null, created_at: iso(-5400e3) },
    { id: 'hz2', author_id: BOB, kind: 'travaux', description: '', photo_url: null, place: 'Route de la Pyramide', lat: 48.835, lng: 2.44, expires_at: iso(25 * 86400e3), resolved_at: null, hidden_at: null, created_at: iso(-86400e3) },
  ],
  hazard_votes: [{ hazard_id: 'hz1', user_id: BOB, vote: 'still', created_at: iso(-3600e3) }],
  posts: [{ id: 'po1', author_id: BOB, body: 'Belle sortie ce matin au lever du soleil', scene: '🌄', photo_url: null, created_at: iso(-3600e3) }],
  post_likes: [{ post_id: 'po1', user_id: ME }],
  comments: [{ id: 'c1', author_id: ME, post_id: 'po1', ride_id: null, body: 'Superbe lumière !', created_at: iso(-60e3) }],
  messages: [
    { id: 'm1', sender_id: BOB, recipient_id: ME, body: 'Salut ! Tu viens samedi ?', photo_url: null, created_at: iso(-7200e3), read_at: null },
    { id: 'm2', sender_id: ME, recipient_id: BOB, body: '', photo_url: `${ME}/photo.webp`, created_at: iso(-3600e3), read_at: null },
    { id: 'm2b', sender_id: BOB, recipient_id: ME, body: '', photo_url: null, audio_path: `${BOB}/22222222-2222-4222-8222-222222222222.webm`, audio_seconds: 14, created_at: iso(-2700e3), read_at: null },
    { id: 'm3', sender_id: ME, recipient_id: BOB, body: 'À demain !', photo_url: null, created_at: iso(-1800e3), read_at: iso(-60e3) },
  ],
  blocks: [],
  follows: [],
  admins: [{ user_id: ME, role: 'admin' }, { user_id: BOB, role: 'moderator' }],
  reports: [
    { id: 'r1', reporter_id: ME, reported_id: BOB, target_type: 'post', target_id: 'po1', category: 'harcelement', reason: 'Message déplacé', snapshot: 'Belle sortie (copie)', created_at: iso(-600e3), resolved_at: null },
    { id: 'r2', reporter_id: BOB, reported_id: BOB, target_type: 'ride', target_id: 'w1', category: 'conduite_dangereuse', reason: 'Feux rouges grillés', snapshot: 'Tour du lac (copie)', created_at: iso(-500e3), resolved_at: null },
  ],
  moderation_log: [{ id: 'l1', actor_id: ME, action: 'avertissement', target_type: 'user', target_user: BOB, target_name: 'Bob', reason: 'Sois gentil', created_at: iso(-60e3) }],
  suspensions: [],
  notification_settings: [{ user_id: ME, email_messages: false, email_activity: true }],
  banned_emails: [],
  push_subscriptions: [],
  verifications: [],
  profile_verifications: [],
  notifications: [
    { id: 'n1', user_id: ME, actor_id: BOB, type: 'ride_join', post_id: null, ride_id: 'w2', data: { title: 'Gravel en forêt' }, read_at: null, created_at: iso(-60e3) },
    { id: 'n3', user_id: ME, actor_id: BOB, type: 'group_message', post_id: null, ride_id: null, data: { group_id: 'g1', title: 'Les Rouleurs de l’Est parisien', excerpt: 'Départ samedi' }, read_at: null, created_at: iso(-90e3) },
    { id: 'n4', user_id: ME, actor_id: null, type: 'ride_reminder', post_id: null, ride_id: 'w2', data: { title: 'Gravel en forêt', time: '10:30', place: 'Forêt de Bondy' }, read_at: null, created_at: iso(-100e3) },
    { id: 'n5', user_id: ME, actor_id: BOB, type: 'hazard', post_id: null, ride_id: null, data: { kind: 'nid_de_poule', place: 'Avenue de Gravelle' }, read_at: null, created_at: iso(-110e3) },
    { id: 'n2', user_id: ME, actor_id: null, type: 'ride_cancelled', post_id: null, ride_id: 'wx', data: { title: 'Vieille sortie' }, read_at: null, created_at: iso(-120e3) },
  ],
};

// Fonctions /api/* simulées
const PLACES = [
  { id: 'n1', lat: 48.861, lng: 2.381, kind: 'shop', name: 'Vélo Service test', phone: '+33 1 00 00 00 00', hours: 'Mo-Sa 09:00-19:00' },
  { id: 'n2', lat: 48.862, lng: 2.382, kind: 'repair', name: 'Borne de réparation test', phone: '', hours: '' },
  { id: 'n3', lat: 48.863, lng: 2.383, kind: 'water', name: '', phone: '', hours: '' },
  { id: 'n4', lat: 48.864, lng: 2.384, kind: 'pump', name: '', phone: '', hours: '' },
];

const RPC = () => ({
  claim_daily_xp: { gained: 5, streak: 3 },
  place_ratings: [{ place_id: 'n2', average: 4, total: 1 }],
  admin_member_details: { email: 'bob@test.fr', providers: ['google'], created_at: iso(-2e9), last_sign_in_at: iso(-3600e3), email_confirmed_at: iso(-2e9),
    lat: 48.87, lng: 2.39, city: 'Paris 20e', lang: 'fr', sessions: [{ ip: '81.240.12.34', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1', at: iso(-600e3) }] },
  admin_member_extra: {
    devices: [{ user_agent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36',
      info: { screen: '1080x2340', timezone: 'Europe/Brussels', standalone: 'oui' }, first_seen: iso(-9e8), last_seen: iso(-3600e3) }],
    last_active: iso(-120e3), show_presence: true, suspended_until: null,
    counts: { bikes: 1, posts: 3, messages_sent: 12, reports_against: 2, blocked_by: 0 },
  },
  member_achievements: { xp: 180, posts: 2, rides_hosted: 3, rides_joined: 4, guests: 6, likes_received: 12, comments: 5, bikes: 1, best_streak: 8, km: 66.7 },
  xp_leaderboard: [
    { user_id: BOB, name: 'Bob', city: 'Paris 20e', points: 95, xp: 640 },
    { user_id: ME, name: 'Nathan', city: 'Paris 11e', points: 40, xp: 180 },
  ],
  admin_traffic: { days: [{ day: '2026-10-11', visits: 12, views: 40, signups: 2 }, { day: '2026-10-12', visits: 20, views: 75, signups: 3 }], pages: [{ page: 'discover', views: 60 }, { page: 'landing', views: 30 }], active_7d: 9, active_30d: 14 },
  follow_counts: { followers: 12, following: 3, i_follow: false, follows_me: true },
  follow_list: [{ id: ME, name: 'Nathan', city: 'Paris 11e', avatar_url: null, i_follow: false }],
  global_search: { members: [{ id: BOB, name: 'Bob', city: 'Paris 20e', avatar_url: null }], topics: [{ id: 'ft1', title: 'Quelle pression pour des pneus de 28 mm ?', reply_count: 1 }], rides: [], groups: [] },
  donation_links: { once: 'https://donate.example/once', monthly: 'https://donate.example/monthly' },
  pioneer_rank: 2,
  referral_stats: { code: 'aaaaaaaa00', count: 2, pending: 1, members: [{ id: BOB, name: 'Bob', has_bike: true }, { id: 'x1', name: 'Chloé', has_bike: true }, { id: 'x2', name: 'Hugo', has_bike: false }] },
  top_neighbourhoods: [{ city: 'Paris 11e', members: 14, active: 11, newcomers: 4, rides: 6, score: 37 }, { city: 'Namur', members: 9, active: 7, newcomers: 3, rides: 2, score: 19 }],
  start_verification: { id: '9b8f6d3e-1111-4222-8333-944445555666', actions: ['pouce', 'sourire', 'clin_oeil'], code: '4719', expires_at: iso(300e3) },
  submit_verification: null,
  admin_verifications: [],
  admin_decide_verification: null,
  vote_hazard: { expires_at: iso(7 * 86400e3), resolved: false },
  online_count: 3,
  follow_suggestions: [{ id: BOB, name: 'Bob', city: 'Paris 20e', avatar_url: null, km: 2, level: 'confirme', disciplines: ['route'] }],
  admin_search_stats: { updated_at: iso(-3600e3), days: [], queries: [], pages: [] },
  admin_stats: { members: 2, members_7d: 2, members_prev_7d: 0, active_7d: 2, online: 1, bikes: 2, rides_upcoming: 3, rides_7d: 1, posts: 1, posts_7d: 1,
    messages: 4, messages_7d: 4, chat_7d: 1, reports_open: 2, feedback_new: 1, errors_24h: 1, hazards_active: 2,
    signups_14d: Array.from({ length: 14 }, (_, i) => ({ day: new Date(now - (13 - i) * 86400e3).toISOString(), n: i % 4 === 0 ? 1 : 0 })) },
  admin_members: T.profiles.map((p) => ({ ...p, email: `${p.name.toLowerCase()}@test.fr`, last_sign_in_at: iso(-60e3), bikes: 1, posts: 0, reports_against: p.id === BOB ? 2 : 0, warnings: p.id === BOB ? 1 : 0, suspended_until: null })),
  name_allowed: true,
  export_my_data: {},
});

const errors = [];
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH && { executablePath: process.env.CHROMIUM_PATH }),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
  permissions: ['geolocation', 'camera', 'microphone'], geolocation: { latitude: 48.861, longitude: 2.381, accuracy: 10 } });
const page = await ctx.newPage();
const watch = (p, label = '') => {
  p.on('pageerror', (e) => errors.push(`pageerror${label}: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|net::/.test(m.text())) errors.push(`console${label}: ${m.text()}`); });
};
watch(page);
let expectDialog = null; // confirmation attendue (texte exact) : acceptée une fois
page.on('dialog', (d) => {
  if (expectDialog && d.message() === expectDialog) { expectDialog = null; d.accept(); return; }
  if (/alert\(1\)|^1$/.test(d.message())) errors.push(`DIALOG (XSS?): ${d.message()}`);
  d.dismiss().catch(() => {});
});

const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
const serveStatic = (route, url) => {
  let p = path.join(DIST, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(p)] || 'application/octet-stream', body: fs.readFileSync(p) });
};
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const mockRoute = async (route, rpcs = RPC()) => {
  const req = route.request();
  const url = new URL(req.url());
  if (url.origin === ORIGIN) {
    if (url.pathname === '/api/places') return json(route, PLACES);
    if (url.pathname.startsWith('/api/')) return json(route, { error: 'indisponible en test' }, 503);
    return serveStatic(route, url);
  }
  if (url.hostname.endsWith('supabase.co')) {
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(\w+)/);
    if (rpc) return json(route, rpcs[rpc[1]] ?? null);
    const m = url.pathname.match(/\/rest\/v1\/(\w+)/);
    if (m) {
      const single = (req.headers().accept || '').includes('vnd.pgrst.object');
      if (req.method() === 'GET' || req.method() === 'HEAD') {
        // filtres PostgREST simples : col=eq.x, col=in.(a,b), lt/lte/gt/gte
        let rows = T[m[1]] || [];
        for (const [col, val] of url.searchParams) {
          if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(col)) continue;
          if (val.startsWith('eq.')) rows = rows.filter((r) => String(r[col]) === val.slice(3));
          else if (val === 'is.null') rows = rows.filter((r) => r[col] == null);
          else if (/^(lt|lte|gt|gte)\./.test(val)) {
            const [op, ...rest] = val.split('.');
            const v = rest.join('.');
            const num = !Number.isNaN(Number(v));
            const cmp = (x) => (num ? Number(x) - Number(v) : String(x) < v ? -1 : String(x) > v ? 1 : 0);
            rows = rows.filter((r) => r[col] != null && ({ lt: cmp(r[col]) < 0, lte: cmp(r[col]) <= 0, gt: cmp(r[col]) > 0, gte: cmp(r[col]) >= 0 })[op]);
          } else if (val.startsWith('in.(')) {
            const list = val.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, ''));
            rows = rows.filter((r) => list.includes(String(r[col])));
          }
        }
        const order = url.searchParams.get('order');
        if (order) {
          const [col, dir] = order.split(',')[0].split('.');
          rows = [...rows].sort((x, y) => String(x[col]).localeCompare(String(y[col])) * (dir === 'desc' ? -1 : 1));
        }
        return json(route, single ? (rows[0] ?? null) : rows);
      }
      if (req.method() === 'POST') {
        let row = {};
        try { row = JSON.parse(req.postData() || '{}'); } catch { /* corps vide */ }
        const one = Array.isArray(row) ? row[0] : row;
        const saved = { id: `new-${m[1]}-${Date.now()}`, created_at: new Date().toISOString(), ...one };
        if (T[m[1]] && ['chat_messages', 'bikes', 'ride_tracks'].includes(m[1])) T[m[1]].push(saved);
        return json(route, single ? saved : [saved], 201);
      }
      return json(route, single ? null : [], 200);
    }
    if (url.pathname.includes('/storage/v1/object/sign')) {
      const { paths = [] } = JSON.parse(req.postData() || '{}');
      return json(route, paths.map((p) => ({ path: p, signedURL: `/object/sign/x/${p}?token=t`, error: null })));
    }
    if (url.pathname.includes('/storage/v1/object/list')) return json(route, []);
    if (url.pathname.includes('/storage/v1/object/public/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(DIST, 'favicon.png')) });
    }
    if (url.pathname.includes('/auth/v1/user')) return json(route, user);
    return json(route, {});
  }
  if (url.hostname === 'ipwho.is') {
    return json(route, { success: true, ip: '81.240.12.34', country: 'Belgique', country_code: 'BE', region: 'Bruxelles', city: 'Ixelles', postal: '1050',
      latitude: 50.83, longitude: 4.37, timezone: { id: 'Europe/Brussels' }, connection: { asn: 5432, org: 'Proximus NV', isp: 'Proximus' } });
  }
  if (url.hostname === 'nominatim.openstreetmap.org') {
    return json(route, url.pathname === '/search' ? [{ lat: '48.86', lon: '2.38', display_name: 'Paris 11e, Paris, France', name: 'Paris 11e' }] : {
      name: 'Lac Daumesnil', display_name: 'Lac Daumesnil, Route de Ceinture du Lac Daumesnil, Paris',
      address: { road: 'Route de Ceinture du Lac Daumesnil', postcode: '75012', city: 'Paris' },
    });
  }
  if (url.hostname.endsWith('open-meteo.com')) {
    // prévisions horaires factices : pluie probable et vent de sud-ouest
    const start = new Date(); start.setUTCMinutes(0, 0, 0);
    const time = Array.from({ length: 16 * 24 }, (_, i) => new Date(start.getTime() + i * 3600e3).toISOString().slice(0, 16));
    const fill = (v) => time.map(() => v);
    return json(route, { utc_offset_seconds: 0, hourly: { time, temperature_2m: fill(17.6), precipitation_probability: fill(70), weather_code: fill(61),
      wind_speed_10m: fill(22), wind_direction_10m: fill(225), wind_gusts_10m: fill(38), apparent_temperature: fill(16) } });
  }
  return route.abort();
};
await page.route('**/*', (route) => mockRoute(route));
await page.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [AUTH_KEY, JSON.stringify(session)]);

const shot = async (name, p = page) => {
  if (!OUT) return;
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};
const step = async (name, fn) => {
  try {
    await fn();
    // l'écran « Oups, une erreur » (ErrorBoundary) ne doit jamais apparaître
    if (await page.locator('img[src*="/illustrations/erreur"]').count()) throw new Error('écran d’erreur affiché');
    console.log('OK  ', name);
  } catch (e) {
    errors.push(`${name}: ${e.message.split('\n').slice(0, 3).join(' | ')}`);
    console.log('FAIL', name);
    await shot(`FAIL-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
  }
};
const tab = (name) => page.locator('nav.fixed').getByRole('button', { name, exact: typeof name === 'string' }).click();
const menu = async (name) => {
  await page.getByRole('button', { name: 'Menu du compte' }).click();
  await page.getByRole('menuitem', { name }).first().click();
};
const home = async () => { await tab('Découvrir'); await page.getByText('Bob').first().waitFor(); };
const text = (s, opts) => page.getByText(s, opts).locator('visible=true').first().waitFor();

await page.goto(`${ORIGIN}/`);
await page.getByText('Bob').first().waitFor({ timeout: 20000 }).catch(() => {});

// ------------------------------------------------------------------ connecté (administrateur)
await step('découvrir : liste des cyclistes', async () => {
  await text('Bob');
  await text('Paris 20e');
  await shot('01-discover');
  if (OUT) { // même page sur ordinateur, en mode sombre
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/01b-discover-desktop-dark.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 390, height: 844 });
  }
});
await step('découvrir : carte et lieux utiles', async () => {
  await page.getByRole('button', { name: 'Carte', exact: true }).first().click();
  await page.locator('.leaflet-container').first().waitFor();
  // calques des lieux pour cyclistes (bornes, magasins, eau, gonflage), s'ils sont proposés
  const layer = page.getByRole('button', { name: /Bornes de réparation|Magasins vélo|Points d’eau|Gonflage/ }).first();
  if (await layer.count()) {
    await layer.click();
    await page.waitForTimeout(500);
  }
  await shot('02-discover-map');
  await page.getByRole('button', { name: 'Liste', exact: true }).first().click().catch(() => {});
});
await step('profil public d’un cycliste (/p/…)', async () => {
  await page.goto(`${ORIGIN}/p/${BOB}`);
  await text('Bob');
  await text('Gravel du dimanche'); // son garage
  await shot('03-user-profile');
  await page.goto(`${ORIGIN}/`);
  await text('Bob');
});
await step('sorties : liste', async () => {
  await tab('Sorties');
  await text('Tour du lac');
  await text('Gravel en forêt');
  await shot('04-rides');
  if (OUT) { await page.emulateMedia({ colorScheme: 'dark' }); await shot('04b-rides-dark'); await page.emulateMedia({ colorScheme: 'light' }); }
});
await step('sorties : discussion du groupe', async () => {
  const chat = page.getByRole('button', { name: /Discussion/ }).first();
  if (await chat.count()) {
    await chat.click();
    await text('On se retrouve au parking de la forêt ?');
  }
});
await step('sorties : formulaire (GPX, pas de lâchage)', async () => {
  await tab('Sorties');
  await page.getByRole('button', { name: /Organiser|Proposer une sortie|Nouvelle sortie|Créer une sortie/ }).first().click();
  await page.locator('form').first().waitFor();
  await page.locator('form input[type=file]').first().waitFor({ state: 'attached' }); // import GPX
  await shot('05-ride-form');
  const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><trkseg>${ROUTE.map(([la, lo], i) => `<trkpt lat="${la}" lon="${lo}"><ele>${40 + i}</ele></trkpt>`).join('')}</trkseg></trk></gpx>`;
  const input = page.locator('form input[type=file][accept*="gpx"], form input[type=file]').first();
  await input.setInputFiles({ name: 'tour.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) });
  await page.waitForTimeout(500);
  await shot('05b-ride-form-gpx');
  await page.keyboard.press('Escape');
  await tab('Sorties');
});
await step('lien partagé d’une sortie (/s/…)', async () => {
  await page.goto(`${ORIGIN}/s/w3`);
  await text('Tour du lac');
  await shot('05c-shared-ride');
  await page.goto(`${ORIGIN}/`);
  await text('Bob');
});
await step('fil d’actualité', async () => {
  await tab('Fil');
  await text('Belle sortie ce matin au lever du soleil');
  await shot('06-feed');
});
await step('messages', async () => {
  await tab(/Messages/);
  await text('À demain !');
  await page.getByText('Bob').first().click();
  await text('Salut ! Tu viens samedi ?');
  await shot('07-conversation');
});
await step('notifications', async () => {
  await page.getByRole('button', { name: 'Notifications' }).first().click();
  await text('Gravel en forêt', { exact: false });
  await shot('08-notifications');
});
await step('recherche', async () => {
  await page.getByRole('button', { name: 'Rechercher' }).first().click();
  await page.locator('input').first().fill('bo');
  await text('Bob');
  await shot('09-search');
});
await step('paramètres du compte', async () => {
  await tab('Profil');
  await text('Mon Canyon'); // résumé du profil cycliste et du garage
  await shot('10-profile');
});
await step('profil cycliste et vélos', async () => {
  await menu(/profil cycliste/i);
  await text('Mon Canyon');
  await shot('11-rider');
});
await step('dangers sur la route', async () => {
  await menu(/Dangers/);
  await text('Gros nid-de-poule dans la descente', { exact: false });
  await shot('12-hazards');
});
await step('suivi GPS', async () => {
  await menu(/Suivi GPS/);
  await page.getByRole('button', { name: /Démarrer|Commencer|Lancer/ }).first().click();
  // on roule vers le nord à allure de cycliste : environ 8 m par position, une position toutes les 0,3 s
  for (let i = 1; i <= 10; i += 1) {
    await ctx.setGeolocation({ latitude: 48.861 + i * 0.000072, longitude: 2.381, accuracy: 5 });
    await page.waitForTimeout(300);
  }
  await shot('13-tracker');
  const stop = page.getByRole('button', { name: /Terminer|Arrêter|Stop/ }).first();
  if (await stop.count()) await stop.click();
  await page.waitForTimeout(300);
  await ctx.setGeolocation({ latitude: 48.861, longitude: 2.381, accuracy: 10 });
});
await step('clubs et groupes', async () => {
  await menu(/groupes/i);
  await text('Les Rouleurs de l’Est parisien');
  await page.getByText('Les Rouleurs de l’Est parisien').first().click();
  await text('Départ samedi 8 h 30 au lac !');
  await shot('14-group');
});
await step('forum', async () => {
  await menu(/^Forum$/);
  await text('Quelle pression pour des pneus de 28 mm ?');
  await page.getByText('Quelle pression pour des pneus de 28 mm ?').first().click();
  await text('Autour de 5,5 bars à l’arrière.');
  await shot('15-forum');
});
await step('tchat général', async () => {
  await menu(/Tchat/);
  await text('Quelqu’un roule vers Chantilly samedi ?');
  await shot('16-chat');
});
await step('niveau et classement', async () => {
  await menu(/classement/i);
  await text('Bob');
  await shot('17-leaderboard');
});
await step('abonnés et abonnements', async () => {
  await menu(/Abonnés/);
  await text('Nathan');
});
await step('parrainage', async () => {
  await menu(/Parrainage|Inviter/);
  await text('aaaaaaaa00', { exact: false });
  await shot('18-invite');
});
await step('administration', async () => {
  await menu(/Administration/);
  await page.waitForTimeout(800);
  await shot('19-admin');
  for (const name of [/^Signalements/, /^Membres/, /^Statistiques/, /^Erreurs/, /^Retours/]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(300); }
  }
  await shot('19b-admin-tabs');
});
await step('conseils de sécurité', async () => {
  await menu(/Conseils de sécurité/);
  await page.waitForTimeout(400);
  await shot('20-safety');
  await home();
});
await step('page 404 illustrée', async () => {
  await page.goto(`${ORIGIN}/cette-page-nexiste-pas`);
  await page.locator('img[src*="/illustrations/404"]').waitFor();
  await shot('21-404');
  await page.goto(`${ORIGIN}/`);
  await text('Bob');
});

// ------------------------------------------------------------------ visiteur sans compte
await step('accueil, langues et pages publiques (sans compte)', async () => {
  const anon = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, colorScheme: 'dark', serviceWorkers: 'block' });
  const p = await anon.newPage();
  watch(p, ' (sans compte)');
  const pub = { ...RPC(),
    public_rides: [{ id: '2b8f6d3e-1111-4222-8333-944445555666', title: 'Boucle de la Citadelle', place: 'Citadelle de Namur', starts_at: iso(86400e3), duration: 120,
      max_participants: 10, participants: 3, ride_type: 'route', level: 'intermediaire', avg_speed: 24, distance_km: 55, elevation_m: 480, no_drop: true, lat: 50.46, lng: 4.86 }] };
  pub.public_ride = { ...pub.public_rides[0], description: 'Tous les niveaux intermédiaires bienvenus', route: ROUTE };
  pub.public_city = { members: 38, rides: pub.public_rides, levels: { debutant: 6, intermediaire: 18, confirme: 10, sportif: 4 } };
  await p.route('**/*', (route) => mockRoute(route, pub));
  await p.goto(`${ORIGIN}/`);
  await p.locator('#root *').first().waitFor();
  await p.waitForTimeout(800);
  await shot('30-landing-dark', p);
  for (const lang of ['NL', 'EN', 'FR']) {
    const b = p.getByRole('button', { name: lang, exact: true }).first();
    if (await b.count()) { await b.click(); await p.waitForTimeout(600); await shot(`30-landing-${lang.toLowerCase()}`, p); }
  }
  await p.goto(`${ORIGIN}/sorties`);
  await p.getByText('Boucle de la Citadelle').first().waitFor();
  await shot('31-public-rides', p);
  await p.getByText('Boucle de la Citadelle').first().click();
  await p.waitForTimeout(500);
  await shot('31b-public-ride', p);
  await p.goto(`${ORIGIN}/nl/sorties`);
  await p.getByText('Boucle de la Citadelle').first().waitFor();
  for (const legal of ['/confidentialite', '/conditions', '/mentions-legales']) {
    await p.goto(`${ORIGIN}${legal}`);
    await p.locator('h1, h2').first().waitFor();
  }
  // lien de parrainage : le code est gardé pour après l'inscription
  await p.goto(`${ORIGIN}/?p=bbbbbbbb00`);
  await p.waitForFunction(() => Object.values(localStorage).some((v) => String(v).includes('bbbbbbbb00')), null, { timeout: 5000 });
  await anon.close();
});

// ------------------------------------------------------------------ nouveau compte : profil cycliste à remplir
await step('nouveau compte : écran « profil cycliste »', async () => {
  const c = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await c.newPage();
  watch(p, ' (nouveau compte)');
  const saved = { profiles: T.profiles, bikes: T.bikes };
  T.profiles = T.profiles.map((x) => (x.id === ME ? { ...x, name: 'The Relaxed', city: '', disciplines: [], level: null, usual_speed: null } : x));
  T.bikes = T.bikes.filter((b) => b.owner_id !== ME);
  let patched = null;
  await p.route('**/*', async (route) => {
    const req = route.request();
    if (new URL(req.url()).pathname === '/rest/v1/profiles' && req.method() === 'PATCH') {
      try { patched = { ...patched, ...JSON.parse(req.postData() || '{}') }; } catch { /* ignoré */ }
    }
    return mockRoute(route);
  });
  await p.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [AUTH_KEY, JSON.stringify(session)]);
  try {
    await p.goto(`${ORIGIN}/`);
    await p.getByText('The Relaxed', { exact: false }).first().waitFor().catch(() => {});
    await p.locator('form, input').first().waitFor();
    // niveau à choisir (débutant, intermédiaire, confirmé, sportif)
    await p.getByText(/Intermédiaire/).first().waitFor();
    await shot('40-rider-onboarding', p);
  } finally {
    Object.assign(T, saved);
    await c.close();
  }
});

// ------------------------------------------------------------------ néerlandais (connecté)
await step('néerlandais (connecté)', async () => {
  const c = await browser.newContext({ locale: 'nl-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await c.newPage();
  watch(p, ' (néerlandais)');
  await p.route('**/*', (route) => mockRoute(route));
  await p.addInitScript(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('cyclami:lang', 'nl'); }, [AUTH_KEY, JSON.stringify(session)]);
  await p.goto(`${ORIGIN}/`);
  await p.getByText('Bob').first().waitFor();
  await p.locator('nav.fixed').getByRole('button').nth(1).click();
  await p.getByText('Tour du lac').first().waitFor();
  await shot('50-nl-rides', p);
  await c.close();
});

// ------------------------------------------------------------------ modérateur
await step('modérateur (Bob) : pages principales', async () => {
  const bobUser = { ...user, id: BOB, email: 'bob@test.fr' };
  const bobSession = { ...session, access_token: jwtFor(BOB, 'bob@test.fr'), user: bobUser };
  const c = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await c.newPage();
  watch(p, ' (modérateur)');
  await p.route('**/*', (route) => (new URL(route.request().url()).pathname.includes('/auth/v1/user')
    ? json(route, bobUser) : mockRoute(route)));
  await p.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [AUTH_KEY, JSON.stringify(bobSession)]);
  await p.goto(`${ORIGIN}/`);
  await p.getByText('Nathan').first().waitFor();
  await p.locator('nav.fixed').getByRole('button', { name: 'Profil', exact: true }).click();
  await p.waitForTimeout(500);
  if (await p.getByRole('button', { name: 'Supprimer mon compte' }).count()) throw new Error('bouton de suppression visible pour un modérateur');
  await shot('60-moderator-profile', p);
  await c.close();
});

console.log('\nERREURS:', errors.length ? `\n${errors.join('\n')}` : 'aucune');
await browser.close();
process.exit(errors.length ? 1 : 0);
