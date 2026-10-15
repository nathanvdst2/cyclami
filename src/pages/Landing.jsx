import { Footprints, Heart, HeartHandshake, Home, MapPin, MessageCircle, ShieldCheck, Siren, Smartphone, Stethoscope, Users } from 'lucide-react';
import { getLang, LANGS, langPath, setLang, t } from '../i18n/index.js';
import SupportCyclami from '../components/SupportCyclami.jsx';
import Brand from '../components/Brand.jsx';
import { CITIES } from '../lib/cities.js';

const STEPS = [
  { emoji: '🐶', title: 'Présente ton compagnon', text: 'Espèce, taille, énergie, caractère et plusieurs jolies photos.' },
  { emoji: '📍', title: 'Découvre qui est près de toi', text: 'Sur une liste ou sur la carte, avec un score de compatibilité.' },
  { emoji: '🌳', title: 'Partez en sortie', text: 'Écris-lui ou rejoins une sortie de groupe organisée dans ton quartier.' },
];

const FEATURES = [
  { icon: Footprints, title: 'Sorties de groupe', text: 'Crée ou rejoins une sortie, une fois ou chaque semaine, avec la météo du jour et une discussion entre participants.' },
  { icon: MapPin, title: 'Carte du quartier', text: 'Membres, sorties, parcs et lieux pour animaux autour de toi, sans jamais révéler ton adresse.' },
  { icon: Siren, title: 'Animaux perdus', text: 'Lance une alerte avec photos : les membres du coin sont prévenus et peuvent la partager.' },
  { icon: HeartHandshake, title: 'Garde entre voisins', text: 'Trouve quelqu’un de confiance pour garder ou promener ton animal quand tu n’es pas là.' },
  { icon: Stethoscope, title: 'Carnet de santé', text: 'Vaccins, vermifuges et visites au même endroit, avec des rappels avant chaque échéance.' },
  { icon: Home, title: 'Adoptions en refuge', text: 'Des animaux à adopter, proposés uniquement par des refuges agréés et vérifiés par l’équipe.' },
  { icon: Users, title: 'Groupes et forum', text: 'Rejoins le club de ta race ou de ton quartier et pose tes questions aux autres propriétaires.' },
  { icon: MessageCircle, title: 'Messagerie', text: 'Discute en direct, partage des photos, fixe le rendez-vous.' },
  { icon: Smartphone, title: 'Sur ton téléphone', text: 'Installe Cyclami sur ton écran d’accueil et reçois les notifications comme une vraie appli.' },
];

// Mêmes questions dans netlify/edge-functions/share.js (homeFaq), écrites dans la page pour Google.
const FAQ = [
  ['Cyclami, c’est une appli de rencontre ?', 'Oui, une appli de rencontre pour les animaux et leurs maîtres : tu trouves des chiens et des chats compatibles près de chez toi pour se promener, jouer ou se rendre service. Ce n’est pas un site de rencontre amoureuse.'],
  ['Comment trouver un compagnon de sortie pour mon chien ?', 'Présente ton chien (taille, énergie, caractère), puis regarde les membres autour de toi sur la liste ou sur la carte, avec un score de compatibilité. Écris-leur ou rejoins une sortie de groupe dans ton quartier.'],
  ['C’est gratuit ?', 'Oui, entièrement : pas d’abonnement, pas de publicité.'],
  ['Où peut-on utiliser Cyclami ?', 'En Belgique et en France, en français, en néerlandais ou en anglais.'],
  ['Les autres voient-ils mon adresse ?', 'Non. Ta position est arrondie à environ 1 km et n’est visible que des membres connectés. Ton e-mail n’est jamais affiché.'],
  ['Quels animaux sont les bienvenus ?', 'Surtout les chiens, mais aussi les chats qui se promènent en harnais, les lapins, les furets… Tous les compagnons qui aiment sortir.'],
  ['Puis-je vendre ou donner un animal ?', 'Non. Pour respecter les règles de protection animale, seuls les refuges agréés et vérifiés publient des animaux à adopter.'],
  ['Je gère un refuge, comment vous rejoindre ?', 'Crée un compte gratuit, puis demande la vérification dans « Adoptions » avec ton numéro d’agrément. L’équipe valide ton refuge rapidement.'],
  ['Et si quelqu’un se comporte mal ?', 'Tu peux le bloquer et le signaler en un clic. Donne toujours tes premiers rendez-vous dans un lieu public.'],
];

// Petit sélecteur de langue « FR | NL | EN » (changer de langue recharge la page).
function LangSwitch() {
  const cur = getLang();
  return (
    <div className="flex items-center gap-1 text-sm text-stone-500" role="group" aria-label={t('Langue')}>
      {LANGS.map(([code, name], i) => (
        <span key={code} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true" className="text-stone-300">|</span>}
          <button type="button" lang={code} title={name} aria-pressed={code === cur}
            className={code === cur ? 'font-bold text-teal-600' : 'hover:text-stone-700'}
            onClick={() => code !== cur && setLang(code)}>
            {code.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}

// Aperçu illustratif de l'application (pas de vraies données).
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-64 rounded-[2.5rem] bg-stone-800 p-3 shadow-2xl">
      <div className="space-y-2 overflow-hidden rounded-[2rem] bg-emerald-50 p-3">
        <Brand size="sm" />
        <div className="text-xs font-bold text-stone-800">{t('Compagnons de sortie')}</div>
        {[
          { e: '🦮', n: 'Rocky', o: 'Camille', d: '450 m', s: 92 },
          { e: '🐕', n: 'Luna', o: 'Yanis', d: '1,2 km', s: 84 },
          { e: '🐩', n: 'Pépette', o: 'Margot', d: '2 km', s: 71 },
        ].map((x) => (
          <div key={x.n} className="card flex items-center gap-2 !p-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xl">{x.e}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-stone-800">{x.n} · {x.o}</span>
              <span className="block text-[10px] text-stone-500">{x.d}</span>
            </span>
            <span className="rounded-full bg-green-100 px-1.5 text-[10px] font-bold text-green-700">{x.s}%</span>
          </div>
        ))}
        <div className="btn-primary w-full !py-1.5 text-xs">🚴 {t('Proposer une sortie')}</div>
      </div>
      <div className="absolute -right-6 bottom-16 hidden rotate-6 rounded-2xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-emerald-100 sm:block">
        <Heart size={12} className="inline fill-red-500 text-red-500" /> <strong>Yanis</strong> {t('a rejoint ta sortie')}
      </div>
    </div>
  );
}

// Ce qu'un lien partagé ouvrira après la connexion (voir App.jsx).
const SHARED_LABELS = {
  rides: 'la sortie', listing: 'l’annonce', forum: 'la discussion', lost: 'l’alerte', groups: 'le groupe',
};
function sharedLabel() {
  try { return SHARED_LABELS[JSON.parse(sessionStorage.getItem('cyclami:deeplink') || 'null')?.page] || null; } catch { return null; }
}

export default function Landing({ go }) {
  const shared = sharedLabel();
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-100 to-emerald-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        {shared && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-stone-700 shadow-sm ring-1 ring-teal-200">
            <span>🔗 {t('On t’a partagé {what} ! Connecte-toi ou inscris-toi (gratuit) pour y accéder.', { what: t(shared) })}</span>
            <span className="flex gap-2">
              <button className="btn-ghost" onClick={() => go('login')}>{t('Se connecter')}</button>
              <button className="btn-primary" onClick={() => go('signup')}>{t('S’inscrire')}</button>
            </span>
          </div>
        )}
        <header className="flex items-center justify-between gap-3">
          <Brand size="md" />
          <div className="flex items-center gap-3">
            <LangSwitch />
            <button className="btn-ghost" onClick={() => go('login')}>{t('Se connecter')}</button>
          </div>
        </header>

        <section className="mt-10 grid items-center gap-12 sm:grid-cols-2">
          <div>
            {/* fond clair fixe : le texte bleu nuit du logo reste lisible en mode sombre */}
            <div className="mx-auto mb-6 w-60 rounded-3xl bg-[#fffaf5] p-3 shadow-sm sm:mx-0 sm:w-72">
              <img src="/logo-sans-slogan-360.webp" srcSet="/logo-sans-slogan-360.webp 360w, /logo-sans-slogan.webp 720w" sizes="(min-width: 640px) 360px, 80vw" alt="Cyclami" width="720" height="624" className="w-full"/>
              {/* slogan du logo, écrit en texte pour être traduit (FR / NL) */}
              <p className="mt-1 flex items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-bold tracking-wide text-[#4b526f] sm:text-[15px]">
                <span className="h-px w-4 shrink-0 bg-[#4b526f] sm:w-6" aria-hidden="true" />
                {t('Sorties entre animaux')}
                <span className="h-px w-4 shrink-0 bg-[#4b526f] sm:w-6" aria-hidden="true" />
              </p>
            </div>
            <h1 className="text-4xl font-extrabold leading-tight text-stone-800 sm:text-5xl">
              {t('Ne promène plus ton compagnon')} <span className="text-teal-500">{t('tout seul.')}</span>
            </h1>
            <p className="mt-4 text-lg text-stone-600">
              {t('Cyclami est l’appli gratuite de rencontre entre chiens, chats et leurs maîtres, en Belgique et en France : trouve des compagnons de sortie près de chez toi. Ton animal se fait des copains, et toi aussi.')}
            </p>
            <p className="mt-2 text-stone-600">
              {t('Et aussi : alertes animaux perdus, garde entre voisins, carnet de santé et adoptions en refuge.')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button className="btn-primary px-6 py-3 text-lg" onClick={() => go('signup')}>
                {t('Créer mon compte gratuit')}
              </button>
            </div>
            <p className="mt-3 flex items-center gap-1 text-sm text-stone-500">
              <ShieldCheck size={16} /> {t('Adresse jamais affichée · Blocage et signalement en un clic')}
            </p>
          </div>
          <PhoneMockup />
        </section>

        <section className="mt-20">
          <h2 className="text-center text-2xl font-extrabold text-stone-800">{t('Comment ça marche ?')}</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card text-center">
                <div className="text-4xl">{s.emoji}</div>
                <div className="mt-2 text-xs font-bold uppercase tracking-wide text-teal-600">{t('Étape {n}', { n: i + 1 })}</div>
                <h3 className="font-bold text-stone-800">{t(s.title)}</h3>
                <p className="mt-1 text-sm text-stone-600">{t(s.text)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-600">
                <Icon size={20} />
              </div>
              <div>
                <h3 className="font-bold text-stone-800">{t(title)}</h3>
                <p className="text-sm text-stone-600">{t(text)}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mx-auto mt-16 max-w-2xl">
          <h2 className="text-center text-2xl font-extrabold text-stone-800">{t('Questions fréquentes')}</h2>
          <div className="mt-6 space-y-2">
            {FAQ.map(([q, a]) => (
              <details key={q} className="card group">
                <summary className="cursor-pointer list-none font-semibold text-stone-800">
                  <span className="mr-2 inline-block text-teal-500 transition group-open:rotate-90">›</span>{t(q)}
                </summary>
                <p className="mt-2 text-sm text-stone-600">{t(a)}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-3xl bg-teal-500 px-6 py-10 text-center text-white">
          <h2 className="text-2xl font-extrabold">{t('Prêt pour la prochaine sortie ?')}</h2>
          <p className="mt-2">{t('Inscription en une minute, c’est gratuit.')}</p>
          <button className="mt-5 rounded-xl bg-white px-6 py-3 font-bold text-teal-600 hover:bg-emerald-50" onClick={() => go('signup')}>
            {t('Rejoindre Cyclami')}
          </button>
        </section>

        <section className="mx-auto mt-16 max-w-3xl text-center">
          <h2 className="text-xl font-extrabold text-stone-800">{t('Sorties et rencontres entre chiens près de chez toi')}</h2>
          {[['BE', t('Belgique')], ['FR', t('France')]].map(([country, label]) => (
            <nav key={country} className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm text-stone-500" aria-label={label}>
              <span className="font-semibold text-stone-600">{label} :</span>
              {CITIES.filter((c) => c.country === country).map((c) => (
                <a key={c.slug} href={langPath(`/sorties/${c.slug}`)} className="hover:text-teal-600 hover:underline"
                  onClick={(e) => { e.preventDefault(); go('public-city', { city: c.slug }); }}>{c.name[getLang()] || c.name.fr}</a>
              ))}
            </nav>
          ))}
        </section>

        <div className="mx-auto mt-10 max-w-xl"><SupportCyclami compact /></div>

        <footer className="mt-12 flex flex-wrap justify-center gap-4 text-sm text-stone-500">
          {[['legal', '/mentions-legales', t('Mentions légales')], ['privacy', '/confidentialite', t('Confidentialité')], ['terms', '/conditions', t('Conditions')]].map(([doc, href, label]) => (
            <a key={doc} href={href} onClick={(e) => { e.preventDefault(); go('legal', { doc }); }}>{label}</a>
          ))}
          <button onClick={() => go('legal', { doc: 'safety' })}>{t('Conseils de sécurité')}</button>
          <a href="/adoptions" onClick={(e) => { e.preventDefault(); go('public-adoptions'); }}>{t('Animaux à adopter')}</a>
          <a href="/sorties" onClick={(e) => { e.preventDefault(); go('public-rides'); }}>{t('Sorties à venir')}</a>
          <a href="/perdus" onClick={(e) => { e.preventDefault(); go('public-lost'); }}>{t('Animaux perdus')}</a>
        </footer>
      </div>
    </div>
  );
}
