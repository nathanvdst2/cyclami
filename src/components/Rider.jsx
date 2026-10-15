import { DISCIPLINES, bikeKind, levelInfo } from '../data/constants.js';
import { t } from '../i18n/index.js';

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
