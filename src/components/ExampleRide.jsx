import { useState } from 'react';
import { CalendarDays, Clock, MapPin, Repeat, Users } from 'lucide-react';
import { PACES } from '../data/constants.js';
import { formatDate } from '../utils/geo.js';
import { t } from '../i18n/index.js';

// Samedi prochain à 10 h (date de l'exemple).
const nextSaturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + (((6 - d.getDay()) + 7) % 7 || 7));
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
};

// Sortie d'exemple épinglée en tête de « À venir » : montre une sortie bien organisée.
// Elle n'existe pas en base : on ne peut ni la rejoindre ni la commenter.
export default function ExampleRide({ onCreate }) {
  const [open, setOpen] = useState(false);
  const pace = PACES.find((p) => p.id === 'normal');
  const tips = [
    t('Un lieu public précis, facile à trouver (point placé sur la carte)'),
    t('Une date, une heure et une durée claires'),
    t('Le rythme, pour que les chiens soient bien assortis'),
    t('Un nombre maximum de participants'),
    t('Les consignes utiles : laisse au début, eau, sacs à crottes'),
  ];
  return (
    <article className="card space-y-3 ring-2 ring-teal-300">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold text-stone-800">{t('Tour du parc et pause au point d’eau')}</h2>
        <span className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-teal-500 px-2 py-0.5 text-xs font-bold text-white">📌 {t('Exemple')}</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">{pace?.label}</span>
        </span>
      </div>
      <div className="grid gap-1 text-sm text-stone-600">
        <span className="flex items-center gap-2"><CalendarDays size={14} /> {formatDate(nextSaturday())}</span>
        <span className="flex items-center gap-2 text-teal-700"><Repeat size={14} /> {t('Chaque semaine')}</span>
        <span className="flex items-center gap-2"><Clock size={14} /> 60 min</span>
        <span className="flex items-center gap-2"><MapPin size={14} /> {t('Parc communal Jules Descampe, entrée côté chaussée de Bruxelles')}</span>
      </div>
      <p className="whitespace-pre-line text-sm text-stone-600">
        {t('Sortie tranquille d’une heure, tous chiens bienvenus s’ils sont sociables. On garde les chiens en laisse les 10 premières minutes, le temps qu’ils fassent connaissance. Pensez à l’eau et aux sacs !')}
      </p>
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Users size={14} /> 3/6 · {t('par un membre d’Cyclami')}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary flex-1" onClick={onCreate}>{t('Organiser ma sortie')}</button>
        <button className="btn-ghost" onClick={() => setOpen(!open)}>{open ? t('Masquer les conseils') : t('Pourquoi c’est un bon exemple ?')}</button>
      </div>
      {open && (
        <div className="space-y-1 rounded-xl bg-teal-50 px-3 py-2 text-sm text-stone-700">
          <p className="font-semibold">{t('Cette sortie n’est pas réelle : elle montre ce qu’une bonne sortie contient.')}</p>
          <ul className="space-y-0.5">{tips.map((tip) => <li key={tip}>✅ {tip}</li>)}</ul>
        </div>
      )}
    </article>
  );
}
