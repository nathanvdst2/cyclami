import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { levelFor } from '../utils/levels.js';
import { getLang, locale, t } from '../i18n/index.js';
import {
  API, MESSAGE_PHOTO_BUCKET, PHOTO_BUCKET, deleteAllMyCloudPhotos, deleteMemberCloudPhotos, deletePublicPhoto, supabase, uploadMessagePhoto, uploadPhoto,
} from '../lib/supabase.js';
import { uploadVoice } from '../lib/voice.js';
import { clearReferral, pendingReferral } from '../lib/referral.js';
import { hazardLabel } from '../data/hazards.js';
import { deviceInfo } from '../lib/device.js';
import { avatarHashes, isReservedHash } from '../lib/reservedAvatar.js';
import { MAX_BIKES, levelInfo } from '../data/constants.js';

const AppContext = createContext(null);

// Quantités chargées : on ne télécharge que ce qui est utile, pas toute la base.
const POSTS_PAGE = 20;
const NEARBY_DEG = { lat: 0.5, lng: 0.7 }; // ≈ 50 km autour de soi
const STALE_MS = 20_000;

// Requête « id dans la liste » découpée en paquets (les URL ont une longueur limitée).
async function selectIn(table, column, ids, build = (q) => q) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = [];
  for (let i = 0; i < unique.length; i += 100) {
    const { data, error } = await build(supabase.from(table).select('*').in(column, unique.slice(i, i + 100)));
    if (error) throw error;
    out.push(...data);
  }
  return out;
}

const EMPTY_DATA = {
  profiles: [], bikes: [], rides: [], participants: [], posts: [], likes: [], messages: [], blocks: [],
  comments: [], notifications: [],
};

// Notification système quand l'onglet est en arrière-plan (si l'utilisateur l'a autorisée).
// tag : même étiquette que la notification push correspondante, pour ne pas l'afficher deux fois.
function systemNotify(title, body, tag) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return;
    const options = { body, icon: '/icon-192.png', badge: '/icon-192.png', tag };
    navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification(title, options))
      .catch(() => new Notification(title, options));
  } catch {
    // notifications non prises en charge
  }
}

// Messages d'erreur Supabase les plus courants, traduits pour l'utilisateur.
// Jamais de message technique (contrainte, colonne, code SQL…) : un texte clair à la place.
export function friendlyError(error) { return frenchError(error); }
function frenchError(error) {
  const msg = error?.message || String(error);
  if (/Invalid login credentials/i.test(msg)) return t('E-mail ou mot de passe incorrect.');
  if (/Email not confirmed/i.test(msg)) return t('Confirme d’abord ton adresse e-mail (regarde tes mails, et les spams).');
  if (/already registered/i.test(msg)) return t('Un compte existe déjà avec cet e-mail.');
  if (/Password should be/i.test(msg)) return t('Le mot de passe doit faire au moins 6 caractères.');
  if (/rate limit/i.test(msg)) return t('Trop de tentatives, réessaie dans quelques minutes.');
  const wait = msg.match(/attends encore (\d+) s/);
  if (wait) {
    const n = Number(wait[1]);
    if (n > 5400) return t('Doucement ! Attends encore {n} h avant de recommencer.', { n: Math.ceil(n / 3600) });
    return n > 90
      ? t('Doucement ! Attends encore {n} min avant de recommencer.', { n: Math.ceil(n / 60) })
      : t('Doucement ! Attends encore {n} s avant de recommencer.', { n });
  }
  if (/Failed to fetch/i.test(msg)) return t('Connexion impossible. Vérifie ton accès à Internet.');
  if (/Database error saving new user|bannie/i.test(msg)) return t('Inscription impossible avec cette adresse e-mail.');
  if (/reports_one_open_per_target/i.test(msg)) return t('Tu as déjà signalé ce contenu : l’équipe va le regarder.');
  if (/row-level security/i.test(msg)) return t('Action non autorisée.');
  if (/bikes_max|bikes_per_owner|10 vélos/i.test(msg)) return t('Tu as déjà {n} vélos : retires-en un pour en ajouter un autre.', { n: MAX_BIKES });
  if (/bikes_name/i.test(msg)) return t('Donne un nom à ton vélo (40 caractères au maximum).');
  if (/usual_speed/i.test(msg)) return t('Indique une vitesse moyenne entre 8 et 50 km/h.');
  if (/rides_avg_speed|avg_speed/i.test(msg)) return t('Indique une vitesse moyenne entre 8 et 50 km/h.');
  if (/distance_km/i.test(msg)) return t('Indique une distance entre 1 et 400 km.');
  if (/elevation_m/i.test(msg)) return t('Indique un dénivelé entre 0 et 8 000 m.');
  if (/rides_route|route_check|jsonb_array_length/i.test(msg)) return t('Le tracé importé est trop long ou illisible. Essaie un autre fichier GPX.');
  // contraintes des formulaires (dates, longueurs, photos)
  if (/expires_on/i.test(msg)) return t('La date choisie n’est pas valide.');
  if (/_photo_url_own|_photos_own|photo_path|avatar_url_own/i.test(msg)) return t('Cette photo n’a pas pu être enregistrée. Choisis-la à nouveau.');
  if (/_photos_max|photo_urls/i.test(msg)) return t('Trop de photos pour ce contenu.');
  if (/messages_content_check|_body_check/i.test(msg)) return t('Le message est vide ou trop long.');
  // erreurs techniques restantes : jamais affichées telles quelles
  if (/value too long|char_length|_check"|violates check constraint/i.test(msg)) return t('Une des informations saisies n’est pas valide (trop longue ou hors limites). Vérifie le formulaire.');
  if (/duplicate key|already exists|unique constraint/i.test(msg)) return t('C’est déjà fait : cette information existe déjà.');
  if (/violates foreign key|is not present in table|still referenced/i.test(msg)) return t('Ce contenu n’existe plus. Recharge la page.');
  if (/not-null|null value in column/i.test(msg)) return t('Un champ obligatoire est vide.');
  if (/invalid input syntax|invalid input value|out of range|date\/time field/i.test(msg)) return t('Une des informations saisies n’est pas au bon format.');
  if (/schema cache|Could not find the|does not exist|PGRST\d+/i.test(msg)) return t('Le site vient d’être mis à jour : recharge la page puis réessaie.');
  if (/JWT|token|not authenticated|session/i.test(msg)) return t('Ta session a expiré : reconnecte-toi.');
  if (/permission denied|not allowed|insufficient_privilege/i.test(msg)) return t('Action non autorisée.');
  if (/timeout|timed out|NetworkError|Load failed|network/i.test(msg)) return t('Le serveur ne répond pas. Réessaie dans un instant.');
  if (/[a-z]+_[a-z_]+|relation "|column "|function |syntax error|SQLSTATE|\bpg_/i.test(msg)) return t('Une erreur est survenue. Réessaie, et si ça continue, écris à l’équipe.');
  const until = msg.match(/suspendu jusqu.au (.+)$/);
  if (until) {
    const d = new Date(until[1]);
    return t('Ton compte est suspendu jusqu’au {date}.', { date: Number.isNaN(d.getTime()) ? until[1] : d.toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' }) });
  }
  // messages déjà rédigés pour les membres (en français dans la base, voir DB_MESSAGES) : traduits
  return t(msg);
}

// Texte affiché pour chaque type de notification (le nom de l'auteur est ajouté à l'affichage).
export const NOTIFICATION_TEXT = {
  ride_join: (n) => t('a rejoint ta sortie « {title} »', { title: n.data?.title || '' }),
  ride_cancelled: (n) => t('La sortie « {title} » a été annulée', { title: n.data?.title || '' }),
  ride_updated: (n) => t('a modifié la sortie « {title} » (lieu ou horaire)', { title: n.data?.title || '' }),
  comment: (n) => t('a commenté « {title} » : {excerpt}', { title: n.data?.title || '', excerpt: n.data?.excerpt || '' }),
  like: () => t('a aimé ta publication'),
  warning: (n) => t('⚠️ Avertissement de l’équipe Cyclami : {reason}', { reason: n.data?.reason || t('merci de respecter les règles du site.') }),
  suspended: (n) => t(n.data?.reason ? '🚫 Ton compte est suspendu jusqu’au {until} : {reason}' : '🚫 Ton compte est suspendu jusqu’au {until}', {
    until: n.data?.until ? new Date(n.data.until).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '?',
    reason: n.data?.reason,
  }),
  report_resolved: (n) => (n.data?.resolution
    ? t('✅ Ton signalement a été traité par l’équipe : {resolution}. Merci !', { resolution: n.data.resolution })
    : t('✅ Ton signalement a été traité par l’équipe. Merci !')),
  ride_message: (n) => t('a écrit dans la discussion de « {title} » : {excerpt}', { title: n.data?.title || '', excerpt: n.data?.excerpt || '' }),
  feedback: (n) => t('a envoyé un avis ({kind}) : {excerpt}', { kind: ({ bug: t('bug'), idee: t('idée') })[n.data?.kind] || t('autre'), excerpt: n.data?.excerpt || '' }),
  chat_mention: (n) => (n.data?.reply
    ? t('t’a répondu dans le tchat général : {excerpt}', { excerpt: n.data?.excerpt || '' })
    : t('t’a mentionné dans le tchat général : {excerpt}', { excerpt: n.data?.excerpt || '' })),
  forum_reply: (n) => t('a répondu sur le forum à « {title} » : {excerpt}', { title: n.data?.title || '', excerpt: n.data?.excerpt || '' }),
  group_ride: (n) => t('organise « {title} » avec le groupe {group}', { title: n.data?.title || '', group: n.data?.group || '' }),
  group_message: (n) => t('a écrit dans le groupe {group} : {excerpt}', { group: n.data?.title || '', excerpt: n.data?.excerpt || '' }),
  follow: () => t('s’est abonné(e) à toi'),
  verification: (n) => (n.data?.approved
    ? t('✅ Ton profil est vérifié : le badge « Profil vérifié » apparaît sur ton profil. La vidéo a été supprimée.')
    : n.data?.reason
      ? t('La vérification de ton profil n’a pas abouti : {reason}. Tu peux réessayer.', { reason: n.data.reason })
      : t('La vérification de ton profil n’a pas abouti. Tu peux réessayer.')),
  referral: () => t('s’est inscrit grâce à ton invitation 🎉 Merci de faire grandir le peloton !'),
  hazard: (n) => t('a signalé un danger près de chez toi : {kind} ({place}). Prudence sur la route !', { kind: hazardLabel(n.data), place: n.data?.place || '' }),
  ride_reminder: (n) => t('⏰ Rappel : la sortie « {title} » a lieu demain à {time} ({place}). Pense au casque, à l’eau et à une chambre à air !', { title: n.data?.title || '', time: n.data?.time || '', place: n.data?.place || '' }),
  member_nearby: (n) => (n.data?.level
    ? t('vient d’arriver sur Cyclami, à {km} km de chez toi, niveau {level} 👋 Propose-lui une sortie !', {
      km: String(n.data?.km ?? '?').replace('.', getLang() === 'en' ? '.' : ','), level: levelInfo(n.data.level)?.label || n.data.level,
    })
    : t('vient d’arriver sur Cyclami, à {km} km de chez toi 👋 Dis-lui bonjour !', { km: String(n.data?.km ?? '?').replace('.', getLang() === 'en' ? '.' : ',') })),
  review: (n) => (n.data?.excerpt
    ? t('te recommande après la sortie « {title} » : {excerpt} 👍', { title: n.data?.title || '', excerpt: n.data.excerpt })
    : t('te recommande après la sortie « {title} » 👍', { title: n.data?.title || '' })),
  content_removed: (n) => {
    if (n.data?.kind === 'avatar') return t('🗑️ L’équipe a retiré ta photo de profil (inappropriée). Tu peux en choisir une autre.');
    const what = ({
      post: t('ta publication'), comment: t('ton commentaire'), ride: t('ta sortie'),
      forum_topic: t('ton sujet du forum'), forum_reply: t('ta réponse sur le forum'),
      group: t('ton groupe'), group_message: t('ton message sur le mur d’un groupe'), chat_message: t('ton message du tchat général'),
    })[n.data?.kind]
      || t('un de tes contenus');
    const vars = { what, excerpt: n.data?.excerpt || '', reason: n.data?.reason };
    return n.data?.reason
      ? t('🗑️ L’équipe a retiré {what} « {excerpt} » ({reason})', vars)
      : t('🗑️ L’équipe a retiré {what} « {excerpt} »', vars);
  },
};

// Notifications qui se lisent sans le nom de l'auteur devant.
export const STANDALONE_NOTIFICATIONS = new Set(['ride_reminder', 'verification']);

// Motifs de signalement (mêmes valeurs que la contrainte en base).
export const REPORT_CATEGORIES = [
  ['harcelement', t('Harcèlement ou insultes')],
  ['inapproprie', t('Contenu inapproprié ou choquant')],
  ['spam', t('Spam ou arnaque')],
  ['faux_profil', t('Faux profil')],
  ['conduite_dangereuse', t('Conduite dangereuse sur la route')],
  ['danger', t('Comportement dangereux')],
  ['autre', t('Autre')],
];

const toBike = (b) => ({
  id: b.id, ownerId: b.owner_id, name: b.name, kind: b.kind, brand: b.brand || '', photoUrl: b.photo_url || null, createdAt: b.created_at,
});

// Tracé GPX simplifié : [[lat, lng], …] (2 à 2000 points, arrondis à ~1 m), ou null
const cleanRoute = (route) => {
  if (!Array.isArray(route)) return null;
  const pts = route.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .slice(0, 2000).map(([lat, lng]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]);
  return pts.length >= 2 ? pts : null;
};
const numOrNull = (v, digits = 1) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
// Colonnes d'une sortie (formulaire → base). Les champs vélo absents (undefined) ne sont pas envoyés :
// valeur par défaut de la base à la création, valeur inchangée lors d'une modification.
const rideColumns = (w) => {
  const row = {
    title: w.title, place: w.place, duration: w.duration, max_participants: w.maxParticipants, description: w.description || '',
    lat: w.coords?.lat ?? null, lng: w.coords?.lng ?? null,
  };
  if (w.type !== undefined) row.ride_type = w.type || 'route';
  if (w.level !== undefined) row.level = w.level || 'intermediaire';
  if (w.avgSpeed !== undefined) row.avg_speed = numOrNull(w.avgSpeed);
  if (w.distanceKm !== undefined) row.distance_km = numOrNull(w.distanceKm);
  if (w.elevationM !== undefined) row.elevation_m = numOrNull(w.elevationM, 0);
  if (w.noDrop !== undefined) row.no_drop = !!w.noDrop;
  if (w.route !== undefined) row.route = cleanRoute(w.route);
  return row;
};

// ----- Notifications push (téléphone, même site fermé) -----
const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && !!API;
const keyBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));

// Abonne cet appareil (ou réenregistre son abonnement pour le compte connecté).
async function subscribePush() {
  if (!pushSupported() || Notification.permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const res = await fetch(`${API}/push/key`);
    if (!res.ok) return null;
    const { key } = await res.json();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  }
  const { endpoint, keys } = sub.toJSON();
  const { error } = await supabase.rpc('register_push', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth });
  return error ? t('Impossible d’activer les notifications sur cet appareil.') : null;
}

// Exécute une action et renvoie un message d'erreur en français (ou null si tout va bien).
async function attempt(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return frenchError(e);
  }
}

const check = ({ error, data }) => {
  if (error) throw error;
  return data;
};

export function AppProvider({ children }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [data, setData] = useState(EMPTY_DATA);
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const me = session?.user?.id || null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: d }) => {
      setSession(d.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Langue du compte : mémorisée dans les métadonnées et le profil, pour que les e-mails partent dans la bonne langue.
  const langSynced = useRef(null);
  useEffect(() => {
    const user = session?.user;
    if (!user || langSynced.current === user.id) return;
    langSynced.current = user.id;
    const lang = getLang();
    if (user.user_metadata?.lang === lang) return;
    supabase.auth.updateUser({ data: { lang } }).then(() => {}, () => {});
    // colonne « lang » ajoutée séparément en base : on ignore une éventuelle erreur
    supabase.from('profiles').update({ lang }).eq('id', user.id).then(() => {}, () => {});
  }, [session]);

  const postLimit = useRef(POSTS_PAGE);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [signedUrls, setSignedUrls] = useState({});
  const lastRefresh = useRef(0);
  // Équipe du site : { user_id: 'admin' | 'moderator' } (publique, pour le badge « Staff »)
  const [staffRoles, setStaffRoles] = useState({});
  const [suspension, setSuspension] = useState(null); // ma suspension en cours, s'il y en a une
  // Membres à toujours charger même s'ils sont loin (recherche, profil ouvert…).
  const pinnedIds = useRef(new Set());

  const refresh = useCallback(async () => {
    if (!me) return;
    lastRefresh.current = Date.now();
    try {
      const mine = check(await supabase.from('profiles').select('*').eq('id', me).maybeSingle());
      const nearbyQuery = mine?.lat != null
        ? supabase.from('profiles').select('*')
          .gte('lat', mine.lat - NEARBY_DEG.lat).lte('lat', mine.lat + NEARBY_DEG.lat)
          .gte('lng', mine.lng - NEARBY_DEG.lng).lte('lng', mine.lng + NEARBY_DEG.lng)
          .limit(300)
        : supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(100);

      const optional = (q) => q.then((r) => (r.error ? { data: [] } : r)); // tables v2 facultatives
      const [nearby, rides, posts, messages, blocks, notifications] = await Promise.all([
        nearbyQuery,
        supabase.from('rides').select('*')
          .gte('starts_at', new Date(Date.now() - 3600_000).toISOString()).order('starts_at').limit(200),
        supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(postLimit.current + 1),
        // les 500 derniers messages suffisent pour la liste des conversations
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('blocks').select('*'),
        optional(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)),
      ]).then((rs) => rs.map(check));

      const morePosts = posts.length > postLimit.current;
      const pagePosts = posts.slice(0, postLimit.current);
      const rideIds = rides.map((w) => w.id);
      const postIds = pagePosts.map((p) => p.id);
      const [participants, likes, postComments, rideComments] = await Promise.all([
        selectIn('ride_participants', 'ride_id', rideIds),
        selectIn('post_likes', 'post_id', postIds),
        selectIn('comments', 'post_id', postIds).catch(() => []),
        selectIn('comments', 'ride_id', rideIds).catch(() => []),
      ]);
      const comments = [...postComments, ...rideComments].sort((a, b) => a.created_at.localeCompare(b.created_at));

      // Profils mentionnés ailleurs (organisateurs, auteurs, interlocuteurs…) mais pas encore chargés.
      const profiles = new Map([...nearby, ...(mine ? [mine] : [])].map((p) => [p.id, p]));
      const referenced = [
        ...rides.map((w) => w.host_id), ...participants.map((p) => p.user_id),
        ...pagePosts.map((p) => p.author_id), ...comments.map((c) => c.author_id),
        ...messages.flatMap((m) => [m.sender_id, m.recipient_id]),
        ...notifications.map((n) => n.actor_id), ...blocks.map((b) => b.blocked_id),
        ...pinnedIds.current,
      ].filter((id) => id && !profiles.has(id));
      (await selectIn('profiles', 'id', referenced)).forEach((p) => profiles.set(p.id, p));
      // vélos des membres chargés (table absente pendant une mise à jour : aucun vélo plutôt qu'un écran d'erreur)
      const bikes = await selectIn('bikes', 'owner_id', [...profiles.keys()], (q) => q.order('created_at')).catch(() => []);

      setData({
        profiles: [...profiles.values()], bikes, rides, participants, posts: pagePosts, likes,
        messages: messages.reverse(), blocks, comments, notifications,
      });
      setHasMorePosts(morePosts);
      const { data: staff } = await supabase.from('admins').select('user_id, role');
      setStaffRoles(Object.fromEntries((staff || []).map((r) => [r.user_id, r.role || 'admin'])));
      const { data: susp } = await supabase.from('suspensions').select('until, reason').eq('user_id', me).maybeSingle();
      setSuspension(susp && new Date(susp.until) > new Date() ? susp : null);
      setLoadError(null);
    } catch (e) {
      setLoadError(frenchError(e));
    }
    setDataReady(true);
  }, [me]);

  const refreshIfStale = useCallback(() => {
    if (Date.now() - lastRefresh.current > STALE_MS) refresh();
  }, [refresh]);

  // Photos des messages : stockées en privé, affichées via des liens temporaires (1 h).
  useEffect(() => {
    const paths = [...new Set(data.messages.map((m) => m.photo_url))]
      .filter((p) => p && !p.startsWith('http') && !signedUrls[p]);
    if (paths.length === 0) return;
    supabase.storage.from(MESSAGE_PHOTO_BUCKET).createSignedUrls(paths, 3600).then(({ data: signed }) => {
      if (!signed) return;
      setSignedUrls((prev) => {
        const next = { ...prev };
        signed.forEach((x) => { if (x.signedUrl) next[x.path] = x.signedUrl; });
        return next;
      });
    });
  }, [data.messages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!me) {
      setData(EMPTY_DATA);
      setDataReady(false);
      return undefined;
    }
    refresh();
    // Messagerie en temps réel : les règles RLS ne laissent passer que nos propres messages.
    const channel = supabase
      .channel(`messages:${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new;
        if (!msg?.id) return;
        if (payload.eventType === 'INSERT' && msg.recipient_id === me) {
          systemNotify(t('Nouveau message 🚴'), msg.body || (msg.audio_path ? t('🎤 Message vocal') : t('📷 Photo')), `m:${msg.sender_id}`);
        }
        setData((d) => {
          const others = d.messages.filter((m) => m.id !== msg.id);
          return { ...d, messages: [...others, msg].sort((a, b) => a.created_at.localeCompare(b.created_at)) };
        });
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}`,
      }, (payload) => {
        const n = payload.new;
        const text = NOTIFICATION_TEXT[n.type]?.(n) || t('Nouvelle activité');
        systemNotify('Cyclami 🚴', n.actor_id && !STANDALONE_NOTIFICATIONS.has(n.type) ? t('Un membre {text}', { text }) : text, `n:${n.id}`);
        setData((d) => ({ ...d, notifications: [n, ...d.notifications.filter((x) => x.id !== n.id)] }));
        // une notification signale souvent une donnée nouvelle (inscription, commentaire…)
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, refresh]);

  // Personnes bloquées dans un sens ou dans l'autre (on ne voit que nos propres blocages).
  const blockedIds = useMemo(() => new Set(data.blocks.map((b) => b.blocked_id)), [data.blocks]);

  const users = useMemo(() => {
    const bikes = data.bikes.map(toBike);
    return data.profiles.map((p) => ({
      id: p.id, name: p.name, city: p.city, bio: p.bio, availability: p.availability || [], xp: p.xp || 0,
      coords: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
      createdAt: p.created_at,
      lastSeen: p.last_seen_at || null, showPresence: p.show_presence !== false, avatarUrl: p.avatar_url || null, verifiedAt: p.verified_at || null,
      // profil cycliste (level null : pas encore rempli → écran d'accueil RiderForm)
      disciplines: p.disciplines || [], level: p.level || null, usualSpeed: p.usual_speed ?? null,
      bikes: bikes.filter((b) => b.ownerId === p.id),
    }));
  }, [data.profiles, data.bikes]);

  const getUser = useCallback((id) => users.find((u) => u.id === id), [users]);
  const currentUser = me ? getUser(me) || null : null;

  const rides = useMemo(() => data.rides.map((w) => ({
    id: w.id, hostId: w.host_id, title: w.title, place: w.place, date: w.starts_at,
    duration: w.duration, maxParticipants: w.max_participants, description: w.description,
    coords: w.lat != null && w.lng != null ? { lat: w.lat, lng: w.lng } : null,
    hidden: !!w.hidden_at, seriesId: w.series_id || null, groupId: w.group_id || null,
    type: w.ride_type || 'route', level: w.level || 'intermediaire',
    avgSpeed: w.avg_speed != null ? Number(w.avg_speed) : null, distanceKm: w.distance_km != null ? Number(w.distance_km) : null,
    elevationM: w.elevation_m ?? null, noDrop: !!w.no_drop, route: Array.isArray(w.route) ? w.route : null,
    participants: data.participants.filter((p) => p.ride_id === w.id).map((p) => p.user_id),
  })).filter((w) => !blockedIds.has(w.hostId)), [data.rides, data.participants, blockedIds]);

  const comments = useMemo(() => data.comments
    .filter((c) => !blockedIds.has(c.author_id))
    .map((c) => ({
      id: c.id, authorId: c.author_id, postId: c.post_id, rideId: c.ride_id, text: c.body, createdAt: c.created_at,
      hidden: !!c.hidden_at,
    })), [data.comments, blockedIds]);

  const notifications = useMemo(() => data.notifications
    .filter((n) => !n.actor_id || !blockedIds.has(n.actor_id))
    .map((n) => ({
      id: n.id, type: n.type, actorId: n.actor_id, postId: n.post_id, rideId: n.ride_id,
      data: n.data || {}, read: !!n.read_at, createdAt: n.created_at, text: NOTIFICATION_TEXT[n.type]?.(n) || '',
    })), [data.notifications, blockedIds]);
  const unreadNotifications = notifications.filter((n) => !n.read).length;

  const posts = useMemo(() => data.posts
    .filter((p) => !blockedIds.has(p.author_id))
    .map((p) => ({
      id: p.id, authorId: p.author_id, scene: p.scene, photoUrl: p.photo_url,
      text: p.body, createdAt: p.created_at, hidden: !!p.hidden_at,
      likes: data.likes.filter((l) => l.post_id === p.id).map((l) => l.user_id),
    })), [data.posts, data.likes, blockedIds]);

  // ----- Abonnements : les membres que je suis (pour le bouton « S'abonner » et le fil « Abonnements ») -----
  const [following, setFollowing] = useState(() => new Set());
  useEffect(() => {
    if (!me) { setFollowing(new Set()); return; }
    supabase.from('follows').select('followee_id').eq('follower_id', me)
      .then(({ data: rows }) => setFollowing(new Set((rows || []).map((r) => r.followee_id))), () => {});
  }, [me]);

  // ----- Points d'expérience : petites récompenses quand on gagne des points -----
  const [toast, setToast] = useState(null); // { text, levelUp? }
  const toastTimer = useRef(null);
  const showToast = useCallback((next) => {
    setToast(next);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), next.levelUp ? 6000 : 3000);
  }, []);
  const prevXp = useRef(null);
  const myXp = currentUser?.xp;
  useEffect(() => {
    if (myXp == null) return;
    const before = prevXp.current;
    prevXp.current = myXp;
    if (before == null || myXp <= before) return;
    const lvl = levelFor(myXp);
    if (lvl.level > levelFor(before).level) {
      showToast({ levelUp: true, text: t('{emoji} Niveau {level} : {name} !', { emoji: lvl.emoji, level: lvl.level, name: lvl.name }) });
    } else {
      showToast({ text: `+${myXp - before} XP` });
    }
  }, [myXp, showToast]);

  // Présence : signe de vie toutes les minutes tant que le site est affiché (statut « en ligne »).
  useEffect(() => {
    if (!me) return undefined;
    const ping = () => { if (document.visibilityState === 'visible') supabase.rpc('touch_presence').then(() => {}, () => {}); };
    ping();
    const timer = setInterval(ping, 60_000);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', ping); };
  }, [me]);

  // Appareil utilisé : signalé une fois par jour (fiche admin : sécurité, comptes multiples).
  useEffect(() => {
    if (!me) return;
    const key = `cyclami:device:${me}`;
    const today = new Date().toLocaleDateString('fr-CA');
    try { if (localStorage.getItem(key) === today) return; } catch { /* stockage indisponible */ }
    supabase.rpc('report_device', { p_info: deviceInfo() }).then(({ error }) => {
      if (!error) try { localStorage.setItem(key, today); } catch { /* ignore */ }
    }, () => {});
  }, [me]);

  // Inscrit grâce au lien d'un membre : la base prévient le parrain (une seule fois)
  useEffect(() => {
    if (!me || !dataReady) return;
    const code = pendingReferral();
    if (code) supabase.rpc('claim_referral', { p_code: code }).then(({ error }) => { if (!error) clearReferral(); }, () => {});
  }, [me, dataReady]);

  // Visite du jour : +5 XP une fois par jour (et bonus de série tous les 7 jours).
  useEffect(() => {
    if (!me || !dataReady || !currentUser) return;
    const key = `cyclami:daily:${me}`;
    const today = new Date().toLocaleDateString('fr-CA');
    try { if (localStorage.getItem(key) === today) return; } catch { /* stockage indisponible */ }
    subscribePush().catch(() => {});
    supabase.rpc('claim_daily_xp').then(({ data: r, error }) => {
      if (error) return;
      try { localStorage.setItem(key, today); } catch { /* ignore */ }
      if (r?.gained > 0) {
        if (r.streak > 1) setTimeout(() => showToast({ text: t('🔥 {n} jours d’affilée !', { n: r.streak }) }), 3200);
        refresh();
      }
    });
  }, [me, dataReady, !!currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = staffRoles[me] === 'admin';
  const isStaff = !!staffRoles[me];
  // compte du fondateur (seul à pouvoir changer les prénoms et à porter sa photo réservée)
  const [ownerId, setOwnerId] = useState(null);
  useEffect(() => {
    if (me) supabase.rpc('owner_id').then(({ data: id }) => setOwnerId(id || null), () => {});
  }, [me]);
  const isOwner = !!me && ownerId === me;
  const unreadCount = data.messages.filter(
    (m) => m.recipient_id === me && !m.read_at && !blockedIds.has(m.sender_id),
  ).length;

  // Ligne « profiles » à partir d'un patch (seuls les champs présents sont envoyés).
  const saveProfileRow = (patch) => {
    const row = {};
    // prénom : envoyé seulement s'il change (figé après l'inscription, sauf pour le fondateur)
    if ('name' in patch && patch.name !== data.profiles.find((p) => p.id === me)?.name) row.name = patch.name;
    if ('city' in patch) row.city = patch.city;
    if ('bio' in patch) row.bio = patch.bio;
    if ('availability' in patch) row.availability = patch.availability;
    if ('disciplines' in patch) row.disciplines = patch.disciplines || [];
    if ('level' in patch) row.level = patch.level || null;
    if ('usualSpeed' in patch) row.usual_speed = patch.usualSpeed === '' || patch.usualSpeed == null ? null : Math.round(Number(patch.usualSpeed));
    return Object.keys(row).length ? supabase.from('profiles').update(row).eq('id', me) : Promise.resolve({ error: null });
  };

  const actions = {
    refresh,
    refreshIfStale,

    // ----- Compte -----
    async signup({ name, email, password, city, lang }) {
      try {
        const { data: d, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { name, city, lang: lang || getLang() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // Supabase renvoie un utilisateur sans identités si l'e-mail est déjà pris.
        if (d.user && d.user.identities?.length === 0) return { error: t('Un compte existe déjà avec cet e-mail.') };
        return { needsConfirmation: !d.session };
      } catch (e) {
        return { error: frenchError(e) };
      }
    },
    login: ({ email, password }) => attempt(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }),
    // Inscription / connexion avec Google : redirige vers Google puis revient sur le site.
    async loginWithGoogle() {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
      });
      return error ? frenchError(error) : null;
    },
    // déconnexion de cet appareil seulement : les autres (téléphone, ordinateur) restent connectés
    logout: () => supabase.auth.signOut({ scope: 'local' }),
    resetPassword: (email) => attempt(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (error) throw error;
    }),
    updatePassword: (password) => attempt(async () => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setRecovering(false);
    }),
    deleteAccount: () => attempt(async () => {
      // le compte administrateur est protégé (la base refuse aussi) : on ne touche à rien
      if (staffRoles[me] === 'admin') throw new Error(t('Le compte administrateur du site ne peut pas être supprimé.'));
      if (staffRoles[me] === 'moderator') {
        throw new Error(t('Tu es modérateur : contacte l’administrateur pour qu’il retire ton rôle avant de supprimer ton compte.'));
      }
      // Les photos se suppriment via l'API Storage, puis le compte via la fonction SQL.
      await deleteAllMyCloudPhotos().catch(() => {});
      for (const bucket of [PHOTO_BUCKET, MESSAGE_PHOTO_BUCKET, 'voice-notes']) {
        const { data: files } = await supabase.storage.from(bucket).list(me, { limit: 1000 });
        if (files?.length) await supabase.storage.from(bucket).remove(files.map((f) => `${me}/${f.name}`));
      }
      // vidéo de vérification en attente
      const { data: pending } = await supabase.from('profile_verifications').select('video_path').eq('user_id', me).not('video_path', 'is', null);
      if (pending?.length) await supabase.storage.from('verifications').remove(pending.map((v) => v.video_path)).catch(() => {});
      check(await supabase.rpc('delete_my_account'));
      await supabase.auth.signOut({ scope: 'local' });
    }),

    // ----- Profil -----
    setShowPresence: (show) => attempt(async () => {
      check(await supabase.rpc('set_show_presence', { p_show: show }));
      await refresh();
    }),
    // dernière connexion à jour d'un membre (conversation ouverte)
    lastSeenOf: async (userId) => (await supabase.from('profiles').select('last_seen_at').eq('id', userId).maybeSingle()).data?.last_seen_at || null,
    // « Télécharger mes données » (RGPD) : un fichier JSON avec tout ce qui concerne le membre
    exportMyData: () => attempt(async () => {
      const dump = check(await supabase.rpc('export_my_data'));
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cyclami-mes-donnees-${new Date().toLocaleDateString('fr-CA')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }),
    // lieux favoris (privés) : liste et ajout / retrait
    favorites: {
      list: async () => check(await supabase.from('place_favorites').select('*').order('created_at', { ascending: false })) || [],
      toggle: (place, on) => attempt(async () => {
        if (on) {
          check(await supabase.from('place_favorites').upsert({
            user_id: me, place_id: place.id, kind: place.kind || 'repair', name: (place.name || '').slice(0, 150), lat: place.lat, lng: place.lng,
          }));
        } else {
          check(await supabase.from('place_favorites').delete().match({ user_id: me, place_id: place.id }));
        }
      }),
    },
    // dons pour soutenir le site : liens vers le service de paiement (aucune donnée bancaire chez nous)
    donationLinks: async () => (await supabase.rpc('donation_links')).data || {},
    setDonationLinks: (once, monthly) => attempt(async () => {
      check(await supabase.rpc('admin_set_donation_links', { p_once: once || '', p_monthly: monthly || '' }));
    }),
    // recherche dans tout le site (membres, forum, sorties, groupes)
    search: async (query) => check(await supabase.rpc('global_search', { p_query: query })) || {},
    // prénom autorisé ? (insultes, noms d'équipe ou du fondateur refusés ; en cas de doute, la base tranche)
    nameAllowed: async (name) => {
      const { data: ok, error } = await supabase.rpc('name_allowed', { p_name: name });
      return error ? true : ok !== false;
    },
    // profil (et profil cycliste) : seuls les champs présents dans patch sont modifiés
    updateProfile: (patch) => attempt(async () => {
      check(await saveProfileRow(patch));
      await refresh();
    }),
    // profil cycliste : { disciplines, level, usualSpeed } (+ name, city, bio, availability facultatifs)
    saveRider: (rider) => attempt(async () => {
      check(await saveProfileRow(rider));
      await refresh();
    }),
    // photo de profil : un fichier pour la changer, null pour la retirer
    setAvatar: (file) => attempt(async () => {
      // empreintes de l'image, vérifiées ici puis par la base (photo réservée au fondateur)
      const hashes = file ? await avatarHashes(file) : [];
      if (file && isReservedHash(hashes) && !isOwner) {
        throw new Error(t('Cette photo de profil est réservée au fondateur de Cyclami. Choisis-en une autre.'));
      }
      const previous = data.profiles.find((p) => p.id === me)?.avatar_url;
      const avatar_url = file ? await uploadPhoto(me, file) : null;
      const avatar_hash = file ? `${hashes.join(',')}|${Date.now()}` : null;
      const res = await supabase.from('profiles').update({ avatar_url, avatar_hash }).eq('id', me);
      if (res.error && avatar_url) await deletePublicPhoto(avatar_url).catch(() => {});
      check(res);
      if (previous && previous !== avatar_url) await deletePublicPhoto(previous).catch(() => {});
      await refresh();
    }),
    locate() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(t('La géolocalisation n’est pas disponible sur cet appareil.'));
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            // Arrondi à ~1 km pour ne jamais exposer l'adresse exacte.
            const round = (x) => Math.round(x * 100) / 100;
            resolve(await attempt(async () => {
              check(await supabase.from('profiles')
                .update({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) })
                .eq('id', me));
              await refresh();
            }));
          },
          () => resolve(t('Position refusée. Autorise la localisation dans ton navigateur.')),
          { timeout: 15000 },
        );
      });
    },

    // ----- Vélos (10 au maximum, photo facultative) -----
    // bike : { name, kind, brand } ; photoFile : nouvelle photo (facultative)
    addBike: (bike, photoFile = null) => attempt(async () => {
      const mine = data.bikes.filter((b) => b.owner_id === me).length;
      if (mine >= MAX_BIKES) throw new Error(t('Tu as déjà {n} vélos : retires-en un pour en ajouter un autre.', { n: MAX_BIKES }));
      const photo_url = photoFile ? await uploadPhoto(me, photoFile) : null;
      const res = await supabase.from('bikes').insert({
        owner_id: me, name: (bike.name || '').trim(), kind: bike.kind || 'route', brand: (bike.brand || '').trim(), photo_url,
      });
      if (res.error && photo_url) await deletePublicPhoto(photo_url).catch(() => {});
      check(res);
      await refresh();
    }),
    // photoFile : nouvelle photo ; bike.photoUrl à null (sans fichier) : photo retirée ; sinon la photo est gardée
    updateBike: (bikeId, bike, photoFile = null) => attempt(async () => {
      const before = data.bikes.find((b) => b.id === bikeId);
      const photo_url = photoFile ? await uploadPhoto(me, photoFile)
        : bike.photoUrl === undefined ? before?.photo_url ?? null : bike.photoUrl || null;
      const row = { photo_url };
      if (bike.name !== undefined) row.name = bike.name.trim();
      if (bike.kind !== undefined) row.kind = bike.kind;
      if (bike.brand !== undefined) row.brand = (bike.brand || '').trim();
      const res = await supabase.from('bikes').update(row).eq('id', bikeId);
      if (res.error && photoFile) await deletePublicPhoto(photo_url).catch(() => {});
      check(res);
      if (before?.photo_url && before.photo_url !== photo_url) await deletePublicPhoto(before.photo_url).catch(() => {});
      await refresh();
    }),
    deleteBike: (bikeId) => attempt(async () => {
      const gone = data.bikes.find((b) => b.id === bikeId);
      check(await supabase.from('bikes').delete().eq('id', bikeId));
      if (gone?.photo_url) await deletePublicPhoto(gone.photo_url).catch(() => {});
      await refresh();
    }),

    // ----- Sorties -----
    // repeatWeeks > 1 : une sortie par semaine, reliées par la même série
    createRide: (w) => attempt(async () => {
      const weeks = Math.min(12, Math.max(1, Number(w.repeatWeeks) || 1));
      const seriesId = weeks > 1 ? crypto.randomUUID() : null;
      const rows = Array.from({ length: weeks }, (_, i) => ({
        ...rideColumns(w),
        host_id: me, starts_at: new Date(new Date(w.date).getTime() + i * 7 * 86400000).toISOString(), series_id: seriesId,
        ...(w.groupId ? { group_id: w.groupId } : {}),
      }));
      // une par une : le contrôle « 12 sorties par série » de la base voit les précédentes
      for (const row of rows) check(await supabase.from('rides').insert(row));
      await refresh();
    }),
    updateRide: (rideId, w) => attempt(async () => {
      const current = data.participants.filter((p) => p.ride_id === rideId).length;
      if (w.maxParticipants < current) {
        throw new Error(t('Il y a déjà {n} participants : le maximum ne peut pas être plus petit.', { n: current }));
      }
      check(await supabase.from('rides').update({
        ...rideColumns(w), starts_at: w.date,
        ...(w.groupId !== undefined ? { group_id: w.groupId || null } : {}),
      }).eq('id', rideId));
      await refresh();
    }),
    toggleJoinRide: (ride) => attempt(async () => {
      if (ride.participants.includes(me)) {
        check(await supabase.from('ride_participants').delete().match({ ride_id: ride.id, user_id: me }));
      } else {
        check(await supabase.from('ride_participants').insert({ ride_id: ride.id, user_id: me }));
      }
      await refresh();
    }),
    cancelRide: (rideId) => attempt(async () => {
      check(await supabase.from('rides').delete().eq('id', rideId));
      await refresh();
    }),
    // annule toutes les dates à venir d'une série
    cancelRideSeries: (seriesId, hostId = me) => attempt(async () => {
      check(await supabase.from('rides').delete().eq('series_id', seriesId).eq('host_id', hostId)
        .gte('starts_at', new Date().toISOString()));
      await refresh();
    }),
    // s'inscrire à toutes les dates à venir d'une série (sauf celles qui sont complètes)
    joinRideSeries: (seriesId) => attempt(async () => {
      const upcoming = rides.filter((x) => x.seriesId === seriesId && new Date(x.date) > new Date()
        && !x.participants.includes(me) && x.participants.length < x.maxParticipants);
      for (const x of upcoming) check(await supabase.from('ride_participants').insert({ ride_id: x.id, user_id: me }));
      await refresh();
    }),

    // ----- Fil d'actualité -----
    createPost: ({ scene, text, photoFile }) => attempt(async () => {
      const photo_url = photoFile ? await uploadPhoto(me, photoFile) : null;
      check(await supabase.from('posts').insert({ author_id: me, scene, body: text, photo_url }));
      await refresh();
    }),
    deletePost: (postId) => attempt(async () => {
      const photo = data.posts.find((p) => p.id === postId)?.photo_url;
      check(await supabase.from('posts').delete().eq('id', postId));
      if (photo) await deletePublicPhoto(photo).catch(() => {});
      await refresh();
    }),
    loadMorePosts: async () => {
      postLimit.current += POSTS_PAGE;
      await refresh();
    },
    toggleLike: (post) => attempt(async () => {
      if (post.likes.includes(me)) {
        check(await supabase.from('post_likes').delete().match({ post_id: post.id, user_id: me }));
      } else {
        check(await supabase.from('post_likes').insert({ post_id: post.id, user_id: me }));
      }
      await refresh();
    }),

    // ----- Messagerie -----
    // voice : message vocal enregistré ({ blob, seconds, ext, type }, voir lib/voice.js)
    sendMessage: (toId, text, photoFile, voice = null) => attempt(async () => {
      const photo_url = photoFile ? await uploadMessagePhoto(me, photoFile) : null;
      const audio_path = voice ? await uploadVoice(me, voice) : null;
      const msg = check(await supabase.from('messages')
        .insert({ sender_id: me, recipient_id: toId, body: text, photo_url, audio_path, audio_seconds: voice?.seconds ?? null }).select().single());
      setData((d) => (d.messages.some((m) => m.id === msg.id) ? d : { ...d, messages: [...d.messages, msg] }));
    }),
    // réaction à un message privé (même emoji une 2e fois : retirée)
    reactMessage: (messageId, emoji) => attempt(async () => {
      const col = (m) => (m.sender_id === me ? 'sender_reaction' : 'recipient_reaction');
      const msg = data.messages.find((m) => m.id === messageId);
      if (!msg) return;
      const next = msg[col(msg)] === emoji ? null : emoji;
      setData((d) => ({ ...d, messages: d.messages.map((m) => (m.id === messageId ? { ...m, [col(m)]: next } : m)) }));
      const { error } = await supabase.rpc('react_message', { p_id: messageId, p_emoji: next || '' });
      if (error) {
        setData((d) => ({ ...d, messages: d.messages.map((m) => (m.id === messageId ? { ...m, [col(m)]: msg[col(msg)] } : m)) }));
        check({ error });
      }
    }),
    // vocal reçu écouté : l'expéditeur voit « Écouté »
    markVoicePlayed: async (messageId) => {
      const now = new Date().toISOString();
      setData((d) => ({ ...d, messages: d.messages.map((m) => (m.id === messageId ? { ...m, audio_played_at: m.audio_played_at || now } : m)) }));
      await supabase.rpc('mark_voice_played', { p_id: messageId });
    },
    markRead: async (otherId) => {
      const unread = data.messages.some((m) => m.sender_id === otherId && m.recipient_id === me && !m.read_at);
      if (!unread) return;
      const now = new Date().toISOString();
      await supabase.from('messages').update({ read_at: now })
        .eq('sender_id', otherId).eq('recipient_id', me).is('read_at', null);
      setData((d) => ({
        ...d,
        messages: d.messages.map((m) => (m.sender_id === otherId && m.recipient_id === me && !m.read_at ? { ...m, read_at: now } : m)),
      }));
    },
    getConversation: (otherId) => data.messages
      .filter((m) => (m.sender_id === me && m.recipient_id === otherId) || (m.sender_id === otherId && m.recipient_id === me))
      .map((m) => ({
        id: m.id, from: m.sender_id, text: m.body, at: m.created_at, readAt: m.read_at,
        // réactions : la mienne et celle de l'autre
        myReaction: (m.sender_id === me ? m.sender_reaction : m.recipient_reaction) || null,
        theirReaction: (m.sender_id === me ? m.recipient_reaction : m.sender_reaction) || null,
        // anciennes photos : URL publique ; nouvelles : chemin privé → lien temporaire
        photoUrl: m.photo_url?.startsWith('http') ? m.photo_url : signedUrls[m.photo_url] || null,
        hasPhoto: !!m.photo_url,
        audioPath: m.audio_path || null, audioSeconds: m.audio_seconds || null, audioPlayedAt: m.audio_played_at || null,
      })),
    listConversations() {
      const byOther = new Map();
      for (const m of data.messages) {
        const other = m.sender_id === me ? m.recipient_id : m.sender_id;
        if (blockedIds.has(other)) continue;
        const entry = byOther.get(other) || { otherId: other, unread: 0 };
        entry.last = { text: m.body || (m.audio_path ? t('🎤 Message vocal') : t('📷 Photo')), at: m.created_at, from: m.sender_id, read: !!m.read_at };
        if (m.recipient_id === me && !m.read_at) entry.unread += 1;
        byOther.set(other, entry);
      }
      return [...byOther.values()].sort((a, b) => b.last.at.localeCompare(a.last.at));
    },

    // ----- Commentaires -----
    addComment: ({ postId, rideId, text }) => attempt(async () => {
      check(await supabase.from('comments').insert({
        author_id: me, post_id: postId || null, ride_id: rideId || null, body: text,
      }));
      await refresh();
    }),
    deleteComment: (commentId) => attempt(async () => {
      check(await supabase.from('comments').delete().eq('id', commentId));
      await refresh();
    }),

    // ----- Notifications -----
    markNotificationsRead: async () => {
      if (!data.notifications.some((n) => !n.read_at)) return;
      const now = new Date().toISOString();
      await supabase.from('notifications').update({ read_at: now }).eq('user_id', me).is('read_at', null);
      setData((d) => ({ ...d, notifications: d.notifications.map((n) => (n.read_at ? n : { ...n, read_at: now })) }));
    },
    async enableSystemNotifications() {
      if (typeof Notification === 'undefined') return t('Ton navigateur ne gère pas les notifications.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return t('Notifications refusées. Tu peux les autoriser dans les réglages du navigateur.');
      return subscribePush().catch(() => null); // le push est un bonus : son échec ne bloque pas
    },
    async disablePush() {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (!sub) return;
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    },
    pushStatus: async () => {
      if (!pushSupported()) return 'unsupported';
      const reg = await navigator.serviceWorker.getRegistration();
      return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
    },

    // ----- Forum -----
    forum: {
      async topics({ category, search } = {}) {
        let q = supabase.from('forum_topics').select('*')
          .order('pinned', { ascending: false }).order('last_reply_at', { ascending: false }).limit(60);
        if (category && category !== 'all') q = q.eq('category', category);
        const words = (search || '').trim().replace(/[%_,()]/g, '');
        if (words.length >= 2) q = q.or(`title.ilike.%${words}%,body.ilike.%${words}%`);
        const rows = check(await q);
        const missing = rows.map((r) => r.author_id).filter((id) => !data.profiles.some((x) => x.id === id));
        if (missing.length) { missing.forEach((id) => pinnedIds.current.add(id)); await refresh(); }
        return rows.filter((r) => !blockedIds.has(r.author_id));
      },
      async topic(id) {
        const [topic, replies] = await Promise.all([
          supabase.from('forum_topics').select('*').eq('id', id).maybeSingle().then(check),
          supabase.from('forum_replies').select('*').eq('topic_id', id).order('created_at').limit(500).then(check),
        ]);
        const people = [topic?.author_id, ...replies.map((r) => r.author_id)].filter((x) => x && !data.profiles.some((p) => p.id === x));
        if (people.length) { people.forEach((x) => pinnedIds.current.add(x)); await refresh(); }
        return { topic, replies: replies.filter((r) => !blockedIds.has(r.author_id)) };
      },
      createTopic: async ({ category, title, body }) => {
        const { data: row, error } = await supabase.from('forum_topics')
          .insert({ author_id: me, category, title: title.trim(), body: (body || '').trim() }).select().single();
        return error ? { error: frenchError(error) } : { id: row.id };
      },
      updateTopic: (id, patch) => attempt(async () => {
        check(await supabase.from('forum_topics').update(patch).eq('id', id));
      }),
      deleteTopic: (id) => attempt(async () => { check(await supabase.from('forum_topics').delete().eq('id', id)); }),
      reply: (topicId, body) => attempt(async () => {
        check(await supabase.from('forum_replies').insert({ topic_id: topicId, author_id: me, body: body.trim() }));
      }),
      updateReply: (id, body) => attempt(async () => {
        check(await supabase.from('forum_replies').update({ body: body.trim() }).eq('id', id));
      }),
      deleteReply: (id) => attempt(async () => { check(await supabase.from('forum_replies').delete().eq('id', id)); }),
    },

    // ----- Groupes / clubs -----
    // groupes visibles (les plus actifs d'abord, triés ensuite par distance dans la page) + mes adhésions
    async loadGroups({ search } = {}) {
      let q = supabase.from('groups').select('*').order('member_count', { ascending: false }).limit(200);
      const words = (search || '').trim().replace(/[%_,()]/g, '');
      if (words.length >= 2) q = q.or(`name.ilike.%${words}%,city.ilike.%${words}%,description.ilike.%${words}%`);
      const [rows, mine] = await Promise.all([
        q.then(check),
        supabase.from('group_members').select('group_id, role').eq('user_id', me).then(check),
      ]);
      const missing = words.length >= 2 ? [] : mine.map((m) => m.group_id).filter((id) => !rows.some((g) => g.id === id));
      const groups = [...rows, ...(await selectIn('groups', 'id', missing))];
      return {
        groups: groups.filter((g) => !blockedIds.has(g.owner_id)),
        memberships: Object.fromEntries(mine.map((m) => [m.group_id, m.role])),
      };
    },
    // groupes dont je suis membre (pour rattacher une sortie)
    async loadMyGroups() {
      const mine = check(await supabase.from('group_members').select('group_id').eq('user_id', me));
      return (await selectIn('groups', 'id', mine.map((m) => m.group_id))).sort((a, b) => a.name.localeCompare(b.name));
    },
    async loadGroup(id) {
      const [group, members, groupRides] = await Promise.all([
        supabase.from('groups').select('*').eq('id', id).maybeSingle().then(check),
        supabase.from('group_members').select('*').eq('group_id', id).order('joined_at').limit(500).then(check),
        supabase.from('rides').select('*').eq('group_id', id)
          .gte('starts_at', new Date(Date.now() - 3600_000).toISOString()).order('starts_at').limit(20).then(check),
      ]);
      const people = [group?.owner_id, ...members.map((m) => m.user_id), ...groupRides.map((w) => w.host_id)]
        .filter((x) => x && !data.profiles.some((p) => p.id === x));
      if (people.length) { people.forEach((x) => pinnedIds.current.add(x)); await refresh(); }
      return { group, members: members.filter((m) => !blockedIds.has(m.user_id)), rides: groupRides };
    },
    createGroup: async ({ name, description, emoji, city }) => {
      const { data: row, error } = await supabase.from('groups').insert({
        owner_id: me, name: name.trim(), description: (description || '').trim(), emoji: emoji || '🚴', city: (city || '').trim(),
      }).select().single();
      return error ? { error: frenchError(error) } : { id: row.id };
    },
    joinGroup: (groupId) => attempt(async () => {
      check(await supabase.from('group_members').insert({ group_id: groupId, user_id: me }));
    }),
    leaveGroup: (groupId) => attempt(async () => {
      check(await supabase.from('group_members').delete().match({ group_id: groupId, user_id: me }));
    }),
    updateGroup: (groupId, { name, description, emoji, city }) => attempt(async () => {
      check(await supabase.from('groups').update({
        name: name.trim(), description: (description || '').trim(), emoji: emoji || '🚴', city: (city || '').trim(),
      }).eq('id', groupId));
    }),
    deleteGroup: (groupId) => attempt(async () => {
      check(await supabase.from('groups').delete().eq('id', groupId));
      await refresh();
    }),
    // les 100 derniers messages du mur, du plus ancien au plus récent
    async loadGroupMessages(groupId) {
      const rows = check(await supabase.from('group_messages').select('*').eq('group_id', groupId)
        .order('created_at', { ascending: false }).limit(100));
      const people = rows.map((r) => r.author_id).filter((x) => !data.profiles.some((p) => p.id === x));
      if (people.length) { people.forEach((x) => pinnedIds.current.add(x)); await refresh(); }
      return rows.filter((r) => !blockedIds.has(r.author_id)).reverse();
    },
    sendGroupMessage: (groupId, body, photoFile) => attempt(async () => {
      const photo_url = photoFile ? await uploadPhoto(me, photoFile) : null;
      const { error } = await supabase.from('group_messages').insert({ group_id: groupId, author_id: me, body: body.trim(), photo_url });
      if (error) {
        if (photo_url) await deletePublicPhoto(photo_url).catch(() => {});
        check({ error });
      }
    }),
    // la photo est effacée aussi quand c'est la mienne
    deleteGroupMessage: (id, photoUrl, authorId) => attempt(async () => {
      check(await supabase.from('group_messages').delete().eq('id', id));
      if (photoUrl && authorId === me) await deletePublicPhoto(photoUrl).catch(() => {});
    }),
    // Mur en temps réel (seuls les membres reçoivent les messages, grâce aux règles RLS) ; renvoie la fonction d'arrêt.
    subscribeGroupMessages(groupId, onChange) {
      const channel = supabase
        .channel(`group:${groupId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_messages', filter: `group_id=eq.${groupId}` }, onChange)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    },

    // ----- Sorties suivies au GPS (distance, durée et vitesses seulement, jamais le tracé) -----
    tracks: {
      mine: async () => check(await supabase.from('ride_tracks').select('*').eq('user_id', me).order('started_at', { ascending: false }).limit(200)),
      // track : { startedAt, durationS, distanceM, rideId?, avgSpeed?, maxSpeed? } (vitesses en km/h)
      save: (track) => attempt(async () => {
        check(await supabase.from('ride_tracks').insert({
          user_id: me, ride_id: track.rideId || null, started_at: new Date(track.startedAt).toISOString(),
          duration_s: Math.round(track.durationS), distance_m: Math.round(track.distanceM),
          ...(track.avgSpeed != null && { avg_speed: numOrNull(track.avgSpeed) }),
          ...(track.maxSpeed != null && { max_speed: numOrNull(track.maxSpeed) }),
        }));
      }),
      remove: (id) => attempt(async () => { check(await supabase.from('ride_tracks').delete().eq('id', id)); }),
      // mes totaux : { count, km, hours }
      totals: async () => {
        const rows = check(await supabase.from('ride_tracks').select('distance_m, duration_s').eq('user_id', me).limit(5000)) || [];
        return {
          count: rows.length,
          km: Math.round(rows.reduce((n, r) => n + (r.distance_m || 0), 0) / 100) / 10,
          hours: Math.round(rows.reduce((n, r) => n + (r.duration_s || 0), 0) / 360) / 10,
        };
      },
    },

    // ----- Profil vérifié (vidéo filmée dans l'appli, contrôlée à la main) -----
    verification: {
      latest: async () => check(await supabase.from('profile_verifications').select('id, status, reason, created_at, decided_at')
        .eq('user_id', me).order('created_at', { ascending: false }).limit(1).maybeSingle()),
      start: async () => check(await supabase.rpc('start_verification')),
      submit: (id, video, signals) => attempt(async () => {
        const path = `${me}/${id}.${video.ext}`;
        const { error } = await supabase.storage.from('verifications').upload(path, video.blob, { contentType: video.type, upsert: true });
        if (error) throw error;
        check(await supabase.rpc('submit_verification', { p_id: id, p_path: path, p_signals: signals }));
      }),
      adminList: async () => check(await supabase.rpc('admin_verifications')) || [],
      videoUrl: async (path) => (await supabase.storage.from('verifications').createSignedUrl(path, 1800)).data?.signedUrl || null,
      // la vidéo est supprimée dès la décision
      decide: (id, approve, reason = '') => attempt(async () => {
        const path = check(await supabase.rpc('admin_decide_verification', { p_id: id, p_approve: approve, p_reason: reason }));
        if (path) await supabase.storage.from('verifications').remove([path]);
      }),
    },

    // ----- Parrainage -----
    referral: {
      stats: async (userId = null) => check(await supabase.rpc('referral_stats', userId ? { p_user: userId } : {})),
      neighbourhoods: async () => check(await supabase.rpc('top_neighbourhoods')) || [],
    },

    // ----- Dangers sur la route (nids-de-poule, travaux, gravillons…) -----
    hazards: {
      // alertes en cours autour de moi (≈ 50 km), avec mes votes
      async list() {
        let q = supabase.from('hazards').select('*').is('resolved_at', null).gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false }).limit(200);
        const c = currentUser?.coords;
        if (c) q = q.gte('lat', c.lat - NEARBY_DEG.lat).lte('lat', c.lat + NEARBY_DEG.lat).gte('lng', c.lng - NEARBY_DEG.lng).lte('lng', c.lng + NEARBY_DEG.lng);
        const { data: rows, error } = await q;
        if (error) return [];
        const ids = rows.map((r) => r.id);
        const { data: votes } = ids.length ? await supabase.from('hazard_votes').select('hazard_id, user_id, vote').in('hazard_id', ids) : { data: [] };
        const authors = rows.map((r) => r.author_id).filter((id) => !data.profiles.some((x) => x.id === id));
        if (authors.length) { authors.forEach((id) => pinnedIds.current.add(id)); await refresh(); }
        return rows.filter((r) => !blockedIds.has(r.author_id)).map((r) => {
          const rv = (votes || []).filter((v) => v.hazard_id === r.id);
          return { ...r, still: rv.filter((v) => v.vote === 'still').length, myVote: rv.find((v) => v.user_id === me)?.vote || null };
        });
      },
      save: (h, photoFile = null) => attempt(async () => {
        const photo_url = photoFile ? await uploadPhoto(me, photoFile) : null;
        const { error } = await supabase.from('hazards').insert({
          author_id: me, kind: h.kind, title: h.kind === 'autre' ? (h.title || '').trim() : '', description: (h.description || '').trim(), photo_url,
          place: h.place.trim(), lat: h.coords.lat, lng: h.coords.lng,
        });
        if (error) {
          if (photo_url) await deletePublicPhoto(photo_url).catch(() => {});
          check({ error });
        }
      }),
      // texte d'une alerte danger corrigé par l'administration
      update: (id, f) => attempt(async () => {
        check(await supabase.from('hazards').update({ title: f.kind === 'autre' ? (f.title || '').trim() : '', place: f.place.trim(), description: (f.description || '').trim() }).eq('id', id));
      }),
      vote: (id, vote) => attempt(async () => {
        const { error } = await supabase.rpc('vote_hazard', { p_id: id, p_vote: vote });
        check({ error });
      }),
      remove: (h) => attempt(async () => {
        check(await supabase.from('hazards').delete().eq('id', h.id));
        if (h.photo_url && h.author_id === me) await deletePublicPhoto(h.photo_url).catch(() => {});
      }),
    },

    // ----- Recommandations après une sortie -----
    reviews: {
      // sorties passées (30 jours) avec des participants que je n'ai pas encore recommandés
      async pending() {
        const mine = check(await supabase.from('ride_participants').select('ride_id').eq('user_id', me));
        if (!mine.length) return [];
        const now = new Date();
        const past = await selectIn('rides', 'id', mine.map((r) => r.ride_id), (q) => q
          .lt('starts_at', now.toISOString()).gte('starts_at', new Date(now - 30 * 86400000).toISOString()));
        if (!past.length) return [];
        const ids = past.map((w) => w.id);
        const [parts, done] = await Promise.all([
          selectIn('ride_participants', 'ride_id', ids),
          selectIn('ride_reviews', 'ride_id', ids, (q) => q.eq('reviewer_id', me)),
        ]);
        const others = [...new Set(parts.map((x) => x.user_id).filter((id) => id !== me))];
        others.forEach((id) => pinnedIds.current.add(id));
        if (others.some((id) => !data.profiles.some((x) => x.id === id))) await refresh();
        return past
          .map((w) => ({
            id: w.id, title: w.title, date: w.starts_at,
            people: parts.filter((x) => x.ride_id === w.id && x.user_id !== me
              && !done.some((d) => d.ride_id === w.id && d.reviewee_id === x.user_id)).map((x) => x.user_id),
          }))
          .filter((w) => w.people.length)
          .sort((a, b) => b.date.localeCompare(a.date));
      },
      give: (rideId, userId, comment) => attempt(async () => {
        check(await supabase.from('ride_reviews').insert({ ride_id: rideId, reviewer_id: me, reviewee_id: userId, comment: (comment || '').trim() }));
      }),
      async forUser(userId) {
        const { data: rows, count, error } = await supabase.from('ride_reviews').select('*', { count: 'exact' })
          .eq('reviewee_id', userId).order('created_at', { ascending: false }).limit(10);
        return { count: error ? 0 : count ?? rows.length, rows: error ? [] : rows };
      },
    },

    // ----- Niveaux -----
    achievements: async (userId) => check(await supabase.rpc('member_achievements', { p_user: userId })),
    leaderboard: async (days) => check(await supabase.rpc('xp_leaderboard', { p_days: days })),

    // ----- Recherche de membres (même loin de soi) -----
    async searchMembers(query) {
      const q = query.trim().replace(/[%_,()]/g, '');
      if (q.length < 2) return [];
      const { data: found, error } = await supabase.from('profiles').select('id').ilike('name', `%${q}%`).limit(20);
      if (error) return [];
      found.forEach((p) => pinnedIds.current.add(p.id));
      await refresh();
      return found.map((p) => p.id);
    },
    // S'assure qu'un profil est chargé (lien direct vers un membre éloigné).
    async ensureUser(userId) {
      if (!userId || pinnedIds.current.has(userId)) return;
      pinnedIds.current.add(userId);
      if (!data.profiles.some((p) => p.id === userId)) await refresh();
    },

    // ----- Abonnements -----
    follows: {
      follow: (userId) => attempt(async () => {
        check(await supabase.from('follows').insert({ follower_id: me, followee_id: userId }));
        setFollowing((s) => new Set([...s, userId]));
      }),
      unfollow: (userId) => attempt(async () => {
        check(await supabase.from('follows').delete().match({ follower_id: me, followee_id: userId }));
        setFollowing((s) => { const n = new Set(s); n.delete(userId); return n; });
      }),
      // retirer quelqu'un de mes abonnés
      removeFollower: (userId) => attempt(async () => {
        check(await supabase.from('follows').delete().match({ follower_id: userId, followee_id: me }));
      }),
      counts: async (userId) => check(await supabase.rpc('follow_counts', { p_user: userId })),
      list: async (userId, kind) => check(await supabase.rpc('follow_list', { p_user: userId, p_kind: kind })) || [],
      suggestions: async () => check(await supabase.rpc('follow_suggestions')) || [],
    },

    // ----- Administration (réservé aux admins, vérifié côté base) -----
    trackView: (page, visit) => { supabase.rpc('track_view', { p_page: page, p_visit: visit }).then(() => {}, () => {}); },

    admin: {
      stats: async () => check(await supabase.rpc('admin_stats')),
      memberDetails: async (userId) => {
        const [main, extra] = await Promise.all([
          supabase.rpc('admin_member_details', { target: userId }).then(check),
          supabase.rpc('admin_member_extra', { target: userId }).then((r) => (r.error ? {} : r.data)),
        ]);
        return { ...main, ...extra };
      },
      traffic: async (days) => check(await supabase.rpc('admin_traffic', { p_days: days })),
      searchStats: async () => check(await supabase.rpc('admin_search_stats')),
      errors: async () => check(await supabase.from('client_errors').select('*').order('last_at', { ascending: false }).limit(100)),
      feedback: async () => check(await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(200)),
      setFeedbackStatus: (id, status) => attempt(async () => { check(await supabase.from('feedback').update({ status }).eq('id', id)); }),
      deleteFeedback: (row) => attempt(async () => {
        check(await supabase.from('feedback').delete().eq('id', row.id));
        if (row.photo_url) await deletePublicPhoto(row.photo_url).catch(() => {});
      }),
      clearError: (id) => attempt(async () => { check(await supabase.from('client_errors').delete().eq('id', id)); }),
      members: async () => check(await supabase.rpc('admin_members')),
      reports: async () => check(await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(200)),
      // ----- modération (admin et modérateurs, vérifié en base) -----
      warn: (userId, reason) => attempt(async () => {
        check(await supabase.rpc('mod_warn_user', { target: userId, reason }));
      }),
      suspend: (userId, days, reason) => attempt(async () => {
        check(await supabase.rpc('mod_suspend_user', { target: userId, days, reason }));
      }),
      unsuspend: (userId) => attempt(async () => {
        check(await supabase.rpc('mod_unsuspend_user', { target: userId }));
      }),
      setHidden: (type, id, hidden) => attempt(async () => {
        check(await supabase.rpc('mod_set_hidden', { p_type: type, p_id: id, p_hidden: hidden }));
        await refresh();
      }),
      removeContent: (type, id, reason) => attempt(async () => {
        check(await supabase.rpc('mod_remove_content', { p_type: type, p_id: id, reason: reason || '' }));
        await refresh();
      }),
      resolve: (reportId, resolution) => attempt(async () => {
        check(await supabase.rpc('mod_resolve_report', { p_report: reportId, p_resolution: resolution || '' }));
      }),
      // le super administrateur corrige le profil d'un membre (nom, ville, présentation, photo)
      editProfile: (userId, patch) => attempt(async () => {
        const row = {};
        for (const k of ['name', 'city', 'bio']) if (k in patch) row[k] = patch[k];
        if (patch.removeAvatar) row.avatar_url = null;
        check(await supabase.from('profiles').update(row).eq('id', userId));
        await refresh();
      }),
      log: async () => check(await supabase.from('moderation_log').select('*').order('created_at', { ascending: false }).limit(200)),
      setModerator: (userId, makeModerator) => attempt(async () => {
        check(await supabase.rpc('admin_set_moderator', { target: userId, make_moderator: makeModerator }));
        await refresh();
      }),
      // suppression simple du compte (sans bloquer l'adresse e-mail) ; ses photos sont effacées aussi
      deleteUser: (userId, reason) => attempt(async () => {
        check(await supabase.rpc('admin_delete_user', { target: userId, reason: reason || '' }));
        await deleteMemberCloudPhotos(userId).catch(() => {});
        await refresh();
      }),
      banUser: (userId, reason) => attempt(async () => {
        check(await supabase.rpc('admin_ban_user', { target: userId, reason: reason || '' }));
        await refresh();
      }),
      bannedEmails: async () => check(await supabase.from('banned_emails').select('*').order('created_at', { ascending: false })),
      unbanEmail: (email) => attempt(async () => {
        check(await supabase.from('banned_emails').delete().eq('email', email));
      }),
    },

    // ----- Sécurité -----
    block: (userId) => attempt(async () => {
      check(await supabase.from('blocks').insert({ blocker_id: me, blocked_id: userId }));
      await refresh();
    }),
    unblock: (userId) => attempt(async () => {
      check(await supabase.from('blocks').delete().match({ blocker_id: me, blocked_id: userId }));
      await refresh();
    }),
    // target : { type: 'user' | 'post' | 'comment' | 'ride' | 'conversation', id?, userId }
    // L'auteur réel et une copie du contenu sont retrouvés par la base elle-même.
    // l'équipe retire une photo de profil signalée (et clôt le signalement)
    removeAvatar: (userId, reportId = null, photoUrl = null) => attempt(async () => {
      const url = photoUrl || data.profiles.find((p) => p.id === userId)?.avatar_url;
      check(await supabase.rpc('mod_remove_avatar', { p_user: userId, p_report: reportId }));
      // le fichier est effacé aussi (pas seulement retiré du profil)
      if (url) await deletePublicPhoto(url).catch(() => {});
      await refresh();
    }),
    // « Donner mon avis » : texte, capture facultative, page et appareil (lus par les administrateurs)
    sendFeedback: ({ kind, body, file, page }) => attempt(async () => {
      const photo_url = file ? await uploadPhoto(me, file) : null;
      const device = {
        ua: navigator.userAgent, screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`, lang: getLang(),
        standalone: String(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true),
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      };
      check(await supabase.from('feedback').insert({ user_id: me, kind, body: body.trim(), page: String(page || '').slice(0, 40), device, photo_url }));
    }),
    report: ({ type = 'user', id = null, userId }, category, reason) => attempt(async () => {
      check(await supabase.from('reports').insert({
        reporter_id: me, reported_id: userId, target_type: type, target_id: id,
        category: category || 'autre', reason: reason || '—',
      }));
    }),
  };

  const value = {
    session, authReady, recovering, dataReady, loadError, isAdmin, isStaff, isOwner, ownerId, staffRoles, suspension, toast,
    currentUser, users, getUser, rides, posts, hasMorePosts, comments, notifications, unreadNotifications,
    blockedIds, unreadCount, following, actions,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
