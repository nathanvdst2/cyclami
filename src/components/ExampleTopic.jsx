import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { t } from '../i18n/index.js';

// Sujet d'exemple épinglé en tête du forum : montre une question bien posée et des réponses utiles.
// Il n'existe pas en base : on ne peut ni y répondre ni le signaler.
export default function ExampleTopic({ onCreate }) {
  const [open, setOpen] = useState(false);
  const replies = [
    { who: 'Sophie', emoji: '🚴‍♀️', text: t('J’étais exactement dans ton cas l’an dernier ! Commence par des sorties « pas de lâchage » de niveau débutant : le groupe attend tout le monde au sommet des côtes. Et reste dans les roues, on se fatigue beaucoup moins à l’abri.') },
    { who: 'Marc', emoji: '🚴', text: t('Dans les côtes, mouline : petit plateau, grand pignon, et garde une cadence régulière plutôt que de te mettre en danseuse dès le pied. Mange un petit quelque chose toutes les 45 minutes, même sans faim.') },
    { who: 'Léa', emoji: '🚵‍♀️', text: t('Préviens l’organisateur en t’inscrivant que tu débutes, la plupart adaptent l’allure. Si tu es du côté de Namur, on fait une sortie tranquille le dimanche matin à 22 km/h, tu es la bienvenue !') },
  ];
  const tips = [
    t('Un titre clair qui résume la question'),
    t('La bonne catégorie, pour être lu par les bonnes personnes'),
    t('Le contexte : ton niveau, ton vélo, ce que tu as déjà essayé'),
    t('Une question précise, à laquelle on peut répondre'),
    t('Des réponses bienveillantes, basées sur l’expérience'),
  ];
  return (
    <article className="card space-y-3 ring-2 ring-teal-300">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-2xl">🌱</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1 font-bold text-stone-800">
            <span className="rounded-full bg-teal-500 px-2 py-0.5 text-xs font-bold text-white">📌 {t('Exemple')}</span>
            {t('Je débute : comment suivre un groupe sans me faire lâcher dans les côtes ?')}
          </span>
          <span className="block truncate text-xs text-stone-500">{t('Débutants & entraide')} · Thomas</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm text-stone-500"><MessageSquare size={14} /> {replies.length}</span>
      </button>
      {open && (
        <>
          <p className="whitespace-pre-line text-sm text-stone-700">
            {t('Bonjour à tous ! Je roule seul depuis trois mois sur un vélo de route d’occasion, environ 50 km à 22 km/h de moyenne. J’aimerais rejoindre des sorties de groupe, mais j’ai peur de ralentir tout le monde dans les montées.\n\nComment avez-vous fait à vos débuts ? Allure, braquet, alimentation… Merci pour vos conseils !')}
          </p>
          <div className="space-y-2">
            {replies.map((r) => (
              <div key={r.who} className="rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                <div className="font-semibold text-stone-800">{r.emoji} {r.who}</div>
                <p className="text-stone-600">{r.text}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1 rounded-xl bg-teal-50 px-3 py-2 text-sm text-stone-700">
            <p className="font-semibold">{t('Ce sujet n’est pas réel : il montre une question bien posée et des réponses utiles.')}</p>
            <ul className="space-y-0.5">{tips.map((tip) => <li key={tip}>✅ {tip}</li>)}</ul>
          </div>
          <button className="btn-primary w-full" onClick={onCreate}>{t('Poser ma question')}</button>
        </>
      )}
    </article>
  );
}
