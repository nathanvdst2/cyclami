import { t } from '../i18n/index.js';
import { illu } from '../lib/illustrations.js';

// Adresse inconnue (lien cassé, faute de frappe…).
export default function NotFound({ go }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <img src={illu('404')} alt="" className="h-48 w-48 object-contain" />
      <h1 className="text-2xl font-extrabold text-stone-800">{t('Oups, cette page a crevé !')}</h1>
      <p className="max-w-sm text-stone-500">{t('On a cherché partout, même dans la sacoche de selle, mais cette adresse n’existe pas (ou plus).')}</p>
      <button className="btn-primary" onClick={() => go('discover')}>{t('Revenir à l’accueil')}</button>
    </div>
  );
}
