import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pause, Play, Square, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { rideType } from '../data/constants.js';
import {
  GOOD_ACCURACY_M, MAX_DISTANCE_M, MAX_DURATION_S, addPosition, averageSpeed, canKeepAwake, currentSpeed, elapsedS,
  formatDuration, formatKm, formatSpeed, keepAwake, loadTrack, newTrack, pauseTrack, resumeTrack, saveTrack, summary,
} from '../lib/tracker.js';
import { locale, t } from '../i18n/index.js';

const TrackMap = lazy(() => import('../components/TrackMap.jsx'));

// Sorties du jour auxquelles je participe (ou que j'organise) : le suivi peut y être rattaché.
function todaysRides(rides, me) {
  const now = Date.now();
  return rides
    .filter((w) => w.hostId === me || w.participants.includes(me))
    .filter((w) => {
      const start = new Date(w.date).getTime();
      const end = start + (Number(w.duration) || 120) * 60000;
      return start - 3 * 3600e3 < now && now < end + 6 * 3600e3;
    })
    .sort((a, b) => Math.abs(new Date(a.date) - now) - Math.abs(new Date(b.date) - now));
}

const Stat = ({ value, unit, label, big = false }) => (
  <div>
    <div className={`${big ? 'text-4xl text-teal-600' : 'text-2xl text-stone-800'} font-extrabold tabular-nums`}>
      {value}{unit && <span className="ml-0.5 text-sm font-semibold text-stone-500">{unit}</span>}
    </div>
    <div className="text-xs text-stone-500">{label}</div>
  </div>
);

// Suivre une sortie au GPS : distance, vitesses, durée et carte du parcours en direct.
export default function Tracker({ back }) {
  const { currentUser, actions, rides = [] } = useApp();
  const [track, setTrack] = useState(loadTrack);
  const [now, setNow] = useState(Date.now());
  const [gpsError, setGpsError] = useState(null);
  const [finished, setFinished] = useState(null); // résultat (summary) à enregistrer
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [history, setHistory] = useState(null);
  const [awake, setAwake] = useState(true);
  const today = todaysRides(rides, currentUser.id);
  const [rideId, setRideId] = useState(() => today[0]?.id || '');
  const watch = useRef(null);
  const lock = useRef(null);

  const reload = () => actions.tracks.mine().then(setHistory).catch(() => setHistory([]));
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPosition = (pos) => setTrack((tr) => {
    const next = tr && addPosition(tr, pos);
    if (next) saveTrack(next);
    return next;
  });

  // GPS et chrono pendant la sortie (reprend après un rechargement de la page)
  useEffect(() => {
    if (!track) return undefined;
    if (!navigator.geolocation) { setGpsError(t('Localisation indisponible sur cet appareil.')); return undefined; }
    watch.current = navigator.geolocation.watchPosition(
      (pos) => { setGpsError(null); onPosition(pos); },
      (err) => setGpsError(err.code === 1 ? t('Autorise la localisation pour suivre ta sortie.') : t('Signal GPS faible…')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // en plus du suivi continu : une demande toutes les 5 s (certains téléphones, dont l'iPhone,
    // espacent ou suspendent les mises à jour du suivi continu)
    const poll = setInterval(() => navigator.geolocation.getCurrentPosition(
      onPosition, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    ), 5000);
    const wake = () => keepAwake().then((l) => { lock.current = l; setAwake(!!l); });
    if (canKeepAwake()) wake(); else setAwake(false);
    // l'écran se rallume : on redemande à le garder allumé
    const onVisible = () => { if (document.visibilityState === 'visible' && canKeepAwake()) wake(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.geolocation.clearWatch(watch.current);
      clearInterval(tick);
      clearInterval(poll);
      lock.current?.release?.().catch(() => {});
      lock.current = null;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [!!track]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    const tr = newTrack(rideId || null);
    saveTrack(tr);
    setTrack(tr);
    setFinished(null);
    setError(null);
    setNotice(null);
  };
  const stop = (auto = null) => {
    const result = summary(track);
    saveTrack(null);
    setTrack(null);
    if (result.durationS < 60 || result.distanceM < 100) { setError(t('Sortie trop courte pour être enregistrée.')); return; }
    if (auto) setNotice(auto);
    setFinished(result);
  };
  const togglePause = () => setTrack((tr) => {
    const next = tr.paused ? resumeTrack(tr) : pauseTrack(tr);
    saveTrack(next);
    return next;
  });
  const cancel = () => {
    if (!window.confirm(t('Abandonner cette sortie sans l’enregistrer ?'))) return;
    saveTrack(null);
    setTrack(null);
  };
  const save = async () => {
    setSaving(true);
    const err = await actions.tracks.save(finished);
    setSaving(false);
    if (err) return setError(err);
    setFinished(null);
    setNotice(null);
    reload();
  };
  const remove = async (id) => {
    if (!window.confirm(t('Supprimer cette sortie de ton historique ?'))) return;
    const err = await actions.tracks.remove(id);
    if (err) setError(err); else reload();
  };

  const elapsed = elapsedS(track, now);
  // plafonds atteints (16 h, 400 km) : la sortie se termine toute seule
  useEffect(() => {
    if (!track || track.paused) return;
    if (elapsed >= MAX_DURATION_S) stop(t('Le suivi s’est arrêté tout seul après 16 h.'));
    else if (track.distance >= MAX_DISTANCE_M) stop(t('Le suivi s’est arrêté tout seul à 400 km.'));
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = rides.find((w) => w.id === (track?.rideId || finished?.rideId));
  const weekAgo = Date.now() - 7 * 86400e3;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const sum = (from) => (history || []).filter((h) => new Date(h.started_at) > from).reduce((s, h) => s + h.distance_m, 0);
  const rideTitle = (id) => rides.find((w) => w.id === id)?.title;

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('rides')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <h1 className="text-2xl font-extrabold text-stone-800">📍 {t('Suivre ma sortie')}</h1>

      {track ? (
        <section className={`card space-y-3 ring-2 ${track.paused ? 'ring-stone-300' : 'ring-teal-200'}`}>
          {chosen && <p className="text-sm font-semibold text-stone-600">{rideType(chosen.type).emoji} {chosen.title}</p>}
          <div className="grid grid-cols-2 gap-3 text-center">
            <Stat big value={formatKm(track.distance)} unit="km" label={t('distance')} />
            <Stat big value={formatDuration(elapsed)} label={track.paused ? `⏸️ ${t('en pause')}` : t('durée')} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={formatSpeed(currentSpeed(track, now))} unit="km/h" label={t('vitesse')} />
            <Stat value={formatSpeed(averageSpeed(track.distance, elapsed))} unit="km/h" label={t('moyenne')} />
            <Stat value={formatSpeed(track.maxSpeed)} unit="km/h" label={t('max')} />
          </div>
          <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-emerald-100" />}>
            <TrackMap segments={track.segments} center={currentUser.coords} fix={track.fix} />
          </Suspense>
          {track.paused
            ? <p className="text-sm font-semibold text-stone-600">⏸️ {t('En pause : la durée et la distance ne comptent plus. Appuie sur « Reprendre » pour repartir.')}</p>
            : <GpsStatus fix={track.fix} error={gpsError} received={track.received || 0} now={now} />}
          <p className="text-xs text-stone-500">
            {awake
              ? t('Garde cette page ouverte pendant la sortie : l’écran reste allumé.')
              : t('Ton navigateur ne peut pas garder l’écran allumé : règle la mise en veille de ton téléphone sur « jamais » pendant la sortie.')}
            {' '}{t('Ton parcours reste sur ton téléphone : seuls la distance, la durée et les vitesses sont enregistrées.')}
          </p>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 py-3 text-lg" onClick={togglePause}>
              {track.paused ? <><Play size={18} /> {t('Reprendre')}</> : <><Pause size={18} /> {t('Pause')}</>}
            </button>
            <button className="btn-primary flex-1 !bg-red-600 py-3 text-lg" onClick={() => stop()}><Square size={18} /> {t('Terminer')}</button>
            <button className="btn-ghost" onClick={cancel} aria-label={t('Abandonner')}><X size={18} /></button>
          </div>
        </section>
      ) : finished ? (
        <section className="card space-y-3 text-center ring-2 ring-green-200">
          <div className="text-4xl">🎉</div>
          {notice && <p className="text-sm text-stone-600">{notice}</p>}
          <p className="text-lg font-extrabold text-stone-800">
            {t('{km} km en {time}', { km: formatKm(finished.distanceM), time: formatDuration(finished.durationS) })}
          </p>
          <p className="text-sm text-stone-600">
            {t('Moyenne {avg} km/h · max {max} km/h', { avg: formatSpeed(finished.avgSpeed), max: formatSpeed(finished.maxSpeed) })}
          </p>
          {chosen && <p className="text-sm text-stone-500">{rideType(chosen.type).emoji} {chosen.title}</p>}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={save} disabled={saving}>{saving ? t('Enregistrement…') : t('Enregistrer la sortie')}</button>
            <button className="btn-ghost" onClick={() => { setFinished(null); setNotice(null); }}>{t('Ne pas enregistrer')}</button>
          </div>
        </section>
      ) : (
        <section className="card space-y-3 text-center">
          <div className="text-5xl">🚴</div>
          <p className="text-sm text-stone-600">{t('Lance le suivi au départ : distance, vitesse, durée et parcours en direct. Tu peux faire une pause à tout moment.')}</p>
          {today.length > 0 && (
            <label className="block text-left text-sm text-stone-600">
              {t('Sortie du jour')}
              <select className="input mt-1" value={rideId} onChange={(e) => setRideId(e.target.value)}>
                <option value="">{t('Aucune (sortie libre)')}</option>
                {today.map((w) => (
                  <option key={w.id} value={w.id}>
                    {rideType(w.type).emoji} {w.title} · {new Date(w.date).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="btn-primary w-full py-3 text-lg" onClick={start}><Play size={18} /> {t('Démarrer la sortie')}</button>
        </section>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {history?.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-lg font-bold text-stone-800">{t('Mes sorties suivies')}</h2>
            <span className="text-sm text-stone-500">
              {t('{km} km ces 7 derniers jours', { km: formatKm(sum(weekAgo)) })} · {t('{km} km ce mois-ci', { km: formatKm(sum(monthStart)) })}
            </span>
          </div>
          {history.slice(0, 30).map((h) => {
            const avg = h.avg_speed != null ? Number(h.avg_speed) : averageSpeed(h.distance_m, h.duration_s);
            const title = h.ride_id && rideTitle(h.ride_id);
            return (
              <div key={h.id} className="card flex items-center gap-3 !p-3 text-sm">
                <span className="min-w-0 flex-1 text-stone-600">
                  {new Date(h.started_at).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })}
                  {title && <span className="block truncate text-xs text-stone-500">{title}</span>}
                </span>
                <span className="font-bold text-stone-800">{formatKm(h.distance_m)} km</span>
                <span className="text-stone-500">{formatDuration(h.duration_s)}</span>
                <span className="text-stone-500">{formatSpeed(avg)} km/h</span>
                <button className="text-stone-400 hover:text-red-600" onClick={() => remove(h.id)} aria-label={t('Supprimer')}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

// état du signal : en attente, bon, ou trop imprécis (ordinateur, intérieur)
function GpsStatus({ fix, error, received, now }) {
  if (error && !fix) return <p className="text-sm font-semibold text-red-600">{error}</p>;
  if (!fix) return <p className="text-sm font-semibold text-stone-500">📡 {t('Recherche du signal GPS…')}</p>;
  const ago = Math.max(0, Math.round((now - fix.at) / 1000));
  // preuve que le suivi est en direct : dernière position reçue et nombre de positions
  const live = <span className="block text-xs font-normal text-stone-500">{t('Dernière position il y a {s} s · {n} positions reçues', { s: ago, n: received })}</span>;
  if (ago > 20) {
    return (
      <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-stone-700 ring-1 ring-emerald-200">
        ⏸️ <strong>{t('Plus de nouvelle position depuis {s} s.', { s: ago })}</strong>{' '}
        {t('Garde cette page ouverte et l’écran allumé : le téléphone coupe le GPS des sites quand l’écran est éteint ou l’appli en arrière-plan.')}
        {live}
      </p>
    );
  }
  if (fix.acc <= GOOD_ACCURACY_M) {
    return <p className="text-sm font-semibold text-green-700">✅ {t('Signal GPS bon (précision ± {m} m) : c’est parti !', { m: fix.acc })}{live}</p>;
  }
  return (
    <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-stone-700 ring-1 ring-emerald-200 dark:bg-stone-800">
      ⚠️ <strong>{t('Position trop imprécise (± {m} m) : la distance ne compte pas encore.', { m: fix.acc.toLocaleString(locale()) })}</strong>{' '}
      {t('Le suivi utilise le GPS du téléphone : lance-le sur ton téléphone, dehors, avec la localisation précise activée. Sur un ordinateur, la position vient du Wi-Fi et n’est pas assez précise.')}
      {live}
    </p>
  );
}
