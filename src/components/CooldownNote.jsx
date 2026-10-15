import { Timer } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { t } from '../i18n/index.js';

// Rappel de l'anti-spam affiché dans les formulaires (mêmes délais que public.enforce_cooldown, schéma v31).
// Masqué pour l'équipe de modération, qui n'y est pas soumise.
const RULES = {
  ride: () => t('une sortie toutes les 30 min au maximum'),
  topic: () => t('un sujet toutes les 15 min au maximum'),
  reply: () => t('une réponse toutes les 15 s au maximum'),
  post: () => t('une publication toutes les 10 min au maximum'),
  listing: () => t('une annonce par heure au maximum'),
  alert: () => t('une alerte toutes les 30 min au maximum'),
  group: () => t('un groupe par heure au maximum'),
  gear: () => t('un objet toutes les 30 s et 10 par jour au maximum'),
  sitting: () => t('une demande de garde par minute et 10 par jour au maximum'),
};

export default function CooldownNote({ kind }) {
  const { isStaff } = useApp();
  if (isStaff) return null; // l'équipe n'est pas soumise à l'anti-spam
  return (
    <p className="flex items-center gap-1.5 text-xs text-stone-500">
      <Timer size={13} className="shrink-0" /> {t('Anti-spam : {rule}.', { rule: RULES[kind]() })}
    </p>
  );
}
