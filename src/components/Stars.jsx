import { Star } from 'lucide-react';
import { t } from '../i18n/index.js';

// Note en étoiles : affichage seul, ou choix de 1 à 5 si onChange est fourni.
export default function Stars({ value = 0, onChange, size = 16, className = '' }) {
  const star = (i) => <Star size={size} className={i <= value ? 'fill-emerald-400 text-emerald-400' : 'text-stone-300'} />;
  if (!onChange) {
    return <span className={`inline-flex gap-0.5 ${className}`} role="img" aria-label={t('{n} étoiles sur 5', { n: value })}>{[1, 2, 3, 4, 5].map((i) => <span key={i}>{star(i)}</span>)}</span>;
  }
  return (
    <span className={`inline-flex gap-1 ${className}`} role="radiogroup" aria-label={t('Note')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={t('{n} étoiles sur 5', { n: i })}
          className="rounded transition-transform hover:scale-110" onClick={() => onChange(i)}>{star(i)}</button>
      ))}
    </span>
  );
}
