import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useApp } from '../context/AppContext.jsx';
import { t } from '../i18n/index.js';

const OPTIONS = [
  ['email_messages', 'Nouveaux messages', 'seulement quand tu n’es pas sur le site, au plus un e-mail toutes les 2 h par conversation'],
  ['email_activity', 'Sorties et commentaires', 'quelqu’un rejoint ta sortie, sortie modifiée ou annulée, nouveau commentaire'],
];

// Choix des notifications reçues par e-mail (les e-mails de modération sont toujours envoyés).
export default function EmailPrefs() {
  const { currentUser, session } = useApp();
  const [prefs, setPrefs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.from('notification_settings').select('*').eq('user_id', currentUser.id).maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError(t('Réglages indisponibles pour le moment.'));
        setPrefs(data || { email_messages: true, email_activity: true });
      });
  }, [currentUser.id]);

  const toggle = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    const { error: e } = await supabase.from('notification_settings').upsert({
      user_id: currentUser.id, email_messages: next.email_messages, email_activity: next.email_activity,
      updated_at: new Date().toISOString(),
    });
    if (e) { setError(t('Impossible d’enregistrer, réessaie.')); setPrefs(prefs); } else setError(null);
  };

  return (
    <section className="card space-y-2">
      <div className="flex items-center gap-2 font-bold text-stone-800"><Mail size={18} className="text-teal-500" /> {t('Notifications par e-mail')}</div>
      <p className="text-xs text-stone-500">{t('Envoyées à {email}.', { email: session.user.email })}</p>
      {prefs && OPTIONS.map(([key, label, hint]) => (
        <label key={key} className="flex cursor-pointer items-start gap-3 py-1">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-teal-500" checked={!!prefs[key]} onChange={() => toggle(key)} />
          <span>
            <span className="block text-sm font-semibold text-stone-700">{t(label)}</span>
            <span className="block text-xs text-stone-500">{t(hint)}</span>
          </span>
        </label>
      ))}
      <p className="text-xs text-stone-400">{t('Les messages de l’équipe de modération sont toujours envoyés.')}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
