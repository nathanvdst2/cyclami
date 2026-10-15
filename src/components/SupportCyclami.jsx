import { useEffect, useState } from 'react';
import { Heart, Repeat } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { t } from '../i18n/index.js';

// « Soutenir Cyclami » : dons ponctuels ou mensuels via un service de paiement externe.
// Rien ne s'affiche tant que l'administrateur n'a pas indiqué les liens (sauf pour lui, avec un rappel).
export default function SupportCyclami({ go, compact = false }) {
  const { actions, isAdmin } = useApp();
  const [links, setLinks] = useState(null);
  useEffect(() => { actions.donationLinks().then(setLinks).catch(() => setLinks({})); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!links) return null;
  const { once, monthly } = links;
  if (!once && !monthly) {
    return isAdmin && go ? (
      <button className="card w-full text-left text-sm text-stone-500" onClick={() => go('admin', { tab: 'stats' })}>
        💛 {t('Dons : ajoute tes liens de paiement dans l’administration (onglet Statistiques) pour afficher « Soutenir Cyclami ».')}
      </button>
    ) : null;
  }
  return (
    <section className={`card space-y-2 ${compact ? '' : 'ring-2 ring-pink-100'}`}>
      <div className="flex items-center gap-2 font-bold text-stone-800"><Heart size={18} className="text-pink-500" /> {t('Soutenir Cyclami')}</div>
      <p className="text-sm text-stone-600">
        {t('Cyclami est gratuit, sans publicité et ne revend aucune donnée. Les dons paient l’hébergement, les e-mails et les cartes, et aident à faire grandir le site.')}
      </p>
      <div className="flex flex-wrap gap-2">
        {once && <a className="btn-primary" href={once} target="_blank" rel="noopener noreferrer"><Heart size={16} /> {t('Faire un don')}</a>}
        {monthly && <a className="btn-ghost" href={monthly} target="_blank" rel="noopener noreferrer"><Repeat size={16} /> {t('Don mensuel')}</a>}
      </div>
      <p className="text-xs text-stone-400">{t('Paiement sécurisé chez notre partenaire de paiement : Cyclami ne voit jamais tes données bancaires. Un don mensuel s’arrête quand tu veux.')}</p>
    </section>
  );
}

// Administration : les deux liens de paiement (ponctuel et mensuel).
export function DonationSettings() {
  const { actions } = useApp();
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { actions.donationLinks().then((l) => setForm({ once: l.once || '', monthly: l.monthly || '' })).catch(() => setForm({ once: '', monthly: '' })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!form) return null;
  const save = async (e) => {
    e.preventDefault();
    const err = await actions.setDonationLinks(form.once, form.monthly);
    setMsg(err ? { error: err } : { ok: t('Liens enregistrés.') });
  };
  return (
    <form onSubmit={save} className="card space-y-2">
      <div className="flex items-center gap-2 font-bold text-stone-800"><Heart size={18} className="text-pink-500" /> {t('Dons pour le site')}</div>
      <p className="text-xs text-stone-500">{t('Crée un lien de paiement chez Stripe (Payment Links), Ko-fi, Liberapay ou PayPal, puis colle-le ici. Laisse vide pour masquer le bouton.')}</p>
      <label className="block text-sm text-stone-600">{t('Lien pour un don ponctuel')}
        <input className="input mt-1" type="url" placeholder="https://…" value={form.once} onChange={(e) => setForm((f) => ({ ...f, once: e.target.value }))} />
      </label>
      <label className="block text-sm text-stone-600">{t('Lien pour un don mensuel')}
        <input className="input mt-1" type="url" placeholder="https://…" value={form.monthly} onChange={(e) => setForm((f) => ({ ...f, monthly: e.target.value }))} />
      </label>
      {msg?.error && <p className="text-sm text-red-600">{msg.error}</p>}
      {msg?.ok && <p className="text-sm text-green-700">{msg.ok}</p>}
      <button className="btn-primary">{t('Enregistrer')}</button>
    </form>
  );
}
