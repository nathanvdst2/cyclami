import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { t } from '../i18n/index.js';

// Sujet d'exemple épinglé en tête du forum : montre une question bien posée et des réponses utiles.
// Il n'existe pas en base : on ne peut ni y répondre ni le signaler.
export default function ExampleTopic({ onCreate }) {
  const [open, setOpen] = useState(false);
  const replies = [
    { who: 'Sophie', pet: '🐕', text: t('Même souci avec ma border ! Ce qui a marché chez nous : s’arrêter net dès que la laisse se tend, et repartir seulement quand elle revient à côté. Les deux premières semaines sont longues, mais ça paie.') },
    { who: 'Marc', pet: '🦮', text: t('Je conseille aussi un harnais avec anneau devant plutôt qu’un collier : il tire beaucoup moins et c’est plus doux pour sa nuque. Et des sorties plus courtes mais plus souvent au début.') },
    { who: 'Léa', pet: '🐶', text: t('Nous avons pris deux séances avec une éducatrice canine en méthode positive, ça nous a beaucoup aidés. Si tu es du côté de Namur, je peux t’envoyer son contact en message privé.') },
  ];
  const tips = [
    t('Un titre clair qui résume la question'),
    t('La bonne catégorie, pour être lu par les bonnes personnes'),
    t('Le contexte : âge, race, ce qui a déjà été essayé'),
    t('Une question précise, à laquelle on peut répondre'),
    t('Des réponses bienveillantes, basées sur l’expérience'),
  ];
  return (
    <article className="card space-y-3 ring-2 ring-teal-300">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-2xl">🎓</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1 font-bold text-stone-800">
            <span className="rounded-full bg-teal-500 px-2 py-0.5 text-xs font-bold text-white">📌 {t('Exemple')}</span>
            {t('Mon chiot de 6 mois tire en laisse : vos astuces ?')}
          </span>
          <span className="block truncate text-xs text-stone-500">{t('Éducation & comportement')} · Thomas</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm text-stone-500"><MessageSquare size={14} /> {replies.length}</span>
      </button>
      {open && (
        <>
          <p className="whitespace-pre-line text-sm text-stone-700">
            {t('Bonjour à tous ! Mon chiot, un berger australien de 6 mois, tire très fort en laisse dès qu’il voit un autre chien. On a essayé les friandises, sans grand succès.\n\nComment avez-vous fait avec le vôtre ? Harnais, méthode, cours d’éducation… Merci pour vos conseils !')}
          </p>
          <div className="space-y-2">
            {replies.map((r) => (
              <div key={r.who} className="rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                <div className="font-semibold text-stone-800">{r.pet} {r.who}</div>
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
