import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { t } from '../i18n/index.js';

// Affichée quand l'utilisateur arrive depuis le lien « mot de passe oublié ».
export default function NewPassword() {
  const { actions } = useApp();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError(t('Le mot de passe doit faire au moins 8 caractères.'));
    setLoading(true);
    const err = await actions.updatePassword(password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-50 px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <h1 className="text-2xl font-extrabold text-stone-800">{t('Nouveau mot de passe')}</h1>
        <input className="input" type="password" placeholder={t('Nouveau mot de passe')} autoComplete="new-password"
          required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={loading}>{loading ? t('Patiente…') : t('Enregistrer')}</button>
      </form>
    </div>
  );
}
