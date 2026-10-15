# 🐾 Cyclami - Réseau Social pour Propriétaires d'Animaux

Site : **https://cyclami.com** (hébergé sur Netlify, domaine chez Cloudflare).

## 📋 Contexte du Projet

**Cyclami** est un projet de rêve d'enfance maintenant concrétisé avec un MVP fonctionnel. C'est une application qui combine :

- **Réseau social** (style Instagram) pour partager des contenus sur nos animaux
- **Plateforme de rencontres amicales** pour propriétaires d'animaux souhaitant se retrouver  
- **Chat communautaire** (style Antiland) avec avatars d'animaux

### 🎯 Objectif Principal
Connecter des propriétaires d'animaux pour des activités communes :
- Organiser des sorties de chiens ensemble
- Trouver des compagnons de promenade dans sa zone géographique
- Créer une communauté locale autour de la passion des animaux
- Partager des moments et conseils entre propriétaires

## 🚀 État Actuel du Développement

### ✅ MVP Fonctionnel Créé
- **Pages principales :** Landing, inscription/connexion, création profil animal, feed social, découverte, profil utilisateur, messages
- **Technologies :** React + Tailwind CSS + Context API pour gestion d'état
- **Design :** Interface moderne orange/ambre, responsive, mobile-first
- **Navigation :** Système complet avec navigation top/bottom

### 🎮 Fonctionnalités Actuellement Opérationnelles
- ✅ Inscription et connexion utilisateur
- ✅ Création de profils d'animaux avec photos (emojis), traits de personnalité
- ✅ Feed social avec posts d'animaux, système de likes
- ✅ Page découverte des membres proches (géolocalisation arrondie à ~1 km)
- ✅ Vrais comptes, messagerie en temps réel, photos, signalement et blocage (Supabase)
- ✅ Carte OpenStreetMap des membres et des sorties, point de rendez-vous choisi sur la carte
- ✅ Profils publics, commentaires sur les publications et les sorties, photos dans les messages
- ✅ Notifications (inscription à une sortie, annulation, commentaire, j'aime) + alertes du navigateur
- ✅ Application installable sur téléphone (PWA), bouton « retour » du téléphone pris en charge
- ✅ Photos compressées avant envoi, photos des messages privés en stockage privé (liens temporaires)
- ✅ Chargement léger : membres à ~50 km, publications 20 par 20, recherche de membres par prénom
- ✅ Sorties modifiables (participants prévenus), « Vu » et « … est en train d'écrire » dans les messages
- ✅ Mode sombre automatique, aperçu de lien (WhatsApp, réseaux sociaux), page d'accueil détaillée
- ✅ Interface utilisateur complète et navigable
- ✅ Navigation fluide entre toutes les pages
- ✅ Gestion d'état global avec Context API

## 📊 Fonctionnalités Détaillées

### Version Gratuite (Implémentée)
- Création de profils pour les animaux (photos, caractéristiques, tempérament, âge, besoins d'exercice)
- Géolocalisation pour trouver des propriétaires à proximité (simulation)
- Chat basique pour organiser les rencontres
- Feed social pour partager photos/vidéos des animaux (stories et posts style Instagram)
- Filtres simples (type d'animal, taille du chien, distance, niveau d'activité)
- Planification de sorties communes de base
- Chat avec avatars d'animaux (style Antiland)
- Système de "matches" basé sur la compatibilité des animaux

### Fonctionnalités Premium (À Développer)
**Recherche et filtres avancés :**
- Filtres détaillés (race, âge du propriétaire, horaires préférés, expérience avec les animaux)
- Accès aux profils "populaires" de la zone
- Recherche par critères comportementaux spécifiques

**Organisation et planification :**
- Organisation d'événements et groupes de sorties
- Calendrier intégré pour planifier les sorties
- Mode "vacances" pour trouver des dog-sitters ou compagnons de voyage
- Planification automatique de rendez-vous récurrents

**Communication premium :**
- Messages illimités (vs limite en gratuit)
- Fonctionnalités chat avancées (partage de localisation en temps réel, photos haute qualité)
- Notifications prioritaires

## 🛠️ Architecture Technique

### Technologies Utilisées
- **Frontend :** React avec Hooks (useState, useContext)
- **Styling :** Tailwind CSS pour design moderne
- **État :** Context API pour gestion globale
- **Navigation :** Système de pages avec routing interne
- **Icons :** Lucide React pour interface cohérente

### Structure du Projet
```
cyclami/
├── src/
│   ├── App.jsx                # Navigation entre les pages
│   ├── main.jsx               # Point d'entrée React
│   ├── index.css              # Styles Tailwind
│   ├── context/AppContext.jsx # État global, appels Supabase, temps réel
│   ├── lib/supabase.js        # Client Supabase + envoi de photos
│   ├── data/constants.js      # Espèces, tailles, caractères…
│   ├── utils/geo.js           # Distance, score de compatibilité, dates
│   ├── components/            # Navigation, carte, cartes de sortie/publication, commentaires…
│   └── pages/                 # Accueil, Auth, Découvrir, Sorties, Fil, Messages, Notifications, Profils, Légal
├── public/                    # Icônes, manifest et service worker (application installable)
├── supabase/schema.sql        # Tables, sécurité (RLS), stockage photos, temps réel
├── tailwind.config.js         # Configuration Tailwind
├── postcss.config.js          # Configuration PostCSS
└── package.json               # Dépendances
```

### Dépendances Clés
```json
{
  "dependencies": {
    "react": "^18.x",
    "lucide-react": "latest"
  },
  "devDependencies": {
    "tailwindcss": "latest",
    "postcss": "latest",
    "autoprefixer": "latest"
  }
}
```

## 🗺️ Roadmap de Développement

### 🎯 Prochaines Étapes Prioritaires
1. **Géolocalisation réelle** avec API Maps (Leaflet/MapBox)
2. **Upload d'images** pour remplacer les emojis
3. **Chat en temps réel** avec WebSocket
4. **Système de matching** algorithme de compatibilité
5. **Notifications** et **calendrier intégré**

### 🚀 Évolution à Long Terme
6. **Fonctionnalités premium** et modèle d'abonnement
7. **Backend complet** (API REST + base de données)
8. **Application mobile** (React Native)
9. **Notifications push**

## 🎮 Comment Tester l'Application

### En local
```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # génère le site statique dans dist/
npm run test:smoke   # parcourt toutes les pages dans Chromium (base Supabase simulée)
```

À chaque push, la GitHub Action « Vérification du site » construit le site et lance ce test.

## 🗄️ Backend : Supabase

Comptes, profils, animaux, sorties, publications, messages (temps réel) et photos sont
stockés dans Supabase. La sécurité repose sur les règles Row Level Security : seuls les
membres connectés voient les données, chacun ne modifie que les siennes, les messages
privés ne sont lisibles que par l'expéditeur et le destinataire.

### Photos chez Cloudflare R2 (10 Go gratuits)
Les photos publiques (animaux, publications) sont stockées dans Cloudflare R2 via un petit
service (`cloudflare/photos-worker`) qui vérifie l'identité du membre auprès de Supabase.
Les photos des messages privés restent dans le stockage privé de Supabase.
Tant que `VITE_PHOTO_API_URL` n'est pas défini, l'app utilise Supabase Storage.

Configuration (une seule fois) :
1. Compte Cloudflare → **R2 Object Storage** → activer R2 (offre gratuite, un moyen de
   paiement peut être demandé) ; ouvrir aussi **Workers & Pages** une fois pour créer
   son sous-domaine `*.workers.dev`.
2. **Account ID** : déjà renseigné dans `cloudflare/photos-worker/wrangler.toml`.
3. **API Token** : *My Profile* → *API Tokens* → *Create Token* → modèle
   **Edit Cloudflare Workers**, puis ajouter la permission *Account → Workers R2 Storage → Edit*.
4. GitHub → *Settings* → *Secrets and variables* → *Actions* : secret `CLOUDFLARE_API_TOKEN`.
5. Onglet **Actions** → « Service photos Cloudflare » → **Run workflow**, puis renseigner
   l'adresse affichée dans `.env.production` (actuellement `https://cyclami-photos.nathanbarbaraytb.workers.dev`)
   (`VITE_PHOTO_API_URL=...`).

### Mise à jour automatique de la base
La GitHub Action `.github/workflows/supabase-schema.yml` exécute `supabase/schema.sql`
à chaque modification du fichier sur `main`. Configuration (une seule fois) :
1. Supabase → bouton **Connect** (en haut) → onglet **Connection String** → section
   **Session pooler** → copier l'URI (`postgresql://postgres.xxxx:[YOUR-PASSWORD]@…pooler.supabase.com:5432/postgres`)
   et remplacer `[YOUR-PASSWORD]` par le mot de passe de la base
   (oublié ? *Project Settings* → *Database* → *Reset database password*).
2. GitHub → dépôt → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret** : nom `SUPABASE_DB_URL`, valeur = l'URI complète.
3. Onglet **Actions** → « Base de données Supabase » → **Run workflow** pour la première exécution.

### Mise en place (une seule fois)
1. **Base de données** (inutile si la mise à jour automatique est configurée) : Supabase → *SQL Editor* → *New query* → coller le contenu de
   `supabase/schema.sql` → *Run*. Le script peut être relancé sans risque.
2. **Adresses autorisées** : *Authentication* → *URL Configuration*
   - *Site URL* : `https://cyclami.com`
   - *Redirect URLs* : `https://cyclami.com/**`, `https://www.cyclami.com/**`,
     `https://cyclami.netlify.app/**` et `http://localhost:5173/**`
3. **E-mails** : le service d'e-mails intégré de Supabase n'envoie qu'aux membres de
   l'équipe du projet. Pour les vrais utilisateurs, brancher un SMTP gratuit, par ex. Brevo
   (300 e-mails/jour) :
   - créer un compte sur brevo.com, vérifier son adresse d'expéditeur
     (*Expéditeurs, domaines et IP dédiées* → *Expéditeurs*) ;
   - *SMTP & API* → onglet *SMTP* → *Générer une nouvelle clé SMTP* ;
   - Supabase → *Authentication* → *Emails* → *SMTP Settings* → activer *Enable custom SMTP* :
     hôte `smtp-relay.brevo.com`, port `587`, identifiant = le « Login » affiché par Brevo,
     mot de passe = la clé SMTP, expéditeur = l'adresse vérifiée, nom = `Cyclami` ;
   - on peut ensuite réactiver *Confirm email* (*Authentication* → *Sign In / Providers*).
4. **E-mails de connexion à l'image d'Cyclami** (confirmation, mot de passe oublié) :
   - Supabase → *Authentication* → *Hooks* → *Send Email hook* → type *HTTPS*,
     URL `https://cyclami-photos.nathanbarbaraytb.workers.dev/auth-email` → *Generate secret* ;
   - copier le secret (`v1,whsec_…`) dans le secret GitHub `SUPABASE_AUTH_HOOK_SECRET`,
     puis relancer le workflow « Service photos Cloudflare ».
5. **Connexion avec Google** :
   - Google Cloud Console → créer un projet → *APIs & Services* → *OAuth consent screen*
     (type *External*, nom `Cyclami`, domaine `cyclami.com`) puis *Publish app* ;
   - *Credentials* → *Create credentials* → *OAuth client ID* → *Web application*,
     *Authorized redirect URI* : `https://qwhssunuewkzdppzvjdv.supabase.co/auth/v1/callback` ;
   - Supabase → *Authentication* → *Sign In / Providers* → *Google* → activer, coller le
     *Client ID* et le *Client Secret*.

La clé `sb_publishable_…` est publique par nature et se trouve dans `src/lib/supabase.js`
(surchargeable via `.env`, voir `.env.example`). Ne jamais mettre la clé `sb_secret_…`
dans le code.

### Administration
Le compte `nathanbarbaraytb@gmail.com` (créé avant la mise en place de l'administration)
est super-utilisateur : Profil → **Administration**. Il y voit les chiffres du site,
traite les signalements, consulte les membres (avec leur e-mail), bannit un membre
(compte et contenus supprimés, adresse bloquée à l'inscription) et peut retirer
n'importe quelle publication, commentaire ou sortie. Les messages privés restent illisibles.
**Espèces** : chiens et chats, NAC (lapin, furet, chinchilla, cochon d'Inde, hamster, rat,
souris, gerbille, octodon, hérisson), oiseaux, reptiles et amphibiens, équidés et animaux de
ferme, poissons (liste dans `src/data/constants.js`).

**Annonces** (vente ou don, onglet Annonces) : pas de paiement sur le site, contact par la
messagerie. La base impose des garde-fous : chiens/chats d'au moins 8 semaines, identification
obligatoire (chiens, chats, furets, équidés), vente de chiens/chats réservée aux éleveurs
(SIREN) ou aux portées LOF/LOOF, don toujours gratuit, 5 annonces/jour. Annonces signalables
et modérables, sans XP. ⚠️ Réglementation à faire valider juridiquement avant ouverture.

**E-mails de notification** : la base choisit qui prévenir (nouveau message — au plus un e-mail
par 30 min et par conversation —, sorties, commentaires, modération ; jamais pour les « j'aime »),
selon les préférences de chacun (Profil → Notifications par e-mail), puis appelle le service
Cloudflare (`POST /notify`) qui envoie via l'API Brevo. Configuration : secret GitHub
`BREVO_API_KEY` (les deux GitHub Actions en dérivent la clé partagée base ↔ Cloudflare) et
expéditeur validé dans Brevo (`SENDER_EMAIL` dans `cloudflare/photos-worker/wrangler.toml`).

**Niveaux** : chaque action rapporte des points d'expérience (XP), calculés uniquement par
la base (déclencheurs ; impossible de modifier son score) : sortie organisée +30, rejointe +20,
participant à sa sortie +5, publication +10 (3/jour), commentaire chez les autres +3 (10/jour),
« j'aime » reçu +2, photo d'animal +15, profil complet +20, visite du jour +5, série de 7 jours +25.
Les points d'un contenu supprimé sont retirés. 8 niveaux (Chiot → Super Truffe), 10 badges,
classement de la semaine / de toujours (Profil → 🏆).

**Modération** : chaque membre peut signaler un profil, une publication, un commentaire,
une sortie ou une conversation privée (motif + détails ; la base retrouve l'auteur et copie
le contenu). 3 signalements de personnes différentes masquent un contenu en attendant
l'équipe. L'équipe peut retirer, masquer/réafficher, avertir, suspendre (1/7/30 jours :
plus de publication, commentaire, message ni sortie) ; l'admin peut bannir. Chaque action
est notée dans le journal, et les auteurs des signalements sont prévenus à la clôture.
Anti-spam : 15 messages/minute, 10 publications/heure, 20 commentaires/10 min.

L'équipe (admin + modérateurs) porte un badge **Staff** à côté de son nom. L'admin nomme
ou retire les modérateurs depuis Administration → Membres / Équipe. Les modérateurs
traitent les signalements et retirent les contenus ; ils ne voient pas les e-mails et ne
bannissent pas. Un modérateur ne peut pas supprimer son compte tant que l'admin ne lui a pas
retiré son rôle (bouton « Contacter l'administrateur » dans son profil). Ajouter un autre admin : Supabase → SQL Editor →
`insert into public.admins (user_id, role) values ('<id du compte>', 'admin');`

## 🌍 Mettre l'application en ligne gratuitement

L'app est un site statique (Vite) : n'importe quel hébergeur gratuit convient.

**Vercel (recommandé, fonctionne avec un dépôt privé)**
1. Se connecter sur https://vercel.com avec son compte GitHub
2. « Add New… → Project » puis importer `cyclami`
3. Vercel détecte Vite tout seul (build : `npm run build`, dossier : `dist`) → « Deploy »
4. Une URL `https://cyclami-xxx.vercel.app` est créée, et chaque push sur `main` met le site à jour

**Netlify** : même principe sur https://app.netlify.com (« Add new site → Import from GitHub »,
build `npm run build`, dossier `dist`).

**GitHub Pages** : gratuit uniquement si le dépôt est public.

### Scénarios de Test
1. **Landing Page :** Tester les boutons inscription/connexion
2. **Inscription :** Créer un compte utilisateur
3. **Création d'Animal :** Ajouter un profil d'animal avec personnalités
4. **Feed Social :** Navigator et liker des posts
5. **Découverte :** Explorer les animaux "à proximité"
6. **Navigation :** Tester tous les onglets du menu

## 💡 Prompt de Continuation pour Claude

**Si vous devez continuer le développement avec Claude, utilisez ce prompt :**

```
Salut ! Je travaille sur mon projet Cyclami - un réseau social pour propriétaires d'animaux qui combine Instagram, Antiland et un site de rencontre pour organiser des sorties d'animaux.

État actuel : J'ai un MVP React fonctionnel avec Tailwind CSS. L'app inclut landing page, inscription, création de profils d'animaux, feed social, découverte des animaux proches, et navigation complète.

Prochaines priorités : [préciser ce que vous voulez développer]

Peux-tu m'aider à [décrire la tâche spécifique] ?
```

## 📈 Vision

Créer LA plateforme de référence pour les propriétaires d'animaux qui cherchent à socialiser leurs compagnons et rencontrer d'autres passionnés dans leur région.

---

*Projet développé en collaboration avec Claude - De l'idée d'enfance au MVP fonctionnel* 🚀
### Sauvegardes
Le workflow « Sauvegarde base de données » sauvegarde chaque nuit la base (comptes, profils, contenus)
dans un fichier chiffré gardé 30 jours (onglet *Actions* → une exécution → *Artifacts*).
- Phrase secrète : secret GitHub `BACKUP_PASSPHRASE` (recommandé, à noter en lieu sûr). Sans lui, elle est
  dérivée de `SUPABASE_DB_URL` : `printf 'cyclami-backup:%s' "$SUPABASE_DB_URL" | sha256sum`.
- Restaurer : `gpg -d cyclami-AAAA-MM-JJ.dump.gpg > base.dump` puis
  `pg_restore --no-owner --clean --if-exists -d "$SUPABASE_DB_URL" base.dump`.
- Les photos sont dans Cloudflare R2 (non incluses dans ce fichier).
