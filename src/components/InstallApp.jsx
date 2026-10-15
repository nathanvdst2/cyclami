import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { t } from '../i18n/index.js';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

// Propose d'installer Cyclami sur l'écran d'accueil du téléphone.
export default function InstallApp() {
  const [prompt, setPrompt] = useState(() => window.__cyclamiInstallPrompt || null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onReady = () => setPrompt(window.__cyclamiInstallPrompt);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('cyclami:installable', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('cyclami:installable', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const install = async () => {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    window.__cyclamiInstallPrompt = null;
    setPrompt(null);
  };

  return (
    <div className="card flex items-start gap-3">
      <Smartphone className="mt-0.5 shrink-0 text-teal-500" />
      <div className="flex-1 space-y-2 text-sm text-stone-600">
        <div className="font-bold text-stone-800">{t('Installer l’application')}</div>
        {prompt ? (
          <>
            <p>{t('Ajoute Cyclami à ton écran d’accueil, comme une vraie appli.')}</p>
            <button className="btn-primary" onClick={install}>{t('Installer')}</button>
          </>
        ) : isIos() ? (
          <p>{t('Dans Safari, touche le bouton')} <strong>{t('Partager')}</strong> {t('(carré avec une flèche), puis')} <strong>{t('« Sur l’écran d’accueil »')}</strong>.</p>
        ) : (
          <p>{t('Ouvre le menu de ton navigateur (⋮) et choisis')} <strong>{t('« Installer l’application »')}</strong> {t('ou')} <strong>{t('« Ajouter à l’écran d’accueil »')}</strong>.</p>
        )}
      </div>
    </div>
  );
}
