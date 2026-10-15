import { lazy, Suspense, useState } from 'react';
import { CalendarDays, Clock, Download, Map as MapIcon, MapPin, Pencil, Repeat, Trash2, Users } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { levelInfo, rideType } from '../data/constants.js';
import { distanceKm, formatDate, formatDistance } from '../utils/geo.js';
import UserAvatar from './UserAvatar.jsx';
import Comments from './Comments.jsx';
import RideChat from './RideChat.jsx';
import ShareButton from './ShareButton.jsx';
import DirectionsButton from './DirectionsButton.jsx';
import AddToCalendar from './AddToCalendar.jsx';
import RideForm from './RideForm.jsx';
import StaffBadge from './StaffBadge.jsx';
import WeatherBadge from './WeatherBadge.jsx';
import { ModerationBar, ReportButton } from './ModerationTools.jsx';
import { locale, t } from '../i18n/index.js';
import { downloadGpx } from '../lib/gpx.js';

const RouteMap = lazy(() => import('./RouteMap.jsx'));

const num = (x, digits = 1) => Number(x).toLocaleString(locale(), { maximumFractionDigits: digits });
// 150 → « 2 h 30 », 45 → « 45 min »
export const formatRideDuration = (min) => {
  const m = Math.round(Number(min) || 0);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
};

// Fiche technique d'une sortie : type, niveau, vitesse, distance, dénivelé, pas de lâchage
export function RideStats({ ride: w, className = '' }) {
  const type = rideType(w.type);
  const level = levelInfo(w.level);
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-xs font-semibold ${className}`}>
      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-800 ring-1 ring-teal-200">{type.emoji} {type.label}</span>
      {level && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800" title={level.speed}>{level.emoji} {level.label}</span>}
      {w.avgSpeed != null && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700" title={t('Vitesse moyenne prévue')}>⚡ {num(w.avgSpeed)} km/h</span>}
      {w.distanceKm != null && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700" title={t('Distance')}>📏 {num(w.distanceKm)} km</span>}
      {w.elevationM != null && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700" title={t('Dénivelé positif')}>⛰️ {num(w.elevationM, 0)} m D+</span>}
      {w.noDrop && <span className="rounded-full bg-teal-500 px-2 py-0.5 text-white" title={t('Le groupe attend tout le monde.')}>🤝 {t('Pas de lâchage')}</span>}
    </div>
  );
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
  const [showRoute, setShowRoute] = useState(highlight);
  const series = w.seriesId ? rides.filter((x) => x.seriesId === w.seriesId) : [];
  const seriesToJoin = series.filter((x) => !x.participants.includes(me) && x.participants.length < x.maxParticipants);
  const km = w.coords && currentUser.coords ? distanceKm(currentUser.coords, w.coords) : null;

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
        <h2 className="font-bold text-stone-800">{rideType(w.type).emoji} {w.title}</h2>
        {!isHost && <span className="shrink-0"><ReportButton type="ride" id={w.id} userId={w.hostId} size={14} /></span>}
      </div>
      <RideStats ride={w} />
      <ModerationBar type="ride" id={w.id} hidden={w.hidden} isAuthor={isHost} />
      <div className="grid gap-1 text-sm text-stone-600">
        <span className="flex flex-wrap items-center gap-2">
          <CalendarDays size={14} /> {formatDate(w.date)}
          <WeatherBadge coords={w.coords || (w.route?.length ? { lat: w.route[0][0], lng: w.route[0][1] } : null)} date={w.date} />
        </span>
        {w.seriesId && (
          <span className="flex items-center gap-2 text-teal-700"><Repeat size={14} /> {t(series.length > 1 ? 'Chaque semaine · {n} dates à venir' : 'Chaque semaine · {n} date à venir', { n: series.length })}</span>
        )}
        <span className="flex items-center gap-2"><Clock size={14} /> {t('environ {d}', { d: formatRideDuration(w.duration) })}</span>
        <span className="flex items-center gap-2">
          <MapPin size={14} /> {w.place}{km != null && <span className="text-stone-400">· {formatDistance(km)}</span>}
          {w.coords && <DirectionsButton lat={w.coords.lat} lng={w.coords.lng} label={w.place} />}
        </span>
      </div>
      {w.description && <p className="whitespace-pre-line text-sm text-stone-600">{w.description}</p>}
      {w.route?.length >= 2 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShowRoute((v) => !v)} aria-expanded={showRoute}>
              <MapIcon size={16} /> {showRoute ? t('Masquer le tracé') : t('Voir le tracé')}
            </button>
            <button type="button" className="btn-ghost" onClick={() => downloadGpx(w.route, w.title)}>
              <Download size={16} /> {t('Télécharger le GPX')}
            </button>
          </div>
          {showRoute && (
            <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-emerald-100" />}>
              <RouteMap route={w.route} start={w.coords} />
            </Suspense>
          )}
        </div>
      )}
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
          text={t('Sortie vélo « {title} » sur Cyclami : viens rouler avec nous !', { title: w.title })} />
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
