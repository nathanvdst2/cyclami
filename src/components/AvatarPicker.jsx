import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { MAX_INPUT_BYTES } from '../utils/image.js';
import { t } from '../i18n/index.js';
import UserAvatar from './UserAvatar.jsx';

// Photo de profil cliquable : choisir une nouvelle photo (ou la retirer).
export default function AvatarPicker({ className = '', withRemove = false }) {
  const { currentUser, actions } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (file) => {
    setError(null);
    setBusy(true);
    const err = await actions.setAvatar(file);
    setBusy(false);
    if (err) setError(err);
  };

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) return setError(t('Image trop lourde (25 Mo maximum).'));
    run(file);
  };

  return (
    <div className="space-y-1">
      <label className={`relative block w-fit cursor-pointer ${busy ? 'opacity-60' : ''}`} title={t('Changer la photo de profil')}>
        <UserAvatar user={currentUser} size="lg" className={className} />
        <span className="absolute -bottom-1 -right-1 rounded-full bg-teal-500 p-1.5 text-white shadow ring-2 ring-white">
          <Camera size={14} />
        </span>
        <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={pick}
          aria-label={t('Changer la photo de profil')} />
      </label>
      {withRemove && currentUser.avatarUrl && (
        <button type="button" className="text-xs text-stone-500 underline" disabled={busy}
          onClick={() => window.confirm(t('Retirer ta photo de profil ? La photo de ton animal sera affichée à la place.')) && run(null)}>
          {t('Retirer la photo')}
        </button>
      )}
      {error && <p className="max-w-[16rem] text-xs text-red-600">{error}</p>}
    </div>
  );
}
