import { useState } from 'react';
import { Route } from 'lucide-react';
import { t } from '../i18n/index.js';
import { MAX_GPX_BYTES, parseGpx } from '../lib/gpx.js';

// Import d'un tracé GPX (Strava, Komoot, Garmin, RideWithGPS…) : le fichier est lu dans le
// navigateur et n'est pas envoyé ; seul le tracé simplifié est gardé avec la sortie.
export default function GpxImport({ onImport, hasRoute = false }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const read = async (file) => {
    setError(null);
    if (!file) return;
    if (!/\.gpx$/i.test(file.name) && !/gpx|xml/i.test(file.type)) return setError(t('Choisis un fichier .gpx.'));
    if (file.size > MAX_GPX_BYTES) return setError(t('Fichier trop lourd (15 Mo maximum).'));
    setBusy(true);
    try {
      onImport(parseGpx(await file.text()));
    } catch (e) {
      setError(t(e.message) || t('Ce fichier n’est pas un GPX valide.'));
    }
    setBusy(false);
  };

  return (
    <div className="space-y-1">
      <label className={`btn-ghost w-fit cursor-pointer ${busy ? 'opacity-60' : ''}`}>
        <Route size={16} /> {busy ? t('Lecture du tracé…') : hasRoute ? t('Remplacer le tracé GPX') : t('Importer un tracé GPX')}
        <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" className="hidden" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; read(f); }} />
      </label>
      {!hasRoute && !error && (
        <p className="text-xs text-stone-500">{t('Exporte ton parcours depuis Strava, Komoot, Garmin… : distance, dénivelé et point de départ se remplissent tout seuls.')}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
