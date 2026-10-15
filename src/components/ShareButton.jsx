import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { shareLink } from '../lib/share.js';
import { t } from '../i18n/index.js';

// Bouton « Partager » : WhatsApp, Messenger… via le partage du téléphone, ou lien copié.
export default function ShareButton({ path, title, text, className = 'btn-ghost', label = true }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    if (await shareLink(path, title, text) === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };
  return (
    <button type="button" className={className} onClick={share} aria-label={t('Partager')}>
      {copied ? <Check size={16} /> : <Share2 size={16} />}
      {label && (copied ? t('Lien copié') : t('Partager'))}
    </button>
  );
}
