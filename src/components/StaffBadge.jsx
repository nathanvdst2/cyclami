import { Crown, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { t } from '../i18n/index.js';

const ROLE_LABEL = { admin: 'Administrateur du site', moderator: 'Modérateur du site' };

// Badge « Staff » affiché à côté du nom des membres de l'équipe (admin et modérateurs),
// « Fondateur » pour le créateur de Cyclami.
export default function StaffBadge({ userId, className = '' }) {
  const { staffRoles, ownerId } = useApp();
  if (userId && userId === ownerId) {
    return (
      <span title={t('Fondateur de Cyclami')}
        className={`ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-white ${className}`}>
        <Crown size={10} strokeWidth={3} /> {t('Fondateur')}
      </span>
    );
  }
  const role = staffRoles[userId];
  if (!role) return null;
  return (
    <span title={t(ROLE_LABEL[role])}
      className={`ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-teal-500 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-white ${className}`}>
      <ShieldCheck size={10} strokeWidth={3} /> {t('Staff')}
    </span>
  );
}
