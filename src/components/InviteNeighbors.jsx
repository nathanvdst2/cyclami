import { useEffect, useState } from 'react';
import { MessagesSquare, Share2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { t } from '../i18n/index.js';
import { referralLink } from '../lib/referral.js';

// Commune seule (« Bois-de-Villers 5170 » → « Bois-de-Villers »)
const townOf = (city) => String(city || '').replace(/\s*\d{4,5}\s*$/, '').replace(/^\d{4,5}\s*/, '').trim();

// Page vide : « Sois le premier à … », inviter ses voisins, ou passer dire bonjour dans le tchat général.
export default function InviteNeighbors({ go, text, shareText }) {
  const { currentUser, actions } = useApp();
  // lien de parrainage personnel (cyclami.com/?p=…)
  const [code, setCode] = useState(null);
  useEffect(() => { actions.referral.stats().then((s) => setCode(s?.code || null)).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [copied, setCopied] = useState(false);
  const town = townOf(currentUser?.city);

  const share = async () => {
    const url = referralLink(code);
    const message = shareText || t('Rejoins-moi sur Cyclami pour promener nos animaux ensemble 🚴');
    try {
      if (navigator.share) await navigator.share({ title: 'Cyclami', text: message, url });
      else {
        await navigator.clipboard.writeText(`${message} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // partage annulé
    }
  };

  return (
    <div className="space-y-2 rounded-2xl bg-teal-50 p-3 text-center text-sm text-stone-600 ring-1 ring-teal-100 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700">
      <p className="font-bold text-stone-800">{town ? t('Sois le premier à {town} 🚴', { town }) : t('Sois le premier dans ton quartier 🚴')}</p>
      <p>{text || t('Cyclami vient de naître : invite tes voisins et amis qui ont un animal. Plus on est nombreux, plus il y a de sorties et d’entraide près de chez toi.')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button className="btn-primary" onClick={share}>
          <Share2 size={16} /> {copied ? t('Lien copié !') : t('Inviter des voisins')}
        </button>
        {go && (
          <button className="btn-ghost" onClick={() => go('chat')}>
            <MessagesSquare size={16} /> {t('Tchat général')}
          </button>
        )}
      </div>
    </div>
  );
}
