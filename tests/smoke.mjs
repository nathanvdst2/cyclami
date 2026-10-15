// Test de fumée : ouvre le site construit (dist/) dans Chromium, avec une fausse base
// Supabase, parcourt toutes les pages et échoue à la moindre erreur JavaScript.
// Usage : npm run build && npm run test:smoke   (captures d'écran : SHOTS_DIR=dossier)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(process.argv[2] || 'dist');
const OUT = process.env.SHOTS_DIR || null;
const ORIGIN = 'https://cyclami.test';
const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOB = 'bbbbbbbb-0000-4000-8000-000000000002';
const now = Date.now();
const iso = (ms) => new Date(now + ms).toISOString();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const exp = Math.floor(now / 1000) + 3600 * 24;
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME, exp, role: 'authenticated', aud: 'authenticated', email: 'moi@test.fr' })}.sig`;
const user = { id: ME, email: 'moi@test.fr', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: iso(-1e9) };
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 86400, expires_at: exp, user };

const T = {
  profiles: [
    { id: ME, name: 'Nathan', city: 'Paris 11e', bio: 'Salut', availability: ['Matin'], lat: 48.86, lng: 2.37, created_at: iso(-1e9), xp: 180 },
    { id: BOB, name: 'Bob', city: 'Paris 20e', bio: 'Sorties au parc <b>html</b>', availability: ['Soir'], lat: 48.87, lng: 2.39, created_at: iso(-2e9), xp: 640, last_seen_at: iso(-30e3), show_presence: true },
  ],
  pets: [
    { id: 'p1', owner_id: ME, name: 'Rex', species: 'chien', breed: 'Labrador', size: 'grand', age: 3, birth_date: (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 3); return d.toLocaleDateString('fr-CA'); })(), energy: 4, emoji: '🦮', traits: ['Joueur'], photo_url: null, created_at: iso(-1e9) },
    { id: 'p2', owner_id: BOB, name: 'Luna', species: 'chien', breed: '', size: 'moyen', age: 0, birth_date: (() => { const d = new Date(); d.setMonth(d.getMonth() - 14); d.setDate(1); return d.toLocaleDateString('fr-CA'); })(), energy: 5, emoji: '<img src=x onerror=alert(1)>', traits: ['Sociable'], photo_url: null, created_at: iso(-1e9) },
  ],
  rides: [
    { id: 'w0', host_id: BOB, title: 'Sortie passée', place: 'Bois', starts_at: iso(-2 * 86400e3), duration: 60, pace: 'normal', max_participants: 5, description: '', lat: null, lng: null, created_at: iso(-5e8) },
    { id: 'w1', host_id: BOB, title: 'Tour du lac', place: 'Lac Daumesnil', starts_at: iso(86400e3), duration: 60, pace: 'normal', max_participants: 5, description: 'Cool', lat: 48.83, lng: 2.41, created_at: iso(-1e6), series_id: 's1', group_id: 'g1' },
    { id: 'w3', host_id: BOB, title: 'Tour du lac', place: 'Lac Daumesnil', starts_at: iso(8 * 86400e3), duration: 60, pace: 'normal', max_participants: 5, description: 'Cool', lat: 48.83, lng: 2.41, created_at: iso(-1e6), series_id: 's1' },
    { id: 'w2', host_id: ME, title: 'Sans carte', place: 'Square', starts_at: iso(2 * 86400e3), duration: 30, pace: 'tranquille', max_participants: 3, description: '', lat: null, lng: null, created_at: iso(-1e6) },
  ],
  feedback: [{ id: 'fb1', user_id: BOB, kind: 'bug', body: 'La carte ne se charge pas sur mon iPhone', page: 'discover', device: { ua: 'Mozilla/5.0 (iPhone)', screen: '390x844', lang: 'fr', standalone: 'true' }, photo_url: null, status: 'new', created_at: iso(-7200e3) }],
  chat_messages: [{ id: 'cm0', author_id: BOB, body: '', audio_path: `${BOB}/11111111-1111-4111-8111-111111111111.webm`, audio_seconds: 9, hidden_at: null, created_at: iso(-900e3) }, { id: 'cm1', author_id: BOB, body: 'Salut tout le monde ! Quelqu’un se promène au parc ce soir ?', hidden_at: null, created_at: iso(-1800e3) }],
  ride_messages: [{ id: 'wm1', ride_id: 'w2', author_id: BOB, body: 'On se retrouve à l’entrée du square ?', created_at: iso(-3600e3) }],
  place_reviews: [{ place_id: 'w1', user_id: BOB, rating: 4, body: 'Grand, clôturé et propre', updated_at: iso(-86400e3) }],
  ride_participants: [{ ride_id: 'w1', user_id: BOB }, { ride_id: 'w2', user_id: ME }, { ride_id: 'w2', user_id: BOB }, { ride_id: 'w0', user_id: ME }, { ride_id: 'w0', user_id: BOB }],
  sitting_requests: [
    { id: 'sr1', owner_id: BOB, pet_id: 'p2', kind: 'garde', starts_on: new Date(now + 3 * 86400e3).toLocaleDateString('fr-CA'), ends_on: new Date(now + 5 * 86400e3).toLocaleDateString('fr-CA'), description: 'Week-end à la mer', city: 'Paris 20e', lat: 48.86, lng: 2.39, status: 'ouverte', created_at: iso(-1e6) },
    { id: 'sr2', owner_id: ME, pet_id: 'p1', kind: 'promenade', starts_on: new Date(now + 1 * 86400e3).toLocaleDateString('fr-CA'), ends_on: new Date(now + 1 * 86400e3).toLocaleDateString('fr-CA'), description: '', city: 'Paris 11e', lat: 48.86, lng: 2.38, status: 'ouverte', created_at: iso(-1e6) },
    { id: 'sr3', owner_id: ME, pet_id: 'p1', kind: 'garde', starts_on: new Date(now - 3 * 86400e3).toLocaleDateString('fr-CA'), ends_on: new Date(now - 86400e3).toLocaleDateString('fr-CA'), description: 'Garde terminée', city: 'Paris 11e', lat: 48.86, lng: 2.38, status: 'pourvue', hidden_at: null, created_at: iso(-6e5) },
  ],
  sitting_offers: [{ id: 'so1', request_id: 'sr2', sitter_id: BOB, message: 'Je promène Luna, Rex peut venir', status: 'proposee', created_at: iso(-1e5) },
    { id: 'so2', request_id: 'sr3', sitter_id: BOB, message: 'Avec plaisir', status: 'acceptee', created_at: iso(-5e5) }],
  place_favorites: [],
  gear_items: [{ id: 'g1', owner_id: BOB, title: 'Cage de transport pour chat', body: 'Très bon état', category: 'transport', species: 'chat', photo_url: '/logo-mark.webp', extra_photos: ['/logo-mark-96.webp'], city: 'Paris 20e', lat: 48.86, lng: 2.39, status: 'dispo', kind: 'don', price_cents: null, created_at: iso(-3600e3) },
    { id: 'g2', owner_id: BOB, title: 'Panier pour grand chien', body: '', category: 'couchage', species: 'chien', photo_url: null, city: 'Paris 20e', lat: 48.86, lng: 2.39, status: 'dispo', kind: 'vente', price_cents: 1500, extra_photos: [], created_at: iso(-7200e3) }],
  sitting_reviews: [{ id: 'sv1', request_id: 'srx', reviewer_id: BOB, sitter_id: ME, rating: 4, comment: 'Super gardien', created_at: iso(-7200e3) }],
  forum_topics: [
    { id: 'ft1', author_id: BOB, category: 'education', title: 'Luna tire en laisse, des conseils ?', body: 'Elle a 1 an et tire beaucoup.', pinned: true, locked: false, reply_count: 1, last_reply_at: iso(-3600e3), hidden_at: null, created_at: iso(-7200e3), updated_at: iso(-7200e3) },
  ],
  groups: [
    { id: 'g1', owner_id: BOB, name: 'Bergers australiens de Paris', description: 'Sorties le samedi matin', emoji: '🐕', city: 'Paris 20e', lat: 48.87, lng: 2.39, member_count: 2, hidden_at: null, created_at: iso(-5e8) },
    { id: 'g2', owner_id: BOB, name: 'Sorties canines Ixelles', description: '', emoji: '🌳', city: 'Ixelles', lat: 50.83, lng: 4.37, member_count: 1, hidden_at: null, created_at: iso(-5e8) },
  ],
  group_members: [
    { group_id: 'g1', user_id: BOB, role: 'owner', joined_at: iso(-5e8) },
    { group_id: 'g1', user_id: ME, role: 'member', joined_at: iso(-1e8) },
    { group_id: 'g2', user_id: BOB, role: 'owner', joined_at: iso(-5e8) },
  ],
  group_messages: [
    { id: 'gm1', group_id: 'g1', author_id: BOB, body: 'Rendez-vous samedi au parc !', photo_url: null, hidden_at: null, created_at: iso(-3600e3) },
    { id: 'gm2', group_id: 'g1', author_id: BOB, body: '', photo_url: 'https://cyclami-photos.test.workers.dev/u/photo.jpg', hidden_at: null, created_at: iso(-1800e3) },
  ],
  forum_replies: [{ id: 'fr1', topic_id: 'ft1', author_id: ME, body: 'Essaie le harnais anti-traction !', hidden_at: null, created_at: iso(-3600e3) }],
  client_errors: [{ id: 'ce1', message: 'TypeError: undefined is not an object', stack: 'at Discover', page: 'discover', user_agent: 'Safari', count: 3, first_at: iso(-7200e3), last_at: iso(-60e3) }],
  pet_health: [{ id: 'h1', pet_id: 'p1', owner_id: ME, kind: 'vaccin', label: 'Rage', done_on: '2025-11-01', next_due: new Date(now + 5 * 86400e3).toLocaleDateString('fr-CA'), notes: 'Dr Martin', created_at: iso(-1e6) }],
  hazards: [{ id: 'hz1', author_id: BOB, kind: 'poison', description: 'Boulettes de viande avec des granulés bleus le long du grillage.', photo_url: null, place: 'Square Maurice Gardette, côté grillage', lat: 48.862, lng: 2.380, expires_at: iso(5 * 86400e3), resolved_at: null, hidden_at: null, created_at: iso(-5400e3) },
    { id: 'hz2', author_id: BOB, kind: 'chenilles', description: '', photo_url: null, place: 'Allée des pins, parc de Belleville', lat: 48.871, lng: 2.385, expires_at: iso(15 * 86400e3), resolved_at: null, hidden_at: null, created_at: iso(-86400e3) }],
  ride_tracks: [{ id: 'tr1', user_id: ME, pet_ids: ['p1'], started_at: iso(-86400e3), duration_s: 2700, distance_m: 3240, created_at: iso(-86400e3) },
    { id: 'tr2', user_id: ME, pet_ids: ['p1'], started_at: iso(-3 * 86400e3), duration_s: 3600, distance_m: 4810, created_at: iso(-3 * 86400e3) }],
  hazard_votes: [{ hazard_id: 'hz1', user_id: BOB, vote: 'still', created_at: iso(-3600e3) }],
  lost_alerts: [{ id: 'la1', owner_id: BOB, kind: 'perdu', pet_id: 'p2', name: 'Luna', species: 'chien', description: 'Collier rouge', photo_url: 'https://cyclami-photos.test.workers.dev/u/luna1.jpg', extra_photos: ['https://cyclami-photos.test.workers.dev/u/luna2.jpg', 'https://cyclami-photos.test.workers.dev/u/luna3.jpg'], place: 'Parc', lat: 48.86, lng: 2.38, seen_at: iso(-7200e3), status: 'active', created_at: iso(-7200e3) }],
  ride_reviews: [{ id: 'rv1', ride_id: 'w0', reviewer_id: BOB, reviewee_id: ME, comment: 'Rex est adorable', created_at: iso(-3600e3) }],
  posts: [{ id: 'po1', author_id: BOB, pet_id: 'p2', body: 'Luna au parc', scene: '🌳', photo_url: null, created_at: iso(-3600e3) }],
  post_likes: [{ post_id: 'po1', user_id: ME }],
  messages: [
    { id: 'm1', sender_id: BOB, recipient_id: ME, body: 'Salut !', photo_url: null, created_at: iso(-7200e3), read_at: null },
    { id: 'm2', sender_id: ME, recipient_id: BOB, body: '', photo_url: `${ME}/photo.webp`, created_at: iso(-3600e3), read_at: null },
    { id: 'm2b', sender_id: BOB, recipient_id: ME, body: '', photo_url: null, audio_path: `${BOB}/22222222-2222-4222-8222-222222222222.webm`, audio_seconds: 14, created_at: iso(-2700e3), read_at: null },
    { id: 'm2c', sender_id: ME, recipient_id: BOB, body: '', photo_url: null, audio_path: `${ME}/33333333-3333-4333-8333-333333333333.webm`, audio_seconds: 6, audio_played_at: iso(-2000e3), created_at: iso(-2400e3), read_at: iso(-2000e3) },
    { id: 'm3', sender_id: ME, recipient_id: BOB, body: 'À demain !', photo_url: null, created_at: iso(-1800e3), read_at: iso(-60e3) },
  ],
  blocks: [],
  admins: [{ user_id: ME, role: 'admin' }, { user_id: BOB, role: 'moderator' }],
  reports: [
    { id: 'r1', reporter_id: ME, reported_id: BOB, target_type: 'post', target_id: 'po1', category: 'harcelement', reason: 'Message déplacé', snapshot: 'Luna au parc (copie)', created_at: iso(-600e3), resolved_at: null },
    { id: 'r3', reporter_id: ME, reported_id: BOB, target_type: 'conversation', target_id: BOB, category: 'harcelement', reason: 'Insultes', snapshot: '12/10 18:01 Lui/elle : Salut\n12/10 18:02 Moi : Bonjour !\n12/10 18:05 Lui/elle : Message très déplacé\nsur deux lignes', created_at: iso(-400e3), resolved_at: null },
    { id: 'r2', reporter_id: BOB, reported_id: BOB, target_type: 'post', target_id: 'po1', category: 'spam', reason: '—', snapshot: 'Luna au parc (copie)', created_at: iso(-500e3), resolved_at: null },
    { id: 'r4', reporter_id: ME, reported_id: BOB, target_type: 'avatar', target_id: null, category: 'inapproprie', reason: '—', snapshot: '/logo-mark.webp', created_at: iso(-450e3), resolved_at: null },
  ],
  moderation_log: [{ id: 'l1', actor_id: ME, action: 'avertissement', target_type: 'user', target_user: BOB, target_name: 'Bob', reason: 'Sois gentil', created_at: iso(-60e3) }],
  suspensions: [],
  notification_settings: [{ user_id: ME, email_messages: false, email_activity: true }],
  listings: [
    { id: 'li1', seller_id: BOB, seller: { id: BOB, name: 'Bob', xp: 640, city: 'Paris 20e' }, kind: 'vente', title: 'Chiot berger australien', species: 'chien', breed: 'Berger australien', sex: 'male', birth_date: '2026-07-01', price_cents: 80000, description: 'Très joueur', photo_urls: [], identification: '250269812345678', approval_number: 'HK12345678', siren: '', lof_registered: false, vaccinated: true, sterilized: false, documents: '', city: 'Paris 20e', lat: 48.87, lng: 2.39, status: 'active', hidden_at: null, created_at: iso(-3600e3) },
    { id: 'li2', seller_id: BOB, seller: { id: BOB, name: 'Bob', xp: 640, city: 'Paris 20e' }, kind: 'don', title: 'Couple de chinchillas', species: 'chinchilla', breed: '', sex: 'inconnu', birth_date: null, price_cents: null, description: '', photo_urls: [], identification: '', siren: '', lof_registered: false, vaccinated: false, sterilized: false, documents: '', city: 'Paris 20e', lat: 48.87, lng: 2.39, status: 'reserve', hidden_at: null, created_at: iso(-7200e3) },
  ],
  shelters: [{ user_id: BOB, name: 'Refuge de Bob', approval_number: 'HK12345678', region: 'wallonie', contact: '', address: 'Rue du Refuge 1, 5000 Namur', lat: 50.465, lng: 4.867, status: 'verified', note: '', pending_changes: { address: 'Rue Neuve 2, 5000 Namur', lat: 50.47, lng: 4.87 }, created_at: iso(-9e6) }],
  banned_emails: [],
  comments: [{ id: 'c1', author_id: BOB, post_id: 'po1', ride_id: null, body: 'Trop mignonne', created_at: iso(-60e3) }],
  notifications: [
    { id: 'n1', user_id: ME, actor_id: BOB, type: 'ride_join', post_id: null, ride_id: 'w2', data: { title: 'Sans carte' }, read_at: null, created_at: iso(-60e3) },
    { id: 'n3', user_id: ME, actor_id: BOB, type: 'group_message', post_id: null, ride_id: null, data: { group_id: 'g1', title: 'Bergers australiens de Paris', excerpt: 'Rendez-vous samedi' }, read_at: null, created_at: iso(-90e3) },
    { id: 'n4', user_id: ME, actor_id: null, type: 'ride_reminder', post_id: null, ride_id: 'w2', data: { title: 'Sans carte', time: '10:30', place: 'Parc des Buttes-Chaumont' }, read_at: null, created_at: iso(-100e3) },
    { id: 'n5', user_id: ME, actor_id: BOB, type: 'member_nearby', post_id: null, ride_id: null, data: { title: 'Rocky', species: 'chien', km: 1.2 }, read_at: null, created_at: iso(-110e3) },
    { id: 'n2', user_id: ME, actor_id: null, type: 'ride_cancelled', post_id: null, ride_id: 'wx', data: { title: 'Vieille sortie' }, read_at: null, created_at: iso(-120e3) },
  ],
};

const errors = [];
// caméra et micro simulés (vérification du profil par vidéo)
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH && { executablePath: process.env.CHROMIUM_PATH }),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const ctx = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block', permissions: ['geolocation', 'camera', 'microphone'], geolocation: { latitude: 48.861, longitude: 2.381 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket|net::/.test(m.text())) errors.push(`console: ${m.text()}`); });
let expectDialog = null; // confirmation attendue (texte exact) : acceptée une fois
page.on('dialog', (d) => {
  if (expectDialog && d.message() === expectDialog) { expectDialog = null; d.accept(); return; }
  errors.push(`DIALOG (XSS?): ${d.message()}`); d.dismiss();
});

const mockRoute = async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (url.origin === ORIGIN) {
    let p = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(p)) p = path.join(DIST, 'index.html');
    const ext = path.extname(p);
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }[ext] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
  }
  if (url.hostname.endsWith('supabase.co')) {
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(\w+)/);
    if (rpc) {
      const RPC = {
        claim_daily_xp: { gained: 5, streak: 3 },
        place_ratings: [{ place_id: 'w1', average: 4, total: 1 }],
        admin_member_details: { email: 'bob@test.fr', providers: ['google'], created_at: iso(-2e9), last_sign_in_at: iso(-3600e3), email_confirmed_at: iso(-2e9),
          lat: 48.87, lng: 2.39, city: 'Paris 20e', lang: 'fr', sessions: [{ ip: '81.240.12.34', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1', at: iso(-600e3) }] },
        admin_member_extra: {
          devices: [{ user_agent: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36',
            info: { screen: '1080x2340', timezone: 'Europe/Brussels', standalone: 'oui' }, first_seen: iso(-9e8), last_seen: iso(-3600e3) }],
          last_active: iso(-120e3), show_presence: true, suspended_until: null,
          counts: { pets: 1, posts: 3, messages_sent: 12, reports_against: 2, blocked_by: 0 },
        },
        member_achievements: { xp: 180, posts: 2, rides_hosted: 3, rides_joined: 4, guests: 6, likes_received: 12, comments: 5, pets: 1, best_streak: 8 },
        xp_leaderboard: [
          { user_id: BOB, name: 'Bob', city: 'Paris 20e', points: 95, xp: 640 },
          { user_id: ME, name: 'Nathan', city: 'Paris 11e', points: 40, xp: 180 },
        ],
        admin_traffic: { days: [{ day: '2026-10-11', visits: 12, views: 40, signups: 2 }, { day: '2026-10-12', visits: 20, views: 75, signups: 3 }], pages: [{ page: 'discover', views: 60 }, { page: 'landing', views: 30 }], active_7d: 9, active_30d: 14 },
        admin_shelter_threads: [{ email: 'contact@spa-exemple.be', shelter_name: 'SPA Exemple', unread: 1, replies: 1, last_at: iso(-600e3), last_excerpt: 'Bonjour, c’est vraiment gratuit ?', last_direction: 'in' }],
        admin_shelter_thread: [
          { id: 'sm1', direction: 'out', from_name: '', subject: 'Proposition de partenariat', body: 'Madame, Monsieur, je me permets de vous présenter Cyclami…', created_at: iso(-9e5), sent_by: 'Nathan' },
          { id: 'sm2', direction: 'in', from_name: 'Marie (SPA Exemple)', subject: 'Re: Proposition de partenariat', body: 'Bonjour, c’est vraiment gratuit ?', created_at: iso(-600e3), sent_by: null },
        ],
        listing_stats: { li1: { views: 12, views_7d: 5, contacts: 3 } },
        follow_counts: { followers: 12, following: 3, i_follow: false, follows_me: true },
        follow_list: [{ id: ME, name: 'Nathan', city: 'Paris 11e', avatar_url: null, i_follow: false }],
        global_search: { members: [{ id: BOB, name: 'Bob', city: 'Paris 20e', avatar_url: null }], pets: [{ id: 'p2', name: 'Luna', emoji: '🐕', photo_url: null, breed: 'Shiba', owner_id: BOB, owner_name: 'Bob' }], listings: [], topics: [{ id: 'ft1', title: 'Luna tire en laisse, des conseils ?', reply_count: 1 }], rides: [], groups: [] },
        public_events: [{ id: 'ev1', kind: 'portes_ouvertes', title: 'Portes ouvertes de printemps', body: 'Venez rencontrer nos chiens', starts_at: new Date(now + 3 * 86400e3).toISOString(), ends_at: new Date(now + 3 * 86400e3 + 6 * 3600e3).toISOString(), shelter_id: BOB, shelter_name: 'Refuge des Collines', place: 'Rue des Fleurs 1, Namur', lat: 50.46, lng: 4.87 }],
        sitter_stats: { [BOB]: { count: 3, average: 4.67, trusted: true } },
        donation_links: { once: 'https://donate.example/once', monthly: 'https://donate.example/monthly' },
        my_game_scores: {}, submit_game_score: { saved: true, best: 3 },
        game_leaderboard: [{ id: BOB, name: 'Bob', avatar_url: null, score: 5, duration_ms: 42000 }],
        pioneer_rank: 2,
        pet_distances: { p1: 42.6 },
        referral_stats: { code: 'aaaaaaaa00', count: 2, pending: 1, members: [{ id: BOB, name: 'Bob', has_pet: true }, { id: 'x1', name: 'Chloé', has_pet: true }, { id: 'x2', name: 'Hugo', has_pet: false }] },
        top_neighbourhoods: [{ city: 'Paris 11e', members: 14, active: 11, newcomers: 4, rides: 6, score: 37 }, { city: 'Namur', members: 9, active: 7, newcomers: 3, rides: 2, score: 19 }, { city: 'Ixelles', members: 5, active: 4, newcomers: 1, rides: 1, score: 9 }],
        start_verification: { id: '9b8f6d3e-1111-4222-8333-944445555666', actions: ['pouce', 'sourire', 'clin_oeil'], code: '4719', expires_at: iso(300e3) },
        submit_verification: null,
        admin_verifications: [{ id: 'v1', user_id: BOB, name: 'Bob', avatar_url: null, member_since: iso(-9e8), submitted_at: iso(-3600e3), created_at: iso(-3700e3),
          video_path: `${BOB}/v1.webm`, rejected_before: 0, challenge: { actions: ['tete_gauche', 'trois_doigts', 'main_oreille'], code: '0382' },
          signals: { camera: 'OBS Virtual Camera', virtual_camera: true, width: 720, height: 960, fps: 30, mime: 'video/webm', duration_ms: 15200, delay_s: 40 } }],
        admin_decide_verification: `${BOB}/v1.webm`,
        vote_hazard: { expires_at: iso(7 * 86400e3), resolved: false },
        online_count: 3,
        follow_suggestions: [{ id: BOB, name: 'Bob', city: 'Paris 20e', avatar_url: null, pet_photo_url: null, km: 2, breed: null }],
        admin_search_stats: { updated_at: iso(-3600e3), days: [{ day: '2026-10-10', clicks: 3, impressions: 40, position: 12 }], queries: [{ key: 'adopter chat namur', clicks: 2, impressions: 15, position: 6 }], pages: [] },
        public_needs: [{ id: 'nd1', kind: 'benevole', title: 'Bénévoles pour promener les chiens', body: 'Le samedi matin', expires_on: '2099-01-01', shelter_id: BOB, shelter_name: 'Refuge de Bob', lat: 50.46, lng: 4.86 }],
        public_adopted: [],
        admin_inbound_domain: '',
        admin_shelter_invites: [{ id: 'inv1', email: 'info@refuge-test.be', shelter_name: 'Refuge Test', lang: 'fr', opted_out: false, created_at: iso(-3600e3), sent_by: 'Nathan' },
          { id: 'inv2', email: 'spa@refuge-ancien.be', shelter_name: 'SPA Ancienne', lang: 'fr', opted_out: false, created_at: iso(-20 * 86400e3), sent_by: 'Nathan', can_relaunch: true },
          { id: 'inv3', email: 'ok@refuge-inscrit.be', shelter_name: 'Refuge Inscrit', lang: 'nl', opted_out: false, created_at: iso(-30 * 86400e3), sent_by: 'Nathan', joined: true }],
        admin_relaunch_shelters: { sent: 1, remaining: 0 },
        admin_stats: { members: 2, members_7d: 2, members_prev_7d: 0, active_7d: 2, online: 1, pets: 2, rides_upcoming: 2, rides_7d: 1, posts: 1, posts_7d: 1,
          messages: 3, messages_7d: 3, chat_7d: 1, lost_active: 1, listings_active: 2, shelters_verified: 1, reports_open: 1, feedback_new: 1,
          shelters_pending: 1, shelter_changes: 1, shelter_replies: 1, errors_24h: 1,
          signups_14d: Array.from({ length: 14 }, (_, i) => ({ day: new Date(Date.now() - (13 - i) * 86400e3).toISOString(), n: i % 4 === 0 ? 1 : 0 })) },
        admin_members: T.profiles.map((p) => ({ ...p, email: `${p.name.toLowerCase()}@test.fr`, last_sign_in_at: iso(-60e3), pets: 1, posts: 0, reports_against: p.id === BOB ? 2 : 0, warnings: p.id === BOB ? 1 : 0, suspended_until: null })),
      };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[rpc[1]] ?? null) });
    }
    const m = url.pathname.match(/\/rest\/v1\/(\w+)/);
    if (m) {
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (req.method() === 'GET') {
        // filtres PostgREST simples : col=eq.x, col=in.(a,b), col=is.null
        let rows = T[m[1]] || [];
        for (const [col, val] of url.searchParams) {
          if (['select', 'order', 'limit', 'offset'].includes(col)) continue;
          if (val.startsWith('eq.')) rows = rows.filter((r) => String(r[col]) === val.slice(3));
          else if (/^(lt|lte|gt|gte)\./.test(val)) {
            const [op, ...rest] = val.split('.');
            const v = rest.join('.');
            const cmp = (x) => (String(x) < v ? -1 : String(x) > v ? 1 : 0);
            rows = rows.filter((r) => r[col] != null && ({ lt: cmp(r[col]) < 0, lte: cmp(r[col]) <= 0, gt: cmp(r[col]) > 0, gte: cmp(r[col]) >= 0 })[op]);
          } else if (val.startsWith('in.(')) {
            const list = val.slice(4, -1).split(',').map((x) => x.replace(/^"|"$/g, ''));
            rows = rows.filter((r) => list.includes(String(r[col])));
          }
        }
        const order = url.searchParams.get('order');
        if (order) {
          const [col, dir] = order.split('.');
          rows = [...rows].sort((x, y) => String(x[col]).localeCompare(String(y[col])) * (dir === 'desc' ? -1 : 1));
        }
        const body = single ? (rows[0] ?? null) : rows;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      }
      // demande de refuge : gardée en mémoire pour l'affichage qui suit
      if (m[1] === 'shelters' && req.method() === 'POST') {
        const row = JSON.parse(req.postData() || '{}');
        T.shelters = [...T.shelters.filter((x) => x.user_id !== row.user_id), { ...row, status: 'pending', note: '' }];
      }
      if (m[1] === 'sitting_reviews' && req.method() === 'POST') T.sitting_reviews.push({ id: 'new', ...JSON.parse(req.postData() || '{}') });
      if (m[1] === 'chat_messages' && req.method() === 'POST') {
        const row = { id: `cm${T.chat_messages.length + 1}`, hidden_at: null, created_at: new Date().toISOString(), ...JSON.parse(req.postData() || '{}') };
        T.chat_messages.push(row);
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
      }
      const body = single ? { id: 'new', sender_id: ME, recipient_id: BOB, body: 'x', created_at: new Date().toISOString() } : [];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (url.pathname.includes('/storage/v1/object/sign')) {
      const { paths = [] } = JSON.parse(req.postData() || '{}');
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(paths.map((p) => ({ path: p, signedURL: `/object/sign/x/${p}?token=t`, error: null }))) });
    }
    if (url.pathname.includes('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }
  if (url.hostname.endsWith('workers.dev') && url.pathname === '/places') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
      { id: 'w1', lat: 48.861, lng: 2.381, kind: 'dog_park', name: 'Caniparc test', phone: '', hours: '' },
      { id: 'n2', lat: 48.862, lng: 2.382, kind: 'vet', name: 'Véto test', phone: '', hours: '' },
    ]) });
  }
  if (url.hostname === 'ipwho.is') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, ip: '81.240.12.34', country: 'Belgique', country_code: 'BE', region: 'Bruxelles', city: 'Ixelles', postal: '1050',
      latitude: 50.83, longitude: 4.37, timezone: { id: 'Europe/Brussels' }, connection: { asn: 5432, org: 'Proximus NV', isp: 'Proximus' },
    }) });
  }
  if (url.hostname === 'nominatim.openstreetmap.org' && url.pathname === '/reverse') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      name: 'Square Maurice Gardette', display_name: 'Square Maurice Gardette, Rue du Général Blaise, Paris',
      address: { road: 'Rue du Général Blaise', house_number: '12', postcode: '75011', city: 'Paris' },
    }) });
  }
  if (url.hostname === 'api.open-meteo.com') {
    // prévisions horaires factices : pluie probable partout
    const start = new Date(); start.setUTCMinutes(0, 0, 0);
    const time = Array.from({ length: 16 * 24 }, (_, i) => new Date(start.getTime() + i * 3600e3).toISOString().slice(0, 16));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      utc_offset_seconds: 0,
      hourly: { time, temperature_2m: time.map(() => 17.6), precipitation_probability: time.map(() => 70), weather_code: time.map(() => 61) },
    }) });
  }
  return route.abort();
};
await page.route('**/*', mockRoute);

await page.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-qwhssunuewkzdppzvjdv-auth-token', JSON.stringify(session)]);
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('text=Compagnons de sortie', { timeout: 15000 });

const shot = async (name) => {
  if (!OUT) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
};
const step = async (name, fn) => {
  try { await fn(); console.log('OK  ', name); } catch (e) { errors.push(`${name}: ${e.message.split('\n').slice(0, 3).join(' | ')}`); console.log('FAIL', name); }
};

await step('discover liste + badge Staff', async () => {
  await page.getByText('Bob').first().waitFor();
  await page.getByTitle('Modérateur du site').first().waitFor();
  await page.getByText('Niv. 5').first().waitFor();
  await page.getByText('1 an et 2 mois').first().waitFor(); // âge calculé depuis la date de naissance
  await shot('01-discover');
  // même page sur ordinateur, en mode sombre
  if (OUT) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(800); // fin des transitions de couleur
    await page.screenshot({ path: `${OUT}/01b-discover-desktop-dark.png`, fullPage: true });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  // fiche d'un animal cliquable → sa page
  await page.getByRole('button', { name: 'Voir le profil de Luna' }).click();
  await page.getByText('Son humain').waitFor();
  await page.goBack(); await page.getByText('Niv. 5').first().waitFor();
});
await step('alertes animal perdu', async () => {
  await page.getByText('1 animal perdu ou trouvé près de toi').click();
  await page.getByText('Animaux perdus & trouvés').waitFor();
  await page.getByText('Collier rouge').waitFor();
  await page.getByRole('button', { name: 'Je l’ai vu' }).waitFor();
  if (await page.locator('a[href$="luna3.jpg"]').count() !== 1) throw new Error('galerie de photos absente');
  await page.getByRole('button', { name: 'Carte' }).last().click(); // choix Google Maps / Plans
  await page.getByRole('link', { name: 'Plans (Apple)' }).waitFor();
  await page.getByRole('button', { name: 'Carte' }).last().click();
  // affiche imprimable avec QR code et numéro facultatif
  await page.getByRole('button', { name: 'Imprimer une affiche' }).click();
  await page.getByPlaceholder('0470 12 34 56').fill('0470 11 22 33');
  const [poster] = await Promise.all([ctx.waitForEvent('page'), page.getByRole('button', { name: 'Créer l’affiche' }).click()]);
  await poster.evaluate(() => { window.print = () => {}; }); // pas de fenêtre d'impression dans le test
  await poster.getByText('PERDU', { exact: true }).waitFor();
  await poster.getByText('📞 0470 11 22 33').waitFor();
  if (await poster.locator('.qr svg').count() !== 1) throw new Error('QR code absent de l’affiche');
  const posterHtml = (await poster.content()).replace('window.print()', '0');
  await poster.close();
  if (OUT) {
    const view = await ctx.newPage();
    await view.setContent(posterHtml);
    await view.screenshot({ path: `${OUT}/19b-lost-poster.png`, fullPage: true });
    await view.close();
  }
  await page.getByRole('button', { name: 'Alerte' }).click();
  await page.getByText('Où l’as-tu vu pour la dernière fois ?').waitFor();
  await page.getByText('Jusqu’à 6 photos', { exact: false }).waitFor();
  await shot('19-lost');
  await page.getByText('Retour').first().click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('garde entre voisins', async () => {
  await page.getByRole('button', { name: 'Garde entre voisins', exact: true }).click();
  await page.getByText('Week-end à la mer').waitFor();
  await page.getByText('Je promène Luna, Rex peut venir').waitFor();
  await page.getByRole('button', { name: 'Accepter' }).waitFor();
  await page.getByText('Comment s’est passée la garde ? Note Bob').waitFor(); // note après une garde terminée
  await page.getByText('Gardien de confiance').first().waitFor(); // badge du gardien (3 gardes, 4,7 ★)
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await page.getByText('Choisis une note de 1 à 5 étoiles.').waitFor();
  await page.getByRole('radio', { name: '4 étoiles sur 5' }).click();
  await shot('21b-sitting-stars');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await page.getByText('Comment s’est passée la garde ? Note Bob').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Je peux aider' }).click();
  await page.getByPlaceholder('Présente-toi').waitFor();
  await shot('21-sitting');
  await page.getByText('Retour').first().click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('don de matériel', async () => {
  await page.getByRole('button', { name: 'Matériel entre voisins', exact: true }).click();
  await page.getByText('Cage de transport pour chat').waitFor();
  await page.getByText('15 €').waitFor(); // objet à vendre
  await page.getByRole('button', { name: '🏷️ À vendre' }).click();
  await page.getByText('Cage de transport pour chat').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Tout', exact: true }).click();
  await page.getByRole('button', { name: 'Ça m’intéresse' }).first().waitFor();
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  await page.getByRole('button', { name: '🏷️ Je vends' }).click();
  await page.getByLabel('Prix (€)').waitFor();
  await page.locator('form input[type=file][multiple]').setInputFiles([1, 2].map((n) => ({ name: `p${n}.png`, mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') })));
  await page.getByText('2/6 photos', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Cage de transport pour chat 2/2' }).waitFor(); // vignettes des photos d'une annonce
  await shot('21c-gear');
  await page.getByText('Retour').first().click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('jeux', async () => {
  await page.getByRole('button', { name: 'Jeux', exact: true }).click();
  await page.getByRole('button', { name: /Quiz du jour/ }).click();
  for (let i = 0; i < 5; i += 1) {
    await page.locator('section.card button.w-full').first().click();
    await page.getByRole('button', { name: i < 4 ? 'Question suivante' : 'Voir mon score' }).click();
  }
  await page.getByText('/5 bonnes réponses', { exact: false }).waitFor();
  await page.getByText('5/5 · 42 s').waitFor(); // classement
  await shot('25-games-quiz');
  await page.getByRole('button', { name: 'Tous les jeux' }).click();
  await page.getByRole('button', { name: /Memory des animaux/ }).click();
  await page.getByRole('button', { name: 'Carte cachée' }).nth(15).waitFor();
  await page.getByRole('button', { name: 'Tous les jeux' }).click();
  await page.getByRole('button', { name: /Attrape la balle/ }).click();
  await page.getByRole('button', { name: 'Jouer', exact: true }).click();
  await page.getByText('Balles : 0').waitFor();
  await shot('25b-games-ball');
  await page.getByRole('button', { name: 'Tous les jeux' }).click();
  await page.getByText('Retour').first().click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('tchat général', async () => {
  await page.getByRole('button', { name: 'Tchat général', exact: true }).click();
  await page.getByText('Quelqu’un se promène au parc ce soir ?').waitFor();
  await page.getByText('3 membres en ligne').waitFor();
  // message vocal de Bob, et micro pour en enregistrer un
  await page.getByRole('button', { name: 'Écouter le message vocal' }).first().waitFor();
  await page.getByText('🎤 0:09').waitFor();
  await page.getByRole('button', { name: 'Enregistrer un message vocal' }).waitFor();
  // répondre à Bob en le mentionnant
  await page.getByRole('button', { name: 'Répondre à ce message' }).first().click();
  await page.getByText('Réponse à Bob', { exact: false }).waitFor();
  const box = page.getByPlaceholder('Écrire… (@ pour mentionner)');
  await box.fill('Bonjour à tous 🚴 @Bo');
  await page.getByRole('option', { name: '@Bob' }).click();
  await box.press('End');
  await box.type('ce soir je viens !');
  // Maj + Entrée : retour à la ligne ; Entrée : envoi
  await box.press('Shift+Enter');
  await box.type('À tout à l’heure');
  await box.press('Enter');
  await page.getByText('ce soir je viens !', { exact: false }).waitFor();
  const sent = T.chat_messages[T.chat_messages.length - 1];
  if (!/je viens !\nÀ tout à l’heure$/.test(sent.body)) throw new Error(`retour à la ligne non gardé : ${JSON.stringify(sent.body)}`);
  if (sent.reply_to !== 'cm1' || !sent.mentions?.includes(BOB)) throw new Error(`réponse ou mention non envoyée : ${JSON.stringify(sent)}`);
  await page.locator('strong', { hasText: '@Bob' }).first().waitFor(); // mention mise en valeur
  // le champ d'écriture reste au-dessus de la barre de navigation
  const form = await page.locator('form').filter({ has: box }).boundingBox();
  const nav = await page.locator('nav').last().boundingBox();
  if (form.y + form.height > nav.y + 1) throw new Error(`champ caché par la navigation (${form.y + form.height} > ${nav.y})`);
  await shot('25c-chat');
  await page.getByText('Retour').first().click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('groupes', async () => {
  await page.getByRole('button', { name: 'Groupes', exact: true }).click();
  await page.getByText('Bergers australiens de Paris').waitFor();
  await page.getByText('Sorties canines Ixelles').waitFor();
  await page.getByRole('button', { name: 'Mes groupes' }).click();
  if (await page.getByText('Sorties canines Ixelles').count()) throw new Error('groupe dont je ne suis pas membre dans « Mes groupes »');
  await page.getByText('Bergers australiens de Paris').click();
  await page.getByText('Rendez-vous samedi au parc !').waitFor();
  await page.getByText('Tour du lac').waitFor();
  await page.getByText('Créateur').waitFor();
  await page.getByRole('button', { name: 'Quitter le groupe' }).waitFor();
  await page.getByPlaceholder('Écris aux membres du groupe…').waitFor();
  await page.getByAltText('Photo du groupe').waitFor(); // photo sur le mur
  await page.locator('form input[type=file]').last().setInputFiles({ name: 'chien.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') });
  await page.getByRole('button', { name: 'Retirer la photo' }).click();
  await shot('27-group');
  await page.getByText('Groupes').first().click();
  await page.getByRole('button', { name: 'Créer un groupe' }).click();
  await page.getByPlaceholder('Nom (ex : Bergers australiens de Namur)').waitFor();
  await page.getByRole('button', { name: 'Découvrir' }).click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('recherche membre', async () => {
  await page.getByPlaceholder('Chercher un membre par son prénom…').fill('zzz');
  await page.getByText('Aucun membre trouvé').waitFor();
  await page.getByPlaceholder('Chercher un membre par son prénom…').fill('bo');
  await page.getByText('Bob').first().waitFor();
  await page.getByLabel('Effacer').click();
});
await step('menu du compte (photo en haut à droite)', async () => {
  await page.getByRole('button', { name: 'Menu du compte' }).click();
  await page.getByRole('menuitem', { name: /Voir mon profil/ }).waitFor();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).waitFor();
  await page.getByRole('menuitem', { name: 'Administration' }).waitFor();
  await shot('27-account-menu');
  // « Donner mon avis » depuis le menu : la fenêtre couvre toute la page (pas coincée dans la barre du haut)
  await page.getByRole('menuitem', { name: /Donner mon avis/ }).click();
  const dialog = await page.getByRole('heading', { name: 'Donner mon avis' }).boundingBox();
  if (!dialog || dialog.y < 120) throw new Error(`fenêtre d'avis mal placée (${JSON.stringify(dialog)})`);
  await page.getByRole('button', { name: 'Fermer' }).last().click();
  await page.getByRole('button', { name: 'Menu du compte' }).click();
  await page.getByRole('menuitem', { name: 'Paramètres du compte' }).click();
  await page.getByText('Voir mon profil public').waitFor();
  await page.getByRole('button', { name: 'Découvrir' }).click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('parrainage', async () => {
  await page.getByRole('button', { name: 'Menu du compte' }).click();
  await page.getByRole('menuitem', { name: 'Inviter des amis' }).click();
  await page.getByRole('heading', { name: '🎁 Inviter des amis' }).waitFor();
  await page.getByText(`${ORIGIN}/?p=aaaaaaaa00`).waitFor(); // lien personnel
  await page.getByText('Badge « Ambassadeur » : 2 / 3 amis inscrits').waitFor();
  await page.getByText('n’a pas encore présenté son animal').waitFor();
  await page.getByText('Paris 11e').waitFor(); // classement des quartiers
  await shot('29-invite');
  await page.getByText('Retour').first().click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('dangers du quartier', async () => {
  await page.getByText('2 dangers signalés près de chez toi', { exact: false }).waitFor(); // bandeau rouge sur l'accueil
  await page.getByRole('button', { name: 'Dangers du quartier', exact: true }).click();
  await page.getByRole('heading', { name: '⚠️ Dangers du quartier' }).waitFor();
  await page.getByText('Boulettes de viande avec des granulés bleus', { exact: false }).waitFor();
  await page.getByText('confirmé par 1', { exact: false }).waitFor();
  await page.getByText('rince la gueule à l’eau', { exact: false }).waitFor(); // conseil
  await shot('27-hazards');
  await page.getByRole('button', { name: 'Toujours là' }).first().click();
  await page.getByRole('button', { name: 'Signaler', exact: true }).click();
  await page.getByRole('radio', { name: '🦠 Algues bleues' }).click();
  await page.getByText('Ne laisse pas ton chien boire ni se baigner', { exact: false }).waitFor();
  await shot('27b-hazard-form');
  await page.getByRole('radio', { name: '⚠️ Autre danger' }).click();
  await page.getByLabel('Quel danger ?').fill('Trou dans le sentier'); // « Autre danger » : le membre le nomme
  await page.getByRole('button', { name: 'Fermer' }).first().click();
  await page.getByText('Retour').first().click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('suivi GPS de la sortie', async () => {
  await page.getByRole('button', { name: /Démarrer une sortie/ }).click();
  await page.getByRole('heading', { name: '📍 Suivre ma sortie' }).waitFor();
  await page.getByText('42,6 km').waitFor(); // compteur de Rex
  await page.getByText('Encore 7,4 km pour le badge 🥈 50 km').waitFor();
  await page.getByText('8,05 km ces 7 derniers jours').waitFor();
  // position imprécise (ordinateur, Wi-Fi) : affichée, mais la distance ne compte pas
  await ctx.setGeolocation({ latitude: 48.861, longitude: 2.381, accuracy: 900 });
  await page.getByRole('button', { name: 'Démarrer la sortie' }).click();
  await page.getByText('Position trop imprécise', { exact: false }).waitFor();
  await shot('28b-tracker-imprecise');
  // on marche vers le nord, environ 6 m par position
  for (let i = 1; i <= 8; i++) {
    await ctx.setGeolocation({ latitude: 48.861 + i * 0.000055, longitude: 2.381, accuracy: 5 });
    await page.waitForTimeout(150);
  }
  await page.locator('text=/^0,0[2-9]$|^0,[1-9]\\d$/').first().waitFor(); // distance en direct
  await page.getByText('Signal GPS bon', { exact: false }).waitFor();
  await shot('28-tracker');
  await page.getByRole('button', { name: 'Terminer' }).click();
  await page.getByText('Sortie trop courte pour être enregistrée.').waitFor(); // moins d'une minute
  await page.getByText('Retour').first().click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('urgence vétérinaire', async () => {
  await page.getByRole('button', { name: 'Urgence véto', exact: true }).click();
  await page.getByRole('heading', { name: '🚑 Urgence vétérinaire' }).waitFor();
  await page.getByText('🩺 Véto test').waitFor();
  await page.getByRole('button', { name: 'Itinéraire' }).first().waitFor();
  await shot('26-emergency');
  await page.getByText('Retour').first().click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('page vide : inviter ses voisins', async () => {
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.getByRole('button', { name: 'Petit', exact: true }).click();
  await page.getByText('Personne pour l’instant avec ces filtres.').waitFor();
  await page.getByText('Sois le premier à Paris 11e 🚴').waitFor();
  await page.getByRole('button', { name: 'Inviter des voisins' }).waitFor();
  await page.getByRole('button', { name: 'Toutes', exact: true }).first().click();
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.getByText('Niv. 5').first().waitFor();
});
await step('discover carte', async () => {
  await page.getByRole('button', { name: 'Carte', exact: true }).click(); await page.locator('.leaflet-container').waitFor();
  await page.locator('.me-dot').waitFor(); // point bleu : localisation déjà autorisée → affiché tout seul
  await page.getByRole('button', { name: 'Me localiser' }).last().waitFor();
  await page.getByRole('button', { name: '🐕 Espaces chiens' }).click();
  // toucher un lieu ouvre sa page : avis, favori, sortie, itinéraire
  await page.locator('.leaflet-marker-icon', { hasText: '🐕' }).first().click();
  await page.getByRole('button', { name: /Voir le lieu/ }).click(); // 1er toucher : bulle ; 2e : page du lieu
  await page.getByRole('heading', { name: '🐕 Caniparc test' }).waitFor();
  await page.getByText('Grand, clôturé et propre').waitFor();
  await page.getByRole('button', { name: '⭐ Donner mon avis' }).click();
  await page.getByRole('button', { name: '5 sur 5' }).click();
  await page.getByPlaceholder('Ton avis (facultatif)', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Annuler' }).last().click();
  await page.getByRole('button', { name: '☆ Ajouter aux favoris' }).click();
  await page.getByRole('button', { name: '★ Dans mes favoris' }).waitFor();
  await page.getByRole('button', { name: '🦮 Proposer une sortie ici' }).waitFor();
  await page.emulateMedia({ colorScheme: 'dark' }); await shot('02b-place-page-dark'); await page.emulateMedia({ colorScheme: 'light' });
  await page.goBack();
  await page.getByRole('button', { name: '⭐ Mes favoris' }).waitFor();
  await page.locator('.leaflet-marker-icon', { hasText: '🐕' }).first().waitFor(); // filtre gardé au retour
  await page.getByRole('button', { name: '🐕 Espaces chiens' }).click();
  // la carte doit passer SOUS la barre de navigation du bas : ses calques (z-index 400 à 1000)
  // doivent rester enfermés dans le cadre de la carte (contexte d'empilement isolé)
  const navOnTop = await page.evaluate(() => {
    const box = document.querySelector('.leaflet-container').parentElement;
    return getComputedStyle(box).isolation === 'isolate';
  });
  if (!navOnTop) throw new Error('la carte recouvre la barre de navigation');
  await shot('02-discover-map');
});
await step('profil public', async () => {
  await page.locator('.leaflet-marker-icon:not(:has(.me-dot))').nth(1).click();
  await page.getByText('Voir le profil →').click();
  await page.getByText('Son animal').waitFor(); await shot('03-user-profile');
  await page.getByText('Pionnier n° 2').waitFor(); // badge des 100 premiers membres
  // abonnements (style Instagram)
  await page.getByText('Te suit').waitFor();
  await page.getByRole('button', { name: 'S’abonner en retour' }).click();
  await page.getByRole('button', { name: 'Abonné', exact: true }).waitFor();
  await page.getByRole('button', { name: '12 abonnés' }).click();
  await page.getByRole('button', { name: '12 abonnés' }).waitFor(); // onglet de la page des abonnés
  await page.getByText('Paris 11e').first().waitFor();
  await page.goBack(); await page.getByText('Son animal').waitFor();
  await page.getByRole('button', { name: 'Données du compte (admin)' }).click(); // fiche admin
  await page.getByText('bob@test.fr').waitFor();
  await page.getByText('81.240.12.34').waitFor();
  await page.getByText('Proximus (AS5432)').waitFor(); // infos sur l'IP
  await page.getByText('Android 14 · SM-S911B · Chrome 129').waitFor(); // appareil
  await page.getByText('Signalements reçus', { exact: true }).waitFor(); // activité
  await page.emulateMedia({ colorScheme: 'dark' }); await shot('03b-admin-panel-dark'); await page.emulateMedia({ colorScheme: 'light' });
});
await step('page de l’animal', async () => {
  await page.locator('h2:has-text("Son animal") + div button').last().click(); // fiche de l'animal → sa page
  await page.getByText('Son humain').waitFor(); await shot('03c-pet-page');
  // carte « Partager en story » : sans partage natif, l'image est téléchargée
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Partager en story' }).click()]);
  if (!download.suggestedFilename().endsWith('-cyclami.png')) throw new Error('carte de partage : ' + download.suggestedFilename());
  if (process.env.SHOTS_DIR) await download.saveAs(`${process.env.SHOTS_DIR}/03d-pet-story.png`);
  await page.goBack(); await page.getByText('Son animal').waitFor();
});
await step('retour navigateur', async () => { await page.goBack(); await page.getByText('Compagnons de sortie').waitFor(); });
await step('sorties liste', async () => {
  await page.getByRole('button', { name: 'Sorties' }).click(); await page.getByText('Tour du lac').first().waitFor();
  await page.getByText('Chaque semaine · 2 dates à venir').first().waitFor();
  // ajout à l'agenda (sortie rejointe ou organisée) et vue calendrier
  await page.getByRole('button', { name: 'Ajouter à mon agenda' }).first().click();
  await page.getByRole('link', { name: 'Google Agenda' }).first().waitFor();
  await page.getByRole('button', { name: 'Calendrier' }).click();
  await page.getByText('Tour du lac').first().waitFor();
  await shot('05b-rides-calendar');
  await page.getByRole('button', { name: 'Liste' }).click();
  await page.getByText('🌧️ 18° · 💧 70%').first().waitFor(); // météo Open-Meteo (mock)
  await page.getByText('Pense au manteau de pluie').first().waitFor();
  await page.getByRole('button', { name: 'Discussion du groupe (2 participants)' }).click(); // discussion de sortie
  await page.getByText('On se retrouve à l’entrée du square ?').waitFor();
  await page.getByText('Visible seulement par l’organisateur et les participants.').waitFor();
  await page.getByText('Comment se sont passées tes sorties').waitFor();
  await page.getByText('Tour du parc et pause au point d’eau').waitFor();
  await page.getByRole('button', { name: 'Pourquoi c’est un bon exemple ?' }).click();
  await page.getByText('Cette sortie n’est pas réelle').waitFor();
  await page.getByText('« Sortie passée »', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Toutes les semaines' }).first().waitFor();
  await shot('04-rides');
});
await step('itinéraire Google Maps / Plans', async () => {
  await page.getByRole('button', { name: 'Itinéraire' }).first().click();
  const g = await page.getByRole('link', { name: 'Google Maps' }).getAttribute('href');
  const a = await page.getByRole('link', { name: 'Plans (Apple)' }).getAttribute('href');
  if (!g.includes('destination=48.83,2.41') || !a.includes('daddr=48.83,2.41')) throw new Error(`liens : ${g} / ${a}`);
  await page.getByRole('button', { name: 'Itinéraire' }).first().click();
});
await step('lien partagé /b/…', async () => {
  await page.goto(`${ORIGIN}/b/w3`);
  await page.locator('article.ring-teal-400', { hasText: 'Tour du lac' }).waitFor();
  await page.getByRole('button', { name: 'Partager' }).first().waitFor();
  await page.goto(`${ORIGIN}/`); await page.getByText('Compagnons de sortie').waitFor();
  await page.getByRole('button', { name: 'Sorties' }).click(); await page.getByText('Tour du lac').first().waitFor();
});
await step('modifier sa sortie', async () => {
  await page.getByRole('button', { name: 'Modifier' }).first().click();
  await page.getByText('Modifier la sortie').waitFor();
  await page.getByRole('button', { name: 'Fermer' }).click();
});
await step('sorties carte', async () => {
  await page.getByRole('button', { name: 'Carte' }).click(); await page.locator('.leaflet-container').waitFor();
  await page.locator('.leaflet-marker-icon', { hasText: '🌳' }).last().click(); // deux sorties au même endroit
  await page.getByRole('button', { name: 'Lac Daumesnil' }).waitFor(); // le lieu est cliquable aussi
  await page.getByRole('button', { name: 'Voir la sortie →' }).click(); // ouvre la sortie dans la liste
  await page.locator('article.ring-teal-400').waitFor();
});
await step('formulaire sortie', async () => { await page.getByRole('button', { name: 'Organiser', exact: true }).click(); await page.getByText('Point de rendez-vous', { exact: true }).waitFor(); await page.locator('form .leaflet-container').click({ position: { x: 100, y: 100 } }); await page.getByText('Point placé').waitFor(); if (await page.getByText('Anti-spam :', { exact: false }).count()) throw new Error('message anti-spam affiché à l’équipe'); await page.locator('input[value="Square Maurice Gardette, Rue du Général Blaise 12, 75011 Paris"]').waitFor(); await page.getByText('Répéter chaque semaine').click(); await page.getByRole('button', { name: 'Publier les 4 sorties' }).waitFor(); await page.locator('option', { hasText: 'Bergers australiens de Paris' }).waitFor({ state: 'attached' }); await shot('05-ride-form'); });
await step('signaler une publication', async () => {
  await page.getByRole('button', { name: 'Fil', exact: true }).click();
  await page.getByText('Luna au parc').first().waitFor();
  await page.getByRole('button', { name: 'Signaler' }).first().click();
  await page.getByText('Signaler cette publication').waitFor();
  await page.getByText('Spam ou arnaque').click();
  await page.getByRole('button', { name: 'Signaler', exact: true }).last().click();
  await page.getByText('L’équipe va examiner ton signalement').waitFor();
  await shot('12-report');
});
await step('forum', async () => {
  await page.getByRole('button', { name: 'Fil', exact: true }).click();
  await page.getByRole('button', { name: '💬 Forum' }).click();
  // sujet d'exemple épinglé : se déplie avec ses réponses et les conseils
  await page.getByText('Mon chiot de 6 mois tire en laisse : vos astuces ?').click();
  await page.getByText('Ce sujet n’est pas réel', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Poser ma question' }).waitFor();
  await page.getByText('Luna tire en laisse, des conseils ?').click();
  await page.getByText('Essaie le harnais anti-traction !').waitFor();
  await page.getByPlaceholder('Ta réponse…').waitFor();
  await page.getByRole('button', { name: 'Verrouiller' }).waitFor(); // je suis admin
  await shot('26-forum');
  await page.getByText('Forum').first().click();
  await page.getByRole('button', { name: 'Nouveau sujet' }).click();
  await page.getByPlaceholder('Titre (ex : Mon chiot tire en laisse, des conseils ?)').waitFor();
});
await step('recherche globale', async () => {
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await page.getByPlaceholder('Membre, animal, race, annonce, sujet…').fill('lu');
  await page.getByText('Luna tire en laisse, des conseils ?').waitFor();
  await page.getByText('Shiba · chez Bob').waitFor();
  await shot('06c-search');
  await page.getByText('Retour').first().click();
});
await step('fil + commentaires', async () => { await page.getByRole('button', { name: 'Fil', exact: true }).click(); await page.getByText('Luna au parc').waitFor(); await page.getByText('1 commentaire').click(); await page.getByText('Trop mignonne').waitFor(); await shot('06-feed'); await page.getByRole('button', { name: 'Mes abonnements' }).click(); await page.getByText('Des membres à suivre').waitFor(); await page.getByText('À 2 km').waitFor(); await shot('06b-suggestions'); await page.getByRole('button', { name: 'Tout le monde' }).click(); });
await step('messages', async () => { await page.getByRole('button', { name: 'Messages' }).first().click(); await page.getByText('À demain !').waitFor(); });
await step('conversation + Vu + photo privée', async () => {
  await page.getByText('Bob').first().click(); await page.getByText('Salut !').waitFor();
  await page.getByText('🎤 0:14').waitFor(); // message vocal reçu
  await page.getByText('Nouveau', { exact: true }).waitFor(); // pas encore écouté
  await page.getByText('Écouté', { exact: true }).waitFor(); // mon vocal, écouté par Bob
  await page.getByRole('button', { name: 'Enregistrer un message vocal' }).waitFor();
  await page.getByText(/^Lu (aujourd’hui|hier|le) /).waitFor(); // accusé de lecture avec la date
  await page.getByLabel('Envoyé', { exact: true }).first().waitFor(); // ✓ envoyé (photo pas encore lue)
  await page.getByLabel('Lu', { exact: true }).first().waitFor(); // ✓✓ lu
  await shot('09c-conversation-voice');
  await page.getByText('En ligne', { exact: true }).waitFor(); // statut de Bob
  await page.locator('img[alt="Photo"]').waitFor();
  // réaction : clic droit sur un message → choix de l'emoji, affiché sous la bulle
  await page.getByText('Salut !').click({ button: 'right' });
  await page.getByRole('button', { name: 'Réagir 😂' }).click();
  await page.getByRole('button', { name: 'Réactions' }).waitFor();
  await shot('07-conversation');
});
await step('notifications', async () => { await page.getByLabel('Notifications').click(); await page.getByText('a rejoint ta sortie').waitFor(); await page.getByText('a été annulée').waitFor(); await page.getByText('a écrit dans le groupe Bergers australiens de Paris').waitFor(); await page.getByText('⏰ Rappel : la sortie « Sans carte » a lieu demain à 10:30', { exact: false }).waitFor(); await page.getByText('vient d’arriver sur Cyclami avec Rocky, à 1,2 km de chez toi', { exact: false }).waitFor(); await shot('08-notifications'); });
await step('carnet de santé', async () => {
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Carnet de santé' }).first().click();
  await page.getByText('Carnet de santé de Rex').waitFor();
  await page.getByText('dans 5 j').waitFor();
  await page.getByText('Dr Martin').waitFor();
  await page.getByRole('button', { name: 'Ajouter' }).click();
  await page.getByRole('button', { name: '💊 Vermifuge' }).click();
  await page.getByText('Mettre le rappel dans 3 mois').waitFor();
  await shot('20-health');
  await page.getByText('Retour').first().click();
});
await step('profil (compte admin protégé)', async () => {
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByText('Installer l’application').first().waitFor();
  await page.getByText('Compte administrateur protégé').waitFor();
  await page.getByText('🎂 Anniversaire aujourd’hui !').first().waitFor(); // Rex est né il y a 3 ans jour pour jour
  await page.getByText('Notifications par e-mail').waitFor();
  if (await page.getByLabel(/Nouveaux messages/).isChecked()) throw new Error('préférence e-mail non chargée');
  if (await page.getByRole('button', { name: 'Supprimer mon compte' }).count()) throw new Error('bouton de suppression visible pour l’admin');
  await page.getByText('Soutenir Cyclami').waitFor(); // dons pour le site
  await page.getByRole('link', { name: 'Don mensuel' }).waitFor();
  await shot('09-profile');
});
await step('adoptions : réservées aux refuges vérifiés', async () => {
  await page.getByRole('button', { name: 'Adoptions' }).click();
  // administration : aperçu d'un refuge fictif (rien n'est publié)
  const actAs = page.getByLabel('Administration : voir la page comme…');
  await page.getByText('Refuge vérifié : Mon refuge (aperçu)').waitFor();
  await page.getByText('Kit du refuge').waitFor();
  await page.getByRole('button', { name: 'Publier un besoin' }).waitFor();
  await shot('16e-admin-preview');
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  await page.getByText('Aperçu : tu vois le formulaire d’un refuge. Rien n’est publié.').waitFor();
  await page.getByRole('button', { name: 'Retour' }).first().click();
  // … ou publier au nom d'un refuge vérifié
  await actAs.selectOption({ label: 'Le refuge « Refuge de Bob » (publier en son nom)' });
  await page.getByText('apparaît au nom de « Refuge de Bob »', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Mes annonces' }).waitFor();
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  await page.getByText('Administration : l’annonce sera publiée au nom de « Refuge de Bob ».').waitFor();
  await page.getByRole('button', { name: 'Retour' }).first().click();
  await actAs.selectOption('off');
  await page.getByText('Chiot berger australien').waitFor();
  await page.getByText('Couple de chinchillas').waitFor();
  await page.getByText('Portes ouvertes de printemps').waitFor(); // événement d'un refuge
  await page.getByText('800 €').waitFor();
  await page.getByText('Réservé').first().waitFor();
  if (await page.getByRole('button', { name: 'Publier', exact: true }).count()) throw new Error('un particulier peut publier une annonce');
  if (await page.getByText('Mimi, chatte câline à adopter').count()) throw new Error('annonce d’exemple visible par un particulier');
  await page.getByRole('button', { name: /Carte des refuges \(1\)/ }).click();
  await page.locator('.leaflet-container').first().waitFor();
  await shot('16-listings');
  // demande de vérification d'un refuge
  await page.getByRole('button', { name: 'Vous êtes un refuge ? Demander la vérification' }).click();
  await page.getByPlaceholder('Nom du refuge').fill('Refuge des Collines');
  await page.getByPlaceholder('Numéro d’agrément du refuge').fill('HK30101234');
  await page.getByPlaceholder('Adresse du refuge').fill('Chemin des Collines 4, 5100 Jambes');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await page.getByText('Place l’adresse du refuge sur la carte.').waitFor();
  await page.locator('form .leaflet-container').click();
  await page.getByText('Point placé. Clique ailleurs pour le déplacer.').waitFor();
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await page.getByText('Demande de vérification envoyée pour « Refuge des Collines »').waitFor();
  // annonce d'exemple épinglée, visible par les refuges seulement
  await page.getByText('Mimi, chatte câline à adopter').click();
  await page.getByText('Seuls les refuges la voient.', { exact: false }).waitFor();
  await page.getByText('Refuge vérifié · agrément HK30100000').waitFor();
  await page.getByText('Les frais d’adoption et les soins qu’ils couvrent').waitFor();
  await shot('16b-example-listing');
  await page.goBack(); await page.getByText('Mimi, chatte câline à adopter').waitFor();
  // fiche : refuge vérifié et numéro d'agrément affichés
  await page.getByText('Chiot berger australien').click();
  await page.getByText('Refuge de Bob').waitFor();
  await page.getByText('Refuge vérifié · agrément HK12345678').waitFor();
  await page.getByText('250269812345678').waitFor();
  await page.getByText('Rue du Refuge 1, 5000 Namur').waitFor();
  await page.getByRole('button', { name: 'Contacter' }).waitFor();
  await shot('17-listing');
  await page.getByText('Gérer l’annonce (administrateur)').waitFor(); // le super administrateur gère toutes les annonces
  await page.getByText('12 vues').waitFor(); // statistiques de l'annonce
  // « Contacter » ouvre le questionnaire de pré-adoption
  await page.getByRole('button', { name: 'Contacter' }).click();
  await page.getByText('Questionnaire de pré-adoption').waitFor();
  await page.getByPlaceholder('Qui vit chez toi ? (ex : 2 adultes)').fill('2 adultes');
  await shot('17b-adoption-form');
  await page.getByRole('button', { name: 'Annuler' }).last().click();
  // une fois vérifié par l'équipe, le refuge peut publier
  T.shelters = T.shelters.map((x) => (x.user_id === ME ? { ...x, status: 'verified' } : x));
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByRole('button', { name: 'Adoptions' }).click();
  await page.getByText('Refuge vérifié : Refuge des Collines').waitFor();
  await page.getByText('Kit du refuge').waitFor(); // page publique, affiche à QR code, Facebook
  await page.getByText('Bénévoles pour promener les chiens').waitFor(); // besoins des refuges
  await page.getByRole('button', { name: 'Publier un besoin' }).waitFor();
  await page.getByRole('button', { name: 'Imprimer l’affiche' }).waitFor();
  await shot('16c-shelter-kit');
  // import de plusieurs animaux depuis un tableur (CSV)
  await page.getByRole('button', { name: 'Importer plusieurs animaux (tableur)' }).click();
  await page.locator('input[type=file][accept*=".csv"]').setInputFiles({ name: 'animaux.csv', mimeType: 'text/csv', buffer: Buffer.from(
    'Nom;Espèce;Race;Sexe;Naissance;Puce;Frais;Vacciné;Stérilisé;Description\n'
    + 'Rex;chien;Malinois;mâle;12/03/2022;056098100123456;150;oui;oui;Très doux\n'
    + 'Minou;chat;;femelle;01/01/2023;056098100654321;0;oui;non;\n'
    + 'Pompon;lapin;;f;;;0;;;Adore les carottes\n') });
  await page.getByText('un chat doit être stérilisé').waitFor(); // ligne refusée, avec la raison
  await page.getByRole('button', { name: 'Importer 2 animaux' }).click();
  await page.getByText('2 animaux importés ✔', { exact: false }).waitFor();
  await shot('16d-shelter-import');
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  await page.getByText('Nouvelle annonce').waitFor();
  await page.getByText('Publié par le refuge vérifié « Refuge des Collines » · agrément HK30101234').waitFor();
  await page.getByText('🏠 Avec frais d’adoption').click();
  await page.getByText('Frais d’adoption (€)').waitFor();
  await page.getByLabel('Espèce').selectOption('chinchilla');
  await shot('18-listing-form');
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
});
await step('niveau, badges et classement', async () => {
  await page.getByText('Compagnon de sortie').first().waitFor();
  await page.getByText('Comment gagner des points ?').click();
  await page.getByText('Organiser une sortie').waitFor();
  await page.getByText('Fidèle').waitFor();
  await shot('14-level');
  await page.getByRole('button', { name: 'Classement' }).click();
  await page.getByText('Tu es').waitFor();
  await page.getByText('95 XP').waitFor();
  await shot('15-leaderboard');
  await page.getByText('Retour').click();
});
await step('vérification du profil par vidéo', async () => {
  await page.getByRole('button', { name: /Faire vérifier mon profil/ }).click();
  await page.getByRole('heading', { name: 'Faire vérifier mon profil' }).waitFor();
  if (!(await page.getByRole('button', { name: 'Ouvrir la caméra' }).isDisabled())) throw new Error('caméra ouverte sans consentement');
  await page.getByLabel(/J’accepte que ma vidéo soit enregistrée/).check();
  await page.getByRole('button', { name: 'Ouvrir la caméra' }).click();
  await page.getByRole('button', { name: 'Commencer l’enregistrement' }).click();
  await page.getByText('Lève le pouce').waitFor({ timeout: 10000 }); // gestes tirés au hasard par le serveur
  await shot('30-verify-recording');
  await page.getByText('4719').waitFor({ timeout: 15000 }); // code à dire à voix haute
  await page.getByRole('button', { name: 'Envoyer à l’équipe' }).click({ timeout: 15000 });
  await page.getByText('Vidéo envoyée, merci !').waitFor();
  // côté administration : défi, indices (caméra virtuelle) et décision
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByText('Administration').first().click();
  await page.getByRole('button', { name: /Vérifications/ }).click();
  await page.getByText('0382').waitFor();
  await page.getByText('caméra virtuelle « OBS Virtual Camera »', { exact: false }).waitFor();
  await shot('30b-admin-verification');
  await page.getByRole('button', { name: 'Refuser' }).click();
  await page.getByText('Choisis un motif de refus.').waitFor(); // pas de refus sans motif
  await page.getByRole('button', { name: 'Vérifier le profil' }).click();
  await page.getByRole('button', { name: /^Signalements( \d+)?$/ }).click(); // onglet par défaut pour la suite
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
  await page.getByText('Installer l’application').first().waitFor();
});
await step('administration', async () => {
  await page.getByText('Administration').first().click();
  await page.getByText('Signalements ouverts').waitFor();
  await page.getByRole('heading', { name: 'À traiter' }).waitFor(); // tableau de bord : ce qui attend une action
  await page.getByText('1 refuge à vérifier').waitFor();
  await page.getByText('Inscriptions des 14 derniers jours').first().waitFor();
  await shot('11e-admin-dashboard');
  await page.getByText('Luna au parc (copie)').waitFor();
  await page.getByText('2 signalements').first().waitFor();
  await page.getByRole('button', { name: 'Clore' }).first().waitFor();
  await page.getByAltText('Photo de profil signalée').waitFor(); // photo de profil signalée, retrait en un clic
  await page.getByRole('button', { name: 'Retirer la photo' }).first().waitFor();
  await page.getByRole('button', { name: 'Voir la conversation (3 messages)' }).click();
  await page.getByText('Message très déplacé').waitFor();
  await shot('25-report-conversation');
  await page.getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Journal' }).click();
  await page.getByText('Sois gentil').waitFor();
  await page.getByRole('button', { name: /^Signalements/ }).click();
  await shot('13-moderation');
  await page.getByRole('button', { name: 'Statistiques' }).click();
  await page.getByText('Visites par jour').waitFor();
  await page.getByText('Accueil (visiteurs)').waitFor();
  await page.getByText('adopter chat namur').waitFor(); // statistiques Google
  await shot('22-stats');
  await page.getByRole('button', { name: 'Erreurs' }).click();
  await page.getByText('TypeError: undefined is not an object').waitFor();
  await page.getByRole('button', { name: /^Retours/ }).click();
  await page.getByText('La carte ne se charge pas sur mon iPhone').waitFor();
  await page.getByText('1 retour à lire').waitFor();
  await shot('11d-admin-feedback');
  await page.getByRole('button', { name: /^Membres/ }).click();
  await page.getByText('bob@test.fr').waitFor();
  await page.getByRole('button', { name: /^Équipe/ }).click();
  await page.getByText('Modérateur', { exact: false }).first().waitFor();
  await page.getByRole('button', { name: 'Retirer' }).waitFor();
  await shot('11-admin');
  await page.getByRole('button', { name: /^Refuges \d*$/ }).click(); // refuges à vérifier
  await page.getByText('Refuge de Bob').waitFor();
  await page.getByText('Refuge des Collines').waitFor();
  await page.getByText('Modification demandée').waitFor(); // refuge vérifié qui change son adresse
  await page.getByText('Rue Neuve 2, 5000 Namur').waitFor();
  // actualisation : on reste sur l'onglet Refuges, et le brouillon du formulaire est gardé
  await page.getByPlaceholder('Nom du refuge (facultatif)').fill('Brouillon gardé');
  await page.waitForTimeout(300);
  await page.reload();
  await page.getByText('Discussions avec les refuges').waitFor();
  if (await page.getByPlaceholder('Nom du refuge (facultatif)').inputValue() !== 'Brouillon gardé') throw new Error('brouillon perdu à l’actualisation');
  await page.getByPlaceholder('Nom du refuge (facultatif)').fill('');
  // coordonnées d'un refuge complétées par l'administration
  // fiche complète d'un refuge modifiable par l'administration
  await page.getByRole('button', { name: 'Modifier la fiche' }).first().click();
  await page.getByLabel('Nom du refuge').first().fill('Refuge de Bob et Cie');
  await page.getByLabel('Numéro d’agrément').first().waitFor();
  await page.getByLabel('Téléphone du refuge').first().fill('081 12 34 56');
  await shot('31b-admin-shelter-editor');
  await page.getByRole('button', { name: 'Enregistrer' }).first().click();
  await page.getByRole('button', { name: 'Modifier la fiche' }).first().waitFor(); // enregistré, formulaire refermé
  // discussion avec un refuge : réponse reçue, on lui répond
  await page.getByText('Discussions avec les refuges').waitFor();
  await page.getByText('Réception sur le site désactivée', { exact: false }).waitFor();
  await page.getByText('Réponses reçues (1)').waitFor(); // réponses reçues en tête
  await page.getByText('SPA Exemple').click();
  await page.getByText('Marie (SPA Exemple)', { exact: false }).waitFor();
  await page.getByPlaceholder('Ta réponse (envoyée par e-mail au refuge)…').fill('Oui, entièrement gratuit !');
  await page.getByRole('button', { name: 'Répondre par e-mail' }).click();
  await page.getByRole('button', { name: 'Discussions' }).click();
  // suppression d'une discussion
  expectDialog = 'Supprimer la discussion avec SPA Exemple ? Tous ses messages seront effacés.';
  await page.getByRole('button', { name: 'Supprimer la discussion avec SPA Exemple' }).click();
  await page.getByText('Aucune discussion pour l’instant.').waitFor();
  // relance unique des refuges sans réponse
  await page.getByText('3 propositions · 1 refuges inscrits · 0 ont répondu').waitFor();
  expectDialog = 'Envoyer un court rappel à 1 refuge(s) qui n’ont ni répondu ni créé de compte depuis au moins 14 jours ? Chaque refuge n’est relancé qu’une seule fois.';
  await page.getByRole('button', { name: '🔁 Relancer les refuges sans réponse (1)' }).click();
  await page.getByText('1 rappel(s) envoyé(s) ✔').waitFor();
  // retirer une proposition de l'historique
  expectDialog = 'Retirer la proposition envoyée à info@refuge-test.be de l’historique ?';
  await page.getByRole('button', { name: 'Retirer la proposition envoyée à info@refuge-test.be' }).click();
  await page.getByText('info@refuge-test.be', { exact: false }).waitFor({ state: 'detached' });
  // proposition envoyée à un refuge par e-mail
  await page.getByPlaceholder('Adresse e-mail du refuge').fill('contact@refuge-exemple.be');
  await page.getByPlaceholder('Nom du refuge (facultatif)').fill('Refuge Exemple');
  expectDialog = 'Envoyer la proposition à contact@refuge-exemple.be ?';
  await page.getByRole('button', { name: 'Envoyer la proposition' }).click();
  await page.getByText('Proposition envoyée à contact@refuge-exemple.be ✔').waitFor();
  await shot('11c-admin-shelters');
  await page.getByRole('button', { name: 'Profil', exact: true }).click();
});
await step('donner mon avis', async () => {
  await page.getByRole('button', { name: /Donner mon avis \/ signaler un bug/ }).first().click();
  await page.getByRole('button', { name: '💡 Une idée' }).click();
  // capture d'écran : aperçu affiché, puis retirée
  await page.locator('input[type=file][accept="image/*"]').last().setInputFiles({ name: 'capture.png', mimeType: 'image/png', buffer: fs.readFileSync(path.join(DIST, 'favicon.png')) });
  await page.getByAltText('Aperçu de la capture d’écran').waitFor();
  await page.getByRole('button', { name: 'Retirer la capture d’écran' }).click();
  await page.getByText('Ajouter une capture d’écran (facultatif)').waitFor();
  await page.getByLabel('Ton message').fill('Ajouter un mode sortie de nuit');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await page.getByText('Merci beaucoup ! Ton message est bien arrivé').waitFor();
  await page.getByText('Merci beaucoup ! Ton message est bien arrivé').waitFor({ state: 'detached', timeout: 5000 });
});
await step('mon profil public', async () => { await page.getByText('Voir mon profil public').click(); await page.getByText('Modifier mon profil').waitFor(); await page.getByText('Recommandé 1 fois après une sortie').waitFor(); await page.getByText('1 avis après une garde', { exact: false }).waitFor(); await page.getByText('« Super gardien »', { exact: false }).waitFor(); await page.getByText('« Rex est adorable »', { exact: false }).waitFor(); });
await step('légal', async () => { await page.getByRole('button', { name: 'Profil', exact: true }).click(); await page.getByText('Mentions légales').click(); await page.getByText('Hébergement').waitFor(); await page.getByText('Retour').click(); await page.getByText('Voir mon profil public').waitFor(); });

// Page d'accueil (déconnecté), en mode sombre
await step('accueil (mode sombre)', async () => {
  const anon = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, colorScheme: 'dark', serviceWorkers: 'block' });
  const p2 = await anon.newPage();
  p2.on('pageerror', (e) => errors.push(`pageerror (accueil): ${e.message}`));
  await p2.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) return u.hostname.endsWith('supabase.co')
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) : route.abort();
    let f = path.join(DIST, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!fs.existsSync(f)) f = path.join(DIST, 'index.html');
    const ext = path.extname(f);
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' }[ext] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(f) });
  });
  await p2.goto(`${ORIGIN}/`);
  await p2.getByText('Comment ça marche ?').waitFor();
  if (OUT) await p2.screenshot({ path: `${OUT}/10-landing-dark.png`, fullPage: true });
  await p2.getByText('Sorties entre animaux', { exact: true }).waitFor(); // slogan sous le logo, traduisible
  await p2.getByRole('button', { name: 'NL', exact: true }).click();
  await p2.getByText('Wandelen met je dier', { exact: true }).waitFor();
  if (OUT) await p2.screenshot({ path: `${OUT}/10b-landing-nl.png` });
  await p2.getByRole('button', { name: 'EN', exact: true }).click();
  await p2.getByText('Rides with pets', { exact: true }).waitFor();
  if (OUT) await p2.screenshot({ path: `${OUT}/10c-landing-en.png`, fullPage: true });
  await p2.getByRole('button', { name: 'FR', exact: true }).click();
  await p2.getByText('Comment ça marche ?').waitFor();
  await p2.getByRole('button', { name: 'Créer mon compte gratuit' }).click();
  await p2.getByRole('button', { name: 'Continuer avec Google' }).waitFor();
  if (OUT) await p2.screenshot({ path: `${OUT}/11-signup.png`, fullPage: true });
  await anon.close();
});

// Pages publiques (sans compte) : animaux à adopter, fiche, refuge, sorties
await step('pages publiques sans compte', async () => {
  const anon = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p3 = await anon.newPage();
  p3.on('pageerror', (e) => errors.push(`pageerror (public): ${e.message}`));
  const SH = '1b8f6d3e-1111-4222-8333-944445555666';
  const LI = { id: '0b8f6d3e-1111-4222-8333-944445555666', title: 'Mimi cherche une famille', species: 'chat', breed: 'Européenne', sex: 'femelle',
    city: 'Namur', status: 'active', price_cents: 15000, kind: 'vente', photo: null, photo_urls: [], description: 'Très douce', vaccinated: true, sterilized: true,
    shelter_id: SH, shelter_name: 'Refuge Test', shelter: { id: SH, name: 'Refuge Test', approval_number: 'HK123', address: 'Rue X 1, Namur', lat: 50.46, lng: 4.86 } };
  const RPCS = { public_listings: [LI], public_listing: LI, public_shelters: [{ id: SH, name: 'Refuge Test', address: 'Rue X 1, Namur', animals: 1 }],
    public_shelter: { id: SH, name: 'Refuge Test', approval_number: 'HK123', address: 'Rue X 1, Namur', lat: 50.46, lng: 4.86, region: 'wallonie',
      contact: '', email: 'info@refuge-test.be', phone: '081 22 33 44', website: 'https://www.refuge-test.be', animals: 1, adopted: 3, verified_at: iso(-30 * 86400e3) },
    public_needs: [{ id: 'nd1', kind: 'don', title: 'Couvertures pour chatons', body: '', expires_on: '2099-01-01', shelter_id: SH, shelter_name: 'Refuge Test' }],
    public_adopted: [{ id: 'ad1', title: 'Rex adopté', species: 'chien', photo: null, adopted_text: 'Rex adore sa nouvelle famille', shelter_name: 'Refuge Test' }],
    public_rides: [{ id: '2b8f6d3e-1111-4222-8333-944445555666', title: 'Tour du lac', place: 'Lac de Genval', starts_at: iso(86400e3), duration: 60, pace: 'normal', max_participants: 6, participants: 2 }] };
  RPCS.public_ride = { ...RPCS.public_rides[0], description: 'Tous chiens sociables bienvenus' };
  RPCS.public_lost_alert = { id: '3b8f6d3e-1111-4222-8333-944445555666', kind: 'perdu', name: 'Filou', species: 'chat', description: 'Chat tigré, collier bleu', photo_url: null, place: 'Rue de Fer, Namur', seen_at: iso(-3600e3), status: 'active' };
  RPCS.public_city = { members: 38, pets: 45, dogs: 31, cats: 9, breeds: ['Labrador', 'Berger Australien', 'Border Collie', 'Jack Russell'],
    rides: [{ ...RPCS.public_rides[0], title: 'Tour de la Citadelle', place: 'Citadelle de Namur' }, { ...RPCS.public_rides[0], id: '4b8f6d3e-1111-4222-8333-944445555666', title: 'Sortie au bord de Meuse', place: 'Jambes, Namur', starts_at: iso(3 * 86400e3), pace: 'tranquille' }],
    lost_active: 1, shelters: [{ id: SH, name: 'Refuge Test', address: 'Rue X 1, Namur', animals: 1 }] };
  RPCS.public_lost_alerts = [
    { id: RPCS.public_lost_alert.id, kind: 'perdu', name: 'Filou', species: 'chat', photo_url: null, place: 'Rue de Fer, Namur', seen_at: iso(-3600e3), status: 'active', solved: false, lat: 50.5, lng: 4.9 },
    { id: '5b8f6d3e-1111-4222-8333-944445555666', kind: 'trouve', name: '', species: 'chien', photo_url: null, place: 'Parc Josaphat, Schaerbeek', seen_at: iso(-7200e3), status: 'active', solved: false, lat: 50.9, lng: 4.4 },
    { id: '6b8f6d3e-1111-4222-8333-944445555666', kind: 'perdu', name: 'Nala', species: 'chien', photo_url: null, place: 'Bois de la Cambre', seen_at: iso(-5 * 86400e3), status: 'resolu', solved: true, lat: 50.8, lng: 4.4 },
  ];
  await p3.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) {
      const m = u.pathname.match(/\/rest\/v1\/rpc\/(\w+)/);
      return u.hostname.endsWith('supabase.co')
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(m ? RPCS[m[1]] ?? null : {}) }) : route.abort();
    }
    let f = path.join(DIST, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(f) });
  });
  await p3.goto(`${ORIGIN}/adoptions`);
  await p3.getByRole('heading', { name: 'Animaux à adopter en refuge' }).waitFor();
  await p3.getByText('Refuges partenaires').waitFor();
  await p3.getByText('Rex adore sa nouvelle famille').waitFor(); // animaux adoptés
  await p3.getByText('Couvertures pour chatons').waitFor(); // besoins des refuges
  // page par ville
  await p3.goto(`${ORIGIN}/adoptions/namur`);
  await p3.getByRole('heading', { name: 'Animaux à adopter à Namur' }).waitFor();
  await p3.getByText('Mimi cherche une famille').waitFor();
  await p3.goto(`${ORIGIN}/adoptions`);
  await p3.getByRole('heading', { name: 'Animaux à adopter en refuge' }).waitFor();
  if (OUT) await p3.screenshot({ path: `${OUT}/12-public-adoptions.png`, fullPage: true });
  await p3.getByText('Mimi cherche une famille').click();
  await p3.getByRole('button', { name: 'Contacter le refuge (inscription gratuite)' }).waitFor();
  await p3.getByText('Refuge vérifié · agrément HK123').waitFor();
  await p3.getByRole('button', { name: 'Refuge Test' }).click();
  await p3.getByText('Ses animaux à adopter').waitFor();
  await p3.getByText('Infos pratiques').waitFor();
  await p3.getByRole('link', { name: '📞 081 22 33 44' }).waitFor(); // coordonnées cliquables
  await p3.getByRole('link', { name: '✉️ info@refuge-test.be' }).waitFor();
  await p3.getByRole('link', { name: '🌐 www.refuge-test.be' }).waitFor();
  await p3.getByText('adoptés grâce à Cyclami').waitFor();
  if (OUT) await p3.screenshot({ path: `${OUT}/12f-public-shelter.png`, fullPage: true });
  if (!p3.url().endsWith(`/refuge/${SH}`)) throw new Error(`adresse du refuge inattendue : ${p3.url()}`);
  await p3.goto(`${ORIGIN}/sorties`);
  await p3.getByText('Tour du lac').waitFor();
  await p3.getByText('Tour du lac').click();
  await p3.getByRole('button', { name: 'Participer (inscription gratuite)' }).waitFor();
  // alerte « perdu » ouverte depuis le QR code d'une affiche, sans compte
  await p3.goto(`${ORIGIN}/p/3b8f6d3e-1111-4222-8333-944445555666`);
  await p3.getByText('Chat tigré, collier bleu').waitFor();
  await p3.getByRole('button', { name: 'Je l’ai vu : prévenir son humain (inscription gratuite)' }).waitFor();
  if (OUT) await p3.screenshot({ path: `${OUT}/12b-public-lost.png`, fullPage: true });
  // lien de parrainage : le code est gardé pour après l'inscription, et retiré de l'adresse
  await p3.goto(`${ORIGIN}/?p=bbbbbbbb00`);
  await p3.waitForFunction(() => localStorage.getItem('cyclami:referral')?.includes('bbbbbbbb00'));
  if (new URL(p3.url()).search) throw new Error(`code encore dans l'adresse : ${p3.url()}`);
  // pages par ville : sorties et rencontres entre chiens, animaux perdus
  await p3.goto(`${ORIGIN}/sorties/namur`);
  await p3.getByRole('heading', { name: 'Sorties et rencontres entre chiens à Namur' }).waitFor();
  await p3.getByText('Tour de la Citadelle').waitFor();
  await p3.getByText('Labrador, Berger Australien', { exact: false }).waitFor();
  if (OUT) await p3.screenshot({ path: `${OUT}/12d-city-rides.png`, fullPage: true });
  await p3.getByRole('button', { name: /Animaux perdus à Namur/ }).click();
  await p3.getByRole('heading', { name: 'Animaux perdus et trouvés à Namur' }).waitFor();
  if (new URL(p3.url()).pathname !== '/perdus/namur') throw new Error(`adresse inattendue : ${p3.url()}`);
  await p3.goto(`${ORIGIN}/perdus`);
  await p3.getByRole('heading', { name: 'Animaux perdus et trouvés en Belgique et en France' }).waitFor();
  await p3.getByRole('link', { name: '📍 Bruxelles' }).waitFor(); // villes qui ont des alertes
  if (OUT) await p3.screenshot({ path: `${OUT}/12e-public-lost-list.png`, fullPage: true });
  await p3.getByText('Filou').click();
  await p3.getByText('Chat tigré, collier bleu').waitFor();
  await p3.goto(`${ORIGIN}/sorties/atlantide`);
  await p3.locator('img[src*="404.webp"]').waitFor(); // ville inconnue : page 404
  // page d'inscription des refuges (lien des propositions envoyées par e-mail)
  await p3.goto(`${ORIGIN}/refuges`);
  await p3.getByRole('heading', { name: 'Refuges : faites adopter vos animaux gratuitement' }).waitFor();
  await p3.getByText('Tous vos animaux d’un coup').waitFor();
  if (OUT) await p3.screenshot({ path: `${OUT}/12c-public-join-shelters.png`, fullPage: true });
  await p3.getByRole('button', { name: 'Inscrire mon refuge (gratuit)' }).first().click();
  await p3.getByRole('button', { name: 'Continuer avec Google' }).waitFor();
  if (await p3.evaluate(() => sessionStorage.getItem('cyclami:shelter-signup')) !== '1') throw new Error('inscription « refuge » non mémorisée');
  // version néerlandaise trouvée sur Google : /nl/…, les liens gardent la langue
  await p3.goto(`${ORIGIN}/nl/adoptions`);
  await p3.getByRole('heading', { name: 'Dieren ter adoptie in asielen' }).waitFor();
  await p3.getByText('Mimi cherche une famille').click();
  await p3.getByText('Refuge Test').first().waitFor();
  if (!new URL(p3.url()).pathname.startsWith('/nl/a/')) throw new Error(`adresse sans la langue : ${p3.url()}`);
  await p3.goto(`${ORIGIN}/nl/sorties/gand`);
  await p3.getByRole('heading', { name: 'Wandelen en kennismaken met honden in Gent' }).waitFor();
  await anon.close();
});

// Version néerlandaise : accueil et site connecté, langue choisie par le sélecteur.
// nouveaux comptes (sans refuge) pour les étapes suivantes : l'accueil « présente ton animal » s'affiche
T.shelters = T.shelters.filter((x) => x.user_id !== ME);
await step('inscription Google : prénom modifiable', async () => {
  const ctxG = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const pg = await ctxG.newPage();
  pg.on('pageerror', (e) => errors.push(`pageerror (inscription): ${e.message}`));
  let savedName = null;
  // compte tout neuf créé avec Google : pseudo Google, pas de ville, pas d'animal
  const saved = { profiles: T.profiles, pets: T.pets };
  T.profiles = T.profiles.map((p) => (p.id === ME ? { ...p, name: 'The Relaxed', city: '' } : p));
  T.pets = T.pets.filter((p) => p.owner_id !== ME);
  await pg.route('**/*', async (route) => {
    const req = route.request();
    if (new URL(req.url()).pathname === '/rest/v1/profiles' && req.method() === 'PATCH') {
      savedName = JSON.parse(req.postData() || '{}').name ?? savedName;
    }
    return mockRoute(route);
  });
  await pg.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-qwhssunuewkzdppzvjdv-auth-token', JSON.stringify(session)]);
  await pg.goto(`${ORIGIN}/`);
  await pg.getByText('Bienvenue The Relaxed', { exact: false }).waitFor();
  await pg.getByLabel('Ton prénom (ou pseudo)').fill('Nathan');
  await pg.getByText('Bienvenue Nathan', { exact: false }).waitFor();
  await pg.getByLabel('Ta ville ou ton quartier').fill('Ixelles');
  await pg.getByText('🚴 Ton premier animal').waitFor();
  await pg.getByPlaceholder('Nom de ton animal').fill('Rex');
  await pg.getByRole('button', { name: 'C’est parti !' }).click();
  await pg.waitForTimeout(800);
  Object.assign(T, saved);
  await ctxG.close();
  if (savedName !== 'Nathan') throw new Error(`prénom enregistré : ${savedName}`);
});
await step('néerlandais', async () => {
  const ctx3 = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p4 = await ctx3.newPage();
  p4.on('pageerror', (e) => errors.push(`pageerror (néerlandais): ${e.message}`));
  await p4.route('**/*', mockRoute);
  await p4.goto(`${ORIGIN}/`);
  await p4.getByText('Comment ça marche ?').waitFor();
  await p4.getByRole('button', { name: 'NL', exact: true }).click(); // recharge la page
  await p4.getByText('Hoe werkt het?').waitFor();
  await p4.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-qwhssunuewkzdppzvjdv-auth-token', JSON.stringify(session)]);
  await p4.goto(`${ORIGIN}/`);
  await p4.getByText('Fietsmaatjes').waitFor();
  await p4.getByRole('button', { name: 'Fietstochten' }).click();
  await p4.getByText('Tour du lac').first().waitFor();
  if (OUT) await p4.screenshot({ path: `${OUT}/23-nl.png`, fullPage: true });
  await ctx3.close();
});

// Vue d'un modérateur (Bob) : il ne peut pas supprimer son compte lui-même.
await step('page 404 illustrée', async () => {
  await page.goto(`${ORIGIN}/cette-page-nexiste-pas`);
  await page.getByText('Oups, cette page s’est sauvée !').waitFor();
  await page.locator('img[src*="404.webp"]').waitFor();
  await page.getByRole('button', { name: 'Revenir à l’accueil' }).click();
  await page.getByText('Compagnons de sortie').waitFor();
});
await step('modérateur : suppression du compte bloquée', async () => {
  const bobJwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: BOB, exp, role: 'authenticated', aud: 'authenticated', email: 'bob@test.fr' })}.sig`;
  const bobUser = { ...user, id: BOB, email: 'bob@test.fr' };
  const bobSession = { ...session, access_token: bobJwt, user: bobUser };
  const ctx2 = await browser.newContext({ locale: 'fr-BE', viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p3 = await ctx2.newPage();
  p3.on('pageerror', (e) => errors.push(`pageerror (modérateur): ${e.message}`));
  await p3.route('**/*', (route) => (new URL(route.request().url()).pathname.includes('/auth/v1/user')
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bobUser) })
    : mockRoute(route)));
  await p3.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, ['sb-qwhssunuewkzdppzvjdv-auth-token', JSON.stringify(bobSession)]);
  await p3.goto(`${ORIGIN}/`);
  await p3.getByRole('button', { name: 'Profil', exact: true }).click();
  await p3.getByText('Tu es modérateur : pour supprimer ton compte').waitFor();
  await p3.getByRole('button', { name: 'Contacter l’administrateur' }).waitFor();
  if (await p3.getByRole('button', { name: 'Supprimer mon compte' }).count()) throw new Error('bouton de suppression visible pour un modérateur');
  await p3.getByText('Modération').first().waitFor();
  await ctx2.close();
});

console.log('\nERREURS:', errors.length ? '\n' + errors.join('\n') : 'aucune');
await browser.close();
process.exit(errors.length ? 1 : 0);
