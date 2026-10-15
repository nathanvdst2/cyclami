import { useEffect, useState } from 'react';
import { ArrowLeft, Footprints, MessageCircle } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { compatibility, distanceKm, formatDistance } from '../utils/geo.js';
import UserAvatar from '../components/UserAvatar.jsx';
import AvatarPicker from '../components/AvatarPicker.jsx';
import PetBadge from '../components/PetBadge.jsx';
import PetPhotos from '../components/PetPhotos.jsx';
import PostCard from '../components/PostCard.jsx';
import UserActions from '../components/UserActions.jsx';
import RideCard from '../components/RideCard.jsx';
import LevelCard from '../components/LevelCard.jsx';
import { Recommendations } from '../components/Reviews.jsx';
import LevelBadge from '../components/LevelBadge.jsx';
import StaffBadge from '../components/StaffBadge.jsx';
import PioneerBadge from '../components/PioneerBadge.jsx';
import AmbassadorBadge from '../components/AmbassadorBadge.jsx';
import VerifiedBadge from '../components/VerifiedBadge.jsx';
import { t, locale } from '../i18n/index.js';
import Presence, { OnlineDot } from '../components/Presence.jsx';
import AdminMemberPanel, { AdminProfileEdit } from '../components/AdminMemberPanel.jsx';
import FollowButton from '../components/FollowButton.jsx';

// Profil public d'un membre : ses animaux, ses sorties à venir et ses publications.
export default function UserProfile({ go, back, params }) {
  const { currentUser, getUser, rides, posts, blockedIds, actions, isAdmin } = useApp();
  const user = getUser(params.userId);
  const [loading, setLoading] = useState(!user);

  // Membre éloigné, pas encore chargé : on va le chercher.
  useEffect(() => {
    if (user) return;
    actions.ensureUser(params.userId).finally(() => setLoading(false));
  }, [params.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user && loading) return <div className="card h-40 animate-pulse" />;

  if (!user || blockedIds.has(user.id)) {
    return (
      <div className="card space-y-3 text-center text-stone-500">
        <p>{t('Ce profil n’est pas disponible.')}</p>
        <button className="btn-ghost" onClick={() => go('discover')}>{t('Retour')}</button>
      </div>
    );
  }

  const isMe = user.id === currentUser.id;
  const km = !isMe && user.coords && currentUser.coords ? distanceKm(currentUser.coords, user.coords) : null;
  const score = isMe ? null : Math.max(0, ...user.pets.map((p) => compatibility(currentUser.pets[0], p)));
  const userRides = rides
    .filter((w) => w.participants.includes(user.id) && new Date(w.date).getTime() > Date.now() - 3600_000)
    .sort((a, b) => a.date.localeCompare(b.date));
  const userPosts = posts.filter((p) => p.authorId === user.id);
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(locale(), { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="space-y-4">
      <button onClick={() => back('discover')}
        className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>

      <section className="card space-y-3">
        <div className="flex items-start gap-3">
          <span className="relative shrink-0">
            {isMe ? <AvatarPicker className="!h-20 !w-20 !text-4xl" />
              : <UserAvatar user={user} size="lg" className="!h-20 !w-20 !text-4xl" />}
            {!isMe && <OnlineDot lastSeen={user.lastSeen} className="!h-4 !w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-stone-800">{user.name}<StaffBadge userId={user.id} className="text-xs" /><LevelBadge xp={user.xp} className="text-xs" /></h1>
            <p className="text-sm text-stone-500">
              {user.city}{km != null && ` · ${t('à {distance}', { distance: formatDistance(km) })}`}
            </p>
            <Presence lastSeen={user.lastSeen} className="block" />
            {memberSince && <p className="text-xs text-stone-400">{t('Membre depuis {date}', { date: memberSince })}</p>}
            <PioneerBadge userId={user.id} />
            <AmbassadorBadge userId={user.id} />
            <VerifiedBadge user={user} />
          </div>
          {!isMe && <UserActions user={user} onBlocked={() => go('discover')} />}
        </div>
        {score != null && user.pets.length > 0 && currentUser.pets[0] && (
          <p className="text-sm font-semibold text-green-700">{t('{score}% compatible avec {name}', { score, name: currentUser.pets[0].name })}</p>
        )}
        <FollowStats userId={user.id} go={go} isMe={isMe} />
        {user.bio && <p className="whitespace-pre-line text-stone-700">{user.bio}</p>}
        {user.availability.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {user.availability.map((a) => (
              <span key={a} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{t(a)}</span>
            ))}
          </div>
        )}
        {isAdmin && !isMe && <AdminMemberPanel key={user.id} userId={user.id} />}
        {isAdmin && !isMe && <AdminProfileEdit key={`edit-${user.id}`} user={user} />}
        {isMe ? (
          <button className="btn-ghost w-full" onClick={() => go('profile')}>{t('Modifier mon profil')}</button>
        ) : (
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => go('messages', {
              userId: user.id,
              draft: t('Salut {name} ! Ça te dirait une sortie entre {myPet} et {pets} ? 🚴', {
                name: user.name, myPet: currentUser.pets[0]?.name || t('mon animal'), pets: user.pets.map((p) => p.name).join(' & '),
              }),
            })}>
              <Footprints size={16} /> {t('Proposer une sortie')}
            </button>
            <button className="btn-ghost" onClick={() => go('messages', { userId: user.id })} aria-label={t('Message')}>
              <MessageCircle size={16} />
            </button>
          </div>
        )}
      </section>

      <LevelCard user={user} go={go} mine={isMe} />
      <Recommendations userId={user.id} go={go} />

      <h2 className="text-lg font-bold text-stone-800">{user.pets.length > 1 ? t('Ses animaux') : t('Son animal')}</h2>
      {user.pets.map((p) => (
        <div key={p.id} className="card">
          <PetPhotos pet={p} onOpen={() => go('animal', { petId: p.id, userId: user.id })} />
          <button type="button" className="block w-full text-left" onClick={() => go('animal', { petId: p.id, userId: user.id })}>
            <PetBadge pet={p} />
          </button>
        </div>
      ))}

      {userRides.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-stone-800">{t('Sorties à venir')}</h2>
          {userRides.map((w) => <RideCard key={w.id} ride={w} go={go} />)}
        </>
      )}

      {userPosts.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-stone-800">{t('Publications')}</h2>
          {userPosts.map((p) => <PostCard key={p.id} post={p} go={go} />)}
        </>
      )}
    </div>
  );
}

// Abonnés / abonnements (comme sur Instagram) et bouton « S'abonner »
function FollowStats({ userId, go, isMe }) {
  const { actions } = useApp();
  const [c, setC] = useState(null);
  const load = () => actions.follows.counts(userId).then(setC).catch(() => setC(null));
  useEffect(() => { load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button className="text-sm text-stone-600" onClick={() => go('follows', { userId, tab: 'followers' })}>
        <strong className="text-stone-800">{c?.followers ?? '…'}</strong> {t('abonnés')}
      </button>
      <button className="text-sm text-stone-600" onClick={() => go('follows', { userId, tab: 'following' })}>
        <strong className="text-stone-800">{c?.following ?? '…'}</strong> {t('abonnements')}
      </button>
      {!isMe && c?.follows_me && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{t('Te suit')}</span>}
      {!isMe && <span className="ml-auto"><FollowButton userId={userId} followsMe={c?.follows_me} small onChange={load} locked={!!c?.owner} /></span>}
    </div>
  );
}
