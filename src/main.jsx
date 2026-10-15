import { i18nReady } from './i18n/index.js';
import './index.css';
import { installErrorReporting } from './lib/errors.js';
import { captureReferral } from './lib/referral.js';

installErrorReporting();
// lien de parrainage (?p=…) : mémorisé pour après l'inscription
captureReferral();

// Mémorise la proposition d'installation (Android / Chrome) pour l'offrir depuis le profil.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__cyclamiInstallPrompt = e;
  window.dispatchEvent(new Event('cyclami:installable'));
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// La traduction (néerlandais ou anglais) est chargée avant le reste du site, qui l'utilise dès son chargement.
i18nReady.then(() => import('./start.jsx'));
