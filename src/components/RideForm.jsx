import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LocateFixed, Search, X } from 'lucide-react';
import { PACES } from '../data/constants.js';
import { useApp } from '../context/AppContext.jsx';
import { getLang, t } from '../i18n/index.js';
import { addressAt } from '../lib/geocode.js';
import CooldownNote from './CooldownNote.jsx';
import { useDraft } from '../lib/persist.js';

const MapView = lazy(() => import('./MapView.jsx'));

const pad = (n) => String(n).padStart(2, '0');
// Date au format attendu par <input type="datetime-local"> (heure locale).
const toLocalInput = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const defaultDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d.toISOString());
};
const nowLocal = () => toLocalInput(new Date().toISOString());

// Formulaire de création ou de modification (initial) d'une sortie.
// preset : lieu choisi sur la carte (« Proposer une sortie ici »)
export default function RideForm({ center, initial, preset, onClose, onSubmit }) {
  const editing = !!initial;
  const { actions } = useApp();
  const [form, setForm, clearDraft] = useDraft(`ride:${initial?.id || 'new'}`, initial ? {
    title: initial.title, place: initial.place, date: toLocalInput(initial.date), duration: initial.duration,
    pace: initial.pace, maxParticipants: initial.maxParticipants, description: initial.description || '', groupId: initial.groupId || '',
  } : {
    title: '', place: '', date: defaultDate(), duration: 60, pace: 'normal', maxParticipants: 5, description: '', repeatWeeks: 1, groupId: '',
  });
  // Groupes dont je suis membre : la sortie peut leur être rattachée (les membres sont prévenus).
  const [groups, setGroups] = useState([]);
  useEffect(() => { actions.loadMyGroups().then(setGroups).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [coords, setCoords, clearCoords] = useDraft(`ride:${initial?.id || 'new'}:coords`, initial?.coords || null);
  useEffect(() => {
    if (!preset) return;
    setCoords({ lat: preset.lat, lng: preset.lng });
    if (preset.name) setForm((f) => ({ ...f, place: preset.name.slice(0, 150) }));
  }, [preset?.lat, preset?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

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
      return { ...f, place: address };
    });
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
        if (!form.place) setForm((f) => ({ ...f, place: hit.display_name.split(',').slice(0, 2).join(',') }));
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
    const err = await onSubmit({
      ...form,
      coords,
      date: new Date(form.date).toISOString(),
      duration: Number(form.duration),
      maxParticipants: Number(form.maxParticipants),
    });
    setSaving(false);
    if (err) setError(err);
    else { clearDraft(); clearCoords(); }
  };

  return (
    <form onSubmit={submit} className="card space-y-3 ring-2 ring-teal-200">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-stone-800">{editing ? t('Modifier la sortie') : t('Nouvelle sortie')}</h2>
        <button type="button" onClick={() => { clearDraft(); clearCoords(); onClose(); }} aria-label={t('Fermer')}><X size={18} /></button>
      </div>
      <input className="input" placeholder={t('Titre (ex : Tour du parc Monceau)')} required maxLength={100} value={form.title} onChange={set('title')} />

      <div className="space-y-2">
        <div className="text-sm font-semibold text-stone-600">{t('Point de rendez-vous')}</div>
        <div className="flex gap-2">
          <input className="input" placeholder={t('Chercher un parc, une adresse…')} value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchPlace(); } }} />
          <button type="button" className="btn-ghost px-3" onClick={searchPlace} disabled={searching} aria-label={t('Chercher')}><Search size={16} /></button>
          <button type="button" className="btn-ghost px-3" onClick={useMyPosition} aria-label={t('Ma position')}><LocateFixed size={16} /></button>
        </div>
        <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-emerald-100" />}>
          <MapView height="h-56" center={coords || center} zoom={14} onPick={pick} picked={coords} places
            onChoosePlace={(p) => { setCoords({ lat: p.lat, lng: p.lng }); if (p.name) setForm((f) => ({ ...f, place: p.name })); }} />
        </Suspense>
        <p className="text-xs text-stone-500">{locating ? t('Recherche de l’adresse…') : coords ? `📍 ${t('Point placé. Clique ailleurs pour le déplacer.')}` : t('Clique sur la carte pour placer le point de rendez-vous (facultatif).')}</p>
        <input className="input" placeholder={t('Nom du lieu (ex : entrée principale du parc)')} required maxLength={150} value={form.place} onChange={set('place')} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <input className="input" type="datetime-local" required min={nowLocal()} value={form.date} onChange={set('date')} />
        <select className="input" value={form.pace} onChange={set('pace')}>
          {PACES.map((p) => <option key={p.id} value={p.id}>{t('Rythme : {pace}', { pace: p.label })}</option>)}
        </select>
        <label className="text-sm text-stone-600">
          {t('Durée (min)')}
          <input className="input mt-1" type="number" min="15" max="300" step="15" value={form.duration} onChange={set('duration')} />
        </label>
        <label className="text-sm text-stone-600">
          {t('Participants max')}
          <input className="input mt-1" type="number" min="2" max="20" value={form.maxParticipants} onChange={set('maxParticipants')} />
        </label>
      </div>
      <textarea className="input" rows="2" maxLength={1000} placeholder={t('Détails (optionnel)')} value={form.description} onChange={set('description')} />
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
              onChange={(e) => setForm({ ...form, repeatWeeks: e.target.checked ? 4 : 1 })} />
            🔁 {t('Répéter chaque semaine')}
          </label>
          {form.repeatWeeks > 1 && (
            <select className="input w-auto py-1" value={form.repeatWeeks} onChange={(e) => setForm({ ...form, repeatWeeks: Number(e.target.value) })} aria-label={t('Nombre de semaines')}>
              {[2, 3, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{t('pendant {n} semaines', { n })}</option>)}
            </select>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!editing && <CooldownNote kind="ride" />}
      <p className="text-xs text-stone-500">🌍 {t('La sortie (titre, lieu, date, description) est aussi visible sans compte sur cyclami.com/sorties, sans ton nom ni celui des participants.')}</p>
      <button className="btn-primary w-full" disabled={saving}>{saving ? t('Enregistrement…') : editing ? (initial.seriesId ? t('Enregistrer (cette date uniquement)') : t('Enregistrer les modifications')) : form.repeatWeeks > 1 ? t('Publier les {n} sorties', { n: form.repeatWeeks }) : t('Publier la sortie')}</button>
    </form>
  );
}
