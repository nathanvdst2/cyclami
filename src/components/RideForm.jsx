import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LocateFixed, RotateCcw, Search, X } from 'lucide-react';
import { LEVELS, RIDE_TYPES, SPEED_MAX, SPEED_MIN, levelInfo } from '../data/constants.js';
import { useApp } from '../context/AppContext.jsx';
import { getLang, locale, t } from '../i18n/index.js';
import { addressAt } from '../lib/geocode.js';
import CooldownNote from './CooldownNote.jsx';
import GpxImport from './GpxImport.jsx';
import { useDraft } from '../lib/persist.js';

const MapView = lazy(() => import('./MapView.jsx'));
const RouteMap = lazy(() => import('./RouteMap.jsx'));

const pad = (n) => String(n).padStart(2, '0');
// Date au format attendu par <input type="datetime-local"> (heure locale).
const toLocalInput = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const defaultDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d.toISOString());
};
const nowLocal = () => toLocalInput(new Date().toISOString());

// Vitesse proposée par défaut selon le niveau (km/h)
const DEFAULT_SPEED = { debutant: 17, intermediaire: 23, confirme: 27, sportif: 31 };
// Durée estimée (min) d'après la distance et la vitesse, arrondie à 5 min
const estimate = (km, speed) => {
  const d = Number(km);
  const v = Number(speed);
  if (!d || !v) return null;
  return Math.min(600, Math.max(15, Math.round((d / v) * 12) * 5));
};
const numOrNull = (x) => (x === '' || x == null || !Number.isFinite(Number(x)) ? null : Number(x));
const fmtKm = (km) => Number(km).toLocaleString(locale(), { maximumFractionDigits: 1 });

// Formulaire de création ou de modification (initial) d'une sortie.
// preset : lieu choisi sur la carte (« Proposer une sortie ici »)
export default function RideForm({ center, initial, preset, onClose, onSubmit }) {
  const editing = !!initial;
  const { actions, currentUser } = useApp();
  const myLevel = levelInfo(currentUser?.level) ? currentUser.level : 'intermediaire';
  const [form, setForm, clearDraft] = useDraft(`ride:${initial?.id || 'new'}`, initial ? {
    title: initial.title, place: initial.place, date: toLocalInput(initial.date), duration: initial.duration,
    maxParticipants: initial.maxParticipants, description: initial.description || '', groupId: initial.groupId || '',
    type: initial.type || 'route', level: initial.level || 'intermediaire', avgSpeed: initial.avgSpeed ?? '',
    distanceKm: initial.distanceKm ?? '', elevationM: initial.elevationM ?? '', noDrop: !!initial.noDrop,
    route: initial.route || null, durationAuto: false,
  } : {
    title: '', place: '', date: defaultDate(), duration: 120, maxParticipants: 8, description: '', repeatWeeks: 1, groupId: '',
    type: RIDE_TYPES.some((x) => x.id === currentUser?.disciplines?.[0]) ? currentUser.disciplines[0] : 'route',
    level: myLevel, avgSpeed: currentUser?.usualSpeed || DEFAULT_SPEED[myLevel], distanceKm: '', elevationM: '',
    noDrop: false, route: null, durationAuto: true,
  });
  // Groupes dont je suis membre : la sortie peut leur être rattachée (les membres sont prévenus).
  const [groups, setGroups] = useState([]);
  useEffect(() => { actions.loadMyGroups?.().then(setGroups).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [coords, setCoords, clearCoords] = useDraft(`ride:${initial?.id || 'new'}:coords`, initial?.coords || null);
  useEffect(() => {
    if (!preset) return;
    // « Organiser une sortie du groupe » : le groupe est choisi d'avance
    if (preset.groupId) setForm((f) => ({ ...f, groupId: preset.groupId }));
    if (!Number.isFinite(preset.lat)) return;
    setCoords({ lat: preset.lat, lng: preset.lng });
    if (preset.name) setForm((f) => ({ ...f, place: preset.name.slice(0, 150) }));
  }, [preset?.lat, preset?.lng, preset?.groupId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // distance ou vitesse changée : la durée estimée suit (tant que le membre ne l'a pas modifiée)
  const setCalc = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      const d = next.durationAuto ? estimate(next.distanceKm, next.avgSpeed) : null;
      return d ? { ...next, duration: d } : next;
    });
  };
  const computed = estimate(form.distanceKm, form.avgSpeed);

  // Point choisi sur la carte : l'adresse précise remplit le nom du lieu
  // (sauf si le membre l'a déjà écrit lui-même).
  const autoPlace = useRef(null);
  const [locating, setLocating] = useState(false);
  const pick = async ({ lat, lng }) => {
    setCoords({ lat, lng });
    setLocating(true);
    const address = await addressAt(lat, lng);
    setLocating(false);
    if (!address) return;
    setForm((f) => {
      if (f.place && f.place !== autoPlace.current) return f;
      autoPlace.current = address;
      return { ...f, place: address.slice(0, 150) };
    });
  };

  // Tracé GPX importé : distance, dénivelé et point de départ pré-remplis
  const importGpx = (r) => {
    if (r.distanceKm > 400) return setError(t('Le tracé dépasse 400 km : choisis un parcours plus court.'));
    setError(null);
    setForm((f) => {
      const next = {
        ...f,
        route: r.route,
        distanceKm: Math.max(1, r.distanceKm),
        elevationM: r.elevationM != null ? Math.min(8000, r.elevationM) : f.elevationM,
        title: f.title || r.name.slice(0, 100),
      };
      const d = next.durationAuto ? estimate(next.distanceKm, next.avgSpeed) : null;
      return d ? { ...next, duration: d } : next;
    });
    pick(r.start);
  };

  // Recherche d'adresse gratuite via OpenStreetMap (Nominatim).
  const searchPlace = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query, format: 'json', limit: '1', 'accept-language': getLang() });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      const [hit] = await res.json();
      if (!hit) setError(t('Lieu introuvable. Essaie une autre formulation, ou clique directement sur la carte.'));
      else {
        setCoords({ lat: Number(hit.lat), lng: Number(hit.lon) });
        if (!form.place) setForm((f) => ({ ...f, place: hit.display_name.split(',').slice(0, 2).join(',').slice(0, 150) }));
      }
    } catch {
      setError(t('Recherche impossible pour le moment. Clique directement sur la carte.'));
    }
    setSearching(false);
  };

  const useMyPosition = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => pick({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setError(t('Position refusée : autorise la localisation pour ce site (icône à gauche de l’adresse, en haut du navigateur), ou clique sur la carte.')),
      { timeout: 15000 },
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    if (new Date(form.date).getTime() < Date.now()) return setError(t('Choisis une date dans le futur.'));
    setSaving(true);
    const { durationAuto, ...values } = form; // eslint-disable-line no-unused-vars
    const err = await onSubmit({
      ...values,
      coords,
      date: new Date(form.date).toISOString(),
      duration: Number(form.duration),
      maxParticipants: Number(form.maxParticipants),
      avgSpeed: numOrNull(form.avgSpeed),
      distanceKm: numOrNull(form.distanceKm),
      elevationM: numOrNull(form.elevationM) != null ? Math.round(Number(form.elevationM)) : null,
      noDrop: !!form.noDrop,
      route: form.route?.length >= 2 ? form.route : null,
    });
    setSaving(false);
    if (err) setError(err);
    else { clearDraft(); clearCoords(); }
  };

  const level = levelInfo(form.level);

  return (
    <form onSubmit={submit} className="card space-y-3 ring-2 ring-teal-200">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-stone-800">{editing ? t('Modifier la sortie') : t('Nouvelle sortie')}</h2>
        <button type="button" onClick={() => { clearDraft(); clearCoords(); onClose(); }} aria-label={t('Fermer')}><X size={18} /></button>
      </div>
      <input className="input" placeholder={t('Titre (ex : Boucle des lacs de l’Eau d’Heure)')} required maxLength={100} value={form.title} onChange={set('title')} />

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Type de sortie')}>
        {RIDE_TYPES.map((x) => (
          <button type="button" key={x.id} role="radio" aria-checked={form.type === x.id} onClick={() => setForm((f) => ({ ...f, type: x.id }))}
            className={`chip ${form.type === x.id ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
            {x.emoji} {x.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-stone-600">
          {t('Niveau')}
          <select className="input mt-1" value={form.level} onChange={(e) => {
            const id = e.target.value;
            setForm((f) => {
              // vitesse encore à sa valeur par défaut : elle suit le niveau
              const speed = Number(f.avgSpeed) === DEFAULT_SPEED[f.level] || f.avgSpeed === '' ? DEFAULT_SPEED[id] : f.avgSpeed;
              const next = { ...f, level: id, avgSpeed: speed };
              const d = next.durationAuto ? estimate(next.distanceKm, next.avgSpeed) : null;
              return d ? { ...next, duration: d } : next;
            });
          }}>
            {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.label} ({l.speed})</option>)}
          </select>
          {level?.hint && <span className="mt-1 block text-xs text-stone-500">{level.hint}</span>}
        </label>
        <label className="text-sm text-stone-600">
          {t('Vitesse moyenne prévue (km/h)')}
          <input className="input mt-1" type="number" inputMode="decimal" min={SPEED_MIN} max={SPEED_MAX} step="0.5"
            value={form.avgSpeed} onChange={setCalc('avgSpeed')} />
        </label>
        <label className="text-sm text-stone-600">
          {t('Distance (km)')}
          <input className="input mt-1" type="number" inputMode="decimal" min="1" max="400" step="0.1"
            value={form.distanceKm} onChange={setCalc('distanceKm')} />
        </label>
        <label className="text-sm text-stone-600">
          {t('Dénivelé positif (m)')}
          <input className="input mt-1" type="number" inputMode="numeric" min="0" max="8000" step="10"
            value={form.elevationM} onChange={set('elevationM')} />
        </label>
      </div>

      <div className="space-y-2">
        <GpxImport hasRoute={!!form.route} onImport={importGpx} />
        {form.route && (
          <div className="space-y-1">
            <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-emerald-100" />}>
              <RouteMap key={`${form.route.length}:${form.route[0]}`} route={form.route} start={coords} height="h-48" />
            </Suspense>
            <p className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
              🗺️ {t('Tracé importé : {km} km, {n} points.', { km: fmtKm(form.distanceKm || 0), n: form.route.length })}
              <button type="button" className="text-red-600 underline" onClick={() => setForm((f) => ({ ...f, route: null }))}>{t('Retirer le tracé')}</button>
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold text-stone-600">{t('Point de départ')}</div>
        <div className="flex gap-2">
          <input className="input" placeholder={t('Chercher une gare, une place, une adresse…')} value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchPlace(); } }} />
          <button type="button" className="btn-ghost px-3" onClick={searchPlace} disabled={searching} aria-label={t('Chercher')}><Search size={16} /></button>
          <button type="button" className="btn-ghost px-3" onClick={useMyPosition} aria-label={t('Ma position')}><LocateFixed size={16} /></button>
        </div>
        <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-emerald-100" />}>
          <MapView height="h-56" center={coords || center} zoom={14} onPick={pick} picked={coords} places
            onChoosePlace={(p) => { setCoords({ lat: p.lat, lng: p.lng }); if (p.name) setForm((f) => ({ ...f, place: p.name.slice(0, 150) })); }} />
        </Suspense>
        <p className="text-xs text-stone-500">{locating ? t('Recherche de l’adresse…') : coords ? `📍 ${t('Point placé. Clique ailleurs pour le déplacer.')}` : t('Clique sur la carte pour placer le point de départ (facultatif).')}</p>
        <input className="input" placeholder={t('Nom du lieu (ex : parking de la gare de Wavre)')} required maxLength={150} value={form.place} onChange={set('place')} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-stone-600">
          {t('Date et heure de départ')}
          <input className="input mt-1" type="datetime-local" required min={nowLocal()} value={form.date} onChange={set('date')} />
        </label>
        <label className="text-sm text-stone-600">
          {t('Durée estimée (min)')}
          <span className="mt-1 flex gap-2">
            <input className="input" type="number" min="15" max="600" step="5" required value={form.duration}
              onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value, durationAuto: false }))} />
            {!form.durationAuto && computed && computed !== Number(form.duration) && (
              <button type="button" className="btn-ghost shrink-0 px-3" title={t('Recalculer depuis la distance et la vitesse')}
                aria-label={t('Recalculer depuis la distance et la vitesse')}
                onClick={() => setForm((f) => ({ ...f, duration: computed, durationAuto: true }))}>
                <RotateCcw size={16} />
              </button>
            )}
          </span>
          {form.durationAuto && computed && <span className="mt-1 block text-xs text-stone-500">{t('Calculée depuis la distance et la vitesse (pauses non comprises).')}</span>}
        </label>
        <label className="text-sm text-stone-600">
          {t('Participants max')}
          <input className="input mt-1" type="number" min="2" max="50" value={form.maxParticipants} onChange={set('maxParticipants')} />
        </label>
      </div>

      <label className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-stone-700">
        <input type="checkbox" className="mt-0.5 accent-teal-500" checked={!!form.noDrop}
          onChange={(e) => setForm((f) => ({ ...f, noDrop: e.target.checked }))} />
        <span>
          <strong>🤝 {t('Pas de lâchage')}</strong>
          <span className="block text-xs text-stone-500">{t('Le groupe attend tout le monde : on se regroupe en haut des côtes et après chaque crevaison.')}</span>
        </span>
      </label>

      <textarea className="input" rows="3" maxLength={1000} placeholder={t('Détails (facultatif) : parcours, pause café, matériel conseillé…')} value={form.description} onChange={set('description')} />
      {(groups.length > 0 || form.groupId) && (
        <label className="block text-sm text-stone-600">
          👥 {t('Groupe')}
          <select className="input mt-1" value={form.groupId} onChange={set('groupId')}>
            <option value="">{t('Aucun groupe')}</option>
            {form.groupId && !groups.some((g) => g.id === form.groupId) && <option value={form.groupId}>{t('Groupe actuel')}</option>}
            {groups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
          </select>
          {form.groupId && <span className="mt-1 block text-xs text-stone-500">{t('Les membres du groupe seront prévenus de la sortie.')}</span>}
        </label>
      )}
      {!editing && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-teal-500" checked={form.repeatWeeks > 1}
              onChange={(e) => setForm((f) => ({ ...f, repeatWeeks: e.target.checked ? 4 : 1 }))} />
            🔁 {t('Répéter chaque semaine')}
          </label>
          {form.repeatWeeks > 1 && (
            <select className="input w-auto py-1" value={form.repeatWeeks} onChange={(e) => setForm((f) => ({ ...f, repeatWeeks: Number(e.target.value) }))} aria-label={t('Nombre de semaines')}>
              {[2, 3, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{t('pendant {n} semaines', { n })}</option>)}
            </select>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!editing && <CooldownNote kind="ride" />}
      <p className="text-xs text-stone-500">🌍 {t('La sortie (titre, lieu, date, niveau, parcours, description) est aussi visible sans compte sur cyclami.com/sorties, sans ton nom ni celui des participants.')}</p>
      <button className="btn-primary w-full" disabled={saving}>{saving ? t('Enregistrement…') : editing ? (initial.seriesId ? t('Enregistrer (cette date uniquement)') : t('Enregistrer les modifications')) : form.repeatWeeks > 1 ? t('Publier les {n} sorties', { n: form.repeatWeeks }) : t('Publier la sortie')}</button>
    </form>
  );
}
