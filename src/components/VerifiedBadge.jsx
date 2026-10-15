import { ShieldCheck } from 'lucide-react';
import { t } from '../i18n/index.js';

// « Profil vérifié » : vidéo contrôlée à la main par l'équipe (voir pages/Verify.jsx).
export default function VerifiedBadge({ user, compact = false }) {
  if (!user?.verifiedAt) return null;
  if (compact) {
    return <ShieldCheck size={14} className="ml-1 inline shrink-0 align-[-2px] text-green-600" aria-label={t('Profil vérifié')} />;
  }
  return (
    <span className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-200"
      title={t('Une personne de l’équipe a vérifié que ce profil appartient à une vraie personne.')}>
      <ShieldCheck size={12} /> {t('Profil vérifié')}
    </span>
  );
}
