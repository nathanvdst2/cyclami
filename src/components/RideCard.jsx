import { useEffect, useState } from 'react';
import { CalendarDays, Clock, MapPin, Pencil, Repeat, Trash2, Users } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { PACES } from '../data/constants.js';
import { distanceKm, formatDate, formatDistance } from '../utils/geo.js';
import UserAvatar from './UserAvatar.jsx';
import Comments from './Comments.jsx';
import RideChat from './RideChat.jsx';
import ShareButton from './ShareButton.jsx';
import DirectionsButton from './DirectionsButton.jsx';
import AddToCalendar from './AddToCalendar.jsx';
import RideForm from './RideForm.jsx';
import StaffBadge from './StaffBadge.jsx';
import { ModerationBar, ReportButton } from './ModerationTools.jsx';
import { t } from '../i18n/index.js';
import { weatherAt } from '../lib/weather.js';

// Prévision pour la sortie, chargée en arrière-plan (null tant qu'on ne sait pas)
function useWeather(coords, date) {
  const [meteo, setMeteo] = useState(null);
  const lat = coords?.lat;
  const lng = coords?.lng;
  useEffect(() => {
    let alive = true;
    setMeteo(null);
    if (lat == null || lng == null) return undefined;
    weatherAt(lat, lng, date).then((m) => { if (alive) setMeteo(m); }, () => {});
    return () => { alive = false; };
  }, [lat, lng, date]);
  return meteo;
}

export default function RideCard({ ride: w, go, highlight = false }) {
  const { currentUser, getUser, actions, rides, isAdmin } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const me = currentUser.id;
  const host = getUser(w.hostId);
  const isHost = w.hostId === me;
  const joined = w.participants.includes(me);
  const full = w.participants.length >= w.maxParticipants;
  const pace = PACES.find((p) => p.id === w.pace);
  const series = w.seriesId ? rides.filter((x) => x.seriesId === w.seriesId) : [];
  const seriesToJoin = series.filter((x) => !x.participants.includes(me) && x.participants.length < x.maxParticipants);
  const km = w.coords && currentUser.coords ? distanceKm(currentUser.coords, w.coords) : null;
  const meteo = useWeather(w.coords, w.date);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
  };

  if (editing) {
    return (
      <RideForm
        initial={w}
        center={w.coords || currentUser.coords}
        onClose={() => setEditing(false)}
        onSubmit={async (values) => {
          const err = await actions.updateRide(w.id, values);
          if (!err) setEditing(false);
          return err;
        }}
      />
    );
  }

  return (
    <article ref={(el) => highlight && el?.scrollIntoView?.({ block: 'center' })} className={`card space-y-3 ${highlight ? 'ring-2 ring-teal-400' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold text-stone-800">{w.title}</h2>
        <span className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{pace?.label}</span>
          {!isHost && <ReportButton type="ride" id={w.id} userId={w.hostId} size={14} />}
        </span>
      </div>
      <ModerationBar type="ride" id={w.id} hidden={w.hidden} isAuthor={isHost} />
      <div className="grid gap-1 text-sm text-stone-600">
        <span className="flex flex-wrap items-center gap-2">
          <CalendarDays size={14} /> {formatDate(w.date)}
          {meteo && (
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800" title={t('Météo prévue')}>
              {meteo.emoji} {meteo.temp}°{meteo.rain != null && ` · 💧 ${meteo.rain}%`}
            </span>
          )}
        </span>
        {meteo?.rain >= 60 && <span className="text-xs text-sky-700">{t('Pense au manteau de pluie 🧥')}</span>}
        {w.seriesId && (
          <span className="flex items-center gap-2 text-teal-700"><Repeat size={14} /> {t(series.length > 1 ? 'Chaque semaine · {n} dates à venir' : 'Chaque semaine · {n} date à venir', { n: series.length })}</span>
        )}
        <span className="flex items-center gap-2"><Clock size={14} /> {w.duration} min</span>
        <span className="flex items-center gap-2">
          <MapPin size={14} /> {w.place}{km != null && <span className="text-stone-400">· {formatDistance(km)}</span>}
          {w.coords && <DirectionsButton lat={w.coords.lat} lng={w.coords.lng} label={w.place} />}
        </span>
      </div>
      {w.description && <p className="whitespace-pre-line text-sm text-stone-600">{w.description}</p>}
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Users size={14} /> {w.participants.length}/{w.maxParticipants}
        <span className="flex -space-x-1">
          {w.participants.map((id) => {
            const u = getUser(id);
            return (
              <button key={id} title={u?.name} onClick={() => u && go('user', { userId: u.id })}>
                <UserAvatar user={u} size="sm" className="ring-2 ring-white" />
              </button>
            );
          })}
        </span>
        <span className="ml-auto text-xs">
          {t('par')}{' '}
          {isHost ? t('toi') : (
            <>
              <button className="font-semibold hover:text-teal-600" onClick={() => host && go('user', { userId: host.id })}>{host?.name}</button>
              {host && <StaffBadge userId={host.id} />}
            </>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(isHost || isAdmin) && (
          <button className="btn-ghost" onClick={() => setEditing(true)}>
            <Pencil size={16} /> {t('Modifier')}
          </button>
        )}
        {isHost ? (
          <button className="btn-ghost flex-1 text-red-600" disabled={busy}
            onClick={() => window.confirm(t('Annuler cette sortie ? Les participants seront prévenus.')) && run(() => actions.cancelRide(w.id))}>
            {t('Annuler la sortie')}
          </button>
        ) : (
          <button className={joined ? 'btn-ghost flex-1' : 'btn-primary flex-1'} disabled={busy || (!joined && full)}
            onClick={() => run(() => actions.toggleJoinRide(w))}>
            {joined ? t('Me désinscrire') : full ? t('Complet') : t('Je viens !')}
          </button>
        )}
        {isAdmin && !isHost && (
          <button className="btn-ghost text-red-600" disabled={busy} aria-label={t('Annuler la sortie')}
            onClick={() => window.confirm(t('Annuler cette sortie ? Les participants seront prévenus.')) && run(() => actions.cancelRide(w.id))}>
            <Trash2 size={16} />
          </button>
        )}
        {!isHost && seriesToJoin.length > 1 && (
          <button className="btn-ghost" disabled={busy} onClick={() => run(() => actions.joinRideSeries(w.seriesId))}>
            <Repeat size={16} /> {t('Toutes les semaines')}
          </button>
        )}
        {(isHost || joined) && <AddToCalendar ride={w} />}
        <ShareButton path={`/b/${w.id}`} label={false} title={w.title}
          text={t('Sortie « {title} » sur Cyclami — viens avec ton compagnon !', { title: w.title })} />
        {!isHost && host && (
          <button className="btn-ghost" onClick={() => go('messages', { userId: host.id, draft: t('Salut {name}, à propos de « {title} »… ', { name: host.name, title: w.title }) })}>
            {t('Contacter')}
          </button>
        )}
      </div>
      {(isHost || isAdmin) && series.length > 1 && (
        <button className="text-xs text-red-600 underline" disabled={busy}
          onClick={() => window.confirm(t('Annuler les {n} dates à venir de cette série ? Les participants seront prévenus.', { n: series.length })) && run(() => actions.cancelRideSeries(w.seriesId, w.hostId))}>
          {t('Annuler toute la série')}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {(isHost || joined) && new Date(w.date) > new Date(Date.now() - 2 * 86400000) && (
        <RideChat rideId={w.id} count={w.participants.length + (w.participants.includes(w.hostId) ? 0 : 1)} />
      )}
      <Comments rideId={w.id} go={go} />
    </article>
  );
}
