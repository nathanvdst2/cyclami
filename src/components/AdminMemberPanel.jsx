import { useEffect, useState } from 'react';
import { Activity, Globe, Lock, MonitorSmartphone, Pencil, UserRound, X } from 'lucide-react';
import { useApp, friendlyError } from '../context/AppContext.jsx';
import { describeUserAgent } from '../lib/device.js';
import { locale, t } from '../i18n/index.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : '—');
const flag = (cc) => (cc?.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '');

// Modifier le profil d'un membre (super administrateur).
export function AdminProfileEdit({ user }) {
  const { actions } = useApp();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  if (!form) {
    return (
      <button className="btn-ghost w-full text-sm" onClick={() => setForm({ name: user.name || '', city: user.city || '', bio: user.bio || '', removeAvatar: false })}>
        <Pencil size={14} /> {t('Modifier ce profil (administrateur)')}
      </button>
    );
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const err = await actions.admin.editProfile(user.id, { ...form, name: form.name.trim(), city: form.city.trim(), bio: form.bio.trim() });
    setSaving(false);
    if (err) setError(err); else setForm(null);
  };
  return (
    <form onSubmit={save} className="space-y-2 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
      <div className="text-sm font-bold text-stone-800">{t('Modifier ce profil (administrateur)')}</div>
      <input className="input" required minLength={1} maxLength={50} placeholder={t('Nom')} value={form.name} onChange={set('name')} />
      <input className="input" maxLength={80} placeholder={t('Ville')} value={form.city} onChange={set('city')} />
      <textarea className="input" rows={3} maxLength={500} placeholder={t('Présentation')} value={form.bio} onChange={set('bio')} />
      {user.avatarUrl && (
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" className="accent-teal-500" checked={form.removeAvatar} onChange={set('removeAvatar')} /> {t('Retirer sa photo de profil')}
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={saving}>{saving ? t('Enregistrement…') : t('Enregistrer')}</button>
        <button type="button" className="btn-ghost" onClick={() => setForm(null)}>{t('Annuler')}</button>
      </div>
    </form>
  );
}

// Fournisseur d'accès et localisation approximative d'une adresse IP (service ipwho.is, sans clé).
// Interrogé seulement quand un administrateur ouvre la fiche.
const ipCache = new Map();
function lookupIp(ip) {
  if (!ipCache.has(ip)) {
    ipCache.set(ip, fetch(`https://ipwho.is/${encodeURIComponent(ip)}?lang=${locale().slice(0, 2)}`)
      .then((r) => r.json()).then((d) => (d?.success === false ? null : d)).catch(() => null));
  }
  return ipCache.get(ip);
}

const COUNT_LABELS = [
  ['bikes', 'Vélos'], ['posts', 'Publications'], ['comments', 'Commentaires'], ['rides_hosted', 'Sorties organisées'],
  ['rides_joined', 'Sorties rejointes'], ['messages_sent', 'Messages envoyés'], ['tracks', 'Parcours GPS'], ['hazards', 'Dangers signalés'],
  ['forum_topics', 'Sujets du forum'], ['groups', 'Clubs et groupes'], ['reports_made', 'Signalements faits'],
  ['reports_against', 'Signalements reçus'], ['reports_open', 'Signalements en attente'], ['warnings', 'Avertissements'],
  ['blocked_by', 'Bloqué par'], ['blocking', 'Membres bloqués'],
];
const ALERT_COUNTS = new Set(['reports_against', 'reports_open', 'warnings', 'blocked_by']);
const INFO_LABELS = [
  ['ip', 'Adresse IP'], ['platform', 'Plateforme'], ['screen', 'Écran'], ['viewport', 'Fenêtre'], ['pixelRatio', 'Densité'], ['language', 'Langue'],
  ['languages', 'Langues'], ['timezone', 'Fuseau horaire'], ['standalone', 'Application installée'], ['notifications', 'Notifications'],
  ['touch', 'Écran tactile'], ['memory', 'Mémoire'], ['cores', 'Processeurs'], ['connection', 'Réseau'], ['darkMode', 'Mode sombre'],
];

// Bloc titré de la fiche (fond « carte » : lisible en mode clair comme en mode sombre).
function Block({ icon: Icon, title, children }) {
  return (
    <section className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-emerald-100">
      <h3 className="flex items-center gap-2 text-sm font-bold text-stone-800"><Icon size={16} className="text-teal-500" /> {title}</h3>
      {children}
    </section>
  );
}

// Libellé au-dessus, valeur en dessous : se lit d'un coup d'œil, même sur téléphone.
function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="break-words text-sm font-medium text-stone-800">{children}</div>
    </div>
  );
}

function IpCard({ session }) {
  const [d, setD] = useState(undefined);
  useEffect(() => { lookupIp(session.ip).then(setD); }, [session.ip]);
  const c = d?.connection || {};
  return (
    <li className="space-y-2 rounded-lg bg-stone-100 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-base font-bold text-stone-800">{session.ip}</span>
        <span className="text-xs text-stone-500">
          {session.first_seen && session.first_seen !== session.at
            ? t('du {first} au {last}', { first: when(session.first_seen), last: when(session.at) })
            : when(session.at)}
        </span>
      </div>
      {session.user_agent && <div className="text-sm text-stone-600">{describeUserAgent(session.user_agent)}</div>}
      {d === undefined && <div className="text-sm text-stone-400">{t('Recherche du fournisseur…')}</div>}
      {d === null && <div className="text-sm text-stone-400">{t('Fournisseur et localisation indisponibles')}</div>}
      {d && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label={t('Fournisseur')}>{c.isp || c.org || '?'}{c.asn ? ` (AS${c.asn})` : ''}</Field>
          <Field label={t('Localisation approximative')}>
            {flag(d.country_code)} {[d.city, d.postal].filter(Boolean).join(' ')}{d.country ? `, ${d.country}` : ''}
          </Field>
          {c.org && c.org !== c.isp && <Field label={t('Organisation')}>{c.org}</Field>}
          {d.timezone?.id && <Field label={t('Fuseau horaire')}>{d.timezone.id}</Field>}
          {d.latitude != null && (
            <a className="text-sm font-semibold text-teal-600 underline" target="_blank" rel="noreferrer"
              href={`https://www.openstreetmap.org/?mlat=${d.latitude}&mlon=${d.longitude}#map=11/${d.latitude}/${d.longitude}`}>
              {t('Voir la zone sur la carte (approximative)')}
            </a>
          )}
        </div>
      )}
    </li>
  );
}

// Fiche réservée aux administrateurs (sécurité et modération). Chargée seulement sur demande :
// chaque consultation est inscrite au journal de modération.
export default function AdminMemberPanel({ userId }) {
  const { actions } = useApp();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setInfo(await actions.admin.memberDetails(userId)); setError(null); } catch (e) { setError(friendlyError(e)); }
    setLoading(false);
  };

  if (!info) {
    return (
      <div className="space-y-1">
        <button className="btn-ghost w-full text-sm" onClick={load} disabled={loading}>
          <Lock size={14} /> {loading ? t('Chargement…') : t('Données du compte (admin)')}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-bold text-red-700"><Lock size={16} /> {t('Données du compte (admin)')}</div>
          <p className="mt-1 text-xs text-stone-600">{t('Confidentiel : à utiliser seulement pour la sécurité et la modération. Cette consultation est notée dans le journal.')}</p>
        </div>
        <button className="p-1 text-stone-500 hover:text-stone-700" onClick={() => setInfo(null)} aria-label={t('Fermer')}><X size={18} /></button>
      </div>

      <Block icon={UserRound} title={t('Compte')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('E-mail')}><a className="text-teal-600 underline" href={`mailto:${info.email}`}>{info.email}</a></Field>
          <Field label={t('Connexion')}>{(info.providers || []).filter(Boolean).join(', ') || '—'}</Field>
          <Field label={t('Inscription')}>{when(info.created_at)}</Field>
          <Field label={t('E-mail confirmé')}>{when(info.email_confirmed_at)}</Field>
          <Field label={t('Dernière connexion')}>{when(info.last_sign_in_at)}</Field>
          <Field label={t('Dernière activité')}>{when(info.last_active)}</Field>
          <Field label={t('Statut en ligne')}>{info.show_presence === false ? t('masqué') : t('visible')}</Field>
          <Field label={t('Suspendu')}>
            {info.suspended_until ? <span className="text-red-600">{t('jusqu’au {date}', { date: when(info.suspended_until) })}</span> : t('non')}
          </Field>
          <Field label={t('Langue')}>{({ nl: 'Nederlands', en: 'English' }[info.lang] || 'Français')}</Field>
          <Field label={t('Position (≈ 1 km)')}>
            {info.lat != null ? (
              <a className="text-teal-600 underline" target="_blank" rel="noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${info.lat}&mlon=${info.lng}#map=14/${info.lat}/${info.lng}`}>{info.city || `${info.lat}, ${info.lng}`}</a>
            ) : '—'}
          </Field>
        </div>
      </Block>

      {info.counts && (
        <Block icon={Activity} title={t('Activité')}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COUNT_LABELS.map(([k, label]) => {
              const alert = ALERT_COUNTS.has(k) && info.counts[k] > 0;
              return (
                <div key={k} className={`rounded-lg p-2 ${alert ? 'bg-red-50 ring-1 ring-red-200' : 'bg-stone-100'}`}>
                  <div className={`text-lg font-extrabold leading-tight ${alert ? 'text-red-600' : 'text-stone-800'}`}>{info.counts[k] ?? 0}</div>
                  <div className="text-xs text-stone-500">{t(label)}</div>
                </div>
              );
            })}
          </div>
        </Block>
      )}

      <Block icon={Globe} title={t('Adresses IP récentes')}>
        {info.sessions?.length ? (
          <ul className="space-y-2">{info.sessions.map((s) => <IpCard key={s.ip} session={s} />)}</ul>
        ) : <p className="text-sm text-stone-500">{t('Aucune adresse IP enregistrée récemment.')}</p>}
      </Block>

      <Block icon={MonitorSmartphone} title={t('Appareils utilisés')}>
        {info.devices?.length ? (
          <ul className="space-y-2">
            {info.devices.map((d, i) => (
              <li key={i} className="space-y-2 rounded-lg bg-stone-100 p-3">
                <div className="text-base font-bold text-stone-800">{describeUserAgent(d.user_agent)}</div>
                <div className="text-xs text-stone-500">{t('Vu la première fois le {first}, dernière fois le {last}', { first: when(d.first_seen), last: when(d.last_seen) })}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {INFO_LABELS.filter(([k]) => d.info?.[k]).map(([k, label]) => <Field key={k} label={t(label)}>{d.info[k]}</Field>)}
                </div>
                <details className="text-xs text-stone-500">
                  <summary className="cursor-pointer">{t('User agent complet')}</summary>
                  <p className="mt-1 break-all font-mono text-stone-600">{d.user_agent}</p>
                </details>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-stone-500">{t('Aucun appareil enregistré pour l’instant (signalé à la prochaine visite).')}</p>}
      </Block>
    </div>
  );
}
