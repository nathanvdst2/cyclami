import { useEffect, useState } from 'react';
import { ArrowLeft, Camera, LogOut, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { MAX_INPUT_BYTES } from '../utils/image.js';
import {
  AVAILABILITY_SLOTS, BIKE_KINDS, DISCIPLINES, LEVELS, MAX_BIKES, SPEED_MAX, SPEED_MIN, bikeKind, levelForSpeed, levelInfo,
} from '../data/constants.js';
import { BikeCard } from '../components/Rider.jsx';
import { t } from '../i18n/index.js';
import { illu } from '../lib/illustrations.js';
import { useDraft } from '../lib/persist.js';

const EMPTY_BIKE = { name: '', kind: 'route', brand: '', photoUrl: null };

// Profil cycliste : disciplines, niveau, vitesse habituelle, disponibilités et vélos.
// onboarding : écran d'accueil obligatoire tant que le niveau n'est pas choisi (voir App.jsx).
// params.bikeId : ouvre directement la fiche d'un vélo ('new' pour en ajouter un).
export default function RiderForm({ go, params = {}, onboarding }) {
  const { currentUser, actions } = useApp();
  const [rider, setRider, clearDraft] = useDraft('rider', {
    disciplines: currentUser.disciplines?.length ? currentUser.disciplines : [],
    level: currentUser.level || '',
    usualSpeed: currentUser.usualSpeed ?? '',
    availability: currentUser.availability || [],
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // inscription avec Google : la ville n'est pas encore connue, et le nom vient du compte Google
  const [needsCity] = useState(onboarding && !currentUser.city);
  const [city, setCity] = useDraft('rider:city', '');
  const [firstName, setFirstName] = useState(currentUser.name || '');
  // premier vélo, facultatif (inscription seulement)
  const [firstBike, setFirstBike] = useDraft('rider:bike', EMPTY_BIKE);
  const [firstBikePhoto, setFirstBikePhoto] = useState(null);

  const set = (k, v) => setRider({ ...rider, [k]: v });
  const toggle = (k, id) => set(k, rider[k].includes(id) ? rider[k].filter((x) => x !== id) : [...rider[k], id]);
  const suggested = levelForSpeed(rider.usualSpeed);

  const submit = async (e) => {
    e.preventDefault();
    if (!rider.disciplines.length) return setError(t('Choisis au moins une discipline.'));
    if (!rider.level) return setError(t('Choisis ton niveau.'));
    const speed = rider.usualSpeed === '' ? null : Number(rider.usualSpeed);
    if (speed != null && !(speed >= SPEED_MIN && speed <= SPEED_MAX)) {
      return setError(t('Indique une vitesse moyenne entre 8 et 50 km/h.'));
    }
    setSaving(true);
    setError(null);
    const patch = { disciplines: rider.disciplines, level: rider.level, usualSpeed: speed, availability: rider.availability };
    if (onboarding) {
      const name = firstName.trim();
      if (name && name !== currentUser.name) {
        if (!(await actions.nameAllowed(name))) {
          setSaving(false);
          return setError(t('Ce prénom n’est pas autorisé. Choisis-en un autre.'));
        }
        patch.name = name;
      }
      if (needsCity) patch.city = city.trim();
      // le vélo d'abord : dès que le niveau est enregistré, le site passe à l'accueil
      if (firstBike.name.trim()) {
        const err = await actions.addBike(firstBike, firstBikePhoto?.file || null);
        if (err) { setSaving(false); return setError(err); }
        setFirstBike(EMPTY_BIKE);
        setFirstBikePhoto(null);
      }
    }
    const err = await actions.saveRider(patch);
    setSaving(false);
    if (err) return setError(err);
    clearDraft();
    if (!onboarding) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  };

  return (
    <div className={onboarding ? 'min-h-screen bg-emerald-50 px-4 py-8' : 'space-y-4'}>
      <form onSubmit={submit} className="card mx-auto max-w-lg space-y-5">
        {onboarding ? (
          <button type="button" onClick={actions.logout} className="flex items-center gap-1 text-sm text-stone-500">
            <LogOut size={16} /> {t('Se déconnecter')}
          </button>
        ) : (
          <button type="button" onClick={() => go('profile')} className="flex items-center gap-1 text-sm text-stone-500">
            <ArrowLeft size={16} /> {t('Retour')}
          </button>
        )}
        <div>
          {onboarding && <img src={illu('bienvenue')} alt="" className="mx-auto mb-2 h-36 w-36 object-contain" />}
          <h1 className="text-2xl font-extrabold text-stone-800">
            {onboarding ? t('Bienvenue {name} ! Quel cycliste es-tu ? 🚴', { name: firstName.trim() || currentUser.name }) : t('Mon profil cycliste')}
          </h1>
          <p className="mt-1 text-stone-500">{t('Ces infos servent à te proposer des cyclistes et des sorties à ton niveau, près de chez toi.')}</p>
        </div>

        {onboarding && (
          <label className="block text-sm font-semibold text-stone-600">
            {t('Ton prénom (ou pseudo)')}
            <input className="input mt-1 font-normal" required minLength={1} maxLength={50} autoComplete="given-name"
              value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <span className="mt-1 block text-xs font-normal text-stone-500">{t('C’est le nom que verront les autres membres. Choisis-le bien : il ne pourra plus être modifié ensuite.')}</span>
          </label>
        )}
        {needsCity && (
          <label className="block text-sm font-semibold text-stone-600">
            {t('Ta ville ou ton quartier')}
            <input className="input mt-1 font-normal" required maxLength={80} placeholder={t('Ex : Namur')} value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
        )}

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-stone-600">{t('Tu roules plutôt…')} <span className="font-normal text-stone-400">({t('plusieurs choix possibles')})</span></legend>
          <div className="flex flex-wrap gap-2">
            {DISCIPLINES.map((d) => {
              const on = rider.disciplines.includes(d.id);
              return (
                <button type="button" key={d.id} aria-pressed={on} onClick={() => toggle('disciplines', d.id)}
                  className={`chip ${on ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
                  {d.emoji} {d.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-stone-600">{t('Ton niveau')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {LEVELS.map((l) => {
              const on = rider.level === l.id;
              return (
                <button type="button" key={l.id} aria-pressed={on} onClick={() => set('level', l.id)}
                  className={`rounded-2xl p-3 text-left ring-1 transition ${on ? 'bg-teal-50 ring-2 ring-teal-500 dark:bg-teal-950' : 'bg-white ring-emerald-200 hover:ring-teal-300 dark:bg-stone-900'}`}>
                  <span className="block font-bold text-stone-800">{l.emoji} {l.label}</span>
                  <span className="block text-xs text-stone-500">{l.hint}</span>
                  <span className="block text-xs font-semibold text-teal-700">{l.speed}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block text-sm font-semibold text-stone-600">
          {t('Ta vitesse moyenne habituelle (km/h)')} <span className="font-normal text-stone-400">({t('facultatif')})</span>
          <input className="input mt-1 w-32 font-normal" type="number" inputMode="numeric" min={SPEED_MIN} max={SPEED_MAX} step="1"
            placeholder={t('ex : 24')} value={rider.usualSpeed} onChange={(e) => set('usualSpeed', e.target.value)} />
          <span className="mt-1 block text-xs font-normal text-stone-500">
            {suggested && suggested !== rider.level
              ? t('À cette vitesse, le niveau « {level} » te correspond sans doute mieux.', { level: levelInfo(suggested).label })
              : t('Sur le plat, en sortie normale (pas ton record !).')}
          </span>
        </label>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-stone-600">{t('Quand peux-tu rouler ?')}</legend>
          <div className="flex flex-wrap gap-2">
            {AVAILABILITY_SLOTS.map((s) => {
              const on = rider.availability.includes(s);
              return (
                <button type="button" key={s} aria-pressed={on} onClick={() => toggle('availability', s)}
                  className={`chip ${on ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
                  {t(s)}
                </button>
              );
            })}
          </div>
        </fieldset>

        {onboarding && (
          <div className="space-y-2 border-t border-emerald-200 pt-4">
            <h2 className="text-lg font-bold text-stone-800">🚲 {t('Ton vélo')} <span className="text-sm font-normal text-stone-400">({t('facultatif')})</span></h2>
            <p className="text-sm text-stone-500">{t('Une photo de ton vélo rapporte des points. Tu pourras en ajouter d’autres depuis ton profil.')}</p>
            <BikeFields bike={firstBike} onChange={setFirstBike} photo={firstBikePhoto} onPhoto={setFirstBikePhoto} onError={setError} required={false} />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={saving}>
          {saving ? t('Enregistrement…') : onboarding ? t('C’est parti !') : saved ? t('Enregistré ✔') : t('Enregistrer')}
        </button>
      </form>

      {!onboarding && <MyBikes openId={params.bikeId} />}
    </div>
  );
}

// Champs d'un vélo : photo, nom, type, marque.
// photo : { file, preview } | null (nouvelle photo choisie) ; bike.photoUrl : photo déjà enregistrée
function BikeFields({ bike, onChange, photo, onPhoto, onError, required = true }) {
  useEffect(() => () => photo?.preview && URL.revokeObjectURL(photo.preview), [photo]);
  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) return onError(t('Image trop lourde (25 Mo maximum).'));
    onError(null);
    onPhoto({ file, preview: URL.createObjectURL(file) });
  };
  const shown = photo?.preview || bike.photoUrl;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {shown
          ? <img src={shown} alt="" className="h-20 w-28 shrink-0 rounded-xl bg-emerald-50 object-cover" />
          : <span className="flex h-20 w-28 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-4xl">{bikeKind(bike.kind).emoji}</span>}
        <div className="space-y-1">
          <label className="btn-ghost cursor-pointer">
            <Camera size={16} /> {shown ? t('Changer la photo') : t('Ajouter une photo')}
            <input type="file" accept="image/*" className="hidden" onChange={pick} />
          </label>
          {shown && (
            <button type="button" className="block text-xs text-stone-500 underline"
              onClick={() => { onPhoto(null); onChange({ ...bike, photoUrl: null }); }}>
              {t('Retirer la photo')}
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" required={required} maxLength={40} placeholder={t('Nom du vélo (ex : Mon Canyon)')} aria-label={t('Nom du vélo')}
          value={bike.name} onChange={(e) => onChange({ ...bike, name: e.target.value })} />
        <select className="input" value={bike.kind} onChange={(e) => onChange({ ...bike, kind: e.target.value })} aria-label={t('Type de vélo')}>
          {BIKE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.emoji} {k.label}</option>)}
        </select>
        <input className="input sm:col-span-2" maxLength={80} placeholder={t('Marque et modèle (facultatif)')} aria-label={t('Marque et modèle')}
          value={bike.brand} onChange={(e) => onChange({ ...bike, brand: e.target.value })} />
      </div>
    </div>
  );
}

// « Mes vélos » : liste, ajout, modification et suppression (chaque vélo est enregistré à part).
function MyBikes({ openId }) {
  const { currentUser, actions } = useApp();
  const bikes = currentUser.bikes || [];
  const [editing, setEditing] = useState(() => (openId === 'new' ? 'new' : bikes.some((b) => b.id === openId) ? openId : null));
  const [form, setForm] = useState(() => (openId && openId !== 'new' ? bikes.find((b) => b.id === openId) || EMPTY_BIKE : EMPTY_BIKE));
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = (bike) => {
    setError(null);
    setPhoto(null);
    setForm(bike ? { name: bike.name, kind: bike.kind, brand: bike.brand, photoUrl: bike.photoUrl } : EMPTY_BIKE);
    setEditing(bike ? bike.id : 'new');
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const err = editing === 'new'
      ? await actions.addBike(form, photo?.file || null)
      : await actions.updateBike(editing, form, photo?.file || null);
    setBusy(false);
    if (err) return setError(err);
    setEditing(null);
    setPhoto(null);
  };
  const remove = async (bike) => {
    if (!window.confirm(t('Supprimer {name} ?', { name: bike.name }))) return;
    const err = await actions.deleteBike(bike.id);
    if (err) setError(err);
  };

  return (
    <section className="card mx-auto max-w-lg space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-800">🚲 {t('Mes vélos')}</h2>
        {editing == null && bikes.length < MAX_BIKES && (
          <button className="btn-ghost" onClick={() => open(null)}><Plus size={16} /> {t('Ajouter')}</button>
        )}
      </div>
      {bikes.length === 0 && editing == null && (
        <p className="text-sm text-stone-500">{t('Présente ton vélo (ou tes vélos) : les autres cyclistes adorent ça.')}</p>
      )}
      {bikes.map((b) => (editing === b.id ? null : (
        <BikeCard key={b.id} bike={b} actions={(
          <>
            <button className="rounded-lg p-2 text-stone-500 hover:bg-emerald-50" onClick={() => open(b)} aria-label={t('Modifier')}><Pencil size={16} /></button>
            <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => remove(b)} aria-label={t('Supprimer')}><Trash2 size={16} /></button>
          </>
        )} />
      )))}
      {editing != null && (
        <form onSubmit={save} className="space-y-3 rounded-2xl bg-emerald-50 p-3 dark:bg-stone-800">
          <h3 className="font-bold text-stone-800">{editing === 'new' ? t('Nouveau vélo') : t('Modifier {name}', { name: form.name })}</h3>
          <BikeFields bike={form} onChange={setForm} photo={photo} onPhoto={setPhoto} onError={setError} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? t('Enregistrement…') : t('Enregistrer')}</button>
            <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setError(null); }}>{t('Annuler')}</button>
          </div>
        </form>
      )}
      {editing == null && error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
