import { CalendarDays, List, Map as MapIcon } from 'lucide-react';
import { t } from '../i18n/index.js';

// Bascule Liste / Carte.
// calendar : ajoute la vue « Calendrier » (sorties)
export default function ViewToggle({ view, setView, calendar = false }) {
  return (
    <div className="ml-auto flex overflow-hidden rounded-xl ring-1 ring-emerald-200">
      {[['list', List, t('Liste')], ...(calendar ? [['calendar', CalendarDays, t('Calendrier')]] : []), ['map', MapIcon, t('Carte')]].map(([id, Icon, label]) => (
        <button key={id} onClick={() => setView(id)}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm ${view === id ? 'bg-teal-500 text-white' : 'bg-white text-stone-600'}`}>
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );
}
