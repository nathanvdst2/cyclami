import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { STANDALONE_NOTIFICATIONS, useApp } from '../context/AppContext.jsx';
import { timeAgo } from '../utils/geo.js';
import UserAvatar from '../components/UserAvatar.jsx';
import { t } from '../i18n/index.js';
import { EmptyState } from '../components/Illustration.jsx';
import { illu } from '../lib/illustrations.js';

const ICONS = {
  ride_join: '🚴', ride_cancelled: '❌', ride_updated: '✏️', comment: '💬', like: '❤️',
  warning: '⚠️', suspended: '🚫', report_resolved: '✅', content_removed: '🗑️',
  review: '👍', forum_reply: '💬', group_ride: '👥', group_message: '👥', shelter_reply: '💌', lost_pet: '🚨', pet_found: '🎉', sitting_request: '🏠', sitting_answer: '🏠', health_reminder: '💉',
  pet_birthday: '🎂', ride_message: '🗨️', shelter_need: '🙏', shelter_event: '📅', shelter_status: '🏠', sitting_rate: '⭐', trusted_sitter: '🏅', sitting_review: '⭐', follow: '➕', feedback: '💬', chat_mention: '💬', ride_reminder: '⏰', member_nearby: '👋', hazard: '⚠️', referral: '🎉', verification: '🛡️',
};

// Notifications illustrées par le chien et le chat (au lieu d'un emoji)
const ILLUSTRATED = { pet_birthday: 'anniversaire', pet_found: 'retrouve', lost_pet: 'animal-perdu' };

export default function Notifications({ go }) {
  const { notifications, getUser, actions, currentUser } = useApp();
  // on garde en mémoire ce qui était non lu à l'ouverture, pour le mettre en évidence
  const [unreadAtOpen] = useState(() => new Set(notifications.filter((n) => !n.read).map((n) => n.id)));
  const [permission, setPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    actions.markNotificationsRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications.length]);

  const [push, setPush] = useState(null); // 'on' | 'off' | 'unsupported'
  useEffect(() => { actions.pushStatus().then(setPush).catch(() => setPush('unsupported')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enable = async () => {
    const err = await actions.enableSystemNotifications();
    setMsg(err);
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    actions.pushStatus().then(setPush).catch(() => {});
  };
  const disable = async () => {
    await actions.disablePush().catch(() => {});
    actions.pushStatus().then(setPush).catch(() => {});
  };

  const open = (n) => {
    if (n.type === 'shelter_reply') go('admin', { tab: 'shelters', thread: n.data?.email });
    else if (n.type === 'lost_pet' || n.type === 'pet_found') go('lost');
    else if (n.type === 'shelter_need') go('listings');
    else if (n.type === 'shelter_status') go('listings');
    else if (n.type === 'sitting_rate') go('sitting');
    else if (n.type === 'trusted_sitter') go('user', { userId: currentUser.id });
    else if (n.type === 'shelter_event') go(n.data?.shelter_id ? 'refuge' : 'listings', n.data?.shelter_id ? { shelterId: n.data.shelter_id } : {});
    else if (n.type === 'health_reminder' || n.type === 'pet_birthday') go('profile');
    else if (n.type === 'ride_message') go('rides', { rideId: n.rideId, chat: true });
    else if (n.type === 'feedback') go('admin', { tab: 'feedback' });
    else if (n.type === 'chat_mention') go('chat');
    else if (n.type === 'verification') go('verify');
    else if (n.type === 'hazard') go('hazards', { hazardId: n.data?.hazard_id });
    else if (n.type === 'ride_reminder' && n.rideId) go('rides', { rideId: n.rideId });
    else if (n.type === 'member_nearby' && n.actorId) go('user', { userId: n.actorId });
    else if (n.type === 'forum_reply' && n.data?.topic_id) go('forum', { topicId: n.data.topic_id });
    else if ((n.type === 'group_ride' || n.type === 'group_message') && n.data?.group_id) go('groups', { groupId: n.data.group_id });
    else if (n.type === 'sitting_request' || n.type === 'sitting_answer') go('sitting');
    else if (n.type === 'sitting_review') go('sitting');
    else if (n.rideId && n.type !== 'ride_cancelled') go('rides');
    else if (n.postId) go('feed');
    else if (n.actorId) go('user', { userId: n.actorId });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-stone-800">{t('Notifications')}</h1>

      {permission === 'default' && (
        <div className="card flex items-center gap-3 text-sm text-stone-600">
          <BellRing className="shrink-0 text-teal-500" />
          <span className="flex-1">{t('Reçois une alerte pour les nouveaux messages et les inscriptions à tes sorties.')}</span>
          <button className="btn-primary" onClick={enable}>{t('Activer')}</button>
        </div>
      )}
      {permission === 'granted' && push === 'off' && (
        <div className="card flex items-center gap-3 text-sm text-stone-600">
          <BellRing className="shrink-0 text-teal-500" />
          <span className="flex-1">{t('Reçois aussi les alertes sur cet appareil quand Cyclami est fermé.')}</span>
          <button className="btn-primary" onClick={enable}>{t('Activer')}</button>
        </div>
      )}
      {push === 'on' && (
        <p className="flex items-center gap-2 text-xs text-stone-500">
          📱 {t('Notifications activées sur cet appareil.')}
          <button className="underline" onClick={disable}>{t('Désactiver')}</button>
        </p>
      )}
      {push === 'unsupported' && permission !== 'denied' && /iPhone|iPad/.test(navigator.userAgent) && (
        <p className="text-xs text-stone-500">📱 {t('Sur iPhone : ajoute Cyclami à l’écran d’accueil (Partager → « Sur l’écran d’accueil ») pour recevoir les notifications.')}</p>
      )}
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      {notifications.length === 0 && (
        <EmptyState name="notifications-vide">{t('Rien de neuf pour l’instant')}</EmptyState>
      )}

      <div className="space-y-2">
        {notifications.map((n) => {
          const actor = n.actorId && !STANDALONE_NOTIFICATIONS.has(n.type) ? getUser(n.actorId) : null;
          return (
            <button key={n.id} onClick={() => open(n)}
              className={`card flex w-full items-center gap-3 text-left ${unreadAtOpen.has(n.id) ? 'ring-2 ring-teal-200' : ''}`}>
              {actor ? <UserAvatar user={actor} size="md" /> : (
                ILLUSTRATED[n.type]
                  ? <img src={illu(ILLUSTRATED[n.type])} alt="" className="h-12 w-12 shrink-0 object-contain" />
                  : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl">{ICONS[n.type]}</span>
              )}
              <span className="min-w-0 flex-1 text-sm text-stone-700">
                {actor && <strong>{actor.name} </strong>}
                {n.text}
                <span className="block text-xs text-stone-400">{ICONS[n.type]} {timeAgo(n.createdAt)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
