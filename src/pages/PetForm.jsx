import { useEffect, useState } from 'react';
import { ArrowLeft, Camera, ImagePlus, LogOut, X } from 'lucide-react';
import { MAX_PET_EXTRA_PHOTOS, useApp } from '../context/AppContext.jsx';
import { MAX_INPUT_BYTES } from '../utils/image.js';
import { EMOJIS, SIZES, TRAITS } from '../data/constants.js';
import SpeciesSelect from '../components/SpeciesSelect.jsx';
import PetAvatar from '../components/PetAvatar.jsx';
import { ageLabel } from '../utils/age.js';
import { t } from '../i18n/index.js';
import { illu } from '../lib/illustrations.js';
import { useDraft } from '../lib/persist.js';
import { ShelterForm } from './Listings.jsx';

const EMPTY = { name: '', species: 'chien', breed: '', size: 'moyen', age: 2, birthDate: null, energy: 3, emoji: '🐕', traits: [], photoUrl: null };

export default function PetForm({ go, params = {}, onboarding }) {
  const { currentUser, users, isAdmin, actions } = useApp();
  // le super administrateur peut modifier l'animal d'un autre membre
  const existing = currentUser.pets.find((p) => p.id === params.petId)
    || (isAdmin && params.petId ? users.flatMap((u) => u.pets).find((p) => p.id === params.petId) : undefined);
  const othersPet = !!existing && existing.ownerId !== currentUser.id;
  const [pet, setPet, clearDraft] = useDraft(`pet:${params.petId || 'new'}`, existing || EMPTY);
  const [photoFile, setPhotoFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [extraFiles, setExtraFiles] = useState([]); // [{ file, preview }]
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  // inscription avec Google : la ville n'est pas encore connue
  const [needsCity] = useState(onboarding && !currentUser.city);
  const [city, setCity] = useDraft('pet:city', '');
  // inscription avec Google : le nom vient du compte Google (pseudo, nom complet…), on le fait vérifier
  const [firstName, setFirstName] = useState(currentUser.name || '');
  const set = (k, v) => setPet({ ...pet, [k]: v });
  const [useBirthDate, setUseBirthDate] = useState(!!existing?.birthDate);
  const today = new Date().toLocaleDateString('fr-CA');

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) return setError(t('Image trop lourde (25 Mo maximum).'));
    setError(null);
    setPhotoFile(file);
    setPreview(URL.createObjectURL(file));
  };

  useEffect(() => () => extraFiles.forEach((f) => URL.revokeObjectURL(f.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const extraRoom = MAX_PET_EXTRA_PHOTOS - (pet.extraPhotos?.length || 0) - extraFiles.length;
  const pickExtra = (e) => {
    const picked = [...(e.target.files || [])];
    e.target.value = '';
    const ok = picked.filter((f) => f.size <= MAX_INPUT_BYTES).slice(0, Math.max(0, extraRoom));
    if (ok.length < picked.length) setError(t('Certaines photos n’ont pas été ajoutées ({n} maximum, 25 Mo chacune).', { n: MAX_PET_EXTRA_PHOTOS }));
    else setError(null);
    setExtraFiles((fs) => [...fs, ...ok.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  };

  const toggleTrait = (tr) =>
    set('traits', pet.traits.includes(tr) ? pet.traits.filter((x) => x !== tr) : [...pet.traits, tr].slice(0, 5));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const patch = {};
    if (onboarding && firstName.trim() !== currentUser.name && !(await actions.nameAllowed(firstName.trim()))) {
      setSaving(false);
      return setError(t('Ce prénom n’est pas autorisé. Choisis-en un autre.'));
    }
    if (needsCity) patch.city = city.trim();
    if (onboarding && firstName.trim() && firstName.trim() !== currentUser.name) patch.name = firstName.trim();
    const cityErr = Object.keys(patch).length ? await actions.updateProfile(patch) : null;
    const err = cityErr || await actions.savePet({ ...pet, birthDate: useBirthDate ? pet.birthDate || null : null }, photoFile, extraFiles.map((f) => f.file));
    setSaving(false);
    if (err) return setError(err);
    clearDraft();
    if (othersPet) go('animal', { petId: existing.id, userId: existing.ownerId });
    else if (!onboarding) go('profile');
    // en onboarding, l'app passe automatiquement à l'accueil dès que l'animal existe
  };

  return (
    <div className={onboarding ? 'min-h-screen bg-emerald-50 px-4 py-8' : ''}>
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
            {onboarding ? t('Bienvenue {name} ! Présente ton compagnon', { name: firstName.trim() || currentUser.name }) : existing ? t('Modifier {name}', { name: existing.name }) : t('Ajouter un animal')}
          </h1>
          {onboarding && <p className="mt-1 text-stone-500">{t('Ces infos servent à trouver des compagnons de sortie compatibles.')}</p>}
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
            <input className="input mt-1 font-normal" required maxLength={80} placeholder={t('Ex : Lyon 7e')} value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
        )}

        {onboarding && (
          <div className="border-t border-emerald-200 pt-4">
            <h2 className="text-lg font-bold text-stone-800">{t('🚴 Ton premier animal')}</h2>
            <p className="text-sm text-stone-500">{t('Sa photo, son nom et son caractère. Tu pourras ajouter tes autres animaux ensuite depuis ton profil.')}</p>
          </div>
        )}
        <div className="flex items-center gap-4">
          <PetAvatar pet={{ ...pet, photoUrl: preview || pet.photoUrl }} size="lg" className="!h-20 !w-20 !text-4xl" />
          <div className="space-y-2">
            <label className="btn-ghost cursor-pointer">
              <Camera size={16} /> {preview || pet.photoUrl ? t('Changer la photo') : t('Ajouter une photo')}
              <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            </label>
            {(preview || pet.photoUrl) && (
              <button type="button" className="block text-xs text-stone-500 underline"
                onClick={() => { setPhotoFile(null); setPreview(null); set('photoUrl', null); }}>
                {t('Retirer la photo')}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-stone-600">{t('Autres photos')} <span className="font-normal text-stone-400">({t('{n} maximum', { n: MAX_PET_EXTRA_PHOTOS })})</span></div>
          <div className="flex flex-wrap gap-2">
            {(pet.extraPhotos || []).map((url) => (
              <span key={url} className="relative">
                <img src={url} alt="" className="h-20 w-20 rounded-xl bg-emerald-100 object-contain" />
                <button type="button" className="absolute -right-1 -top-1 rounded-full bg-stone-800 p-0.5 text-white" aria-label={t('Retirer la photo')}
                  onClick={() => set('extraPhotos', pet.extraPhotos.filter((u) => u !== url))}><X size={12} /></button>
              </span>
            ))}
            {extraFiles.map((f) => (
              <span key={f.preview} className="relative">
                <img src={f.preview} alt="" className="h-20 w-20 rounded-xl bg-emerald-100 object-contain" />
                <button type="button" className="absolute -right-1 -top-1 rounded-full bg-stone-800 p-0.5 text-white" aria-label={t('Retirer la photo')}
                  onClick={() => { URL.revokeObjectURL(f.preview); setExtraFiles((fs) => fs.filter((x) => x !== f)); }}><X size={12} /></button>
              </span>
            ))}
            {extraRoom > 0 && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-emerald-200 text-xs text-stone-500">
                <ImagePlus size={20} className="text-teal-500" /> {t('Ajouter')}
                <input type="file" accept="image/*" multiple className="hidden" onChange={pickExtra} />
              </label>
            )}
          </div>
        </div>

        {!preview && !pet.photoUrl && (
          <div>
            <label className="mb-1 block text-sm font-semibold text-stone-600">{t('Ou choisis un avatar')}</label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((e) => (
                <button type="button" key={e} onClick={() => set('emoji', e)}
                  className={`h-12 w-12 rounded-xl text-2xl ${pet.emoji === e ? 'bg-teal-100 ring-2 ring-teal-400' : 'bg-emerald-50'}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input" placeholder={onboarding ? t('Nom de ton animal') : t('Nom')} required maxLength={40} value={pet.name} onChange={(e) => set('name', e.target.value)} />
          {/* « Autre » : on précise quel animal c'est (furet, tortue, chèvre…) */}
          <input className={`input ${pet.species === 'autre' ? 'ring-2 ring-teal-300' : ''}`} maxLength={60} required={pet.species === 'autre'} minLength={pet.species === 'autre' ? 2 : undefined}
            placeholder={pet.species === 'autre' ? t('Quel animal ? (ex : furet, tortue, chèvre)') : t('Race (optionnel)')}
            aria-label={pet.species === 'autre' ? t('Quel animal ?') : t('Race (optionnel)')}
            value={pet.breed} onChange={(e) => set('breed', e.target.value)} />
          <SpeciesSelect value={pet.species} onChange={(v) => set('species', v)} aria-label={t('Espèce')} />
          <select className="input" value={pet.size} onChange={(e) => set('size', e.target.value)}>
            {SIZES.map((s) => <option key={s.id} value={s.id}>{t('Taille : {size}', { size: s.label })}</option>)}
          </select>
          <div className="text-sm text-stone-600">
            {useBirthDate ? (
              <label>
                {t('Date de naissance')}
                <input className="input mt-1" type="date" required min="1980-01-01" max={today}
                  value={pet.birthDate || ''} onChange={(e) => set('birthDate', e.target.value)} />
              </label>
            ) : (
              <label>
                {t('Âge (ans)')}
                <input className="input mt-1" type="number" min="0" max="40" value={pet.age} onChange={(e) => set('age', e.target.value)} />
              </label>
            )}
            <button type="button" className="mt-1 text-xs text-teal-600 underline" onClick={() => setUseBirthDate(!useBirthDate)}>
              {useBirthDate ? t('Indiquer l’âge à la place') : t('Je connais sa date de naissance')}
            </button>
            {useBirthDate && pet.birthDate && (
              <span className="ml-2 text-xs text-stone-500">{t('{age} aujourd’hui · mis à jour automatiquement', { age: ageLabel(pet) })}</span>
            )}
          </div>
          <label className="text-sm text-stone-600">
            {t('Énergie : {n}/5', { n: pet.energy })}
            <input className="mt-3 w-full accent-teal-500" type="range" min="1" max="5" value={pet.energy} onChange={(e) => set('energy', Number(e.target.value))} />
          </label>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-stone-600">{t('Caractère (5 max)')}</label>
          <div className="flex flex-wrap gap-2">
            {TRAITS.map((tr) => (
              <button type="button" key={tr} onClick={() => toggleTrait(tr)}
                className={`chip ${pet.traits.includes(tr) ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
                {t(tr)}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={saving}>
          {saving ? t('Enregistrement…') : onboarding ? t('C’est parti !') : t('Enregistrer')}
        </button>
      </form>
      {onboarding && <ShelterSignup go={go} />}
    </div>
  );
}

// Inscription d'un refuge : pas besoin de présenter un animal personnel, la demande de vérification suffit.
function ShelterSignup({ go }) {
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem('cyclami:shelter-signup') === '1'; } catch { return false; }
  });
  return (
    <section className="card mx-auto mt-4 max-w-lg space-y-3">
      <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-3xl">🏠</span>
        <span>
          <span className="block font-bold text-stone-800">{t('Tu inscris un refuge ?')}</span>
          <span className="block text-sm text-stone-500">{t('Pas besoin de présenter un animal : demande directement la vérification de ton refuge.')}</span>
        </span>
      </button>
      {open && (
        <ShelterForm onDone={() => {
          try { sessionStorage.removeItem('cyclami:shelter-signup'); } catch { /* stockage indisponible */ }
          go('listings');
        }} />
      )}
    </section>
  );
}
