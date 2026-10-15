import { useState } from 'react';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { getLang, LANGS, setLang, t } from '../i18n/index.js';
import { useDraft } from '../lib/persist.js';

const TITLES = {
  signup: 'Rejoindre Cyclami 🚴',
  login: 'Bon retour ! 🚴',
  forgot: 'Mot de passe oublié',
};

export default function Auth({ mode, go }) {
  const { actions } = useApp();
  // brouillon gardé à l'actualisation, sauf le mot de passe (jamais enregistré dans le navigateur)
  const [draft, setDraft] = useDraft('auth', { name: '', email: '', city: '', accept: false });
  const [password, setPassword] = useState('');
  const form = { ...draft, password };
  const setForm = ({ password: pw, ...rest }) => { setPassword(pw); setDraft(rest); };
  const [error, setError] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const switchTo = (m) => { setError(null); go(m); };

  const google = async () => {
    setError(null);
    setLoading(true);
    const err = await actions.loginWithGoogle();
    // en cas de succès, le navigateur part chez Google
    if (err) { setError(err); setLoading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (mode === 'signup' && form.password.length < 8) {
      return setError(t('Le mot de passe doit faire au moins 8 caractères.'));
    }
    setLoading(true);
    if (mode === 'signup' && !(await actions.nameAllowed(form.name.trim()))) {
      setLoading(false);
      return setError(t('Ce prénom n’est pas autorisé. Choisis-en un autre.'));
    }
    if (mode === 'signup') {
      const res = await actions.signup({ ...form, lang: getLang() });
      if (res.error) setError(res.error);
      else if (res.needsConfirmation) setSentTo(form.email);
    } else if (mode === 'login') {
      const err = await actions.login(form);
      if (err) setError(err);
    } else {
      const err = await actions.resetPassword(form.email);
      if (err) setError(err);
      else setSentTo(form.email);
    }
    setLoading(false);
  };

  if (sentTo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-emerald-50 px-4">
        <div className="card w-full max-w-sm space-y-4 p-6 text-center">
          <MailCheck className="mx-auto text-teal-500" size={48} />
          <h1 className="text-xl font-extrabold text-stone-800">{t('Regarde tes e-mails')}</h1>
          <p className="text-stone-600">
            {t('Nous avons envoyé un lien à')} <strong>{sentTo}</strong>.{' '}
            {mode === 'signup' ? t('Clique dessus pour activer ton compte.') : t('Clique dessus pour choisir un nouveau mot de passe.')}
          </p>
          <p className="text-sm text-stone-400">{t('Pense à vérifier les spams.')}</p>
          <button className="btn-ghost w-full" onClick={() => { setSentTo(null); switchTo('login'); }}>{t('Aller à la connexion')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-50 px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => go('landing')} className="flex items-center gap-1 text-sm text-stone-500">
            <ArrowLeft size={16} /> {t('Retour')}
          </button>
          <LangSwitch />
        </div>
        <h1 className="text-2xl font-extrabold text-stone-800">{t(TITLES[mode])}</h1>
        {mode === 'signup' && <p className="text-sm text-stone-500">{t('Trouve des cyclistes de ton niveau près de chez toi et roulez ensemble. C’est gratuit.')}</p>}
        {mode === 'forgot' && <p className="text-sm text-stone-500">{t('Indique ton e-mail, on t’envoie un lien pour le réinitialiser.')}</p>}
        {mode !== 'forgot' && (
          <>
            <button type="button" onClick={google} disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">
              <GoogleLogo /> {t('Continuer avec Google')}
            </button>
            {mode === 'signup' && (
              <p className="text-xs text-stone-500">
                {t('En continuant avec Google, tu acceptes les')}{' '}
                <button type="button" className="underline" onClick={() => go('legal', { doc: 'terms', back: 'signup' })}>{t('conditions d’utilisation')}</button>
                {' '}{t('et la')}{' '}
                <button type="button" className="underline" onClick={() => go('legal', { doc: 'privacy', back: 'signup' })}>{t('politique de confidentialité')}</button>.{' '}
                {t('Seuls ton prénom et ton e-mail sont récupérés.')}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-stone-400">
              <span className="h-px flex-1 bg-stone-200" /> {t('ou avec ton e-mail')} <span className="h-px flex-1 bg-stone-200" />
            </div>
          </>
        )}
        {mode === 'signup' && (
          <>
            <input className="input" placeholder={t('Prénom')} required maxLength={50} value={form.name} onChange={set('name')} />
            <input className="input" placeholder={t('Ville ou quartier')} required maxLength={80} value={form.city} onChange={set('city')} />
          </>
        )}
        <input className="input" type="email" placeholder={t('E-mail')} required autoComplete="email" value={form.email} onChange={set('email')} />
        {mode !== 'forgot' && (
          <input className="input" type="password" placeholder={t('Mot de passe')} required
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} />
        )}
        {mode === 'login' && (
          <button type="button" className="text-sm text-teal-600" onClick={() => switchTo('forgot')}>{t('Mot de passe oublié ?')}</button>
        )}
        {mode === 'signup' && (
          <label className="flex items-start gap-2 text-sm text-stone-600">
            <input type="checkbox" required className="mt-1 accent-teal-500" checked={form.accept} onChange={set('accept')} />
            <span>
              {t('J’accepte les')}{' '}
              <button type="button" className="underline" onClick={() => go('legal', { doc: 'terms', back: 'signup' })}>{t('conditions d’utilisation')}</button>
              {' '}{t('et la')}{' '}
              <button type="button" className="underline" onClick={() => go('legal', { doc: 'privacy', back: 'signup' })}>{t('politique de confidentialité')}</button>
              {', '}{t('et j’ai lu les')}{' '}
              <button type="button" className="underline" onClick={() => go('legal', { doc: 'safety', back: 'signup' })}>{t('conseils de sécurité')}</button>.
            </span>
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full py-3" disabled={loading}>
          {loading ? t('Patiente…') : mode === 'signup' ? t('Créer mon compte') : mode === 'login' ? t('Se connecter') : t('Envoyer le lien')}
        </button>
        <p className="text-center text-sm text-stone-500">
          {mode === 'signup' ? t('Déjà inscrit ?') : t('Pas encore de compte ?')}{' '}
          <button type="button" className="font-semibold text-teal-600" onClick={() => switchTo(mode === 'signup' ? 'login' : 'signup')}>
            {mode === 'signup' ? t('Se connecter') : t('S’inscrire')}
          </button>
        </p>
      </form>
    </div>
  );
}

// Petit sélecteur de langue « FR | NL » (changer de langue recharge la page).
function LangSwitch() {
  const cur = getLang();
  return (
    <div className="flex items-center gap-1 text-xs text-stone-400" role="group" aria-label={t('Langue')}>
      {LANGS.map(([code, name], i) => (
        <span key={code} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true" className="text-stone-300">|</span>}
          <button type="button" lang={code} title={name} aria-pressed={code === cur}
            className={code === cur ? 'font-bold text-teal-600' : 'hover:text-stone-600'}
            onClick={() => code !== cur && setLang(code)}>
            {code.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
