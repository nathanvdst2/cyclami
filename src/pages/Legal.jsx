import { ArrowLeft } from 'lucide-react';
import { t } from '../i18n/index.js';

// Textes en français (clés de traduction, voir src/i18n/nl/Legal.js) ; {name} et {contact} remplacés à l'affichage.
// Éditeur du site (identification obligatoire, Code de droit économique belge, livre XII).
const PUBLISHER = {
  name: 'Nathan Vandoorslaert',
  contact: 'contact@cyclami.com',
};

const DOCS = {
  legal: {
    title: 'Mentions légales',
    sections: [
      ['Éditeur du site', [
        'Cyclami est un projet édité à titre non professionnel par {name}.',
        'Contact : {contact}',
      ]],
      ['Hébergement', [
        'Site : Netlify, Inc., San Francisco, Californie, États-Unis — netlify.com',
        'Données et comptes : Supabase, Inc. — supabase.com (serveurs situés à Londres, Royaume-Uni).',
        'Photos : Cloudflare, Inc. — cloudflare.com. E-mails de notification : Brevo (Sendinblue SAS, Paris) — brevo.com.',
      ]],
      ['Responsabilité', [
        'Les contenus (profils, photos, messages, sorties) sont publiés par les membres, qui en sont responsables.',
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
        'Profil : prénom, ville ou quartier, présentation, disponibilités.',
        'Position : uniquement si tu l’autorises, arrondie à environ 1 km. Ton adresse exacte n’est jamais enregistrée.',
        'Sécurité : le site conserve les 20 dernières adresses IP depuis lesquelles tu l’as utilisé, avec leurs dates, pour lutter contre les abus et les comptes bannis. Elles sont effacées avec ton compte.',
        'Appareils : une fois par jour, le site note les caractéristiques techniques de ton appareil (navigateur, système, taille d’écran, langue, fuseau horaire, application installée ou non). Les 10 appareils les plus récents sont gardés.',
        'Contenus : fiches de tes animaux, photos, publications, « j’aime », sorties, messages privés et signalements.',
        'Messages vocaux : enregistrés dans un espace privé, écoutables seulement par ton interlocuteur (ou par les membres connectés s’ils sont envoyés dans le tchat général).',
        'Sorties suivies au GPS : seulement la distance et la durée. Ton parcours reste sur ton téléphone et n’est jamais envoyé.',
        'Vérification du profil (facultative, avec ton accord) : une courte vidéo filmée dans l’application où tu fais des gestes et dis un code, avec le nom technique de la caméra utilisée. Seuls les administrateurs la regardent, sans reconnaissance faciale automatique ; elle est supprimée dès la décision et seule la date de vérification est gardée. Aucune pièce d’identité n’est demandée.',
      ]],
      ['Pourquoi', [
        'Uniquement pour faire fonctionner le service : te montrer les membres proches, organiser des sorties et échanger des messages.',
        'Aucune publicité, aucune revente de données, aucun traceur publicitaire.',
      ]],
      ['Qui voit quoi', [
        'Ton profil, tes animaux et tes publications sont visibles par les membres connectés, jamais par le public.',
        'Pages publiques (visibles sans compte et par les moteurs de recherche) : les sorties à venir (titre, lieu de rendez-vous, date, durée, description), sans le nom de l’organisateur ni des participants, ainsi que les annonces et les fiches des refuges vérifiés.',
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
        'Tu peux aussi introduire une plainte auprès de l’Autorité de protection des données (autoriteprotectiondonnees.be).',
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
        'Cyclami est un site gratuit qui met en relation des propriétaires d’animaux en Belgique et en France : sorties, publications, messagerie, adoptions en refuge, garde et alertes.',
        'En créant un compte, tu acceptes ces conditions et la politique de confidentialité.',
      ]],
      ['Ton compte', [
        'Il faut avoir au moins 16 ans pour s’inscrire.',
        'Tu es responsable de ton compte et des informations que tu publies : elles doivent être exactes.',
        'Tu peux supprimer ton compte à tout moment depuis Profil → « Supprimer mon compte ».',
      ]],
      ['Ce qui est interdit', [
        'Les insultes, le harcèlement, les contenus violents, haineux, sexuels ou illégaux.',
        'Le spam, la publicité non sollicitée et les arnaques.',
        'La maltraitance animale.',
        'Vendre ou donner un animal (ou proposer de le faire) en dehors de la rubrique Adoptions, réservée aux refuges vérifiés : dans le fil, les commentaires, le forum, les groupes, les sorties ou la messagerie. La loi wallonne n’autorise ces annonces que sur des sites spécialisés reconnus.',
        'Usurper l’identité de quelqu’un ou publier les données personnelles d’autrui.',
      ]],
      ['Modération', [
        'Tout membre peut signaler un contenu ou un membre. L’équipe peut masquer un contenu, avertir ou suspendre un compte qui ne respecte pas ces règles.',
      ]],
      ['Rencontres et animaux', [
        'Les sorties, les gardes et les adoptions se font sous la responsabilité des membres et des refuges. Cyclami n’est pas partie aux accords entre membres et ne vérifie pas l’identité des participants.',
        'Suis nos conseils de sécurité et garde ton animal sous ta surveillance.',
      ]],
      ['Responsabilité', [
        'Le service est fourni tel quel, sans garantie de disponibilité. Cyclami ne peut être tenu responsable des contenus publiés par les membres ni des rencontres organisées entre eux.',
        'Ces conditions peuvent évoluer ; la version en ligne fait foi. Elles sont soumises au droit belge.',
        'Question : {contact}',
      ]],
    ],
  },
  listings: {
    title: 'Règles des adoptions',
    sections: [
      ['Pourquoi seulement des refuges ?', [
        'En Wallonie, le Code du bien-être des animaux (article D.49) n’autorise la publicité pour vendre ou donner un animal que dans une revue ou sur un site d’annonces spécialisé reconnu par la Région. Les refuges agréés peuvent, eux, faire connaître les animaux qu’ils replacent.',
        'Cyclami est un réseau social, pas un site d’annonces spécialisé : la rubrique Adoptions est donc réservée aux refuges dont l’équipe a vérifié le numéro d’agrément.',
        'Particuliers et éleveurs ne peuvent pas proposer d’animaux sur Cyclami, ni dans la rubrique Adoptions, ni ailleurs (fil, forum, groupes, messages). Ces messages sont bloqués ou retirés.',
      ]],
      ['Tu dois faire adopter ton animal ?', [
        'Contacte un refuge agréé près de chez toi : il l’accueille, le soigne et lui cherche une famille adaptée.',
        'Tu peux aussi passer par un site d’annonces spécialisé reconnu par la Région (son numéro de reconnaissance doit y être affiché).',
      ]],
      ['Ce que vérifie Cyclami à la publication', [
        'Le refuge est vérifié par l’équipe ; son nom et son numéro d’agrément sont affichés sur chaque annonce.',
        'Chiens et chats : au moins 8 semaines et numéro de puce obligatoire.',
        'Chats : toujours stérilisés avant d’être confiés.',
        'Chevaux, poneys et ânes : numéro d’identification (puce, UELN) obligatoire.',
        'Espèce, âge, sexe, race ou croisement et statut de stérilisation sont indiqués dans l’annonce.',
      ]],
      ['Obligations à connaître (Belgique)', [
        'Chiens et chats doivent être identifiés et enregistrés (DogID / CatID) ; le changement de propriétaire y est enregistré lors de l’adoption.',
        'En Wallonie, l’adoptant présente un extrait du fichier central (permis de détention), délivré par sa commune.',
        'Il est interdit de céder un chien ou un chat dans un lieu public (marché, parking…).',
        'Pour les mammifères, seules les espèces de la liste positive peuvent être détenues. Espèces protégées (certains perroquets, tortues, reptiles…) : documents CITES ou autorisations selon les cas.',
        'Les règles varient selon la région (Wallonie, Bruxelles, Flandre) : renseigne-toi sur wallonie.be, bienetreanimal.brussels ou dierenwelzijnvlaanderen.be, ou auprès d’un vétérinaire.',
      ]],
      ['Éviter les arnaques', [
        'Rencontre toujours l’animal au refuge avant l’adoption. Ne verse jamais d’argent à distance, par mandat cash, carte prépayée ou cryptomonnaie.',
        'Signale toute annonce ou tout message qui propose de vendre ou donner un animal avec le drapeau 🚩 (motif « Vente ou don d’animal interdit »).',
      ]],
    ],
  },
  safety: {
    title: 'Conseils de sécurité',
    sections: [
      ['Avant la rencontre', [
        'Échange d’abord quelques messages sur Cyclami avant de donner ton numéro.',
        'Ne partage jamais ton adresse, tes coordonnées bancaires ou d’argent.',
        'Préviens un proche : où tu vas, avec qui, et à quelle heure tu reviens.',
      ]],
      ['Pendant la sortie', [
        'Donne rendez-vous dans un lieu public et fréquenté : parc, square, entrée de bois.',
        'Garde les animaux en laisse au début, le temps qu’ils fassent connaissance.',
        'Vérifie que les vaccins et vermifuges de ton animal sont à jour.',
        'Si tu te sens mal à l’aise, tu peux partir à tout moment.',
      ]],
      ['En cas de problème', [
        'Utilise « Bloquer » pour ne plus être contacté par quelqu’un.',
        'Utilise « Signaler » pour prévenir l’équipe d’un comportement inapproprié.',
        'En cas de danger, appelle le 101 (police) ou le 112.',
      ]],
    ],
  },
};

export default function Legal({ back, params }) {
  const doc = DOCS[params.doc] || DOCS.legal;
  const vars = { name: PUBLISHER.name, contact: PUBLISHER.contact };
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
