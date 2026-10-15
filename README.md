# 🚴 Cyclami

**Roule avec des cyclistes de ton niveau, près de chez toi.**

Cyclami est un site gratuit (installable sur téléphone) pour trouver des cyclistes de ton niveau
près de chez toi et organiser des sorties ensemble, en Belgique et en France, en français,
néerlandais et anglais. Adresse : **https://cyclami.netlify.app** (un nom de domaine pourra être
ajouté plus tard, voir section F).

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Architecture](#architecture)
3. [Développement local](#développement-local)
4. [Mise en ligne pas à pas (guide débutant)](#mise-en-ligne-pas-à-pas-guide-débutant)
   - [A. Créer la base de données Supabase](#a-créer-la-base-de-données-supabase)
   - [B. Créer le site sur Netlify](#b-créer-le-site-sur-netlify)
   - [C. Les e-mails avec Brevo](#c-les-e-mails-avec-brevo)
   - [D. Devenir administrateur](#d-devenir-administrateur)
   - [E. Sauvegardes](#e-sauvegardes)
   - [F. Plus tard : un nom de domaine (facultatif)](#f-plus-tard--un-nom-de-domaine-facultatif)
5. [Récapitulatif des variables et secrets](#récapitulatif-des-variables-et-secrets)
6. [Dépannage](#dépannage)

---

## Fonctionnalités

- **Profil cycliste** : disciplines (route, VTT / gravel, loisir / électrique), niveau (débutant,
  intermédiaire, confirmé, sportif), vitesse moyenne habituelle, disponibilités, ville, photo, et
  « mon garage » (jusqu'à 10 vélos avec photo).
- **Découvrir** : les cyclistes proches de chez toi, classés par compatibilité (niveau, vitesse,
  disciplines en commun, disponibilités, distance), en liste ou sur la carte.
- **Sorties** : type, niveau, vitesse moyenne prévue, distance, dénivelé, point de départ sur la
  carte, tracé importé depuis un fichier **GPX**, option « **pas de lâchage** » (le groupe attend tout
  le monde), sorties **hebdomadaires**, inscription, tchat du groupe, rappel la veille, météo et vent
  au départ (Open-Meteo), avis après la sortie, ajout au calendrier, partage avec aperçu (WhatsApp…).
- **Suivi GPS** de ta sortie (distance, durée, vitesse), historique de tes sorties.
- **Groupes / clubs**, **forum**, **tchat général**, **messages privés** (photos, messages vocaux),
  **fil d'actualité**, abonnements, parrainage.
- **Carte des lieux utiles** (OpenStreetMap) : bornes de réparation 🔧, magasins vélo 🚲, points
  d'eau 💧, gonflage 🎈, avec favoris et avis.
- **Dangers sur la route** signalés par les membres : nid-de-poule, travaux, route fermée, chien
  agressif, gravillons, verglas, inondation, trafic dangereux…
- **Niveaux et badges** (XP calculés par la base) : de « Petites roues » à « Légende du peloton ».
- **Notifications** dans le site, **par e-mail** (Brevo) et **push** sur le téléphone.
- **Modération** : signalements, équipe de modérateurs, avertissements, suspensions, bannissement,
  tableau de bord d'administration.
- Mode sombre automatique, application installable (PWA), FR / NL / EN.

## Architecture

| Partie | Technologie | Où |
|---|---|---|
| Interface | React 18 + Vite + Tailwind CSS, carte Leaflet / OpenStreetMap | `src/` |
| Base de données, comptes, photos, temps réel | **Supabase** (PostgreSQL + Row Level Security, Auth, Storage, Realtime) | `supabase/schema.sql` |
| Hébergement | **Netlify** (site statique `dist/`) | `netlify.toml`, `public/_redirects` |
| Fonctions serveur `/api/*` | **Netlify Functions** (+ Netlify Blobs pour le cache et la clé des notifications push) | `netlify/functions/` |
| Aperçu des liens partagés, pages publiques pour Google | Netlify Edge Function | `netlify/edge-functions/share.js` |
| E-mails | **Brevo** (API pour les notifications, SMTP pour les e-mails de connexion) | `netlify/functions/notify.js`, `auth-email.js` |
| Automatisations | GitHub Actions | `.github/workflows/` |

```
cyclami/
├── src/
│   ├── main.jsx, App.jsx        # point d'entrée et navigation entre les pages
│   ├── context/AppContext.jsx   # état global, appels Supabase, temps réel
│   ├── lib/supabase.js          # client Supabase, envoi des photos (Supabase Storage), constante API = '/api'
│   ├── data/constants.js        # types de sortie, niveaux, types de vélo, disponibilités…
│   ├── components/, pages/      # écrans et composants
│   └── i18n/nl, i18n/en         # traductions (le français sert de clé)
├── public/                      # logo (SVG), icônes, illustrations, manifest, service worker, _redirects
├── netlify/
│   ├── functions/               # /api/notify, /api/push, /api/push/key, /api/auth-email, /api/places, /api/email-quota
│   ├── lib/shared.js            # code commun aux fonctions
│   ├── test/functions.test.mjs  # tests des fonctions (sans Netlify)
│   └── edge-functions/share.js  # aperçu des liens partagés
├── supabase/schema.sql          # tables, sécurité, déclencheurs (relançable sans risque)
├── scripts/brand-images.mjs     # régénère icônes PNG / logos WebP / image de partage depuis les SVG
├── tests/                       # test de toutes les pages dans Chromium (base simulée)
└── .github/workflows/           # vérification, base de données, sauvegardes, contrôle du site
```

**Fonctions serveur** (toutes sur le même domaine que le site) :

| Adresse | Rôle | Appelée par |
|---|---|---|
| `POST /api/notify` | envoie un e-mail de notification via Brevo | la base (clé partagée) |
| `POST /api/push` | envoie une notification push (Web Push / VAPID) | la base (clé partagée) |
| `GET /api/push/key` | clé publique des notifications push (créée automatiquement au 1er appel, gardée dans Netlify Blobs) | le navigateur |
| `POST /api/auth-email` | e-mails de connexion aux couleurs de Cyclami (facultatif) | Supabase Auth (Send Email Hook) |
| `GET /api/places?lat=&lng=` | lieux utiles OpenStreetMap, en cache 10 jours | le navigateur |
| `GET /api/email-quota` | crédits d'e-mails Brevo restants | page Administration |

La **clé partagée** entre la base et les fonctions n'est jamais écrite nulle part : elle est
calculée des deux côtés à partir de la clé Brevo (`sha256("cyclami-notify:" + BREVO_API_KEY)`).

## Développement local

Il faut **Node.js 22** (https://nodejs.org → version « LTS »).

```bash
npm install
cp .env.example .env.local     # puis remplir VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                    # http://localhost:5173
```

- Les fonctions `/api/*` ne tournent pas avec `npm run dev` (les e-mails, le push et les lieux
  sont alors simplement indisponibles). Pour les essayer : `npx netlify-cli dev` (après `netlify link`).
- Tests :

```bash
npm run test:functions                      # fonctions Netlify (e-mails, push, lieux, quota)
npm run build && npm run test:smoke         # toutes les pages dans Chromium, base Supabase simulée
node tests/reserved-avatar.test.mjs         # photo de profil réservée
```

  Si le site n'a pas été construit avec une adresse Supabase, `test:smoke` le reconstruit tout seul
  avec un projet fictif (rien n'est envoyé à une vraie base). Captures d'écran : `SHOTS_DIR=shots npm run test:smoke`.
- À chaque envoi sur GitHub, l'action **« Vérification du site »** lance tous ces tests.
- Logo modifié (`public/logo-mark.svg`, `public/logo.svg`) ? Régénérer les images :
  `node scripts/brand-images.mjs`.

---

## Mise en ligne pas à pas (guide débutant)

Compte une heure ou deux. Tout est gratuit : le site tourne sur `https://cyclami.netlify.app`
(un nom de domaine payant pourra s'ajouter plus tard, section F). Il te faut :

- un compte **GitHub** avec ce dépôt (https://github.com) ;
- un compte **Supabase** (https://supabase.com, « Start your project », connexion avec GitHub possible) ;
- un compte **Netlify** (https://app.netlify.com, connexion avec GitHub) ;
- un compte **Brevo** (https://www.brevo.com) pour les e-mails.

> 🔐 **Règle d'or** : les clés secrètes (mot de passe de la base, clé Brevo, clé `sb_secret_…`…)
> ne s'écrivent **jamais** dans le code ni dans un fichier du dépôt. Elles vont uniquement dans
> Netlify (variables d'environnement) ou GitHub (secrets). Garde-les aussi dans un gestionnaire
> de mots de passe.

### A. Créer la base de données Supabase

1. **Créer le projet**
   - https://supabase.com/dashboard → **New project**.
   - *Organization* : la tienne. *Project name* : `cyclami`.
   - *Database Password* : clique **Generate a password**, puis **copie-le et garde-le** (gestionnaire
     de mots de passe). Il sert plus bas pour `SUPABASE_DB_URL`.
   - *Region* : choisis une région **en Europe** — **West EU (Paris)** est la plus proche de la
     Belgique et de la France (données hébergées dans l'UE).
   - **Create new project**, puis attends 1 à 2 minutes.

2. **Récupérer l'adresse et la clé publique**
   - Menu de gauche → ⚙️ **Project Settings** → **Data API** : copie **Project URL**
     (de la forme `https://abcdefghijklmnop.supabase.co`). → ce sera `VITE_SUPABASE_URL`.
   - **Project Settings** → **API Keys** : copie la **Publishable key** (`sb_publishable_…`).
     → ce sera `VITE_SUPABASE_PUBLISHABLE_KEY`. Elle est publique par nature (la sécurité repose
     sur les règles de la base). ⚠️ Ne copie **pas** la *Secret key* (`sb_secret_…`).

3. **Installer les tables avec la GitHub Action** (recommandé : la base se mettra ensuite à jour
   toute seule à chaque modification de `supabase/schema.sql`)
   - Dans Supabase, bouton **Connect** (en haut de la page du projet) → onglet **Connection String**
     → *Method* : **Session pooler** → copie l'adresse
     `postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`.
   - Remplace `[YOUR-PASSWORD]` (crochets compris) par le mot de passe de la base de l'étape 1.
     (Oublié ? **Project Settings** → **Database** → **Reset database password**.)
   - Sur GitHub, ouvre le dépôt → **Settings** → **Secrets and variables** → **Actions** →
     **New repository secret** : *Name* `SUPABASE_DB_URL`, *Secret* = l'adresse complète → **Add secret**.
   - Onglet **Actions** du dépôt → à gauche **« Base de données Supabase »** → **Run workflow** →
     **Run workflow**. Attends la coche verte ✅ (2 à 3 minutes). Le script est d'abord testé sur une
     base vide, puis appliqué à la tienne.
   - *Sans GitHub Action* : Supabase → **SQL Editor** → **New query** → colle tout le contenu de
     `supabase/schema.sql` → **Run**. (Il peut être relancé sans risque.)

4. **Adresses autorisées pour la connexion**
   - **Authentication** → **URL Configuration** :
     - *Site URL* : `https://cyclami.netlify.app` (l'adresse Netlify de l'étape B) ;
     - *Redirect URLs* → **Add URL** : `https://cyclami.netlify.app/**` et `http://localhost:5173/**`
       (développement). **Save**.

5. **Connexion avec Google (facultatif)**
   - https://console.cloud.google.com → crée un projet `Cyclami` → **APIs & Services** →
     **OAuth consent screen** (type *External*, nom `Cyclami`, e-mail d'assistance, page d'accueil
     `https://cyclami.netlify.app`) → enregistre, puis **Publish app**.
   - **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID** →
     *Application type* **Web application** → *Authorized redirect URIs* → **Add URI** :
     `https://abcdefghijklmnop.supabase.co/auth/v1/callback` (ton *Project URL* + `/auth/v1/callback`)
     → **Create**. Copie le *Client ID* et le *Client secret*.
   - Supabase → **Authentication** → **Sign In / Providers** → **Google** → active *Enable Sign in
     with Google*, colle les deux valeurs → **Save**.

### B. Créer le site sur Netlify

1. https://app.netlify.com → **Add new project** (ou *Add new site*) → **Import an existing project**
   → **GitHub** → autorise Netlify → choisis le dépôt `cyclami`.
2. Réglages de construction : rien à changer, ils sont lus dans `netlify.toml`
   (*Build command* `npm run build`, *Publish directory* `dist`, *Functions directory*
   `netlify/functions`, Node 22).
3. Toujours sur cet écran, **Add environment variables** (ou plus tard : **Project configuration** →
   **Environment variables** → **Add a variable** → **Add a single variable**) :

   | Variable | Valeur | Obligatoire ? |
   |---|---|---|
   | `VITE_SUPABASE_URL` | *Project URL* de Supabase (étape A2) | oui |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | *Publishable key* `sb_publishable_…` (étape A2) | oui |
   | `SITE_URL` | `https://cyclami.netlify.app` (adresse du site, sans `/` à la fin) | conseillé |
   | `BREVO_API_KEY` | clé API Brevo (étape C3) — coche **Contains secret values** | pour les e-mails |
   | `SENDER_EMAIL` | adresse expéditeur validée chez Brevo (étape C2), ex. `ton.adresse@gmail.com` | pour les e-mails |
   | `SENDER_NAME` | `Cyclami` | non (défaut : Cyclami) |
   | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | mêmes valeurs que les `VITE_…` : lues par les fonctions `/api/*` et la fonction edge d’aperçu des liens partagés (qui reprennent les `VITE_…` si elles sont absentes) | non |
   | `SUPABASE_AUTH_HOOK_SECRET` | secret `v1,whsec_…` du Send Email Hook (étape C5) | non |

4. **Deploy**. Après 1 à 2 minutes, le site est en ligne sur `https://<nom-au-hasard>.netlify.app`.
5. **Choisir l'adresse `cyclami.netlify.app`** : **Project configuration** (*Site configuration*) →
   **General** → **Project details** → **Change project name** (*Change site name*) → tape `cyclami` →
   **Save**. Le site répond alors sur `https://cyclami.netlify.app`. Si le nom est déjà pris, choisis-en
   un autre (ex. `cyclami-be`) et utilise cette adresse partout où ce guide écrit `cyclami.netlify.app`
   (variable `SITE_URL`, Supabase étape A4, et la commande SQL de la section F, étape 6, pour la base).
6. À chaque envoi sur la branche `main` de GitHub, Netlify reconstruit le site tout seul.
   ⚠️ Après avoir **ajouté ou modifié une variable**, relance une construction :
   **Deploys** → **Trigger deploy** → **Deploy project** (ou *Clear cache and deploy*).
7. Rien à configurer pour **Netlify Blobs** (cache des lieux, clé des notifications push) : c'est
   automatique. Les notifications push fonctionnent dès le premier abonnement d'un membre.

### C. Les e-mails avec Brevo

Deux sortes d'e-mails partent par Brevo (offre gratuite : 300 e-mails par jour) :
les **e-mails de connexion** (confirmation d'inscription, mot de passe oublié) envoyés par Supabase en
**SMTP**, et les **notifications** (nouveau message, sortie…) envoyées par la fonction `/api/notify`
avec l'**API** Brevo. Sans nom de domaine, on utilise simplement une adresse e-mail existante
(par exemple une adresse Gmail) comme expéditeur.

1. **Créer le compte** sur https://www.brevo.com (*Sign up free*), remplis le profil (Brevo peut
   demander quelques jours de vérification du compte avant d'envoyer).
2. **Vérifier l'adresse expéditeur** : Brevo → menu en haut à droite (ton nom) → **Senders, Domains &
   Dedicated IPs** (*Expéditeurs, domaines et IP dédiées*) → onglet **Senders** (*Expéditeurs*) →
   **Add a sender** : *From name* `Cyclami`, *From email* = ton adresse (ex. `ton.adresse@gmail.com`)
   → Brevo envoie un **code** à cette adresse → recopie-le pour la valider.
   > ⚠️ Avec une adresse gratuite (Gmail, Outlook…), Brevo peut **réécrire l'expéditeur** (l'e-mail
   > part alors d'une adresse technique de Brevo, avec ton adresse en « répondre à »), et une partie
   > des e-mails peut arriver dans les **indésirables**. C'est normal tant que le site n'a pas son
   > propre domaine : la solution définitive est d'authentifier un domaine (section F).
3. **Clé API** (pour les notifications) : Brevo → menu en haut à droite → **SMTP & API** → onglet
   **API Keys** → **Generate a new API key** → nom `Netlify` → copie la clé (`xkeysib-…`, affichée une
   seule fois). Mets-la à **deux** endroits :
   - Netlify → **Environment variables** → `BREVO_API_KEY` (cocher *Contains secret values*), et
     `SENDER_EMAIL` = l'adresse validée à l'étape 2 → puis **Trigger deploy** ;
   - GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** →
     `BREVO_API_KEY` → puis **Actions** → « Base de données Supabase » → **Run workflow** : la base
     reçoit ainsi la clé partagée et commence à envoyer les notifications.
   - Brevo → **Security** → **Authorised IPs** : si le blocage des adresses IP inconnues est actif,
     **désactive-le** (les fonctions Netlify n'ont pas d'adresse IP fixe).
4. **SMTP pour Supabase** (e-mails de connexion) : Brevo → **SMTP & API** → onglet **SMTP** →
   **Generate a new SMTP key** → nom `Supabase` → copie la clé. Note aussi le **Login** affiché
   (`xxxx@smtp-brevo.com`). Puis Supabase → **Authentication** → **Emails** → onglet **SMTP Settings** →
   active **Enable Custom SMTP** :
   - *Sender email* = l'adresse validée à l'étape 2, *Sender name* `Cyclami` ;
   - *Host* `smtp-relay.brevo.com`, *Port* `587` ;
   - *Username* = le **Login** Brevo, *Password* = la **clé SMTP** → **Save changes**.
   - Conseillé : **Authentication** → **Rate Limits** → augmente *Rate limit for sending emails*
     (par ex. 100 par heure), et vérifie dans **Sign In / Providers** → **Email** que
     *Confirm email* est activé.
5. **E-mails de connexion aux couleurs de Cyclami, en FR / NL / EN (facultatif)** :
   - Supabase → **Authentication** → **Hooks** → **Add hook** → **Send Email hook** → type **HTTPS** →
     *URL* `https://cyclami.netlify.app/api/auth-email` (ton adresse Netlify) → **Generate secret** →
     copie le secret (`v1,whsec_…`).
   - Netlify → variable `SUPABASE_AUTH_HOOK_SECRET` = ce secret → **Trigger deploy**, puis, une fois
     le site reconstruit, **Create hook** dans Supabase.
   - Teste avec « mot de passe oublié ». Si les e-mails n'arrivent plus, désactive le hook : Supabase
     reprend alors l'envoi par SMTP (étape 4).
6. **Suivi** : Brevo → **Transactional** → **Logs** montre chaque e-mail envoyé ; la page
   **Administration** du site affiche les crédits restants du jour.

### D. Devenir administrateur

Le compte **`nathanbarbaraytb@gmail.com`** devient automatiquement **administrateur** (fondateur), grâce à
`supabase/schema.sql` :

- un déclencheur sur les comptes (`promote_founder`) le nomme administrateur **dès que l'adresse
  e-mail est confirmée** (clic sur le lien de l'e-mail de confirmation, ou connexion avec Google
  qui confirme l'adresse d'office) ;
- si le compte existait déjà avant l'installation du schéma, il est promu au moment où le script est
  appliqué (étape A3) ;
- par sécurité, cela ne joue **que tant que le site n'a aucun administrateur** : personne ne peut
  obtenir ce rôle plus tard en s'inscrivant avec cette adresse sans pouvoir la confirmer.

Concrètement :

1. Une fois le site en ligne (étapes A à C), inscris-toi sur le site avec `nathanbarbaraytb@gmail.com`
   (ou **Continuer avec Google** avec ce compte).
2. Clique sur le lien de confirmation reçu par e-mail (inutile avec Google).
3. Déconnecte-toi puis reconnecte-toi : **Administration** apparaît dans le menu du compte.

Si ça ne marche pas (par exemple compte créé avant que la base ne soit prête, ou e-mail de
confirmation jamais reçu) : Supabase → **Authentication** → **Users** → vérifie que la colonne
*Confirmed at* du compte est remplie (sinon menu **⋯** → **Confirm email**), puis **SQL Editor** →
**New query** → **Run** :

```sql
insert into public.admins (user_id, role)
select id, 'admin' from auth.users where lower(email) = 'nathanbarbaraytb@gmail.com'
on conflict (user_id) do update set role = 'admin';
```

L'administrateur voit **Profil → Administration** (menu du compte en haut à droite) : chiffres du site,
signalements, membres (avec leur e-mail), nomination des modérateurs, avertissements, suspensions,
bannissement, retrait de n'importe quel contenu. Les messages privés restent illisibles.

Ajouter un **autre administrateur** : Supabase → **Authentication** → **Users** → copie l'*UID* du
compte, puis **SQL Editor** → **New query** :

```sql
insert into public.admins (user_id, role) values ('<UID du compte>', 'admin')
on conflict (user_id) do update set role = 'admin';
```

Les **modérateurs** se nomment depuis le site : Administration → Membres.

### E. Sauvegardes

- L'offre gratuite de Supabase ne garde pas de sauvegarde téléchargeable : la GitHub Action
  **« Sauvegarde base de données »** (`.github/workflows/backup.yml`) sauvegarde **chaque nuit** la base
  (comptes, profils, sorties, messages…) dans un fichier **chiffré** gardé **30 jours**.
  Elle utilise le secret `SUPABASE_DB_URL` (étape A3), rien d'autre à faire.
- Ajoute le secret GitHub **`BACKUP_PASSPHRASE`** (une longue phrase secrète, **notée en lieu sûr**) :
  GitHub → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
  Sans lui, la phrase est dérivée de `SUPABASE_DB_URL` : `printf 'cyclami-backup:%s' "$SUPABASE_DB_URL" | sha256sum`
  (elle change donc si le mot de passe de la base change).
- **Télécharger** une sauvegarde : onglet **Actions** → « Sauvegarde base de données » → une exécution
  → en bas, **Artifacts** → `sauvegarde-AAAA-MM-JJ`.
- **Restaurer** (ordinateur avec PostgreSQL installé) :

  ```bash
  gpg -d cyclami-AAAA-MM-JJ.dump.gpg > base.dump          # demande la phrase secrète
  pg_restore --no-owner --clean --if-exists -d "$SUPABASE_DB_URL" base.dump
  ```
- Les **photos** (Supabase Storage) ne sont pas dans ce fichier. Pour les copier de temps en temps :
  Supabase → **Storage** → bucket `photos` → télécharger, ou passer à l'offre Pro de Supabase
  (sauvegardes quotidiennes incluses).

### F. Plus tard : un nom de domaine (facultatif)

Le site fonctionne très bien sur `https://cyclami.netlify.app`. Un nom de domaine à toi
(`cyclami.be`, `cyclami.fr`, `cyclami.com`… environ 10 à 15 € par an) rend l'adresse plus facile à
retenir et, surtout, permet des **e-mails fiables** envoyés depuis ton domaine.

1. **Acheter le domaine** : le plus simple, directement chez Netlify → **Domains** (menu de l'équipe)
   → **Register a domain** (configuration automatique) ; ou chez un bureau d'enregistrement
   (OVHcloud, Gandi, Combell, one.com, Cloudflare Registrar…).
2. Netlify → ton projet → **Domain management** → **Add a domain** → tape le domaine → **Verify** →
   **Add domain**.
3. **Utiliser Netlify DNS** (recommandé : HTTPS automatique, et c'est là que tu ajouteras les
   enregistrements Brevo) : à côté du domaine, **Options** → **Set up Netlify DNS** → suis l'assistant
   jusqu'à la liste de **4 serveurs de noms** (`dns1.p0X.nsone.net`, …). Chez ton bureau
   d'enregistrement, remplace les serveurs de noms (*nameservers*) par ces 4 adresses. La propagation
   prend de quelques minutes à 48 h.
4. **HTTPS** : **Domain management** → section **HTTPS** → **Verify DNS configuration** puis
   **Provision certificate** (souvent automatique, renouvelé tout seul).
5. **www** : ajoute aussi `www.` + ton domaine (Netlify le propose) et garde le domaine nu comme
   **Primary domain** : `www` et `cyclami.netlify.app` redirigent alors vers lui.
6. **Mettre l'adresse à jour partout** :
   - Netlify → variable `SITE_URL` = `https://ton-domaine.be` → **Trigger deploy** ;
   - Supabase → **Authentication** → **URL Configuration** : *Site URL* et *Redirect URLs* (étape A4) ;
   - Supabase → **Authentication** → **Hooks** : URL du Send Email Hook, si tu l'utilises ;
   - la base (adresse d'appel des e-mails et du push) : Supabase → **SQL Editor** →
     `update private.settings set value = 'https://ton-domaine.be/api/notify' where key = 'notify_url';`
   - dans le code : `public/_redirects`, `public/robots.txt`, `index.html` (balises `og:`), la constante
     `SITE` de `netlify/edge-functions/share.js` et `.github/workflows/site-check.yml`.
7. **Authentifier le domaine chez Brevo** (e-mails qui n'arrivent plus en indésirables) :
   - Brevo → **Senders, Domains & Dedicated IPs** → onglet **Domains** → **Add a domain** → ton domaine
     → authentification **manuelle** (« Authenticate the domain yourself »).
   - Brevo affiche des enregistrements DNS : un **TXT** `brevo-code:…`, deux **CNAME** DKIM
     (`brevo1._domainkey`, `brevo2._domainkey`) et un **TXT** DMARC (`_dmarc`,
     `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`).
   - Pour **chacun** : Netlify → **Domains** → ton domaine → **DNS settings** → **Add new record** →
     recopie *Record type*, *Name* (sans le domaine à la fin, Netlify l'ajoute) et *Value* exactement
     comme Brevo les donne → **Save**.
   - Retour dans Brevo → **Authenticate this email domain** (si c'est refusé, attends 1 h et réessaie).
   - Ajoute l'expéditeur `noreply@ton-domaine.be` (**Senders** → **Add a sender** ; validé sans boîte
     mail puisque le domaine est authentifié), puis mets cette adresse dans la variable Netlify
     `SENDER_EMAIL` et dans Supabase (**SMTP Settings** → *Sender email*).
8. Pour vérifier : change `SITE` dans `.github/workflows/site-check.yml`, puis onglet **Actions** →
   **« Contrôle du site »** → **Run workflow**.

---

## Récapitulatif des variables et secrets

**Netlify** → *Project configuration* → *Environment variables* :

| Variable | Exemple | Rôle |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://abcdefghijklmnop.supabase.co` | adresse de la base (site) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | clé publique (site) |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | idem | fonctions `/api/*` et fonction edge d’aperçu des liens (facultatif : sinon elles lisent les `VITE_…`) |
| `SITE_URL` | `https://cyclami.netlify.app` | liens dans les e-mails (défaut : `https://cyclami.netlify.app`) |
| `BREVO_API_KEY` 🔐 | `xkeysib-…` | envoi des e-mails ; dérive aussi la clé partagée avec la base |
| `SENDER_EMAIL` | `ton.adresse@gmail.com` | expéditeur validé chez Brevo (plus tard : `noreply@` ton domaine) |
| `SENDER_NAME` | `Cyclami` | nom affiché (défaut : Cyclami) |
| `SUPABASE_AUTH_HOOK_SECRET` 🔐 | `v1,whsec_…` | e-mails de connexion personnalisés (facultatif) |

**GitHub** → *Settings* → *Secrets and variables* → *Actions* :

| Secret | Rôle |
|---|---|
| `SUPABASE_DB_URL` 🔐 | adresse « Session pooler » avec mot de passe : mise à jour de la base, sauvegardes |
| `BREVO_API_KEY` 🔐 | la même clé que sur Netlify : active les notifications par e-mail et push dans la base |
| `BACKUP_PASSPHRASE` 🔐 | phrase de chiffrement des sauvegardes (conseillé) |

`.env.production` peut contenir les deux valeurs **publiques** `VITE_…` à la place de Netlify ;
les variables Netlify ont la priorité. Ne jamais y mettre de secret.

## Dépannage

| Problème | Solution |
|---|---|
| Page blanche, console : « configuration Supabase manquante » | `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` absentes au moment de la construction : ajoute-les dans Netlify puis **Trigger deploy**. |
| La connexion Google renvoie vers une mauvaise adresse | Supabase → Authentication → URL Configuration : *Site URL* et *Redirect URLs* (étape A4). |
| Les e-mails de confirmation n'arrivent pas | Supabase → Authentication → Emails → SMTP Settings (étape C4) ; Brevo → Transactional → Logs ; regarde les indésirables. |
| Les notifications par e-mail ne partent pas | Secret GitHub `BREVO_API_KEY` présent et action « Base de données Supabase » relancée ; mêmes clés sur Netlify et GitHub ; `SENDER_EMAIL` validée chez Brevo ; Netlify → **Logs** → **Functions** → `notify`. |
| `/api/notify` répond 401 | La clé Brevo de Netlify et celle du secret GitHub sont différentes : remets la même aux deux endroits, relance l'action et redéploie. |
| Brevo refuse : « unrecognised IP address » | Brevo → Security → Authorised IPs → désactive le blocage. |
| L'adresse `cyclami.netlify.app` est déjà prise | Netlify → **Project configuration** → **General** → **Change project name** (*Site configuration → Change site name*), choisis un autre nom, puis mets à jour `SITE_URL`, les adresses de Supabase (étape A4) et `notify_url` (voir section F, étape 6). |
| Le domaine (section F) n'est pas encore en HTTPS | Domain management → HTTPS → *Verify DNS configuration* ; attends la propagation des serveurs de noms. |
| L'action « Base de données Supabase » échoue à la connexion | Vérifie `SUPABASE_DB_URL` : adresse **Session pooler**, port 5432, `[YOUR-PASSWORD]` remplacé (sans crochets). |
