// Aperçu des liens partagés (WhatsApp, Messenger, Facebook…) et pages publiques trouvables sur Google.
//   - /s/<sortie>, /f/<sujet>, /g/<club ou groupe>, /p/<profil> : balises « og: » de l'aperçu ;
//   - /, /sorties, /sorties/<ville>, /s/<sortie> : le contenu de la page est aussi écrit dans le HTML
//     envoyé, pour les moteurs de recherche (le site le remplace dès qu'il s'affiche) ;
//   - /sitemap.xml : plan du site (pages publiques en français, néerlandais et anglais).
// Les robots n'exécutent pas toujours le JavaScript : tout est donc préparé ici, côté serveur.
// Configuration : variables d'environnement Netlify SUPABASE_URL et SUPABASE_PUBLISHABLE_KEY
// (ou VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY, les mêmes que le site), SITE_URL facultative.
import { CITIES, CITY_RADIUS_KM, cityBySlug, nearbyCities } from '../../src/lib/cities.js';

// Variables d'environnement (Netlify → Site configuration → Environment variables).
const env = (name) => {
  try {
    return globalThis.Netlify?.env?.get?.(name) ?? globalThis.process?.env?.[name] ?? '';
  } catch {
    return '';
  }
};
const supabaseUrl = () => String(env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, '');
const supabaseKey = () => String(env('SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_PUBLISHABLE_KEY'));
// Adresse officielle du site (liens canoniques, plan du site) : une seule constante à changer.
export const SITE = 'https://cyclami.com';
const siteUrl = () => String(env('SITE_URL') || SITE).replace(/\/+$/, '');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function rpc(name, args = {}) {
  const base = supabaseUrl();
  if (!base) return null; // base pas encore configurée : la page reste celle de l'application
  try {
    const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: supabaseKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(2500),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Seules les photos publiques du stockage Supabase du site servent d'image d'aperçu.
const isOwnPhoto = (url) => {
  const base = supabaseUrl();
  return !!base && typeof url === 'string' && url.startsWith(`${base}/storage/v1/object/public/`);
};

// Langues des pages publiques : français sans préfixe, néerlandais sous /nl, anglais sous /en.
export const LANGS = ['fr', 'nl', 'en'];
const LOCALE = { fr: 'fr-BE', nl: 'nl-BE', en: 'en-GB' };
const OG_LOCALE = { fr: 'fr_BE', nl: 'nl_BE', en: 'en_GB' };
const prefix = (lang) => (lang === 'fr' ? '' : `/${lang}`);

// Textes des pages publiques écrits par le serveur (pour Google), dans les trois langues.
// Les questions fréquentes sont les mêmes que sur la page d'accueil (src/pages/Landing.jsx et ses traductions).
const TX = {
  fr: {
    homeTitle: 'Cyclami — Trouve des cyclistes de ton niveau et roulez ensemble',
    homeDesc: 'L’appli gratuite pour trouver des cyclistes de ton niveau près de chez toi et rouler ensemble : sorties de groupe sur route, en VTT, gravel ou vélo électrique, en Belgique et en France.',
    homeH1: 'Roule avec des cyclistes de ton niveau, près de chez toi',
    homeIntro: 'Cyclami est l’appli gratuite pour trouver des cyclistes de ton niveau près de chez toi et rouler ensemble, en Belgique et en France. Sorties de groupe sans lâchage, suivi GPS, dangers de la route signalés par les cyclistes du coin, clubs et forum.',
    homeFaq: [
      ['Cyclami, c’est quoi ?', 'Une appli gratuite pour trouver des cyclistes de ton niveau près de chez toi et rouler ensemble : sorties de groupe sur route, en VTT ou gravel, ou en balade à vélo électrique, en Belgique et en France.'],
      ['Comment trouver des cyclistes de mon niveau ?', 'Indique tes disciplines, ton niveau et ta vitesse moyenne habituelle, puis regarde les cyclistes autour de toi sur la liste ou sur la carte, avec un score de compatibilité. Écris-leur ou rejoins une sortie de groupe.'],
      ['Je débute : vais-je ralentir le groupe ?', 'Choisis une sortie de niveau débutant ou marquée « pas de lâchage » : le groupe s’engage à attendre tout le monde. L’allure, la distance et le dénivelé sont indiqués avant de t’inscrire.'],
      ['C’est gratuit ?', 'Oui, entièrement : pas d’abonnement, pas de publicité.'],
      ['Où peut-on utiliser Cyclami ?', 'En Belgique et en France, en français, en néerlandais ou en anglais.'],
      ['Les autres voient-ils mon adresse ?', 'Non. Ta position est arrondie à environ 1 km et n’est visible que des membres connectés. Ton e-mail n’est jamais affiché.'],
      ['Cyclami organise-t-il les sorties ?', 'Non. Les sorties sont proposées par les membres et chacun roule sous sa propre responsabilité. Porte un casque, respecte le code de la route et choisis une sortie adaptée à ton niveau.'],
      ['Mon club peut-il utiliser Cyclami ?', 'Oui : crée un groupe pour ton club ou ta bande d’amis, avec son mur de discussion et ses sorties réservées aux membres. C’est gratuit.'],
      ['Et si quelqu’un se comporte mal ?', 'Tu peux le bloquer et le signaler en un clic. Donne toujours tes premiers rendez-vous dans un lieu public.'],
    ],
    ridesTitle: 'Sorties vélo à venir',
    ridesDesc: (n) => `${n ? `${n} sortie${n > 1 ? 's' : ''} de groupe à venir` : 'Les prochaines sorties de groupe'} en Belgique et en France : route, VTT, gravel et vélo électrique, pour tous les niveaux. Gratuit.`,
    ridesIntro: 'Les prochaines sorties de groupe proposées par les cyclistes de Cyclami, en Belgique et en France : route, VTT, gravel ou balade à vélo électrique. Inscris-toi gratuitement pour y participer.',
    byTown: 'Sorties vélo par ville',
    townTitle: (c) => `Sorties vélo et cyclistes à ${c}`,
    townDesc: (c, n) => `Cyclistes à ${c} : trouve des partenaires de ton niveau près de chez toi${n ? ` (${n} cyclistes dans les environs)` : ''} et rejoins des sorties de groupe sur route, en VTT ou à vélo électrique. Gratuit.`,
    townIntro: (c) => `Tu roules à ${c} ou dans les environs ? Sur Cyclami, les cyclistes du coin se retrouvent pour rouler ensemble, à leur niveau : sorties sur route, en VTT ou gravel, balades à vélo électrique. Gratuit, sans publicité.`,
    townStats: (m, r, g, km) => `${m} cyclistes à moins de ${km} km, ${r} sorties prévues, ${g} clubs et groupes.`,
    townRides: (c) => `Prochaines sorties autour de ${c}`,
    townNoRide: 'Aucune sortie prévue pour le moment : organise la première !',
    townGroups: (c) => `Clubs et groupes près de ${c}`,
    otherCities: 'Autres villes',
    rideDesc: (d, pl, info) => `📅 ${d} · 📍 ${pl}${info ? ` · ${info}` : ''} — Sortie vélo de groupe sur Cyclami.`,
    safety: 'Cyclami n’organise pas les sorties : chacun roule sous sa propre responsabilité. Casque recommandé et code de la route de rigueur.',
    types: { route: 'Route', vtt_gravel: 'VTT / gravel', loisir_electrique: 'Loisir / électrique' },
    levels: { debutant: 'Débutant', intermediaire: 'Intermédiaire', confirme: 'Confirmé', sportif: 'Sportif' },
    noDrop: 'pas de lâchage', kmh: (v) => `${v} km/h`, elev: (v) => `${v} m D+`,
  },
  nl: {
    homeTitle: 'Cyclami — Vind fietsers van jouw niveau en rij samen',
    homeDesc: 'De gratis app om fietsers van jouw niveau bij jou in de buurt te vinden en samen te rijden: groepsritten op de weg, met de mountainbike, gravelfiets of elektrische fiets, in België en Frankrijk.',
    homeH1: 'Rij samen met fietsers van jouw niveau, bij jou in de buurt',
    homeIntro: 'Cyclami is de gratis app om fietsers van jouw niveau bij jou in de buurt te vinden en samen te rijden, in België en Frankrijk. Groepsritten waarbij niemand wordt gelost, gps-tracking, gevaren op de weg gemeld door fietsers uit de buurt, clubs en forum.',
    homeFaq: [
      ['Wat is Cyclami?', 'Een gratis app om fietsers van jouw niveau bij jou in de buurt te vinden en samen te rijden: groepsritten op de weg, met de mountainbike of gravelfiets, of een tochtje op de elektrische fiets, in België en Frankrijk.'],
      ['Hoe vind ik fietsers van mijn niveau?', 'Geef je disciplines, je niveau en je gebruikelijke gemiddelde snelheid op en bekijk de fietsers rondom jou in de lijst of op de kaart, met een matchscore. Stuur hen een bericht of sluit je aan bij een groepsrit.'],
      ['Ik ben beginner: houd ik de groep niet op?', 'Kies een rit voor beginners of een rit waarbij « niemand wordt gelost »: de groep wacht op iedereen. Tempo, afstand en hoogtemeters staan vermeld voor je je inschrijft.'],
      ['Is het gratis?', 'Ja, volledig: geen abonnement, geen reclame.'],
      ['Waar kun je Cyclami gebruiken?', 'In België en Frankrijk, in het Nederlands, Frans of Engels.'],
      ['Kunnen anderen mijn adres zien?', 'Nee. Je locatie wordt afgerond tot op ongeveer 1 km en is alleen zichtbaar voor aangemelde leden. Je e-mailadres wordt nooit getoond.'],
      ['Organiseert Cyclami de ritten?', 'Nee. De ritten worden voorgesteld door de leden en iedereen rijdt op eigen verantwoordelijkheid. Draag een helm, respecteer de verkeersregels en kies een rit die bij je niveau past.'],
      ['Kan mijn club Cyclami gebruiken?', 'Ja: maak een groep aan voor je club of je vriendengroep, met een eigen prikbord en ritten enkel voor de leden. Het is gratis.'],
      ['En als iemand zich misdraagt?', 'Je kunt die persoon met één klik blokkeren en melden. Spreek de eerste keren altijd af op een openbare plek.'],
    ],
    ridesTitle: 'Komende fietstochten',
    ridesDesc: (n) => `${n ? `${n} komende ${n > 1 ? 'groepsritten' : 'groepsrit'}` : 'De volgende groepsritten'} in België en Frankrijk: weg, mountainbike, gravel en elektrische fiets, voor alle niveaus. Gratis.`,
    ridesIntro: 'De volgende groepsritten voorgesteld door de fietsers van Cyclami, in België en Frankrijk: op de weg, met de mountainbike, gravelfiets of elektrische fiets. Schrijf je gratis in om mee te rijden.',
    byTown: 'Fietstochten per stad',
    townTitle: (c) => `Fietstochten en fietsers in ${c}`,
    townDesc: (c, n) => `Fietsers in ${c}: vind fietsmaatjes van jouw niveau bij jou in de buurt${n ? ` (${n} fietsers in de omgeving)` : ''} en rij mee in groepsritten op de weg, met de mountainbike of de elektrische fiets. Gratis.`,
    townIntro: (c) => `Fiets je in ${c} of omgeving? Op Cyclami vinden fietsers uit de buurt elkaar om samen te rijden, op hun niveau: ritten op de weg, met de mountainbike of gravelfiets, tochtjes op de elektrische fiets. Gratis, zonder reclame.`,
    townStats: (m, r, g, km) => `${m} fietsers binnen ${km} km, ${r} geplande ritten, ${g} clubs en groepen.`,
    townRides: (c) => `Volgende fietstochten rond ${c}`,
    townNoRide: 'Nog geen fietstocht gepland: organiseer de eerste!',
    townGroups: (c) => `Clubs en groepen bij ${c}`,
    otherCities: 'Andere steden',
    rideDesc: (d, pl, info) => `📅 ${d} · 📍 ${pl}${info ? ` · ${info}` : ''} — Groepsrit op Cyclami.`,
    safety: 'Cyclami organiseert de ritten niet: iedereen rijdt op eigen verantwoordelijkheid. Een helm is aangeraden en de verkeersregels gelden altijd.',
    types: { route: 'Weg', vtt_gravel: 'Mountainbike / gravel', loisir_electrique: 'Recreatief / elektrisch' },
    levels: { debutant: 'Beginner', intermediaire: 'Gemiddeld', confirme: 'Gevorderd', sportif: 'Sportief' },
    noDrop: 'niemand wordt gelost', kmh: (v) => `${v} km/u`, elev: (v) => `${v} hoogtemeters`,
  },
  en: {
    homeTitle: 'Cyclami — Find cyclists of your level and ride together',
    homeDesc: 'The free app to find cyclists of your level near you and ride together: group rides on the road, by mountain bike, gravel bike or e-bike, in Belgium and France.',
    homeH1: 'Ride with cyclists of your level, near you',
    homeIntro: 'Cyclami is the free app to find cyclists of your level near you and ride together, in Belgium and France. No-drop group rides, GPS tracking, road hazards reported by local cyclists, clubs and a forum.',
    homeFaq: [
      ['What is Cyclami?', 'A free app to find cyclists of your level near you and ride together: group rides on the road, by mountain bike or gravel bike, or leisurely e-bike rides, in Belgium and France.'],
      ['How do I find cyclists of my level?', 'Enter your disciplines, your level and your usual average speed, then browse the cyclists around you on the list or the map, with a match score. Message them or join a group ride.'],
      ['I’m a beginner: will I slow the group down?', 'Pick a beginner ride or one marked “no-drop”: the group commits to waiting for everyone. The pace, distance and elevation gain are shown before you sign up.'],
      ['Is it free?', 'Yes, completely: no subscription, no ads.'],
      ['Where can I use Cyclami?', 'In Belgium and France, in French, Dutch or English.'],
      ['Can others see my address?', 'No. Your location is rounded to about 1 km and is only visible to logged-in members. Your e-mail is never shown.'],
      ['Does Cyclami organise the rides?', 'No. Rides are proposed by members and everyone rides at their own risk. Wear a helmet, follow the rules of the road and choose a ride that suits your level.'],
      ['Can my club use Cyclami?', 'Yes: create a group for your club or your group of friends, with its own discussion wall and members-only rides. It’s free.'],
      ['What if someone behaves badly?', 'You can block and report them in one click. Always arrange your first meet-ups in a public place.'],
    ],
    ridesTitle: 'Upcoming bike rides',
    ridesDesc: (n) => `${n ? `${n} upcoming group ride${n > 1 ? 's' : ''}` : 'Upcoming group rides'} in Belgium and France: road, mountain bike, gravel and e-bike, for every level. Free.`,
    ridesIntro: 'The next group rides proposed by Cyclami cyclists in Belgium and France: road, mountain bike, gravel or leisurely e-bike rides. Sign up for free to join.',
    byTown: 'Bike rides by city',
    townTitle: (c) => `Bike rides and cyclists in ${c}`,
    townDesc: (c, n) => `Cyclists in ${c}: find riding partners of your level near you${n ? ` (${n} cyclists nearby)` : ''} and join group rides on the road, by mountain bike or e-bike. Free.`,
    townIntro: (c) => `Riding in or around ${c}? On Cyclami, local cyclists meet up to ride together at their own level: road rides, mountain bike or gravel rides, leisurely e-bike rides. Free, no ads.`,
    townStats: (m, r, g, km) => `${m} cyclists within ${km} km, ${r} upcoming rides, ${g} clubs and groups.`,
    townRides: (c) => `Upcoming rides around ${c}`,
    townNoRide: 'No ride planned yet: organise the first one!',
    townGroups: (c) => `Clubs and groups near ${c}`,
    otherCities: 'Other cities',
    rideDesc: (d, pl, info) => `📅 ${d} · 📍 ${pl}${info ? ` · ${info}` : ''} — Group bike ride on Cyclami.`,
    safety: 'Cyclami does not organise the rides: everyone rides at their own risk. Helmets recommended; the rules of the road always apply.',
    types: { route: 'Road', vtt_gravel: 'MTB / gravel', loisir_electrique: 'Leisure / e-bike' },
    levels: { debutant: 'Beginner', intermediaire: 'Intermediate', confirme: 'Experienced', sportif: 'Sporty' },
    noDrop: 'no-drop', kmh: (v) => `${v} km/h`, elev: (v) => `${v} m elevation gain`,
  },
};

const when = (iso, lang = 'fr') => new Date(iso).toLocaleString(LOCALE[lang], { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const nb = (v, lang) => Number(v).toLocaleString(LOCALE[lang], { maximumFractionDigits: 1 });
const has = (v) => v != null && v !== '' && Number.isFinite(Number(v));

// « Route · Intermédiaire · 62 km · 25 km/h · pas de lâchage »
function rideInfo(w, lang = 'fr') {
  const T = TX[lang];
  return [
    T.types[w.ride_type], T.levels[w.level],
    has(w.distance_km) && `${nb(w.distance_km, lang)} km`,
    has(w.elevation_m) && T.elev(nb(w.elevation_m, lang)),
    has(w.avg_speed) && T.kmh(nb(w.avg_speed, lang)),
    w.no_drop && T.noDrop,
  ].filter(Boolean).join(' · ');
}

const rideLine = (w, pre, lang) => `<li><a href="${pre}/s/${w.id}">${esc(w.title)}</a> — ${esc(when(w.starts_at, lang))} · ${esc(w.place)}${rideInfo(w, lang) ? ` · ${esc(rideInfo(w, lang))}` : ''}</li>`;

// Contenu de chaque page publique : titre, description, contenu HTML et données structurées.
// path : adresse sans le préfixe de langue ; les liens écrits dans la page gardent la langue.
async function publicPage(path, site, lang = 'fr') {
  const T = TX[lang];
  const pre = prefix(lang);
  let m;
  if (path === '/') {
    return {
      title: T.homeTitle,
      fullTitle: true,
      description: T.homeDesc,
      body: `<h1>${esc(T.homeH1)}</h1>
<p>${esc(T.homeIntro)}</p>
${T.homeFaq.map(([q, a]) => `<h2>${esc(q)}</h2>\n<p>${esc(a)}</p>`).join('\n')}
<p><a href="${pre}/sorties">${esc(T.ridesTitle)}</a></p>`,
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Cyclami', url: `${site}/`, inLanguage: lang },
        { '@context': 'https://schema.org', '@type': 'Organization', name: 'Cyclami', url: `${site}/`, logo: `${site}/icon-512.png` },
        { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang,
          mainEntity: T.homeFaq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      ],
    };
  }
  if (path === '/sorties') {
    const rides = await rpc('public_rides');
    if (!rides) return null;
    return {
      title: T.ridesTitle,
      description: T.ridesDesc(rides.length),
      body: `<h1>${esc(T.ridesTitle)}</h1>
<p>${esc(T.ridesIntro)}</p>
<ul>${rides.map((w) => rideLine(w, pre, lang)).join('')}</ul>
<p>${esc(T.safety)}</p>
<h2>${esc(T.byTown)}</h2>
<ul>${CITIES.map((c) => `<li><a href="${pre}/sorties/${c.slug}">${esc(T.townTitle(c.name[lang]))}</a></li>`).join('')}</ul>`,
      jsonld: rides.slice(0, 50).map((w) => rideEvent(w, site, lang)),
    };
  }
  if ((m = path.match(/^\/sorties\/([a-z0-9-]{2,60})$/))) {
    const c = cityBySlug(m[1]);
    if (!c) return null;
    const name = c.name[lang];
    const d = await rpc('public_city', { p_lat: c.lat, p_lng: c.lng, p_km: CITY_RADIUS_KM });
    if (!d) return null;
    const rides = d.rides || [];
    const groups = d.groups || [];
    return {
      title: T.townTitle(name),
      description: T.townDesc(name, d.members),
      body: `<h1>${esc(T.townTitle(name))}</h1>
<p>${esc(T.townIntro(name))}</p>
<p>${esc(T.townStats(d.members || 0, rides.length, groups.length, CITY_RADIUS_KM))}</p>
<h2>${esc(T.townRides(name))}</h2>
${rides.length ? `<ul>${rides.map((w) => rideLine(w, pre, lang)).join('')}</ul>` : `<p>${esc(T.townNoRide)}</p>`}
${groups.length ? `<h2>${esc(T.townGroups(name))}</h2>
<ul>${groups.map((g) => `<li><a href="${pre}/g/${g.id}">${esc(g.name)}</a>${g.city ? ` — ${esc(g.city)}` : ''}</li>`).join('')}</ul>` : ''}
<p>${esc(T.safety)}</p>
<h2>${esc(T.otherCities)}</h2>
<ul>${nearbyCities(c, 8).map((o) => `<li><a href="${pre}/sorties/${o.slug}">${esc(T.townTitle(o.name[lang]))}</a></li>`).join('')}</ul>`,
      jsonld: rides.slice(0, 20).map((w) => rideEvent(w, site, lang)),
    };
  }
  if ((m = path.match(/^\/s\/([0-9a-f-]{36})$/i))) {
    const w = await rpc('public_ride', { p_id: m[1].toLowerCase() });
    if (!w) return null;
    const info = rideInfo(w, lang);
    return {
      title: `🚴 ${w.title}`,
      description: T.rideDesc(when(w.starts_at, lang), w.place, info),
      body: `<h1>${esc(w.title)}</h1>
<p>${esc(when(w.starts_at, lang))} · ${esc(w.duration)} min · ${esc(w.place)}</p>
${info ? `<p>${esc(info)}</p>` : ''}
<p>${esc(w.description).replace(/\n/g, '<br>')}</p>
<p>${esc(T.safety)}</p>
<p><a href="${pre}/sorties">${esc(T.ridesTitle)}</a></p>`,
      jsonld: [rideEvent(w, site, lang)],
    };
  }
  return null;
}

function rideEvent(w, site, lang = 'fr') {
  const lat = Number(w.lat);
  const lng = Number(w.lng);
  return {
    '@context': 'https://schema.org', '@type': 'Event', name: w.title, startDate: w.starts_at,
    endDate: new Date(new Date(w.starts_at).getTime() + (w.duration || 60) * 60000).toISOString(),
    ...(w.description && { description: String(w.description).slice(0, 500) }),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', eventStatus: 'https://schema.org/EventScheduled',
    location: { '@type': 'Place', name: w.place, address: w.place,
      ...(has(w.lat) && has(w.lng) && { geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng } }) },
    url: `${site}${prefix(lang)}/s/${w.id}`,
    isAccessibleForFree: true, organizer: { '@type': 'Organization', name: 'Cyclami', url: site }, inLanguage: lang,
  };
}

// Versions dans les autres langues (même page) pour Google, plus la langue de la page.
// path : adresse sans préfixe de langue.
export function withLanguages(html, path, site, lang = 'fr') {
  const href = (l) => `${site}${prefix(l)}${path === '/' && l !== 'fr' ? '' : path}`;
  const links = [...LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(href(l))}" />`),
    `<link rel="alternate" hreflang="x-default" href="${esc(href('fr'))}" />`].join('\n    ');
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`);
  html = html.replace(/<meta property="og:locale" content="[^"]*"\s*\/?>/, `<meta property="og:locale" content="${OG_LOCALE[lang]}" />`);
  return html.replace('</head>', `    ${links}\n  </head>`);
}

export function withPreview(html, p, url) {
  const set = (attr, name, value) => {
    const re = new RegExp(`<meta ${attr}="${name}" content="[^"]*"\\s*/?>`);
    const tag = `<meta ${attr}="${name}" content="${esc(value)}" />`;
    return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
  };
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}${p.fullTitle ? '' : ' · Cyclami'}</title>`);
  html = set('name', 'description', p.description || '');
  html = set('property', 'og:title', p.title);
  html = set('property', 'og:description', p.description || '');
  html = set('property', 'og:url', url);
  // image d'aperçu : seulement une photo publique du site, sinon l'image par défaut (/og-image.png)
  if (p.image && isOwnPhoto(p.image)) {
    html = set('property', 'og:image', p.image);
    html = set('name', 'twitter:image', p.image);
    html = html.replace(/\s*<meta property="og:image:(width|height)" content="[^"]*"\s*\/?>/g, '');
  }
  if (p.noindex) html = html.replace('</head>', '    <meta name="robots" content="noindex" />\n  </head>');
  if (p.canonical !== false) html = html.replace('</head>', `    <link rel="canonical" href="${esc(url)}" />\n  </head>`);
  if (p.jsonld?.length) {
    const json = JSON.stringify(p.jsonld.length === 1 ? p.jsonld[0] : p.jsonld).replace(/</g, '\\u003c');
    html = html.replace('</head>', `    <script type="application/ld+json">${json}</script>\n  </head>`);
  }
  // contenu lisible par les moteurs de recherche ; remplacé par l'application dès son affichage
  // les visiteurs (JavaScript actif) ne le voient pas s'afficher une seconde avant le site : seulement les robots sans JavaScript
  if (p.body) {
    html = html.replace('</head>', `    <script>document.documentElement.classList.add('js')</script><style>.js #ssr{visibility:hidden}</style>\n  </head>`);
    html = html.replace('<div id="root"></div>', `<div id="root"><main id="ssr" style="max-width:48rem;margin:auto;padding:1rem">${p.body}</main></div>`);
  }
  return html;
}

// Plan du site pour Google : pages publiques (en français, néerlandais et anglais), villes et sorties à venir.
async function sitemap(site) {
  const rides = await rpc('public_rides');
  const pages = [
    ['/', 'weekly'], ['/sorties', 'daily'],
    ...CITIES.map((c) => [`/sorties/${c.slug}`, 'weekly']),
    ...(rides || []).map((w) => [`/s/${w.id}`, 'daily']),
  ];
  const href = (l, p) => `${site}${prefix(l)}${p === '/' && l !== 'fr' ? '' : p}`;
  const entry = (loc, freq, alts = '') => `  <url><loc>${esc(loc)}</loc>${alts}<changefreq>${freq}</changefreq></url>`;
  const lines = [
    ...pages.flatMap(([p, freq]) => {
      const alts = [...LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(href(l, p))}"/>`),
        `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(href('fr', p))}"/>`].join('');
      return LANGS.map((l) => entry(href(l, p), freq, alts));
    }),
    ...['/mentions-legales', '/confidentialite', '/conditions'].map((p) => entry(site + p, 'yearly')),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${lines.join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export default async (request, context) => {
  const url = new URL(request.url);
  const site = siteUrl();
  const full = url.pathname.replace(/\/$/, '') || '/';
  if (full === '/sitemap.xml') return sitemap(site);
  // /nl/… et /en/… : mêmes pages, textes dans la langue
  const lm = full.match(/^\/(nl|en)(\/.*)?$/);
  const lang = lm ? lm[1] : 'fr';
  const path = lm ? lm[2] || '/' : full;
  const res = await context.next();
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  let p = await publicPage(path, site, lang);
  const isPublic = !!p;
  // ville inconnue (/sorties/xyz) : page 404 de l'application, avec le bon code pour Google
  if (!p && /^\/sorties\/[^/]+$/.test(path) && !cityBySlug(path.split('/')[2])) {
    return new Response(await res.text(), { status: 404, headers: res.headers });
  }
  if (!p) {
    // sortie terminée, sujet du forum, club ou groupe, profil : seulement l'aperçu du lien
    const m = path.match(/^\/([sfgp])\/([0-9a-f-]{36})$/i);
    if (!m) return res;
    p = await rpc('share_preview', { p_kind: m[1], p_id: m[2].toLowerCase() });
    if (!p?.title) return res;
    // pages réservées aux membres ; un profil n'a jamais de photo dans son aperçu (seul le prénom est public)
    p = { title: p.title, description: p.description, image: m[1].toLowerCase() === 'p' ? null : p.image, canonical: false };
  }
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=300');
  let html = await res.text();
  html = withPreview(html, p, `${site}${full === '/' ? '/' : full}`);
  if (isPublic) html = withLanguages(html, path, site, lang);
  // une page publique existe : code 200 (la règle « 404 » des adresses inconnues ne s'applique pas)
  return new Response(html, { status: 200, headers });
};

export const config = {
  path: ['/', '/s/*', '/f/*', '/g/*', '/p/*', '/sorties', '/sorties/*', '/sitemap.xml', '/nl', '/nl/*', '/en', '/en/*'],
};
