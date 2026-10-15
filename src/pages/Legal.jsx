import { ArrowLeft } from 'lucide-react';
import { t } from '../i18n/index.js';

// Textes en français (clés de traduction, voir src/i18n/nl/Legal.js) ; {name}, {address} et {contact} remplacés à l'affichage.
// Éditeur du site (identification obligatoire, Code de droit économique belge, livre XII ; LCEN en France).
// Adresse du site : une seule constante à changer le jour où un nom de domaine est acheté.
const SITE = 'https://cyclami.netlify.app';
const PUBLISHER = {
  name: '[à compléter]',
  address: '[à compléter]',
  contact: '[à compléter]', // adresse e-mail de contact
};

const DOCS = {
  legal: {
    title: 'Mentions légales',
    sections: [
      ['Éditeur du site', [
        'Cyclami ({site}) est un projet édité à titre non professionnel par {name}.',
        'Adresse : {address}',
        'Contact : {contact}',
      ]],
      ['Hébergement', [
        'Site et services en ligne : Netlify, Inc., San Francisco, Californie, États-Unis — netlify.com',
        'Données, comptes et photos : Supabase, Inc. — supabase.com (serveurs en Europe).',
        'E-mails de notification : Brevo (Sendinblue SAS, Paris) — brevo.com.',
        'Cartes : © les contributeurs d’OpenStreetMap (openstreetmap.org). Météo : Open-Meteo (open-meteo.com).',
      ]],
      ['Responsabilité', [
        'Les contenus (profils, photos, messages, sorties, tracés, dangers signalés) sont publiés par les membres, qui en sont responsables.',
        'Cyclami n’organise pas les sorties : il permet aux cyclistes de se trouver et de rouler ensemble, chacun sous sa propre responsabilité.',
        'Tout contenu illicite peut être signalé depuis l’application (bouton « Signaler ») ou par e-mail.',
      ]],
    ],
  },
  privacy: {
    title: 'Politique de confidentialité',
    sections: [
      ['Données collectées', [
        'Compte : adresse e-mail et mot de passe (chiffré, jamais visible).',
        'Connexion avec Google : seulement ton adresse e-mail, ton nom et ta photo de profil Google, pour créer ton compte. Aucune autre donnée de ton compte Google n’est consultée.',
        'Profil : prénom, ville ou quartier, présentation, disponibilités, disciplines pratiquées, niveau, vitesse moyenne habituelle et tes vélos (nom, type, marque, photo).',
        'Position : uniquement si tu l’autorises, arrondie à environ 1 km. Ton adresse exacte n’est jamais enregistrée.',
        'Sécurité : le site conserve les 20 dernières adresses IP depuis lesquelles tu l’as utilisé, avec leurs dates, pour lutter contre les abus et les comptes bannis. Elles sont effacées avec ton compte.',
        'Appareils : une fois par jour, le site note les caractéristiques techniques de ton appareil (navigateur, système, taille d’écran, langue, fuseau horaire, application installée ou non). Les 10 appareils les plus récents sont gardés.',
        'Contenus : photos, publications, « j’aime », sorties (avec leur point de départ et, si l’organisateur en importe un, un tracé simplifié du parcours), messages privés, dangers signalés sur la route et signalements.',
        'Fichiers GPX : seul un tracé simplifié est enregistré avec la sortie ; le fichier lui-même n’est pas conservé.',
        'Messages vocaux : enregistrés dans un espace privé, écoutables seulement par ton interlocuteur (ou par les membres connectés s’ils sont envoyés dans le tchat général).',
        'Sorties suivies au GPS : seulement la distance, la durée et les vitesses. Ton parcours reste sur ton téléphone et n’est jamais envoyé.',
        'Météo au départ d’une sortie : ton navigateur interroge directement Open-Meteo avec la position du point de départ (pas la tienne).',
        'Vérification du profil (facultative, avec ton accord) : une courte vidéo filmée dans l’application où tu fais des gestes et dis un code, avec le nom technique de la caméra utilisée. Seuls les administrateurs la regardent, sans reconnaissance faciale automatique ; elle est supprimée dès la décision et seule la date de vérification est gardée. Aucune pièce d’identité n’est demandée.',
      ]],
      ['Pourquoi', [
        'Uniquement pour faire fonctionner le service : te montrer les cyclistes proches de ton niveau, organiser des sorties, prévenir des dangers de la route et échanger des messages.',
        'Aucune publicité, aucune revente de données, aucun traceur publicitaire.',
      ]],
      ['Qui voit quoi', [
        'Ton profil, tes vélos et tes publications sont visibles par les membres connectés, jamais par le public.',
        'Pages publiques (visibles sans compte et par les moteurs de recherche) : les sorties à venir (titre, lieu de rendez-vous, date, durée, type, niveau, allure, distance, dénivelé, description), sans le nom de l’organisateur ni des participants, ainsi que des chiffres par ville (nombre de membres) et les noms des clubs et groupes.',
        'Si tu partages le lien de ton profil, son aperçu (WhatsApp, Messenger…) montre seulement ton prénom.',
        'Tes messages privés ne sont visibles que par toi et ton interlocuteur. Si l’un de vous signale la conversation, ses 15 derniers messages sont transmis à l’équipe de modération.',
        'Les administrateurs du site peuvent consulter ton e-mail, tes dates de connexion, les adresses IP de tes sessions, tes appareils, l’activité de ton compte et ta position arrondie, uniquement pour la sécurité et la modération (lutte contre les abus, comptes bannis). Chaque consultation est enregistrée.',
        'Pour connaître le fournisseur d’accès et la ville approximative d’une adresse IP, l’administrateur qui consulte la fiche interroge le service ipwho.is (l’adresse IP lui est alors transmise).',
        'Ton adresse e-mail n’est montrée à aucun autre membre. Elle sert à te connecter et, si tu le souhaites, à recevoir des notifications (désactivables dans ton profil), envoyées par notre prestataire Brevo.',
      ]],
      ['Conservation et suppression', [
        'Tes données sont conservées tant que ton compte existe.',
        'Tu peux supprimer définitivement ton compte et toutes tes données depuis Profil → « Supprimer mon compte ».',
      ]],
      ['Tes droits (RGPD)', [
        'Tu peux demander l’accès, la rectification ou la suppression de tes données en écrivant à {contact}.',
        'Tu peux aussi introduire une plainte auprès de l’Autorité de protection des données (autoriteprotectiondonnees.be) ou, en France, de la CNIL (cnil.fr).',
      ]],
      ['Cookies', [
        'Le site enregistre seulement ta session de connexion dans ton navigateur. Aucun cookie publicitaire ni traceur.',
        'Pour mesurer la fréquentation, seuls des compteurs anonymes (nombre de pages vues par jour) sont tenus : aucune adresse IP ni aucun identifiant n’est enregistré.',
      ]],
    ],
  },
  terms: {
    title: 'Conditions d’utilisation',
    sections: [
      ['Le service', [
        'Cyclami est un site gratuit qui met en relation des cyclistes en Belgique et en France pour rouler ensemble : sorties de groupe, clubs et groupes, publications, forum, messagerie, suivi GPS et signalement des dangers de la route.',
        'En créant un compte, tu acceptes ces conditions et la politique de confidentialité.',
      ]],
      ['Ton compte', [
        'Il faut avoir au moins 16 ans pour s’inscrire.',
        'Tu es responsable de ton compte et des informations que tu publies : elles doivent être exactes (notamment le niveau, l’allure et la distance annoncés pour une sortie).',
        'Tu peux supprimer ton compte à tout moment depuis Profil → « Supprimer mon compte ».',
      ]],
      ['Ce qui est interdit', [
        'Les insultes, le harcèlement, les contenus violents, haineux, sexuels ou illégaux.',
        'Le spam, la publicité non sollicitée et les arnaques (y compris la vente de vélos volés ou douteux).',
        'Organiser des courses ou des défis de vitesse sur la voie publique, ou inciter à enfreindre le code de la route.',
        'Signaler de faux dangers ou publier des informations trompeuses sur une sortie.',
        'Usurper l’identité de quelqu’un ou publier les données personnelles d’autrui.',
      ]],
      ['Modération', [
        'Tout membre peut signaler un contenu ou un membre. L’équipe peut masquer un contenu, avertir ou suspendre un compte qui ne respecte pas ces règles.',
      ]],
      ['Sécurité routière et responsabilité des sorties', [
        'Cyclami n’organise pas les sorties : ce sont des rendez-vous entre particuliers. Cyclami n’est pas partie aux accords entre membres et ne vérifie ni l’identité, ni le niveau, ni l’état de santé des participants.',
        'Chacun roule sous sa propre responsabilité : vérifie que ton niveau, ta forme et ton vélo conviennent à la sortie, et que tu es correctement assuré (responsabilité civile).',
        'Le port du casque est vivement recommandé, ainsi qu’un éclairage et des vêtements visibles par mauvais temps ou de nuit.',
        'Respecte le code de la route en toutes circonstances, même en groupe : feux, priorités, sens de circulation et règles propres aux groupes de cyclistes.',
        'Les tracés, la météo, les dangers signalés et les estimations de vitesse sont indicatifs et peuvent être inexacts : reste attentif à la route.',
      ]],
      ['Responsabilité', [
        'Le service est fourni tel quel, sans garantie de disponibilité. Cyclami ne peut être tenu responsable des contenus publiés par les membres, ni des sorties, rencontres ou accidents survenus entre eux.',
        'Ces conditions peuvent évoluer ; la version en ligne fait foi. Elles sont soumises au droit belge.',
        'Question : {contact}',
      ]],
    ],
  },
  safety: {
    title: 'Conseils de sécurité',
    sections: [
      ['Avant la sortie', [
        'Échange d’abord quelques messages sur Cyclami avant de donner ton numéro.',
        'Ne partage jamais ton adresse ni tes coordonnées bancaires, et n’envoie jamais d’argent.',
        'Préviens un proche : où tu vas, avec qui, et à quelle heure tu reviens.',
        'Choisis une sortie de ton niveau : regarde la distance, le dénivelé, l’allure prévue et si le groupe s’engage à ne lâcher personne.',
        'Vérifie ton vélo (freins, pneus, éclairage) et emporte de quoi réparer une crevaison, de l’eau et à manger.',
      ]],
      ['Pendant la sortie', [
        'Donne rendez-vous dans un lieu public et fréquenté.',
        'Porte un casque et des vêtements visibles ; allume tes lumières par mauvais temps ou à la tombée du jour.',
        'Respecte le code de la route, roule en file quand la circulation l’exige et préviens le groupe des obstacles (gestes et voix).',
        'Si tu te sens mal à l’aise ou trop juste physiquement, tu peux t’arrêter ou rentrer à tout moment.',
      ]],
      ['En cas de problème', [
        'Utilise « Bloquer » pour ne plus être contacté par quelqu’un.',
        'Utilise « Signaler » pour prévenir l’équipe d’un comportement inapproprié ou dangereux.',
        'Signale les dangers de la route (nid-de-poule, travaux, gravillons, route fermée…) pour prévenir les autres cyclistes.',
        'En cas d’accident ou de danger, appelle le 112.',
      ]],
    ],
  },
};

export default function Legal({ back, params }) {
  const doc = DOCS[params.doc] || DOCS.legal;
  const vars = { name: PUBLISHER.name, address: PUBLISHER.address, contact: PUBLISHER.contact, site: SITE.replace(/^https:\/\//, '') };
  return (
    <div className="space-y-4 pb-8">
      <button onClick={() => back(params.back || 'landing')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <h1 className="text-2xl font-extrabold text-stone-800">{t(doc.title)}</h1>
      {doc.sections.map(([title, lines]) => (
        <section key={title} className="card space-y-2">
          <h2 className="font-bold text-stone-800">{t(title)}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
            {lines.map((l) => <li key={l}>{t(l, vars)}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
