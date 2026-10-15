import { useEffect, useRef, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { t } from '../i18n/index.js';

// Dates au format des agendas : 20261020T080000Z
const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

// « Ajouter à mon agenda » : Google Agenda, ou fichier .ics (iPhone, Outlook, autres agendas).
// ride : { id, date, duration (minutes), title, place, description } ; url et fileName pour un autre événement.
export default function AddToCalendar({ ride, url: pageUrl, fileName = 'sortie-cyclami.ics' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const start = new Date(ride.date);
  const end = new Date(start.getTime() + (Number(ride.duration) || 60) * 60000);
  const url = pageUrl || `${window.location.origin}/b/${ride.id}`;
  const details = `${ride.description ? `${ride.description}\n\n` : ''}${url}`;
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`🚴 ${ride.title}`)}`
    + `&dates=${stamp(start)}/${stamp(end)}&location=${encodeURIComponent(ride.place)}&details=${encodeURIComponent(details)}`;

  const downloadIcs = () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cyclami//Sorties//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${ride.id}@cyclami.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${icsText(`🚴 ${ride.title}`)}`, `LOCATION:${icsText(ride.place)}`, `DESCRIPTION:${icsText(details)}`, `URL:${url}`,
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(ride.title)}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setOpen(false);
  };

  return (
    <span ref={box} className="relative inline-block">
      <button type="button" className="btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={t('Ajouter à mon agenda')}>
        <CalendarPlus size={16} />
      </button>
      {open && (
        <span className="absolute right-0 top-full z-20 mt-1 flex w-52 flex-col overflow-hidden rounded-xl bg-white text-sm shadow-lg ring-1 ring-stone-200">
          <span className="px-3 pt-2 text-xs font-semibold text-stone-500">{t('Ajouter à mon agenda')}</span>
          <a className="px-3 py-2 text-stone-700 hover:bg-emerald-50" href={google} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>Google Agenda</a>
          <button type="button" className="px-3 py-2 text-left text-stone-700 hover:bg-emerald-50" onClick={downloadIcs}>{t('iPhone, Outlook, autre (.ics)')}</button>
        </span>
      )}
    </span>
  );
}
