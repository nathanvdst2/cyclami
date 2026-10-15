import { useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { t } from '../i18n/index.js';

// « Itinéraire » : au choix Google Maps ou Plans d'Apple, vers le point exact du rendez-vous.
// big : gros bouton (cartes d'alerte) au lieu du petit lien de la carte de sortie ; text : libellé du bouton.
export default function DirectionsButton({ lat, lng, label, big = false, text }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const dest = `${lat},${lng}`;
  const apps = [
    ['Google Maps', `https://www.google.com/maps/dir/?api=1&destination=${dest}`],
    [t('Plans (Apple)'), `https://maps.apple.com/?daddr=${dest}${label ? `&q=${encodeURIComponent(label)}` : ''}`],
  ];
  return (
    <span ref={box} className={`relative inline-block ${big ? '' : 'ml-1'}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={big ? 'btn-ghost' : 'inline-flex items-center gap-0.5 text-xs font-semibold text-teal-600'}>
        <Navigation size={big ? 16 : 12} /> {text || t('Itinéraire')}
      </button>
      {open && (
        <span className={`absolute top-full z-20 mt-1 flex w-44 flex-col overflow-hidden rounded-xl bg-white text-sm shadow-lg ring-1 ring-stone-200 ${big ? 'right-0' : 'left-0'}`}>
          {apps.map(([name, href]) => (
            <a key={name} href={href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}
              className="px-3 py-2 text-stone-700 hover:bg-emerald-50">
              {name}
            </a>
          ))}
        </span>
      )}
    </span>
  );
}
