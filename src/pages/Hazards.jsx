import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, LocateFixed, Plus, ThumbsUp, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { HAZARD_KINDS, hazardDays, hazardKind, hazardLabel } from '../data/hazards.js';
import { MAX_INPUT_BYTES } from '../utils/image.js';
import { distanceKm, formatDistance, timeAgo } from '../utils/geo.js';
import ViewToggle from '../components/ViewToggle.jsx';
import DirectionsButton from '../components/DirectionsButton.jsx';
import { addressAt } from '../lib/geocode.js';
import { useDraft, usePageState } from '../lib/persist.js';
import { locale, t } from '../i18n/index.js';
import QuickEdit from '../components/QuickEdit.jsx';

const MapView = lazy(() => import('../components/MapView.jsx'));

// Dangers sur la route : nids-de-poule, travaux, gravillons, chien agressif, verglas…
// Les cyclistes à moins de 3 km sont prévenus ; une alerte expire seule, « Toujours là » la prolonge.
export default function Hazards({ back, params = {} }) {
  const { currentUser, actions, getUser, isStaff, isAdmin } = useApp();
  const [items, setItems] = useState(null);
  const [creating, setCreating] = usePageState('hazards:creating', false);
  const [view, setView] = usePageState('hazards:view', 'list');
  const [error, setError] = useState(null);

  const load = () => actions.hazards.list().then(setItems);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const vote = async (h, v) => {
    if (v === 'gone' && h.author_id === currentUser.id && !window.confirm(t('Le danger a disparu ? L’alerte sera fermée.'))) return;
    const err = await actions.hazards.vote(h.id, v);
    if (err) setError(err); else load();
  };
  const remove = async (h) => {
    if (!window.confirm(t('Supprimer cette alerte ?'))) return;
    const err = await actions.hazards.remove(h);
    if (err) setError(err); else load();
  };

  const list = (items || []).map((h) => ({
    ...h, km: currentUser.coords ? distanceKm(currentUser.coords, { lat: h.lat, lng: h.lng }) : null,
  })).sort((x, y) => (x.km ?? 1e9) - (y.km ?? 1e9))
    .sort((x, y) => (y.id === params.hazardId) - (x.id === params.hazardId));

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('discover')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-stone-800">⚠️ {t('Dangers sur la route')}</h1>
        <button className="btn-primary shrink-0" onClick={() => setCreating(true)}><Plus size={16} /> {t('Signaler')}</button>
      </div>
      <p className="text-sm text-stone-500">
        {t('Nids-de-poule, travaux, gravillons, chien agressif, verglas… Les cyclistes à moins de 3 km sont prévenus tout de suite.')}
      </p>

      {creating && <HazardForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}

      <div className="flex items-center gap-2">
        <span className="text-sm text-stone-500">{t(list.length > 1 ? '{n} dangers signalés' : '{n} danger signalé', { n: list.length })}</span>
        <ViewToggle view={view} setView={setView} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items === null && <div className="card h-40 animate-pulse" />}
      {items && list.length === 0 && (
        <div className="card space-y-1 text-center text-stone-500">
          <div className="text-4xl">🚴</div>
          <p>{t('Aucun danger signalé près de chez toi. Bonne route !')}</p>
        </div>
      )}

      {view === 'map' && items && (
        <Suspense fallback={<div className="card h-96 animate-pulse" />}>
          <MapView height="h-[26rem]" center={currentUser.coords} zoom={13}
            markers={list.map((h) => ({
              id: h.id, coords: { lat: h.lat, lng: h.lng }, emoji: hazardKind(h.kind).emoji, highlight: true,
              popup: <div className="text-sm"><strong>{hazardKind(h.kind).emoji} {hazardLabel(h)}</strong><br />{h.place}</div>,
            }))} />
        </Suspense>
      )}

      {view === 'list' && list.map((h) => {
        const k = hazardKind(h.kind);
        const mine = h.author_id === currentUser.id;
        const author = getUser(h.author_id);
        return (
          <article key={h.id} ref={(el) => h.id === params.hazardId && el?.scrollIntoView?.({ block: 'center' })}
            className={`card space-y-3 ring-red-200 ${h.id === params.hazardId ? 'ring-4' : 'ring-2'}`}>
            <div className="flex gap-3">
              {h.photo_url
                ? <a href={h.photo_url} target="_blank" rel="noreferrer" className="shrink-0"><img src={h.photo_url} alt={k.label} loading="lazy" className="h-20 w-20 rounded-xl bg-emerald-100 object-cover" /></a>
                : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-red-50 text-4xl">{k.emoji}</div>}
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-red-700">{k.emoji} {hazardLabel(h)}</h2>
                <p className="text-sm text-stone-600">📍 {h.place}{h.km != null && ` · ${formatDistance(h.km)}`}</p>
                <p className="text-xs text-stone-400">
                  {mine ? t('Signalé {when} · par toi', { when: timeAgo(h.created_at) })
                    : t('Signalé {when} · par {who}', { when: timeAgo(h.created_at), who: author?.name || t('un membre') })}
                  {' · '}{t('jusqu’au {date}', { date: new Date(h.expires_at).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }) })}
                  {h.still > 0 && ` · ${t('confirmé par {n}', { n: h.still })}`}
                </p>
              </div>
            </div>
            {h.description && <p className="whitespace-pre-line text-sm text-stone-700">{h.description}</p>}
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">💡 {k.advice}</p>
            <div className="flex flex-wrap gap-2">
              {!mine && (
                <button className={`btn-ghost flex-1 ${h.myVote === 'still' ? '!bg-red-50 !text-red-700' : ''}`} onClick={() => vote(h, 'still')} disabled={h.myVote === 'still'}>
                  <ThumbsUp size={16} /> {h.myVote === 'still' ? t('Confirmé') : t('Toujours là')}
                </button>
              )}
              <button className={`btn-ghost flex-1 ${h.myVote === 'gone' ? '!bg-green-50 !text-green-700' : ''}`} onClick={() => vote(h, 'gone')} disabled={h.myVote === 'gone'}>
                <CheckCircle2 size={16} /> {h.myVote === 'gone' ? t('Merci !') : t('Plus là')}
              </button>
              <DirectionsButton lat={h.lat} lng={h.lng} label={h.place} big text={t('Carte')} />
              {(mine || isStaff) && (
                <button className="btn-ghost text-red-600" onClick={() => remove(h)} aria-label={t('Supprimer')}><Trash2 size={16} /></button>
              )}
              {isAdmin && (
                <QuickEdit value={h} onSaved={load} onSave={(f) => actions.hazards.update(h.id, { ...f, kind: h.kind })} fields={[
                  ...(h.kind === 'autre' ? [{ key: 'title', label: t('Quel danger ?'), max: 60, required: true }] : []),
                  { key: 'place', label: t('Lieu'), max: 150, required: true },
                  { key: 'description', label: t('Description'), max: 500, multiline: true },
                ]} />
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function HazardForm({ onClose, onSaved }) {
  const { currentUser, actions } = useApp();
  const [form, setForm, clearDraft] = useDraft('hazard', { kind: 'nid_de_poule', title: '', place: '', description: '' });
  const [coords, setCoords, clearCoords] = useDraft('hazard:coords', currentUser.coords || null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // point choisi sur la carte → adresse dans « Lieu » (si le membre ne l'a pas écrit lui-même)
  const autoPlace = useRef(null);
  const pick = async ({ lat, lng }) => {
    setCoords({ lat, lng });
    const address = await addressAt(lat, lng);
    if (!address) return;
    setForm((f) => {
      if (f.place && f.place !== autoPlace.current) return f;
      autoPlace.current = address;
      return { ...f, place: address };
    });
  };
  const locate = () => navigator.geolocation?.getCurrentPosition(
    (pos) => pick({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => setError(t('Position refusée : clique sur la carte.')),
    { timeout: 15000 },
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!coords) return setError(t('Place sur la carte l’endroit du danger.'));
    setSaving(true);
    setError(null);
    const err = await actions.hazards.save({ ...form, coords }, file);
    setSaving(false);
    if (err) setError(err); else { clearDraft(); clearCoords(); onSaved(); }
  };

  return (
    <form onSubmit={submit} className="card space-y-3 ring-2 ring-red-200">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-stone-800">{t('Signaler un danger')}</h2>
        <button type="button" onClick={() => { clearDraft(); clearCoords(); onClose(); }} aria-label={t('Fermer')}><X size={18} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Type de danger')}>
        {HAZARD_KINDS.map((k) => (
          <button type="button" key={k.id} role="radio" aria-checked={form.kind === k.id} onClick={() => set('kind', k.id)}
            className={`chip justify-start py-2 text-left ${form.kind === k.id ? 'bg-red-600 text-white ring-red-600' : 'bg-white text-stone-700 ring-emerald-200'}`}>
            {k.emoji} {k.label}
          </button>
        ))}
      </div>
      {form.kind === 'autre' && (
        <input className="input" required minLength={3} maxLength={60} autoFocus aria-label={t('Quel danger ?')}
          placeholder={t('Quel danger ? (ex : arbre tombé, plaque d’égout descellée, piste cyclable bloquée)')}
          value={form.title || ''} onChange={(e) => set('title', e.target.value)} />
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm font-semibold text-stone-600">
          {t('Où ?')}
          <button type="button" className="flex items-center gap-1 text-xs text-teal-600" onClick={locate}><LocateFixed size={14} /> {t('Ma position')}</button>
        </div>
        <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-emerald-100" />}>
          <MapView height="h-56" center={coords || currentUser.coords} zoom={15} onPick={pick} picked={coords} />
        </Suspense>
        <input className="input" placeholder={t('Lieu (ex : rue de la Station, descente après le pont)')} required maxLength={150}
          value={form.place} onChange={(e) => set('place', e.target.value)} />
      </div>
      <textarea className="input" rows="3" maxLength={500} placeholder={t('Ce que tu as vu (facultatif)')}
        value={form.description} onChange={(e) => set('description', e.target.value)} />
      {preview ? (
        <div className="relative w-fit">
          <img src={preview} alt={t('Aperçu')} className="h-24 rounded-xl bg-emerald-100 object-contain" />
          <button type="button" onClick={() => setFile(null)} aria-label={t('Retirer la photo')}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 shadow ring-1 ring-stone-200"><X size={14} /></button>
        </div>
      ) : (
        <label className="btn-ghost w-fit cursor-pointer">
          <Camera size={16} /> {t('Ajouter une photo (facultatif)')}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f && f.size > MAX_INPUT_BYTES) return setError(t('Image trop lourde (25 Mo maximum).'));
            setFile(f || null);
          }} />
        </label>
      )}
      <p className="text-xs text-stone-500">{hazardKind(form.kind).advice}</p>
      <p className="text-xs text-stone-400">{t('L’alerte disparaîtra toute seule dans {n} jours (ou plus tôt si les cyclistes indiquent que le danger n’est plus là).', { n: hazardDays(form.kind) })}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary w-full !bg-red-600" disabled={saving}>{saving ? t('Publication…') : t('Publier et prévenir les cyclistes du coin')}</button>
    </form>
  );
}
