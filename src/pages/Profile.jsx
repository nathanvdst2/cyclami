import { useState } from 'react';
import { BellRing, Download, Eye, Languages, LogOut, Pencil, Plus, ShieldCheck, Stethoscope, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { AVAILABILITY_SLOTS } from '../data/constants.js';
import PetBadge from '../components/PetBadge.jsx';
import InstallApp from '../components/InstallApp.jsx';
import LevelCard from '../components/LevelCard.jsx';
import EmailPrefs from '../components/EmailPrefs.jsx';
import AvatarPicker from '../components/AvatarPicker.jsx';
import { t, LANGS, getLang, setLang } from '../i18n/index.js';
import { isBirthday } from '../utils/age.js';
import { illu } from '../lib/illustrations.js';
import SupportCyclami from '../components/SupportCyclami.jsx';
import FeedbackButton from '../components/Feedback.jsx';
import { useDraft } from '../lib/persist.js';

export default function Profile({ go }) {
  const { currentUser, getUser, blockedIds, actions, session, isAdmin, isStaff, isOwner, staffRoles } = useApp();
  const adminId = Object.keys(staffRoles).find((id) => staffRoles[id] === 'admin');
  const [form, setForm] = useDraft('profile', {
    name: currentUser.name, city: currentUser.city, bio: currentUser.bio || '',
    availability: currentUser.availability || [],
  });
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const enableNotifications = async () => {
    const err = await actions.enableSystemNotifications();
    if (err) setError(err);
    if (typeof Notification !== 'undefined') setNotifPermission(Notification.permission);
  };

  const toggleSlot = (s) => setForm({
    ...form,
    availability: form.availability.includes(s) ? form.availability.filter((x) => x !== s) : [...form.availability, s],
  });

  const run = async (fn) => {
    setError(null);
    const err = await fn();
    if (err) setError(err);
    return err;
  };

  const save = async (e) => {
    e.preventDefault();
    setStatus('saving');
    const err = await run(() => actions.updateProfile(form));
    setStatus(err ? null : 'saved');
    if (!err) setTimeout(() => setStatus(null), 1500);
  };

  const deleteAccount = async () => {
    const answer = window.prompt(t('Cette action est définitive : ton profil, tes animaux, tes photos et tes messages seront supprimés.\n\nÉcris SUPPRIMER pour confirmer.'));
    if (answer?.trim().toUpperCase() !== t('SUPPRIMER')) return;
    await run(() => actions.deleteAccount());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <AvatarPicker className="!h-20 !w-20 !text-4xl" withRemove />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-stone-800">{t('Mon profil')}</h1>
          <p className="break-all text-sm text-stone-500">{session.user.email}</p>
          <button className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-teal-600" onClick={() => go('user', { userId: currentUser.id })}>
            <Eye size={14} /> {t('Voir mon profil public')}
          </button>
        </div>
      </div>

      {isStaff && (
        <button className="card flex w-full items-center gap-3 text-left ring-2 ring-teal-200" onClick={() => go('admin')}>
          <ShieldCheck className="shrink-0 text-teal-500" />
          <span className="flex-1">
            <span className="block font-bold text-stone-800">{isAdmin ? t('Administration') : t('Modération')}</span>
            <span className="block text-sm text-stone-500">
              {isAdmin ? t('Signalements, membres, équipe, bannissements et chiffres du site') : t('Signalements à traiter et chiffres du site')}
            </span>
          </span>
        </button>
      )}

      {currentUser.pets.filter((p) => isBirthday(p.birthDate)).map((p) => (
        <section key={p.id} className="card flex items-center gap-3 ring-2 ring-pink-200">
          <img src={illu('anniversaire')} alt="" className="h-20 w-20 shrink-0 object-contain" />
          <div>
            <div className="font-extrabold text-stone-800">{t('Joyeux anniversaire {name} ! 🎂', { name: p.name })}</div>
            <div className="text-sm text-stone-500">{t('Partage une photo de la fête avec le quartier dans le fil.')}</div>
          </div>
        </section>
      ))}

      <button className={`card flex w-full items-center gap-3 text-left ${currentUser.verifiedAt ? '' : 'ring-2 ring-green-200'}`} onClick={() => go('verify')}>
        <ShieldCheck className="shrink-0 text-green-600" size={26} />
        <span className="flex-1">
          <span className="block font-bold text-stone-800">{currentUser.verifiedAt ? t('Profil vérifié ✓') : t('Faire vérifier mon profil')}</span>
          <span className="block text-sm text-stone-500">
            {currentUser.verifiedAt ? t('Le badge est visible sur ton profil.') : t('15 secondes de vidéo pour obtenir le badge « Profil vérifié » et rassurer les autres membres.')}
          </span>
        </span>
      </button>

      <LevelCard user={currentUser} go={go} mine />

      <InstallApp />

      <EmailPrefs />

      <section className="card space-y-2">
        <div className="flex items-center gap-2 font-bold text-stone-800"><Eye size={18} className="text-teal-500" /> {t('Statut en ligne')}</div>
        <label className="flex items-start gap-3 text-sm text-stone-700">
          <input type="checkbox" className="mt-1 accent-teal-500" checked={currentUser.showPresence}
            onChange={(e) => actions.setShowPresence(e.target.checked)} />
          <span>
            {t('Montrer aux autres membres quand je suis en ligne')}
            <span className="block text-xs text-stone-500">{t('Si tu le désactives, personne ne voit si tu es en ligne ni ta dernière connexion.')}</span>
          </span>
        </label>
      </section>

      <section className="card space-y-2">
        <div className="flex items-center gap-2 font-bold text-stone-800"><Languages size={18} className="text-teal-500" /> {t('Langue')}</div>
        <div className="flex flex-wrap gap-2">
          {LANGS.map(([code, label]) => {
            const on = getLang() === code;
            return (
              <button type="button" key={code} lang={code} aria-pressed={on} onClick={() => !on && setLang(code)}
                className={`chip ${on ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {notifPermission === 'default' && (
        <div className="card flex items-center gap-3 text-sm text-stone-600">
          <BellRing className="shrink-0 text-teal-500" />
          <span className="flex-1">{t('Active les alertes pour ne rater aucun message ni inscription à tes sorties.')}</span>
          <button className="btn-primary" onClick={enableNotifications}>{t('Activer')}</button>
        </div>
      )}

      <form onSubmit={save} className="card space-y-3">
        <label className="block text-sm font-semibold text-stone-600">
          {t('Prénom')}
          <input className={`input mt-1 font-normal ${isOwner ? '' : 'cursor-not-allowed opacity-70'}`} required maxLength={50}
            value={form.name} onChange={set('name')} readOnly={!isOwner} />
          {!isOwner && <span className="mt-1 block text-xs font-normal text-stone-500">{t('Le prénom choisi à l’inscription ne peut plus être modifié. Besoin d’un changement ? Écris à l’équipe.')}</span>}
        </label>
        <label className="block text-sm font-semibold text-stone-600">
          {t('Ville ou quartier')}
          <input className="input mt-1 font-normal" maxLength={80} value={form.city} onChange={set('city')} />
        </label>
        <label className="block text-sm font-semibold text-stone-600">
          {t('Présentation')}
          <textarea className="input mt-1 font-normal" rows="2" maxLength={500} placeholder={t('Tes parcs préférés, tes habitudes de sortie…')} value={form.bio} onChange={set('bio')} />
        </label>
        <div>
          <div className="mb-1 text-sm font-semibold text-stone-600">{t('Disponibilités pour promener')}</div>
          <div className="flex flex-wrap gap-2">
            {AVAILABILITY_SLOTS.map((s) => {
              const on = form.availability.includes(s);
              return (
                <button type="button" key={s} onClick={() => toggleSlot(s)}
                  className={`chip ${on ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
                  {t(s)}
                </button>
              );
            })}
          </div>
        </div>
        <button className="btn-primary" disabled={status === 'saving'}>
          {status === 'saving' ? t('Enregistrement…') : status === 'saved' ? t('Enregistré ✔') : t('Enregistrer')}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-stone-800">{t('Mes animaux')}</h2>
        <button className="btn-ghost" onClick={() => go('pet')}><Plus size={16} /> {t('Ajouter')}</button>
      </div>
      {currentUser.pets.map((p) => (
        <div key={p.id} className="card flex items-start justify-between gap-2">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => go('animal', { petId: p.id })}>
            <PetBadge pet={p} />
          </button>
          <div className="flex shrink-0 gap-1">
            <button className="rounded-lg p-2 text-stone-500 hover:bg-emerald-50" onClick={() => go('health', { petId: p.id })} aria-label={t('Carnet de santé')} title={t('Carnet de santé')}>
              <Stethoscope size={16} />
            </button>
            <button className="rounded-lg p-2 text-stone-500 hover:bg-emerald-50" onClick={() => go('pet', { petId: p.id })} aria-label={t('Modifier')}>
              <Pencil size={16} />
            </button>
            {currentUser.pets.length > 1 && (
              <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label={t('Supprimer')}
                onClick={() => window.confirm(t('Supprimer {name} ?', { name: p.name })) && run(() => actions.deletePet(p.id))}>
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      ))}

      {blockedIds.size > 0 && (
        <div className="card space-y-2">
          <h2 className="font-bold text-stone-800">{t('Membres bloqués')}</h2>
          {[...blockedIds].map((id) => (
            <div key={id} className="flex items-center justify-between text-sm">
              <span>{getUser(id)?.name || t('Membre')}</span>
              <button className="text-teal-600" onClick={() => run(() => actions.unblock(id))}>{t('Débloquer')}</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button className="btn-ghost" onClick={actions.logout}><LogOut size={16} /> {t('Se déconnecter')}</button>
        {isAdmin ? (
          <p className="flex items-center gap-1 text-xs text-stone-400">
            <ShieldCheck size={14} /> {t('Compte administrateur protégé : il ne peut pas être supprimé.')}
          </p>
        ) : isStaff ? (
          <div className="w-full space-y-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-stone-500 ring-1 ring-emerald-100">
            <p className="flex items-center gap-1">
              <ShieldCheck size={14} /> {t('Tu es modérateur : pour supprimer ton compte, demande d’abord à l’administrateur de retirer ton rôle.')}
            </p>
            {adminId && (
              <button className="btn-ghost !py-1 text-xs" onClick={() => go('messages', {
                userId: adminId,
                draft: t('Bonjour, je souhaite quitter l’équipe de modération et supprimer mon compte. Peux-tu retirer mon rôle de modérateur ? Merci !'),
              })}>
                {t('Contacter l’administrateur')}
              </button>
            )}
          </div>
        ) : (
          <button className="btn-ghost text-red-600" onClick={deleteAccount}><Trash2 size={16} /> {t('Supprimer mon compte')}</button>
        )}
      </div>

      <FeedbackButton />
      <SupportCyclami go={go} />
      <ExportData />

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-emerald-100 pt-3 text-sm text-stone-500">
        <button onClick={() => go('legal', { doc: 'safety', back: 'profile' })}>{t('Conseils de sécurité')}</button>
        <button onClick={() => go('legal', { doc: 'privacy', back: 'profile' })}>{t('Confidentialité')}</button>
        <button onClick={() => go('legal', { doc: 'legal', back: 'profile' })}>{t('Mentions légales')}</button>
        <button onClick={() => go('legal', { doc: 'terms', back: 'profile' })}>{t('Conditions')}</button>
      </div>
    </div>
  );
}

// « Télécharger mes données » : copie de tout ce qui concerne le membre (RGPD).
function ExportData() {
  const { actions } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    const err = await actions.exportMyData();
    setBusy(false);
    if (err) setError(err);
  };
  return (
    <div className="card space-y-2">
      <div className="flex items-center gap-2 font-bold text-stone-800"><Download size={18} className="text-teal-500" /> {t('Mes données')}</div>
      <p className="text-sm text-stone-600">{t('Télécharge une copie de tout ce qui te concerne sur Cyclami : profil, animaux, publications, messages, sorties, annonces… (fichier JSON).')}</p>
      <button className="btn-ghost" disabled={busy} onClick={run}><Download size={16} /> {busy ? t('Préparation…') : t('Télécharger mes données')}</button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
