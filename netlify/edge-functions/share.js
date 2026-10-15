// Aperçu des liens partagés (WhatsApp, Messenger, Facebook…) et pages publiques trouvables sur Google.
//   - /b/<sortie>, /a/<annonce>, /f/<sujet>, /p/<alerte>, /g/<groupe> : balises « og: » de l'aperçu ;
//   - /adoptions, /sorties, /refuge/<refuge>, /a/<annonce>, /b/<sortie> : le contenu de la page est aussi
//     écrit dans le HTML envoyé, pour les moteurs de recherche (le site le remplace dès qu'il s'affiche).
// Les robots n'exécutent pas toujours le JavaScript : tout est donc préparé ici, côté serveur.
import { CITIES, CITY_RADIUS_KM, cityBySlug, nearbyCities, nearestCity } from '../../src/lib/cities.js';

const SUPABASE_URL = 'https://qwhssunuewkzdppzvjdv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_aaKHdx4rse2owAsSRLL4Rg_jGJ3HTIk'; // clé publique (la même que le site)
const PHOTO_RE = /^https:\/\/(cyclami-photos\.[a-z0-9-]+\.workers\.dev|qwhssunuewkzdppzvjdv\.supabase\.co\/storage\/v1\/object\/public)\//;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function rpc(name, args = {}) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(2500),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const SPECIES = {
  fr: { chien: 'Chien', chat: 'Chat', lapin: 'Lapin', furet: 'Furet', chinchilla: 'Chinchilla', cochon_inde: 'Cochon d’Inde',
    hamster: 'Hamster', rat: 'Rat', souris: 'Souris', gerbille: 'Gerbille', perroquet: 'Perroquet', perruche: 'Perruche',
    canari: 'Canari', poule: 'Poule', tortue: 'Tortue', cheval: 'Cheval', poney: 'Poney', ane: 'Âne', chevre: 'Chèvre' },
  nl: { chien: 'Hond', chat: 'Kat', lapin: 'Konijn', furet: 'Fret', chinchilla: 'Chinchilla', cochon_inde: 'Cavia',
    hamster: 'Hamster', rat: 'Rat', souris: 'Muis', gerbille: 'Gerbil', perroquet: 'Papegaai', perruche: 'Parkiet',
    canari: 'Kanarie', poule: 'Kip', tortue: 'Schildpad', cheval: 'Paard', poney: 'Pony', ane: 'Ezel', chevre: 'Geit' },
  en: { chien: 'Dog', chat: 'Cat', lapin: 'Rabbit', furet: 'Ferret', chinchilla: 'Chinchilla', cochon_inde: 'Guinea pig',
    hamster: 'Hamster', rat: 'Rat', souris: 'Mouse', gerbille: 'Gerbil', perroquet: 'Parrot', perruche: 'Budgie',
    canari: 'Canary', poule: 'Hen', tortue: 'Tortoise', cheval: 'Horse', poney: 'Pony', ane: 'Donkey', chevre: 'Goat' },
};

// Langues des pages publiques : français sans préfixe, néerlandais sous /nl, anglais sous /en.
export const LANGS = ['fr', 'nl', 'en'];
const LOCALE = { fr: 'fr-BE', nl: 'nl-BE', en: 'en-GB' };
const OG_LOCALE = { fr: 'fr_BE', nl: 'nl_BE', en: 'en_GB' };
const prefix = (lang) => (lang === 'fr' ? '' : `/${lang}`);

// Textes des pages publiques écrits par le serveur (pour Google), dans les trois langues.
const TX = {
  fr: {
    townTitle: (c) => `Sorties et rencontres entre chiens à ${c}`,
    townDesc: (c, n) => `Propriétaires de chiens à ${c} : trouve des compagnons de sortie près de chez toi${n ? ` (${n} membres dans les environs)` : ''}, rejoins des sorties de groupe et entraidez-vous. Gratuit.`,
    townIntro: (c) => `Tu habites à ${c} ou dans les environs ? Sur Cyclami, les propriétaires de chiens du coin se rencontrent pour promener leurs compagnons ensemble, se rendre service et s’entraider. Gratuit, sans publicité.`,
    townStats: (m, d, km) => `${m} membres et ${d} chiens à moins de ${km} km.`,
    townBreeds: 'Races les plus présentes', townRides: (c) => `Prochaines sorties autour de ${c}`, townNoRide: 'Aucune sortie prévue pour le moment : organise la première !',
    townShelters: (c) => `Refuges près de ${c}`, otherCities: 'Autres villes', byTown: 'Sorties et rencontres par ville',
    lostTitle: 'Animaux perdus et trouvés en Belgique et en France', lostTownTitle: (c) => `Animaux perdus et trouvés à ${c}`,
    lostDesc: (c, n) => `${n ? `${n} alerte${n > 1 ? 's' : ''} en cours` : 'Les alertes en cours'} : chiens, chats et autres animaux perdus ou trouvés${c ? ` à ${c} et dans les environs` : ' en Belgique et en France'}. Tu as vu l’un d’eux ? Préviens son humain.`,
    lostIntro: 'Les alertes en cours des membres d’Cyclami. Tu as vu l’un de ces animaux ? Ouvre l’alerte pour prévenir son humain.',
    lostNone: 'Aucune alerte en cours. Tant mieux !', lostKind: { perdu: 'Perdu', trouve: 'Trouvé', solved: 'Retrouvé' },
    homeTitle: 'Cyclami — Rencontres et sorties entre chiens, chats et maîtres',
    homeDesc: 'L’appli gratuite de rencontre entre animaux : trouve des compagnons de sortie pour ton chien ou ton chat près de chez toi, en Belgique et en France.',
    homeH1: 'Rencontres et sorties entre chiens, chats et leurs maîtres',
    homeIntro: 'Cyclami est l’appli gratuite de rencontre entre chiens, chats et leurs maîtres, en Belgique et en France : trouve des compagnons de sortie près de chez toi. Et aussi : alertes animaux perdus, garde entre voisins, carnet de santé et adoptions en refuge.',
    homeFaq: [
      ['Cyclami, c’est une appli de rencontre ?', 'Oui, une appli de rencontre pour les animaux et leurs maîtres : tu trouves des chiens et des chats compatibles près de chez toi pour se promener, jouer ou se rendre service. Ce n’est pas un site de rencontre amoureuse.'],
      ['Comment trouver un compagnon de sortie pour mon chien ?', 'Présente ton chien (taille, énergie, caractère), puis regarde les membres autour de toi sur la liste ou sur la carte, avec un score de compatibilité. Écris-leur ou rejoins une sortie de groupe dans ton quartier.'],
      ['C’est gratuit ?', 'Oui, entièrement : pas d’abonnement, pas de publicité.'],
      ['Où peut-on utiliser Cyclami ?', 'En Belgique et en France, en français, en néerlandais ou en anglais.'],
      ['Les autres voient-ils mon adresse ?', 'Non. Ta position est arrondie à environ 1 km et n’est visible que des membres connectés. Ton e-mail n’est jamais affiché.'],
      ['Quels animaux sont les bienvenus ?', 'Surtout les chiens, mais aussi les chats qui se promènent en harnais, les lapins, les furets… Tous les compagnons qui aiment sortir.'],
      ['Puis-je vendre ou donner un animal ?', 'Non. Pour respecter les règles de protection animale, seuls les refuges agréés et vérifiés publient des animaux à adopter.'],
      ['Je gère un refuge, comment vous rejoindre ?', 'Crée un compte gratuit, puis demande la vérification dans « Adoptions » avec ton numéro d’agrément. L’équipe valide ton refuge rapidement.'],
      ['Et si quelqu’un se comporte mal ?', 'Tu peux le bloquer et le signaler en un clic. Donne toujours tes premiers rendez-vous dans un lieu public.'],
    ],
    adoptTitle: 'Animaux à adopter en refuge',
    adoptDesc: (n) => `${n ? `${n} animal${n > 1 ? 'aux' : ''} à adopter : chiens` : 'Chiens'}, chats et autres animaux à adopter dans des refuges agréés et vérifiés, en Belgique et en France.`,
    adoptIntro: 'Chiens, chats et autres compagnons qui attendent une famille, proposés uniquement par des refuges agréés et vérifiés.',
    adopted: 'Ils ont trouvé une famille', byCity: 'Par ville', partners: 'Refuges partenaires',
    ridesTitle: 'Sorties entre propriétaires d’animaux',
    ridesDesc: 'Les prochaines sorties à plusieurs organisées par les propriétaires de chiens et d’autres animaux, près de chez toi. Gratuit.',
    ridesIntro: 'Les prochaines sorties organisées par les membres d’Cyclami. Inscris-toi gratuitement pour y participer avec ton compagnon.',
    cityTitle: (c) => `Animaux à adopter à ${c}`,
    cityDesc: (n, c) => `${n} animal${n > 1 ? 'aux' : ''} à adopter à ${c} et dans les environs, dans des refuges agréés et vérifiés.`,
    allAnimals: 'Tous les animaux à adopter',
    shelterTitle: (n) => `${n} — animaux à adopter`,
    shelterDesc: (n, a) => `Les animaux à adopter au refuge ${n}${a ? ` (${a})` : ''}, refuge agréé vérifié sur Cyclami.`,
    verified: (num) => `Refuge vérifié · agrément ${num}`, itsAnimals: 'Ses animaux à adopter',
    listingTitle: (tt) => `${tt} — à adopter`,
    listingDesc: (sp, br, sh, c, pr) => `${sp}${br ? ` (${br})` : ''} à adopter au refuge ${sh}${c ? `, ${c}` : ''}. ${pr}.`,
    offeredBy: (sh, num) => `Proposé à l’adoption par ${sh}, refuge vérifié (agrément ${num}).`,
    free: 'Gratuit', fee: (v) => `${v} € de frais d’adoption`,
    rideDesc: (d, pl) => `📅 ${d} · 📍 ${pl} — Sortie entre propriétaires d’animaux sur Cyclami.`,
    joinTitle: 'Refuges : faites adopter vos animaux gratuitement',
    joinDesc: 'Refuges agréés de Belgique et de France : publiez vos animaux à adopter gratuitement sur Cyclami, sans commission ni publicité. Import depuis un tableur, page publique, messagerie sécurisée.',
    joinBody: ['Inscription et publication gratuites, sans commission ni publicité.', 'Vos animaux ont une page publique, visible sans compte et sur Google.', 'Seuls les refuges agréés, vérifiés par notre équipe, publient des adoptions.', 'Les adoptants vous écrivent par une messagerie sécurisée ; vous choisissez les familles.', 'Importez tous vos animaux depuis un tableur.'],
  },
  nl: {
    townTitle: (c) => `Wandelen en kennismaken met honden in ${c}`,
    townDesc: (c, n) => `Hondenbaasjes in ${c}: vind fietsmaatjes bij jou in de buurt${n ? ` (${n} leden in de omgeving)` : ''}, wandel mee in groep en help elkaar. Gratis.`,
    townIntro: (c) => `Woon je in ${c} of omgeving? Op Cyclami leren hondenbaasjes uit de buurt elkaar kennen om samen te wandelen en elkaar te helpen. Gratis, zonder reclame.`,
    townStats: (m, d, km) => `${m} leden en ${d} honden binnen ${km} km.`,
    townBreeds: 'Meest voorkomende rassen', townRides: (c) => `Volgende fietstochten rond ${c}`, townNoRide: 'Nog geen fietstocht gepland: organiseer de eerste!',
    townShelters: (c) => `Asielen bij ${c}`, otherCities: 'Andere steden', byTown: 'Wandelen en kennismaken per stad',
    lostTitle: 'Vermiste en gevonden dieren in België en Frankrijk', lostTownTitle: (c) => `Vermiste en gevonden dieren in ${c}`,
    lostDesc: (c, n) => `${n ? `${n} lopende ${n > 1 ? 'meldingen' : 'melding'}` : 'De lopende meldingen'}: vermiste of gevonden honden, katten en andere dieren${c ? ` in ${c} en omgeving` : ' in België en Frankrijk'}. Heb je er een gezien? Verwittig het baasje.`,
    lostIntro: 'De lopende meldingen van leden van Cyclami. Heb je een van deze dieren gezien? Open de melding om het baasje te verwittigen.',
    lostNone: 'Geen lopende meldingen. Gelukkig maar!', lostKind: { perdu: 'Vermist', trouve: 'Gevonden', solved: 'Teruggevonden' },
    homeTitle: 'Cyclami — Ontmoetingen en fietstochten voor honden, katten en baasjes',
    homeDesc: 'De gratis app om dieren te laten kennismaken: vind fietsmaatjes voor je hond of kat bij jou in de buurt, in België en Frankrijk.',
    homeH1: 'Ontmoetingen en fietstochten voor honden, katten en hun baasjes',
    homeIntro: 'Cyclami is de gratis ontmoetingsapp voor honden, katten en hun baasjes, in België en Frankrijk: vind fietsmaatjes bij jou in de buurt. En ook: meldingen van vermiste dieren, oppas bij buren, gezondheidsboekje en adopties uit een asiel.',
    homeFaq: [
      ['Is Cyclami een datingapp?', 'Ja, een ontmoetingsapp voor dieren en hun baasjes: je vindt passende honden en katten bij jou in de buurt om samen te wandelen, te spelen of elkaar te helpen. Het is geen datingsite voor romantische relaties.'],
      ['Hoe vind ik een fietsmaatje voor mijn hond?', 'Stel je hond voor (grootte, energie, karakter) en bekijk de leden in je buurt in de lijst of op de kaart, met een matchscore. Stuur hen een bericht of sluit je aan bij een groepsfietstocht in je buurt.'],
      ['Is het gratis?', 'Ja, volledig: geen abonnement, geen reclame.'],
      ['Waar kun je Cyclami gebruiken?', 'In België en Frankrijk, in het Nederlands, Frans of Engels.'],
      ['Kunnen anderen mijn adres zien?', 'Nee. Je locatie wordt afgerond tot op ongeveer 1 km en is alleen zichtbaar voor aangemelde leden. Je e-mailadres wordt nooit getoond.'],
      ['Welke dieren zijn welkom?', 'Vooral honden, maar ook katten die aan een tuigje wandelen, konijnen, fretten… Alle maatjes die graag naar buiten gaan.'],
      ['Kan ik een dier verkopen of weggeven?', 'Nee. Om de dierenwelzijnsregels te respecteren, plaatsen enkel erkende en gecontroleerde asielen dieren ter adoptie.'],
      ['Ik beheer een asiel, hoe sluit ik aan?', 'Maak een gratis account aan en vraag de verificatie aan in « Adopties » met je erkenningsnummer. Het team keurt je asiel snel goed.'],
      ['En als iemand zich misdraagt?', 'Je kunt die persoon met één klik blokkeren en melden. Spreek de eerste keren altijd af op een openbare plek.'],
    ],
    adoptTitle: 'Dieren ter adoptie in asielen',
    adoptDesc: (n) => `${n ? `${n} ${n > 1 ? 'dieren' : 'dier'} ter adoptie: honden` : 'Honden'}, katten en andere dieren ter adoptie in erkende en gecontroleerde asielen, in België en Frankrijk.`,
    adoptIntro: 'Honden, katten en andere dieren die op een thuis wachten, enkel aangeboden door erkende en gecontroleerde asielen.',
    adopted: 'Ze vonden een thuis', byCity: 'Per stad', partners: 'Partnerasielen',
    ridesTitle: 'Fietstochten tussen baasjes',
    ridesDesc: 'De volgende groepsfietstochten georganiseerd door hondenbaasjes en andere dierenliefhebbers, bij jou in de buurt. Gratis.',
    ridesIntro: 'De volgende fietstochten georganiseerd door leden van Cyclami. Schrijf je gratis in om mee te wandelen met je dier.',
    cityTitle: (c) => `Dieren ter adoptie in ${c}`,
    cityDesc: (n, c) => `${n} ${n > 1 ? 'dieren' : 'dier'} ter adoptie in ${c} en omgeving, in erkende en gecontroleerde asielen.`,
    allAnimals: 'Alle dieren ter adoptie',
    shelterTitle: (n) => `${n} — dieren ter adoptie`,
    shelterDesc: (n, a) => `De dieren ter adoptie in het asiel ${n}${a ? ` (${a})` : ''}, erkend en gecontroleerd asiel op Cyclami.`,
    verified: (num) => `Gecontroleerd asiel · erkenning ${num}`, itsAnimals: 'Dieren ter adoptie',
    listingTitle: (tt) => `${tt} — ter adoptie`,
    listingDesc: (sp, br, sh, c, pr) => `${sp}${br ? ` (${br})` : ''} ter adoptie in het asiel ${sh}${c ? `, ${c}` : ''}. ${pr}.`,
    offeredBy: (sh, num) => `Ter adoptie aangeboden door ${sh}, gecontroleerd asiel (erkenning ${num}).`,
    free: 'Gratis', fee: (v) => `${v} € adoptiekosten`,
    rideDesc: (d, pl) => `📅 ${d} · 📍 ${pl} — Fietstocht tussen baasjes op Cyclami.`,
    joinTitle: 'Asielen: laat uw dieren gratis adopteren',
    joinDesc: 'Erkende asielen in België en Frankrijk: plaats uw dieren gratis ter adoptie op Cyclami, zonder commissie of reclame. Import vanuit een spreadsheet, publieke pagina, beveiligde berichten.',
    joinBody: ['Inschrijven en plaatsen is gratis, zonder commissie of reclame.', 'Uw dieren krijgen een publieke pagina, zichtbaar zonder account en op Google.', 'Enkel erkende asielen, gecontroleerd door ons team, plaatsen adopties.', 'Kandidaat-adoptanten schrijven u via beveiligde berichten; u kiest zelf de gezinnen.', 'Importeer al uw dieren vanuit een spreadsheet.'],
  },
  en: {
    townTitle: (c) => `Dog rides and meet-ups in ${c}`,
    townDesc: (c, n) => `Dog owners in ${c}: find riding buddies near you${n ? ` (${n} members nearby)` : ''}, join group rides and help each other. Free.`,
    townIntro: (c) => `Living in or around ${c}? On Cyclami, local dog owners meet to ride their companions together and help each other out. Free, no ads.`,
    townStats: (m, d, km) => `${m} members and ${d} dogs within ${km} km.`,
    townBreeds: 'Most common breeds', townRides: (c) => `Upcoming rides around ${c}`, townNoRide: 'No ride planned yet: organise the first one!',
    townShelters: (c) => `Shelters near ${c}`, otherCities: 'Other cities', byTown: 'Rides and meet-ups by city',
    lostTitle: 'Lost and found pets in Belgium and France', lostTownTitle: (c) => `Lost and found pets in ${c}`,
    lostDesc: (c, n) => `${n ? `${n} active alert${n > 1 ? 's' : ''}` : 'Active alerts'}: lost or found dogs, cats and other pets${c ? ` in and around ${c}` : ' in Belgium and France'}. Seen one of them? Let their human know.`,
    lostIntro: 'Active alerts from Cyclami members. Have you seen one of these animals? Open the alert to let their human know.',
    lostNone: 'No active alerts. Good news!', lostKind: { perdu: 'Lost', trouve: 'Found', solved: 'Reunited' },
    homeTitle: 'Cyclami — Meet-ups and rides for dogs, cats and their owners',
    homeDesc: 'The free app for pets to meet: find riding buddies for your dog or cat near you, in Belgium and France.',
    homeH1: 'Meet-ups and rides for dogs, cats and their owners',
    homeIntro: 'Cyclami is the free meet-up app for dogs, cats and their owners, in Belgium and France: find riding buddies near you. Plus: lost pet alerts, pet sitting between neighbours, health records and shelter adoptions.',
    homeFaq: [
      ['Is Cyclami a dating app?', 'Yes, a dating app for pets and their owners: find compatible dogs and cats near you to ride, play or help each other out. It is not a romantic dating site.'],
      ['How do I find a riding buddy for my dog?', 'Introduce your dog (size, energy, temperament), then browse the members around you on the list or the map, with a match score. Message them or join a group ride in your neighbourhood.'],
      ['Is it free?', 'Yes, completely: no subscription, no ads.'],
      ['Where can I use Cyclami?', 'In Belgium and France, in French, Dutch or English.'],
      ['Can others see my address?', 'No. Your location is rounded to about 1 km and is only visible to logged-in members. Your e-mail is never shown.'],
      ['Which animals are welcome?', 'Mostly dogs, but also cats that ride on a harness, rabbits, ferrets… Any companion who loves going out.'],
      ['Can I sell or give away an animal?', 'No. To comply with animal welfare rules, only licensed and verified shelters can list animals for adoption.'],
      ['I run a shelter, how do I join?', 'Create a free account, then request verification under “Adoptions” with your licence number. Our team approves your shelter quickly.'],
      ['What if someone behaves badly?', 'You can block and report them in one click. Always arrange your first meet-ups in a public place.'],
    ],
    adoptTitle: 'Shelter animals to adopt',
    adoptDesc: (n) => `${n ? `${n} ${n > 1 ? 'pets' : 'pet'} to adopt: dogs` : 'Dogs'}, cats and other pets to adopt from approved, verified shelters in Belgium and France.`,
    adoptIntro: 'Dogs, cats and other companions waiting for a home, offered only by approved and verified shelters.',
    adopted: 'They found a home', byCity: 'By city', partners: 'Partner shelters',
    ridesTitle: 'Rides between pet owners',
    ridesDesc: 'Upcoming group rides organised by dog owners and other pet lovers near you. Free.',
    ridesIntro: 'Upcoming rides organised by Cyclami members. Sign up for free to join with your pet.',
    cityTitle: (c) => `Pets to adopt in ${c}`,
    cityDesc: (n, c) => `${n} ${n > 1 ? 'pets' : 'pet'} to adopt in and around ${c}, from approved and verified shelters.`,
    allAnimals: 'All pets to adopt',
    shelterTitle: (n) => `${n} — pets to adopt`,
    shelterDesc: (n, a) => `Pets to adopt at the ${n} shelter${a ? ` (${a})` : ''}, an approved shelter verified on Cyclami.`,
    verified: (num) => `Verified shelter · licence ${num}`, itsAnimals: 'Pets to adopt',
    listingTitle: (tt) => `${tt} — to adopt`,
    listingDesc: (sp, br, sh, c, pr) => `${sp}${br ? ` (${br})` : ''} to adopt at ${sh}${c ? `, ${c}` : ''}. ${pr}.`,
    offeredBy: (sh, num) => `Offered for adoption by ${sh}, a verified shelter (licence ${num}).`,
    free: 'Free', fee: (v) => `€${v} adoption fee`,
    rideDesc: (d, pl) => `📅 ${d} · 📍 ${pl} — Ride between pet owners on Cyclami.`,
    joinTitle: 'Shelters: rehome your animals for free',
    joinDesc: 'Licensed shelters in Belgium and France: list your animals for adoption on Cyclami for free, with no commission or ads. Spreadsheet import, public page, secure messaging.',
    joinBody: ['Free registration and listings, no commission or ads.', 'Your animals get a public page, visible without an account and on Google.', 'Only licensed shelters, verified by our team, can list adoptions.', 'Adopters write to you through secure messaging; you choose the families.', 'Import all your animals from a spreadsheet.'],
  },
};

const speciesLabel = (s, lang = 'fr') => SPECIES[lang][s] || SPECIES.fr[s] || (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : 'Animal');
const when = (iso, lang = 'fr') => new Date(iso).toLocaleString(LOCALE[lang], { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const price = (cents, lang = 'fr') => (cents == null ? TX[lang].free : TX[lang].fee((cents / 100).toLocaleString(LOCALE[lang])));

// « Liège 4000 » → « liege-4000 » (même calcul que src/lib/share.js)
const citySlug = (city) => String(city || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Contenu de chaque page publique : titre, description, contenu HTML et données structurées.
// path : adresse sans le préfixe de langue ; les liens écrits dans la page gardent la langue.
async function publicPage(path, origin, lang = 'fr') {
  const T = TX[lang];
  const pre = prefix(lang);
  const sp = (s) => speciesLabel(s, lang);
  let m;
  if (path === '/') {
    return {
      title: T.homeTitle,
      fullTitle: true,
      description: T.homeDesc,
      body: `<h1>${esc(T.homeH1)}</h1>
<p>${esc(T.homeIntro)}</p>
${T.homeFaq.map(([q, a]) => `<h2>${esc(q)}</h2>\n<p>${esc(a)}</p>`).join('\n')}`,
      jsonld: [
        { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Cyclami', url: `${origin}/`, inLanguage: lang },
        { '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: lang,
          mainEntity: T.homeFaq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
      ],
    };
  }
  if (path === '/adoptions') {
    const [animals, shelters, adopted] = await Promise.all([rpc('public_listings'), rpc('public_shelters'), rpc('public_adopted')]);
    if (!animals) return null;
    return {
      title: T.adoptTitle,
      description: T.adoptDesc(animals.length),
      body: `<h1>${esc(T.adoptTitle)}</h1>
<p>${esc(T.adoptIntro)}</p>
<ul>${animals.map((l) => `<li><a href="${pre}/a/${l.id}">${esc(l.title)}</a> — ${esc(sp(l.species))}${l.breed ? ` (${esc(l.breed)})` : ''} · ${esc(l.shelter_name)}${l.city ? ` · ${esc(l.city)}` : ''}</li>`).join('')}</ul>
${adopted?.length ? `<h2>${esc(T.adopted)}</h2>
<ul>${adopted.map((a) => `<li>${esc(a.title)} — ${esc(a.shelter_name)}${a.adopted_text ? ` : ${esc(a.adopted_text)}` : ''}</li>`).join('')}</ul>` : ''}
<h2>${esc(T.byCity)}</h2>
<ul>${[...new Map(animals.filter((l) => citySlug(l.city)).map((l) => [citySlug(l.city), l.city])).entries()].map(([slug, name]) => `<li><a href="${pre}/adoptions/${slug}">${esc(name)}</a></li>`).join('')}</ul>
<h2>${esc(T.partners)}</h2>
<ul>${(shelters || []).map((s) => `<li><a href="${pre}/refuge/${s.id}">${esc(s.name)}</a>${s.address ? ` — ${esc(s.address)}` : ''}</li>`).join('')}</ul>`,
    };
  }
  if (path === '/refuges') {
    return {
      title: T.joinTitle,
      description: T.joinDesc,
      body: `<h1>${esc(T.joinTitle)}</h1>\n<ul>${T.joinBody.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`,
    };
  }
  if (path === '/sorties') {
    const rides = await rpc('public_rides');
    if (!rides) return null;
    return {
      title: T.ridesTitle,
      description: T.ridesDesc,
      body: `<h1>${esc(T.ridesTitle)}</h1>
<p>${esc(T.ridesIntro)}</p>
<ul>${rides.map((w) => `<li><a href="${pre}/b/${w.id}">${esc(w.title)}</a> — ${esc(when(w.starts_at, lang))} · ${esc(w.place)}</li>`).join('')}</ul>
<h2>${esc(T.byTown)}</h2>
<ul>${CITIES.map((c) => `<li><a href="${pre}/sorties/${c.slug}">${esc(T.townTitle(c.name[lang]))}</a></li>`).join('')}</ul>`,
      jsonld: rides.slice(0, 50).map((w) => rideEvent(w, origin, lang)),
    };
  }
  if ((m = path.match(/^\/sorties\/([a-z0-9-]{2,60})$/))) {
    const c = cityBySlug(m[1]);
    if (!c) return null;
    const name = c.name[lang];
    const d = await rpc('public_city', { p_lat: c.lat, p_lng: c.lng, p_km: CITY_RADIUS_KM });
    if (!d) return null;
    return {
      title: T.townTitle(name),
      description: T.townDesc(name, d.members),
      body: `<h1>${esc(T.townTitle(name))}</h1>
<p>${esc(T.townIntro(name))}</p>
<p>${esc(T.townStats(d.members, d.dogs, CITY_RADIUS_KM))}</p>
${d.breeds.length ? `<p>${esc(T.townBreeds)} : ${esc(d.breeds.join(', '))}</p>` : ''}
<h2>${esc(T.townRides(name))}</h2>
${d.rides.length ? `<ul>${d.rides.map((w) => `<li><a href="${pre}/b/${w.id}">${esc(w.title)}</a> — ${esc(when(w.starts_at, lang))} · ${esc(w.place)}</li>`).join('')}</ul>` : `<p>${esc(T.townNoRide)}</p>`}
${d.lost_active ? `<p><a href="${pre}/perdus/${c.slug}">${esc(T.lostTownTitle(name))}</a></p>` : ''}
${d.shelters.length ? `<h2>${esc(T.townShelters(name))}</h2>
<ul>${d.shelters.map((s) => `<li><a href="${pre}/refuge/${s.id}">${esc(s.name)}</a>${s.address ? ` — ${esc(s.address)}` : ''}</li>`).join('')}</ul>` : ''}
<h2>${esc(T.otherCities)}</h2>
<ul>${nearbyCities(c, 8).map((o) => `<li><a href="${pre}/sorties/${o.slug}">${esc(T.townTitle(o.name[lang]))}</a></li>`).join('')}</ul>`,
      jsonld: d.rides.slice(0, 20).map((w) => rideEvent(w, origin, lang)),
    };
  }
  const lostTown = path.match(/^\/perdus\/([a-z0-9-]{2,60})$/);
  if (path === '/perdus' || lostTown) {
    const c = lostTown ? cityBySlug(lostTown[1]) : null;
    if (lostTown && !c) return null;
    const alerts = await rpc('public_lost_alerts', c ? { p_lat: c.lat, p_lng: c.lng } : {});
    if (!alerts) return null;
    const name = c?.name[lang];
    const active = alerts.filter((a) => !a.solved).length;
    const towns = c ? nearbyCities(c, 8) : [...new Set(alerts.map((a) => nearestCity(a)).filter(Boolean))];
    return {
      title: c ? T.lostTownTitle(name) : T.lostTitle,
      description: T.lostDesc(name, active),
      // page de ville sans alerte : pas dans les résultats de Google (contenu vide)
      noindex: !!c && !alerts.length,
      image: alerts.find((a) => a.photo_url)?.photo_url,
      body: `<h1>${esc(c ? T.lostTownTitle(name) : T.lostTitle)}</h1>
<p>${esc(T.lostIntro)}</p>
${alerts.length ? `<ul>${alerts.map((a) => `<li><a href="${pre}/p/${a.id}">${esc(a.solved ? T.lostKind.solved : T.lostKind[a.kind] || '')} : ${esc(a.name || sp(a.species))}</a> — ${esc(sp(a.species))} · ${esc(a.place)} · ${esc(when(a.seen_at, lang))}</li>`).join('')}</ul>` : `<p>${esc(T.lostNone)}</p>`}
${towns.length ? `<h2>${esc(T.otherCities)}</h2>
<ul>${towns.map((o) => `<li><a href="${pre}/perdus/${o.slug}">${esc(T.lostTownTitle(o.name[lang]))}</a></li>`).join('')}</ul>` : ''}`,
    };
  }
  if ((m = path.match(/^\/adoptions\/([a-z0-9-]{2,60})$/))) {
    const all = await rpc('public_listings');
    const animals = (all || []).filter((l) => citySlug(l.city) === m[1]);
    if (!animals.length) return null;
    const city = animals[0].city;
    return {
      title: T.cityTitle(city),
      description: T.cityDesc(animals.length, city),
      body: `<h1>${esc(T.cityTitle(city))}</h1>
<ul>${animals.map((l) => `<li><a href="${pre}/a/${l.id}">${esc(l.title)}</a> — ${esc(sp(l.species))} · ${esc(l.shelter_name)}</li>`).join('')}</ul>
<p><a href="${pre}/adoptions">${esc(T.allAnimals)}</a></p>`,
    };
  }
  if ((m = path.match(/^\/refuge\/([0-9a-f-]{36})$/i))) {
    const [s, animals] = await Promise.all([rpc('public_shelter', { p_id: m[1] }), rpc('public_listings', { p_shelter: m[1] })]);
    if (!s) return null;
    return {
      title: T.shelterTitle(s.name),
      description: T.shelterDesc(s.name, s.address),
      body: `<h1>${esc(s.name)}</h1>
<p>${esc(T.verified(s.approval_number))}${s.address ? ` · ${esc(s.address)}` : ''}</p>
<h2>${esc(T.itsAnimals)}</h2>
<ul>${(animals || []).map((l) => `<li><a href="${pre}/a/${l.id}">${esc(l.title)}</a> — ${esc(sp(l.species))}</li>`).join('')}</ul>`,
      jsonld: [{ '@context': 'https://schema.org', '@type': 'AnimalShelter', name: s.name, url: `${origin}${pre}${path}`,
        ...(s.address && { address: s.address }), ...(s.lat != null && { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng } }) }],
    };
  }
  if ((m = path.match(/^\/a\/([0-9a-f-]{36})$/i))) {
    const l = await rpc('public_listing', { p_id: m[1] });
    if (!l) return null;
    const label = sp(l.species);
    return {
      title: T.listingTitle(l.title),
      description: T.listingDesc(label, l.breed, l.shelter.name, l.city, price(l.price_cents, lang)),
      image: l.photo_urls?.[0],
      body: `<h1>${esc(l.title)}</h1>
<p>${esc(label)}${l.breed ? ` · ${esc(l.breed)}` : ''} · ${esc(price(l.price_cents, lang))}${l.city ? ` · ${esc(l.city)}` : ''}</p>
<p>${esc(l.description).replace(/\n/g, '<br>')}</p>
<p>${esc(T.offeredBy('§§', l.shelter.approval_number)).replace('§§', `<a href="${pre}/refuge/${l.shelter.id}">${esc(l.shelter.name)}</a>`)}</p>`,
    };
  }
  if ((m = path.match(/^\/b\/([0-9a-f-]{36})$/i))) {
    const w = await rpc('public_ride', { p_id: m[1] });
    if (!w) return null;
    return {
      title: `🚴 ${w.title}`,
      description: T.rideDesc(when(w.starts_at, lang), w.place),
      body: `<h1>${esc(w.title)}</h1>
<p>${esc(when(w.starts_at, lang))} · ${w.duration} min · ${esc(w.place)}</p>
<p>${esc(w.description).replace(/\n/g, '<br>')}</p>`,
      jsonld: [rideEvent(w, origin, lang)],
    };
  }
  return null;
}

function rideEvent(w, origin, lang = 'fr') {
  return {
    '@context': 'https://schema.org', '@type': 'Event', name: w.title, startDate: w.starts_at,
    endDate: new Date(new Date(w.starts_at).getTime() + (w.duration || 60) * 60000).toISOString(),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', eventStatus: 'https://schema.org/EventScheduled',
    location: { '@type': 'Place', name: w.place, address: w.place }, url: `${origin}${prefix(lang)}/b/${w.id}`,
    isAccessibleForFree: true, organizer: { '@type': 'Organization', name: 'Cyclami', url: origin }, inLanguage: lang,
  };
}

// Versions dans les autres langues (même page) pour Google, plus la langue de la page.
// path : adresse sans préfixe de langue.
export function withLanguages(html, path, origin, lang = 'fr') {
  const href = (l) => `${origin}${prefix(l)}${path === '/' && l !== 'fr' ? '' : path}`;
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
  if (p.image && PHOTO_RE.test(p.image)) {
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

// Plan du site pour Google : pages publiques (en français, néerlandais et anglais), annonces, refuges et sorties à venir.
async function sitemap(origin) {
  const [animals, shelters, rides, lost] = await Promise.all([rpc('public_listings'), rpc('public_shelters'), rpc('public_rides'), rpc('public_lost_alerts')]);
  const pages = [
    ['/', 'weekly'], ['/adoptions', 'daily'], ['/sorties', 'daily'], ['/refuges', 'monthly'], ['/perdus', 'daily'],
    ...CITIES.map((c) => [`/sorties/${c.slug}`, 'weekly']),
    // pages « animaux perdus » des villes qui ont des alertes (les autres sont vides)
    ...[...new Set((lost || []).map((a) => nearestCity(a)?.slug).filter(Boolean))].map((slug) => [`/perdus/${slug}`, 'daily']),
    ...(animals || []).map((l) => [`/a/${l.id}`, 'weekly']),
    ...[...new Set((animals || []).map((l) => citySlug(l.city)).filter(Boolean))].map((c) => [`/adoptions/${c}`, 'weekly']),
    ...(shelters || []).map((s) => [`/refuge/${s.id}`, 'weekly']),
    ...(rides || []).map((w) => [`/b/${w.id}`, 'daily']),
  ];
  const href = (l, p) => `${origin}${prefix(l)}${p === '/' && l !== 'fr' ? '' : p}`;
  const entry = (loc, freq, alts = '') => `  <url><loc>${esc(loc)}</loc>${alts}<changefreq>${freq}</changefreq></url>`;
  const lines = [
    ...pages.flatMap(([p, freq]) => {
      const alts = [...LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(href(l, p))}"/>`),
        `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(href('fr', p))}"/>`].join('');
      return LANGS.map((l) => entry(href(l, p), freq, alts));
    }),
    ...['/mentions-legales', '/confidentialite', '/conditions'].map((p) => entry(origin + p, 'yearly')),
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
  const full = url.pathname.replace(/\/$/, '') || '/';
  if (full === '/sitemap.xml') return sitemap(url.origin);
  // /nl/… et /en/… : mêmes pages, textes dans la langue
  const lm = full.match(/^\/(nl|en)(\/.*)?$/);
  const lang = lm ? lm[1] : 'fr';
  const path = lm ? lm[2] || '/' : full;
  const res = await context.next();
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  let p = await publicPage(path, url.origin, lang);
  const isPublic = !!p;
  // ville inconnue (/sorties/xyz) : page 404 de l'application, avec le bon code pour Google
  if (!p && /^\/(sorties|perdus)\/[^/]+$/.test(path) && !cityBySlug(path.split('/')[2])) {
    return new Response(await res.text(), { status: 404, headers: res.headers });
  }
  if (!p) {
    const m = path.match(/^\/([abfpg])\/([0-9a-f-]{36})$/i);
    if (!m) return res;
    p = await rpc('share_preview', { p_kind: m[1], p_id: m[2].toLowerCase() });
    if (!p?.title) return res;
    p = { ...p, canonical: false }; // pages réservées aux membres : seulement l'aperçu
  }
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'public, max-age=300');
  let html = await res.text();
  if (p) html = withPreview(html, p, `${url.origin}${full === '/' ? '/' : full}`);
  if (isPublic) html = withLanguages(html, path, url.origin, lang);
  // une page publique existe : code 200 (la règle « 404 » des adresses inconnues ne s'applique pas)
  return new Response(html, { status: 200, headers });
};

export const config = {
  path: ['/', '/b/*', '/a/*', '/f/*', '/p/*', '/g/*', '/adoptions', '/adoptions/*', '/sorties', '/sorties/*', '/perdus', '/perdus/*', '/refuge/*', '/refuges', '/sitemap.xml',
    '/nl', '/nl/*', '/en', '/en/*'],
};
