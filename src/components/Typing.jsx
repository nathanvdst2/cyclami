import { Check, CheckCheck } from 'lucide-react';
import { t } from '../i18n/index.js';

// Bulle « … » animée : quelqu'un écrit ou enregistre un vocal.
export function TypingBubble({ children }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-300" role="status" aria-live="polite">
      <span className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-3 py-2.5 shadow-sm ring-1 ring-emerald-100 dark:bg-stone-800 dark:ring-stone-700" aria-hidden="true">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-400" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
      {children}
    </div>
  );
}

// Accusé de lecture d'un message envoyé : ✓ envoyé, ✓✓ lu.
export function ReadTicks({ read, className = '' }) {
  return read
    ? <CheckCheck size={14} strokeWidth={2.75} className={className} aria-label={t('Lu')} />
    : <Check size={14} className={`opacity-70 ${className}`} aria-label={t('Envoyé')} />;
}
