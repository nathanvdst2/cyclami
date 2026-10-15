import { useState } from 'react';
import { CalendarDays, Clock, MapPin, Repeat, Users } from 'lucide-react';
import { formatDate } from '../utils/geo.js';
import { t } from '../i18n/index.js';
import { RideStats, formatRideDuration } from './RideCard.jsx';

// Samedi prochain à 9 h (date de l'exemple).
const nextSaturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + (((6 - d.getDay()) + 7) % 7 || 7));
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

// Sortie d'exemple : elle n'existe pas en base, on ne peut ni la rejoindre ni la commenter.
const EXAMPLE = { type: 'route', level: 'intermediaire', avgSpeed: 24, distanceKm: 62, elevationM: 540, noDrop: true, duration: 165 };

// Sortie d'exemple épinglée en tête de « À venir » : montre une sortie bien organisée.
export default function ExampleRide({ onCreate }) {
  const [open, setOpen] = useState(false);
  const tips = [
    t('Un point de départ précis, facile à trouver (placé sur la carte)'),
    t('Le type de sortie et le niveau, pour rouler avec des cyclistes qui ont ton rythme'),
    t('La vitesse moyenne, la distance et le dénivelé (ou un tracé GPX)'),
    t('« Pas de lâchage » si le groupe attend tout le monde'),
    t('Les consignes utiles : casque, chambre à air de rechange, eau, éclairage'),
  ];
  return (
    <article className="card space-y-3 ring-2 ring-teal-300">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-bold text-stone-800">🚴 {t('Boucle du samedi matin et pause café')}</h2>
        <span className="shrink-0 rounded-full bg-teal-500 px-2 py-0.5 text-xs font-bold text-white">📌 {t('Exemple')}</span>
      </div>
      <RideStats ride={EXAMPLE} />
      <div className="grid gap-1 text-sm text-stone-600">
        <span className="flex items-center gap-2"><CalendarDays size={14} /> {formatDate(nextSaturday())}</span>
        <span className="flex items-center gap-2 text-teal-700"><Repeat size={14} /> {t('Chaque semaine')}</span>
        <span className="flex items-center gap-2"><Clock size={14} /> {t('environ {d}', { d: formatRideDuration(EXAMPLE.duration) })}</span>
        <span className="flex items-center gap-2"><MapPin size={14} /> {t('Gare de Wavre, devant l’entrée principale')}</span>
      </div>
      <p className="whitespace-pre-line text-sm text-stone-600">
        {t('Boucle vallonnée par les petites routes du Brabant wallon, à allure régulière. On se regroupe en haut de chaque côte et on fait une pause café à mi-parcours. Casque obligatoire, prends une chambre à air de rechange et de quoi boire.')}
      </p>
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <Users size={14} /> 5/10 · {t('par un membre de Cyclami')}
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
