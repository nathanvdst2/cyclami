import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { DISCIPLINES, bikeKind, levelInfo } from '../data/constants.js';
import { locale, t } from '../i18n/index.js';

// Pastilles du profil cycliste : niveau, vitesse moyenne habituelle et disciplines.
// compact : une seule ligne (listes), sinon des pastilles (profil).
export function RiderChips({ user, compact = false, className = '' }) {
  if (!user) return null;
  const level = levelInfo(user.level);
  const disciplines = DISCIPLINES.filter((d) => (user.disciplines || []).includes(d.id));
  if (!level && !user.usualSpeed && !disciplines.length) return null;
  if (compact) {
    return (
      <div className={`truncate text-xs text-stone-500 ${className}`}>
        {[
          level && `${level.emoji} ${level.label}`,
          user.usualSpeed && t('{n} km/h', { n: user.usualSpeed }),
          disciplines.map((d) => d.emoji).join(' '),
        ].filter(Boolean).join(' · ')}
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {level && (
        <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800" title={level.hint}>
          {level.emoji} {level.label}
        </span>
      )}
      {user.usualSpeed && (
        <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800" title={t('Vitesse moyenne habituelle')}>
          💨 {t('{n} km/h de moyenne', { n: user.usualSpeed })}
        </span>
      )}
      {disciplines.map((d) => (
        <span key={d.id} className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          {d.emoji} {d.label}
        </span>
      ))}
    </div>
  );
}

// Carte d'un vélo : photo (ou emoji), nom, type et marque. actions : boutons à droite (modifier, supprimer…)
export function BikeCard({ bike, actions = null, onOpenPhoto }) {
  const kind = bikeKind(bike.kind);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-2 ring-1 ring-emerald-100 dark:bg-stone-900 dark:ring-stone-700">
      {bike.photoUrl ? (
        <button type="button" className="shrink-0" onClick={() => onOpenPhoto?.(bike.photoUrl)} aria-label={t('Voir la photo de {name}', { name: bike.name })}>
          <img src={bike.photoUrl} alt={bike.name} loading="lazy" className="h-20 w-28 rounded-xl bg-emerald-50 object-cover" />
        </button>
      ) : (
        <span className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-4xl" aria-hidden="true">{kind.emoji}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold text-stone-800">{bike.name}</div>
        <div className="truncate text-sm text-stone-500">{kind.emoji} {kind.label}</div>
        {bike.brand && <div className="truncate text-xs text-stone-400">{bike.brand}</div>}
      </div>
      {actions && <div className="flex shrink-0 gap-1">{actions}</div>}
    </div>
  );
}

// Grille des vélos d'un membre (profil public), avec la photo en grand au toucher.
export function BikeList({ bikes, onOpenPhoto }) {
  if (!bikes?.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {bikes.map((b) => <BikeCard key={b.id} bike={b} onOpenPhoto={onOpenPhoto} />)}
    </div>
  );
}

// Statistiques d'un cycliste : sorties organisées et rejointes, kilomètres suivis au GPS (si disponibles).
// Les chiffres viennent de member_achievements() ; pour soi, les km viennent de ses propres suivis GPS.
export function RiderStats({ userId, mine = false, go }) {
  const { actions } = useApp();
  const [stats, setStats] = useState(null);
  const [km, setKm] = useState(null);
  useEffect(() => {
    let alive = true;
    actions.achievements(userId).then((s) => alive && setStats(s || {})).catch(() => alive && setStats({}));
    if (mine) actions.tracks.totals().then((x) => alive && setKm(x?.km ?? null)).catch(() => {});
    return () => { alive = false; };
  }, [userId, mine]); // eslint-disable-line react-hooks/exhaustive-deps
  const kmShown = km ?? stats?.km_tracked ?? null;
  const items = [
    ['🗺️', stats?.rides_hosted, t('sorties organisées')],
    ['🚴', stats?.rides_joined, t('sorties rejointes')],
    ...(kmShown != null ? [['📍', Number(kmShown).toLocaleString(locale(), { maximumFractionDigits: 0 }), t('km suivis au GPS')]] : []),
  ];
  return (
    <div className={`grid gap-2 ${items.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {items.map(([emoji, n, label]) => (
        <div key={label} className="rounded-2xl bg-emerald-50 px-2 py-2 text-center dark:bg-stone-800">
          <div className="text-lg font-extrabold text-stone-800">{emoji} {n ?? '…'}</div>
          <div className="text-xs text-stone-500">{label}</div>
        </div>
      ))}
      {mine && go && !Number(kmShown) && (
        <button className="col-span-full text-xs font-semibold text-teal-600" onClick={() => go('tracker')}>
          📍 {t('Suis ta prochaine sortie au GPS pour compter tes kilomètres')}
        </button>
      )}
    </div>
  );
}
