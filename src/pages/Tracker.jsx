import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Square, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import {
  GOOD_ACCURACY_M, addPosition, badgeFor, formatDuration, formatKm, keepAwake, loadTrack, newTrack, nextBadge, saveTrack,
} from '../lib/tracker.js';
import { locale, t } from '../i18n/index.js';

const TrackMap = lazy(() => import('../components/TrackMap.jsx'));

// Suivre une sortie au GPS : chrono, distance, carte du parcours ; kilomètres cumulés par animal et badges.
export default function Tracker({ back }) {
  const { currentUser, actions } = useApp();
  const [track, setTrack] = useState(loadTrack);
  const [now, setNow] = useState(Date.now());
  const [gpsError, setGpsError] = useState(null);
  const [finished, setFinished] = useState(null); // { distanceM, durationS, startedAt } à enregistrer
  const [petIds, setPetIds] = useState(() => currentUser.pets.map((p) => p.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(null);
  const [petKm, setPetKm] = useState({});
  const watch = useRef(null);
  const lock = useRef(null);

  const reload = () => {
    actions.tracks.mine().then(setHistory).catch(() => setHistory([]));
    actions.tracks.petKm(currentUser.pets.map((p) => p.id)).then(setPetKm).catch(() => {});
  };
  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS et chrono pendant la sortie (reprend après un rechargement de la page)
  useEffect(() => {
    if (!track) return undefined;
    if (!navigator.geolocation) { setGpsError(t('Localisation indisponible sur cet appareil.')); return undefined; }
    watch.current = navigator.geolocation.watchPosition(
      (pos) => { setGpsError(null); setTrack((tr) => { const next = tr && addPosition(tr, pos); if (next) saveTrack(next); return next; }); },
      (err) => setGpsError(err.code === 1 ? t('Autorise la localisation pour suivre ta sortie.') : t('Signal GPS faible…')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // en plus du suivi continu : une demande toutes les 5 s (certains téléphones, dont l'iPhone,
    // espacent ou suspendent les mises à jour du suivi continu)
    const poll = setInterval(() => navigator.geolocation.getCurrentPosition(
      (pos) => setTrack((tr) => { const next = tr && addPosition(tr, pos); if (next) saveTrack(next); return next; }),
      () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    ), 5000);
    keepAwake().then((l) => { lock.current = l; });
    // l'écran se rallume : on redemande à le garder allumé
    const onVisible = () => { if (document.visibilityState === 'visible') keepAwake().then((l) => { lock.current = l; }); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      navigator.geolocation.clearWatch(watch.current);
      clearInterval(tick);
      clearInterval(poll);
      lock.current?.release?.().catch(() => {});
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [!!track]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => { const tr = newTrack(); saveTrack(tr); setTrack(tr); setFinished(null); setError(null); };
  const stop = () => {
    const durationS = (Date.now() - track.startedAt) / 1000;
    const result = { distanceM: track.distance, durationS, startedAt: track.startedAt };
    saveTrack(null);
    setTrack(null);
    if (durationS < 60 || track.distance < 50) { setError(t('Sortie trop courte pour être enregistrée.')); return; }
    setFinished(result);
  };
  const cancel = () => {
    if (!window.confirm(t('Abandonner cette sortie sans l’enregistrer ?'))) return;
    saveTrack(null);
    setTrack(null);
  };
  const save = async () => {
    setSaving(true);
    // vitesse plausible pour une sortie : le reste vient d'un GPS qui a sauté
    const distanceM = Math.min(finished.distanceM, finished.durationS * 4.2, 50000);
    const err = await actions.tracks.save({ ...finished, distanceM, durationS: Math.min(finished.durationS, 6 * 3600), petIds });
    setSaving(false);
    if (err) return setError(err);
    setFinished(null);
    reload();
  };
  const remove = async (id) => {
    if (!window.confirm(t('Supprimer cette sortie de ton historique ?'))) return;
    const err = await actions.tracks.remove(id);
    if (err) setError(err); else reload();
  };

  const elapsed = track ? Math.max(0, (now - track.startedAt) / 1000) : 0;
  const pace = track && track.distance > 100 ? elapsed / (track.distance / 1000) : null; // secondes par km
  const weekAgo = Date.now() - 7 * 86400e3;
  const weekKm = (history || []).filter((h) => new Date(h.started_at) > weekAgo).reduce((s, h) => s + h.distance_m, 0);

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('discover')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <h1 className="text-2xl font-extrabold text-stone-800">📍 {t('Suivre ma sortie')}</h1>

      {track ? (
        <section className="card space-y-3 ring-2 ring-teal-200">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="text-3xl font-extrabold tabular-nums text-teal-600">{formatKm(track.distance)}</div><div className="text-xs text-stone-500">km</div></div>
            <div><div className="text-3xl font-extrabold tabular-nums text-stone-800">{formatDuration(elapsed)}</div><div className="text-xs text-stone-500">{t('durée')}</div></div>
            <div><div className="text-3xl font-extrabold tabular-nums text-stone-800">{pace ? formatDuration(pace) : '–'}</div><div className="text-xs text-stone-500">{t('min / km')}</div></div>
          </div>
          <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-emerald-100" />}>
            <TrackMap points={track.points} center={currentUser.coords} fix={track.fix} />
          </Suspense>
          <GpsStatus fix={track.fix} error={gpsError} received={track.received || 0} now={now} />
          <p className="text-xs text-stone-500">{t('Garde cette page ouverte pendant la sortie : l’écran reste allumé. Ton parcours reste sur ton téléphone, seuls la distance et la durée sont enregistrées.')}</p>
          <div className="flex gap-2">
            <button className="btn-primary flex-1 !bg-red-600 py-3 text-lg" onClick={stop}><Square size={18} /> {t('Terminer')}</button>
            <button className="btn-ghost" onClick={cancel} aria-label={t('Abandonner')}><X size={18} /></button>
          </div>
        </section>
      ) : finished ? (
        <section className="card space-y-3 text-center ring-2 ring-green-200">
          <div className="text-4xl">🎉</div>
          <p className="text-lg font-extrabold text-stone-800">
            {t('{km} km en {time}', { km: formatKm(finished.distanceM), time: formatDuration(finished.durationS) })}
          </p>
          {currentUser.pets.length > 0 && (
            <div className="space-y-1 text-left">
              <p className="text-sm font-semibold text-stone-600">{t('Avec qui ?')}</p>
              <div className="flex flex-wrap gap-2">
                {currentUser.pets.map((p) => (
                  <button key={p.id} type="button" aria-pressed={petIds.includes(p.id)}
                    onClick={() => setPetIds((ids) => (ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}
                    className={`chip ${petIds.includes(p.id) ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
                    {p.emoji} {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={save} disabled={saving}>{saving ? t('Enregistrement…') : t('Enregistrer la sortie')}</button>
            <button className="btn-ghost" onClick={() => setFinished(null)}>{t('Ne pas enregistrer')}</button>
          </div>
        </section>
      ) : (
        <section className="card space-y-3 text-center">
          <div className="text-5xl">🐕‍🦺</div>
          <p className="text-sm text-stone-600">{t('Lance le suivi au départ : distance, durée et parcours en direct. Les kilomètres s’ajoutent au compteur de ton animal.')}</p>
          <button className="btn-primary w-full py-3 text-lg" onClick={start}><Play size={18} /> {t('Démarrer la sortie')}</button>
        </section>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {currentUser.pets.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-stone-800">{t('Compteur de kilomètres')}</h2>
          {currentUser.pets.map((p) => {
            const km = Number(petKm[p.id] || 0);
            const badge = badgeFor(km);
            const next = nextBadge(km);
            const prevKm = badge?.km || 0;
            return (
              <div key={p.id} className="card space-y-2 !p-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{p.emoji}</span>
                  <span className="flex-1 font-bold text-stone-800">{p.name}</span>
                  <span className="text-lg font-extrabold text-teal-600">{km.toLocaleString(locale())} km</span>
                  {badge && <span className="text-2xl" title={t('Badge {km} km', { km: badge.km })}>{badge.emoji}</span>}
                </div>
                {next && (
                  <>
                    <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.min(100, ((km - prevKm) / (next.km - prevKm)) * 100)}%` }} />
                    </div>
                    <p className="text-xs text-stone-500">{t('Encore {km} km pour le badge {emoji} {target} km', { km: (next.km - km).toLocaleString(locale(), { maximumFractionDigits: 1 }), emoji: next.emoji, target: next.km })}</p>
                  </>
                )}
              </div>
            );
          })}
        </section>
      )}

      {history?.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold text-stone-800">{t('Mes sorties')}</h2>
            <span className="text-sm text-stone-500">{t('{km} km ces 7 derniers jours', { km: formatKm(weekKm) })}</span>
          </div>
          {history.slice(0, 20).map((h) => (
            <div key={h.id} className="card flex items-center gap-3 !p-3 text-sm">
              <span className="flex-1 text-stone-600">{new Date(h.started_at).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="font-bold text-stone-800">{formatKm(h.distance_m)} km</span>
              <span className="text-stone-500">{formatDuration(h.duration_s)}</span>
              <span>{h.pet_ids.map((id) => currentUser.pets.find((p) => p.id === id)?.emoji).filter(Boolean).join('')}</span>
              <button className="text-stone-400 hover:text-red-600" onClick={() => remove(h.id)} aria-label={t('Supprimer')}><Trash2 size={14} /></button>
            </div>
          ))}
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
