import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, BadgeCheck, Ban, BarChart3, Bug, CheckCircle2, Flag, Home, Mail, MessageCircle, MessageSquareHeart, RefreshCw, ScrollText, Send,
  ShieldCheck, Trash2, TrendingDown, TrendingUp, UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import { useApp, friendlyError } from '../context/AppContext.jsx';
import { timeAgo } from '../utils/geo.js';
import StaffBadge from '../components/StaffBadge.jsx';
import ReportCase from '../components/ReportCase.jsx';
import { locale, t } from '../i18n/index.js';
import { useDraft, usePageState } from '../lib/persist.js';
import { DonationSettings } from '../components/SupportCyclami.jsx';
import { emailQuota } from '../lib/supabase.js';
import AdminVerifications from '../components/AdminVerifications.jsx';
import AddressPicker from '../components/AddressPicker.jsx';

// Actions du journal de modération (enregistrées en français par la base), traduites à l'affichage.
const actionLabel = (action) => {
  const m = /^suspension (\d+) j$/.exec(action || '');
  return m ? t('suspension {n} j', { n: m[1] }) : t(action);
};

// Tableau de bord du super-utilisateur. Toutes les actions sont vérifiées par la base :
// un non-admin qui arriverait ici ne verrait rien et ne pourrait rien faire.
export default function Admin({ go, params = {} }) {
  const { isAdmin, isStaff, staffRoles, currentUser, getUser, actions } = useApp();
  const [tab, setTab] = usePageState('admin:tab', params.tab || 'reports');
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState([]);
  const [members, setMembers] = useState([]);
  const [banned, setBanned] = useState([]);
  const [log, setLog] = useState([]);
  const [filter, setFilter] = usePageState('admin:filter', '');
  const [showResolved, setShowResolved] = usePageState('admin:resolved', false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // vidéos de vérification de profil en attente (pastille de l'onglet)
  const [verifCount, setVerifCount] = useState(0);
  useEffect(() => { if (isAdmin) actions.verification.adminList().then((r) => setVerifCount(r.length)).catch(() => {}); }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // les modérateurs n'ont accès ni aux e-mails des membres ni aux bannissements
      const [s, r, m, b, l] = await Promise.all([
        actions.admin.stats(), actions.admin.reports(),
        isAdmin ? actions.admin.members() : [], isAdmin ? actions.admin.bannedEmails() : [],
        actions.admin.log().catch(() => []),
      ]);
      setLog(l);
      setStats(s);
      setReports(r);
      setMembers(m);
      setBanned(b);
    } catch (e) {
      setError(friendlyError(e));
    }
    setLoading(false);
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (isStaff) load(); }, [isStaff, load]);

  if (!isStaff) {
    return <div className="card text-center text-stone-500">{t('Cette page est réservée à l’équipe du site.')}</div>;
  }

  const memberName = (id) => members.find((m) => m.id === id)?.name || getUser(id)?.name || t('Membre');

  const setModerator = async (member, make) => {
    const question = make
      ? t('Nommer {name} modérateur ?\n\nIl pourra traiter les signalements et retirer des publications, commentaires et sorties. Un badge « Staff » apparaîtra à côté de son nom.', { name: member.name })
      : t('Retirer le rôle de modérateur à {name} ?', { name: member.name });
    if (!window.confirm(question)) return;
    const err = await actions.admin.setModerator(member.id, make);
    if (err) setError(err);
    else load();
  };

  const ban = async (member) => {
    const reason = window.prompt(
      t('Bannir {name} ({email}) ?\n\nSon compte, ses animaux, publications et messages seront supprimés, et son adresse ne pourra plus servir à s’inscrire.\n\nRaison (facultatif) :', { name: member.name, email: member.email }),
    );
    if (reason === null) return;
    const err = await actions.admin.banUser(member.id, reason);
    if (err) setError(err);
    else load();
  };

  const deleteMember = async (member) => {
    if (!window.confirm(t('Supprimer le compte de {name} ({email}) ?\n\nSon profil, ses animaux, publications, messages et photos seront effacés. Contrairement au bannissement, cette adresse pourra se réinscrire.', { name: member.name, email: member.email }))) return;
    if (!window.confirm(t('Dernière confirmation : supprimer définitivement le compte de {name} ?', { name: member.name }))) return;
    const err = await actions.admin.deleteUser(member.id, '');
    if (err) setError(err);
    else load();
  };

  const unsuspend = async (member) => {
    if (!window.confirm(t('Lever la suspension de {name} ?', { name: member.name }))) return;
    const err = await actions.admin.unsuspend(member.id);
    if (err) setError(err);
    else load();
  };

  const unban = async (email) => {
    if (!window.confirm(t('Autoriser à nouveau {email} à s’inscrire ?', { email }))) return;
    const err = await actions.admin.unbanEmail(email);
    if (err) setError(err);
    else load();
  };

  // Dossiers : signalements regroupés par contenu visé ; les plus signalés d'abord.
  const cases = Object.values(reports.reduce((acc, r) => {
    const key = `${r.target_type}:${r.target_id || r.reported_id}:${r.resolved_at ? r.resolved_at : 'ouvert'}`;
    (acc[key] ||= { key, reports: [] }).reports.push(r);
    return acc;
  }, {}));
  const openCount = cases.filter((c) => !c.reports[0].resolved_at).length;
  const visibleCases = cases
    .filter((c) => showResolved || !c.reports[0].resolved_at)
    .sort((a, b) => (!!a.reports[0].resolved_at - !!b.reports[0].resolved_at) || b.reports.length - a.reports.length);
  const needle = filter.trim().toLowerCase();
  const visibleMembers = members.filter((m) => !needle
    || m.name.toLowerCase().includes(needle) || m.email?.toLowerCase().includes(needle) || m.city?.toLowerCase().includes(needle));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-stone-800">
          <ShieldCheck className="text-teal-500" /> {isAdmin ? t('Administration') : t('Modération')}
        </h1>
        <button className="btn-ghost px-3" onClick={load} disabled={loading} aria-label={t('Actualiser')}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!stats && !error && <div className="card h-40 animate-pulse" />}
      {stats && <Dashboard stats={stats} openCount={openCount} isAdmin={isAdmin} setTab={setTab} verifCount={verifCount} />}
      {isAdmin && <EmailQuota />}

      <div className="flex flex-wrap gap-2">
        {[
          ['reports', t('Signalements'), Flag, openCount],
          ['log', t('Journal'), ScrollText, 0],
          ...(isAdmin ? [
            ['stats', t('Statistiques'), BarChart3, 0],
            ['feedback', t('Retours'), MessageSquareHeart, stats?.feedback_new || 0],
            ['verifications', t('Vérifications'), BadgeCheck, verifCount],
            ['shelters', t('Refuges'), Home, (stats?.shelters_pending || 0) + (stats?.shelter_changes || 0) + (stats?.shelter_replies || 0)],
            ['members', t('Membres ({n})', { n: members.length }), Users, 0],
            ['team', t('Équipe ({n})', { n: Object.keys(staffRoles).length }), ShieldCheck, 0],
            ['errors', t('Erreurs'), Bug, stats?.errors_24h || 0],
            ['banned', t('Bannis ({n})', { n: banned.length }), Ban, 0],
          ] : []),
        ].map(([id, label, Icon, badge]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}
            className={`chip inline-flex items-center gap-1.5 ${tab === id ? 'bg-stone-800 text-white ring-stone-800' : 'bg-white text-stone-600 ring-emerald-200'}`}>
            <Icon size={14} /> {label}
            {badge > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-bold leading-4 text-white">{badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'stats' && isAdmin && <Traffic />}
      {tab === 'stats' && isAdmin && <SearchStats />}
      {tab === 'stats' && isAdmin && <DonationSettings />}
      {tab === 'shelters' && isAdmin && <Shelters go={go} thread={params.thread} />}
      {tab === 'feedback' && isAdmin && <FeedbackList go={go} />}
      {tab === 'verifications' && isAdmin && <AdminVerifications go={go} onCount={setVerifCount} />}
      {tab === 'errors' && isAdmin && <ClientErrors />}

      {tab === 'reports' && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" className="accent-teal-500" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            {t('Afficher aussi les dossiers traités')}
          </label>
          {visibleCases.length === 0 && <div className="card text-center text-stone-500">{t('Aucun signalement à traiter 🎉')}</div>}
          {visibleCases.map((c) => (
            <ReportCase key={c.key} reports={c.reports} memberName={memberName} go={go} onDone={load}
              member={members.find((m) => m.id === c.reports[0].reported_id)} />
          ))}
        </div>
      )}

      {tab === 'log' && (
        <div className="space-y-2">
          {log.length === 0 && <div className="card text-center text-stone-500">{t('Aucune action de modération pour l’instant.')}</div>}
          {log.map((l) => (
            <div key={l.id} className="card !p-3 text-sm">
              <div className="text-stone-700">
                <strong>{memberName(l.actor_id)}</strong> · {actionLabel(l.action)}
                {l.target_name && <> · <button className="font-semibold text-teal-600" onClick={() => l.target_user && go('user', { userId: l.target_user })}>{l.target_name}</button></>}
              </div>
              {l.reason && <div className="text-xs text-stone-500">{l.reason}</div>}
              <div className="text-xs text-stone-400">{timeAgo(l.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-2">
          <input className="input" placeholder={t('Filtrer par prénom, e-mail ou ville…')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          {visibleMembers.map((m) => (
            <div key={m.id} className="card flex items-center gap-3 !p-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => go('user', { userId: m.id })}>
                <div className="font-bold text-stone-800">
                  {m.name}
                  <StaffBadge userId={m.id} />
                  {m.id === currentUser.id && <span className="ml-2 rounded-full bg-teal-100 px-2 text-xs text-teal-700">{t('toi')}</span>}
                  {m.reports_against > 0 && <span className="ml-2 rounded-full bg-red-500 px-2 text-xs text-white">{t(m.reports_against > 1 ? '{n} signalements' : '{n} signalement', { n: m.reports_against })}</span>}
                  {m.warnings > 0 && <span className="ml-2 rounded-full bg-emerald-100 px-2 text-xs text-emerald-800">{t(m.warnings > 1 ? '{n} avertissements' : '{n} avertissement', { n: m.warnings })}</span>}
                  {m.suspended_until && <span className="ml-2 rounded-full bg-red-100 px-2 text-xs text-red-700">{t('suspendu jusqu’au {date}', { date: new Date(m.suspended_until).toLocaleDateString(locale()) })}</span>}
                </div>
                <div className="truncate text-xs text-stone-500">{m.email} · {m.city || '—'}</div>
                <div className="text-xs text-stone-400">
                  {t('Inscrit {when}', { when: timeAgo(m.created_at) })} · {t(m.pets > 1 ? '{n} animaux' : '{n} animal', { n: m.pets })} · {t(m.posts > 1 ? '{n} publications' : '{n} publication', { n: m.posts })}
                  {m.last_sign_in_at && <> · {t('vu {when}', { when: timeAgo(m.last_sign_in_at) })}</>}
                </div>
              </button>
              {m.suspended_until && (
                <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => unsuspend(m)}>{t('Lever la suspension')}</button>
              )}
              {!staffRoles[m.id] && (
                <button className="rounded-lg p-2 text-teal-600 hover:bg-teal-50" onClick={() => setModerator(m, true)}
                  aria-label={t('Nommer {name} modérateur', { name: m.name })} title={t('Nommer modérateur')}>
                  <UserPlus size={18} />
                </button>
              )}
              {m.id !== currentUser.id && !staffRoles[m.id] && (
                <>
                  <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => deleteMember(m)} aria-label={t('Supprimer le compte de {name}', { name: m.name })} title={t('Supprimer le compte')}>
                    <Trash2 size={18} />
                  </button>
                  <button className="rounded-lg p-2 text-red-500 hover:bg-red-50" onClick={() => ban(m)} aria-label={t('Bannir {name}', { name: m.name })} title={t('Bannir')}>
                    <Ban size={18} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'team' && isAdmin && (
        <div className="space-y-2">
          <p className="text-sm text-stone-500">
            {t('Les membres de l’équipe ont un badge')} <StaffBadge userId={currentUser.id} />{' '}
            {t('à côté de leur nom. Les modérateurs traitent les signalements et retirent les contenus ; seul l’administrateur bannit et gère l’équipe. Pour nommer un modérateur : onglet « Membres », bouton')}{' '}
            <UserPlus size={14} className="inline" />.
          </p>
          {Object.entries(staffRoles).map(([id, role]) => {
            const m = members.find((x) => x.id === id) || { id, name: getUser(id)?.name || t('Membre') };
            return (
              <div key={id} className="card flex items-center gap-3 !p-3">
                <button className="min-w-0 flex-1 text-left" onClick={() => go('user', { userId: id })}>
                  <div className="font-bold text-stone-800">{m.name}<StaffBadge userId={id} /></div>
                  <div className="text-xs text-stone-500">{role === 'admin' ? t('Administrateur') : t('Modérateur')}{m.email ? ` · ${m.email}` : ''}</div>
                </button>
                {role === 'moderator' && (
                  <button className="btn-ghost text-red-600" onClick={() => setModerator(m, false)}>
                    <UserMinus size={16} /> {t('Retirer')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'banned' && (
        <div className="space-y-2">
          {banned.length === 0 && <div className="card text-center text-stone-500">{t('Personne n’a été banni.')}</div>}
          {banned.map((b) => (
            <div key={b.email} className="card flex items-center gap-3 !p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-stone-800">{b.email}</div>
                <div className="text-xs text-stone-500">{b.reason || t('Sans raison indiquée')} · {timeAgo(b.created_at)}</div>
              </div>
              <button className="text-teal-600" onClick={() => unban(b.email)}>{t('Débannir')}</button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-stone-400">
        {t('Par respect de la vie privée, les messages privés ne sont pas lisibles ici, sauf les extraits qu’un membre transmet lui-même en signalant une conversation.')}
      </p>
    </div>
  );
}

const PAGE_LABELS = {
  landing: t('Accueil (visiteurs)'), login: t('Connexion'), signup: t('Inscription'), discover: t('Découvrir'), rides: t('Sorties'),
  feed: t('Fil'), messages: t('Messages'), profile: t('Profil'), user: t('Profils publics'), listings: t('Annonces'), listing: t('Détail annonce'),
  notifications: t('Notifications'), lost: t('Animaux perdus'), sitting: t('Garde'), health: t('Carnet de santé'), legal: t('Pages légales'),
};

// Statut des demandes de refuge.
const SHELTER_STATUS = { pending: t('À vérifier'), verified: t('Vérifié'), rejected: t('Refusé') };
// demandes à vérifier en premier, puis refuges vérifiés, puis refusés (plus récents d'abord dans chaque groupe)
const SHELTER_ORDER = { pending: 0, verified: 1, rejected: 2 };
const SHELTER_FIELDS = { name: t('Nom'), approval_number: t('Numéro d’agrément'), region: t('Région'), contact: t('Contact'), address: t('Adresse') };

// Refuges : seuls les refuges vérifiés publient des adoptions. Vérifier le numéro d'agrément
// (listes officielles de la Région, site du refuge) avant de valider.
// Fiche d'un refuge (nom, agrément, région, adresse, e-mail, téléphone, site) : l'administration la modifie directement.
const SHELTER_REGIONS = [['wallonie', 'Wallonie'], ['bruxelles', 'Bruxelles'], ['flandre', 'Flandre'], ['france', 'France'], ['autre', 'Autre']];
function ShelterEditor({ shelter: r, onSaved }) {
  const { actions } = useApp();
  const [editing, setEditing] = useState(false);
  const blank = () => ({
    name: r.name || '', approval_number: r.approval_number || '', region: r.region || 'wallonie',
    address: r.address || '', coords: r.lat != null ? { lat: r.lat, lng: r.lng } : null,
    email: r.email || '', phone: r.phone || '', website: r.website || '',
  });
  const [form, setForm] = useState(blank);
  const [error, setError] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    const err = await actions.shelters.update(r.user_id, form);
    if (err) return setError(err);
    setEditing(false);
    onSaved();
  };
  if (!editing) {
    const items = [r.email && `✉️ ${r.email}`, r.phone && `📞 ${r.phone}`, r.website && `🌐 ${r.website.replace(/^https?:\/\//, '')}`].filter(Boolean);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
        {items.length ? items.map((x) => <span key={x} className="break-all">{x}</span>) : <span className="text-emerald-700">{t('Aucune coordonnée')}</span>}
        {r.contact && !items.length && <span className="break-all">({r.contact})</span>}
        <button className="font-semibold text-teal-600" onClick={() => { setForm(blank()); setEditing(true); }}>{t('Modifier la fiche')}</button>
      </div>
    );
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={save} className="space-y-1 rounded-xl bg-emerald-50 p-2">
      <input className="input !py-1 text-sm" required minLength={2} maxLength={120} placeholder={t('Nom du refuge')} value={form.name} onChange={set('name')} aria-label={t('Nom du refuge')} />
      <input className="input !py-1 text-sm" required minLength={3} maxLength={60} placeholder={t('Numéro d’agrément')} value={form.approval_number} onChange={set('approval_number')} aria-label={t('Numéro d’agrément')} />
      <select className="input !py-1 text-sm" value={form.region} onChange={set('region')} aria-label={t('Région')}>
        {SHELTER_REGIONS.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
      </select>
      <AddressPicker value={{ address: form.address, coords: form.coords }} placeholder={t('Adresse du refuge')}
        onChange={(v) => setForm((f) => { const next = typeof v === 'function' ? v({ address: f.address, coords: f.coords }) : v; return { ...f, ...next }; })} />
      <input className="input !py-1 text-sm" type="email" maxLength={120} placeholder={t('E-mail du refuge')} value={form.email} onChange={set('email')} aria-label={t('E-mail du refuge')} />
      <input className="input !py-1 text-sm" type="tel" maxLength={40} placeholder={t('Téléphone du refuge')} value={form.phone} onChange={set('phone')} aria-label={t('Téléphone du refuge')} />
      <input className="input !py-1 text-sm" inputMode="url" maxLength={200} placeholder={t('Site web (ex : www.mon-refuge.be)')} value={form.website} onChange={set('website')} aria-label={t('Site web du refuge')} />
      {r.contact && <p className="break-all text-[11px] text-stone-500">{t('Ancien contact : {text}', { text: r.contact })}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary !py-1 text-xs">{t('Enregistrer')}</button>
        <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setEditing(false)}>{t('Annuler')}</button>
      </div>
    </form>
  );
}

function Shelters({ go, thread }) {
  const { actions } = useApp();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const load = () => actions.shelters.list().then(setRows).catch((e) => setError(friendlyError(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const review = async (r, accept) => {
    const err = await actions.shelters.reviewChanges(r.user_id, accept);
    if (err) setError(err); else load();
  };
  const decide = async (r, status) => {
    const note = status === 'rejected' ? window.prompt(t('Motif du refus (visible par le demandeur) :'), '') : '';
    if (note === null) return;
    const err = await actions.shelters.decide(r.user_id, status, note || '');
    if (err) setError(err); else load();
  };
  if (!rows) return error ? <p className="text-sm text-red-600">{error}</p> : <div className="card h-32 animate-pulse" />;
  return (
    <div className="space-y-2">
      <ShelterThreads initial={thread} />
      <ShelterInvite />
      <p className="text-xs text-stone-500">{t('Vérifie le numéro d’agrément du refuge (listes officielles de la Région, site du refuge) avant de valider : un refuge validé peut publier des adoptions.')}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows.length === 0 && <div className="card text-center text-stone-500">{t('Aucune demande de refuge.')}</div>}
      {[...rows].sort((a, b) => (a.pending_changes ? -1 : SHELTER_ORDER[a.status] ?? 9) - (b.pending_changes ? -1 : SHELTER_ORDER[b.status] ?? 9)).map((r) => (
        <div key={r.user_id} className="card space-y-1 !p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <button className="font-bold text-stone-800" onClick={() => go('user', { userId: r.user_id })}>{r.name}</button>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'verified' ? 'bg-green-100 text-green-700' : r.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>
              {SHELTER_STATUS[r.status]}
            </span>
          </div>
          <div className="text-xs text-stone-500">
            {t('Agrément {number}', { number: r.approval_number })} · {r.region} · {t('compte : {name}', { name: r.member?.name || '—' })}
            {r.address && <div className="truncate text-xs text-stone-500">📍 {r.address}</div>}
          </div>
          <ShelterEditor shelter={r} onSaved={load} />
          {r.note && <div className="text-xs text-red-600">{r.note}</div>}
          {r.pending_changes && (
            <div className="space-y-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
              <p className="font-semibold">⏳ {t('Modification demandée')}</p>
              {Object.entries(SHELTER_FIELDS).filter(([k]) => k in r.pending_changes).map(([k, label]) => (
                <div key={k}>{label} : <s className="text-stone-400">{r[k] || '—'}</s> → <strong>{r.pending_changes[k] || '—'}</strong></div>
              ))}
              <div className="flex gap-2 pt-1">
                <button className="btn-primary !py-1 text-xs" onClick={() => review(r, true)}>{t('Accepter les changements')}</button>
                <button className="btn-ghost !py-1 text-xs" onClick={() => review(r, false)}>{t('Refuser')}</button>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {r.status !== 'verified' && <button className="btn-primary !py-1 text-xs" onClick={() => decide(r, 'verified')}>{t('Valider')}</button>}
            {r.status !== 'rejected' && <button className="btn-ghost !py-1 text-xs" onClick={() => decide(r, 'rejected')}>{t('Refuser')}</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

// Discussions avec les refuges : leurs réponses aux propositions arrivent ici, et on leur répond par e-mail.
function ShelterThreads({ initial }) {
  const { actions } = useApp();
  const [threads, setThreads] = useState(null);
  const [open, setOpen] = usePageState('admin:thread', initial || null);
  const [showWaiting, setShowWaiting] = usePageState('admin:threads-waiting', false);
  const [domain, setDomain] = useState(null);
  const [error, setError] = useState(null);
  const load = () => actions.shelters.threads().then(setThreads).catch((e) => setError(friendlyError(e)));
  useEffect(() => {
    load();
    actions.shelters.inboundDomain().then(setDomain).catch(() => setDomain(''));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleInbound = async () => {
    const next = domain ? '' : 'reply.cyclami.com';
    if (!window.confirm(next
      ? t('Activer la réception des réponses sur le site ? Le DNS de reply.cyclami.com doit déjà pointer vers Brevo, sinon les réponses seront perdues.')
      : t('Désactiver la réception sur le site ? Les réponses iront de nouveau à contact@cyclami.com.'))) return;
    const err = await actions.shelters.setInboundDomain(next);
    if (err) setError(err); else setDomain(next);
  };
  // supprime les messages ; l'historique des propositions (et les « STOP ») est gardé
  const remove = async (th) => {
    if (!window.confirm(t('Supprimer la discussion avec {name} ? Tous ses messages seront effacés.', { name: th.shelter_name || th.email }))) return;
    const err = await actions.shelters.deleteThread(th.email);
    if (err) setError(err); else setThreads((list) => list.filter((x) => x.email !== th.email));
  };
  // réponses reçues en tête ; propositions sans réponse repliées pour garder la liste courte
  const replied = (threads || []).filter((th) => th.replies > 0 || th.last_direction === 'in')
    .sort((a, b) => (b.unread > 0) - (a.unread > 0));
  const waiting = (threads || []).filter((th) => !(th.replies > 0 || th.last_direction === 'in'));
  const renderThread = (th) => (
    <div key={th.email} className="flex items-center gap-1 rounded-xl hover:bg-emerald-50">
      <button className="flex min-w-0 flex-1 items-center gap-2 p-2 text-left" onClick={() => setOpen(th.email)}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-stone-800">{th.shelter_name || th.email}</span>
          <span className="block truncate text-xs text-stone-500">{th.last_direction === 'out' ? `${t('Toi')} : ` : ''}{th.last_excerpt}</span>
        </span>
        <span className="shrink-0 text-xs text-stone-400">{timeAgo(th.last_at)}</span>
        {th.unread > 0 && <span className="shrink-0 rounded-full bg-red-500 px-2 text-xs font-bold text-white">{th.unread}</span>}
      </button>
      <button className="shrink-0 p-2 text-stone-400 hover:text-red-600" onClick={() => remove(th)}
        aria-label={t('Supprimer la discussion avec {name}', { name: th.shelter_name || th.email })}>
        <Trash2 size={16} />
      </button>
    </div>
  );
  if (open) return <ShelterThread email={open} onBack={() => { setOpen(null); load(); }} />;
  return (
    <section className="card space-y-2">
      <div className="flex items-center gap-2 font-bold text-stone-800"><MessageCircle size={18} className="text-teal-500" /> {t('Discussions avec les refuges')}</div>
      {domain !== null && (
        <div className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs ${domain ? 'bg-green-50 text-green-700' : 'bg-emerald-50 text-emerald-800'}`}>
          <span className="min-w-0 flex-1">
            {domain
              ? t('Réception activée : les réponses arrivent ici ({domain}).', { domain })
              : t('Réception sur le site désactivée : les réponses vont à contact@cyclami.com. Active-la une fois le DNS de reply.cyclami.com configuré.')}
          </span>
          <button className="underline" onClick={toggleInbound}>{domain ? t('Désactiver') : t('Activer')}</button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {threads?.length === 0 && <p className="text-sm text-stone-500">{t('Aucune discussion pour l’instant.')}</p>}
      {replied.length > 0 && <div className="text-xs font-semibold text-stone-500">{t('Réponses reçues ({n})', { n: replied.length })}</div>}
      {replied.map(renderThread)}
      {waiting.length > 0 && (
        <button className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs font-semibold text-stone-500 hover:bg-emerald-50"
          onClick={() => setShowWaiting((v) => !v)} aria-expanded={showWaiting}>
          <span>{t('En attente de réponse ({n})', { n: waiting.length })}</span>
          <span className="text-teal-600">{showWaiting ? t('Masquer') : t('Afficher')}</span>
        </button>
      )}
      {showWaiting && waiting.map(renderThread)}
    </section>
  );
}

function ShelterThread({ email, onBack }) {
  const { actions } = useApp();
  const [messages, setMessages] = useState(null);
  const [text, setText] = useDraft(`shelter-reply:${email}`, '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const load = () => actions.shelters.thread(email).then(setMessages).catch((e) => setError(friendlyError(e)));
  useEffect(() => { load(); }, [email]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const err = await actions.shelters.reply(email, text);
    setSending(false);
    if (err) setError(err); else { setText(''); load(); }
  };
  return (
    <section className="card space-y-3">
      <button className="flex items-center gap-1 text-sm text-stone-500" onClick={onBack}><ArrowLeft size={16} /> {t('Discussions')}</button>
      <div className="break-all font-bold text-stone-800">{email}</div>
      {!messages && !error && <div className="h-24 animate-pulse rounded-xl bg-emerald-50" />}
      <div className="space-y-2">
        {messages?.map((m) => (
          <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.direction === 'out' ? 'bg-teal-500 text-white' : 'bg-emerald-50 text-stone-800 ring-1 ring-emerald-100'}`}>
              <div className={`mb-1 text-[11px] ${m.direction === 'out' ? 'text-teal-100' : 'text-stone-500'}`}>
                {m.direction === 'out' ? (m.sent_by || 'Cyclami') : (m.from_name || email)} · {new Date(m.created_at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}
                {m.subject && ` · ${m.subject}`}
              </div>
              <div className="whitespace-pre-line break-words">{m.body}</div>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form onSubmit={send} className="space-y-2">
        <textarea className="input" rows="3" maxLength={5000} placeholder={t('Ta réponse (envoyée par e-mail au refuge)…')} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn-primary w-full" disabled={sending || !text.trim()}><Send size={16} /> {sending ? t('Envoi…') : t('Répondre par e-mail')}</button>
      </form>
    </section>
  );
}

// Proposer à un refuge de rejoindre Cyclami : e-mail professionnel envoyé par le serveur.
// Crédits d'e-mails Brevo : la formule gratuite permet environ 300 e-mails par jour pour tout le site.
const FREE_DAILY_EMAILS = 300;
// Tableau de bord : ce qui attend une action, puis les chiffres (avec la tendance de la semaine).
function Dashboard({ stats: s, openCount, isAdmin, setTab, verifCount = 0 }) {
  const { currentUser } = useApp();
  const todo = [
    [openCount, t(openCount > 1 ? '{n} signalements à traiter' : '{n} signalement à traiter', { n: openCount }), Flag, 'reports'],
    [s.feedback_new || 0, t(s.feedback_new > 1 ? '{n} retours de membres à lire' : '{n} retour de membre à lire', { n: s.feedback_new }), MessageSquareHeart, 'feedback'],
    [verifCount, t(verifCount > 1 ? '{n} vidéos de vérification à regarder' : '{n} vidéo de vérification à regarder', { n: verifCount }), BadgeCheck, 'verifications'],
    [s.shelters_pending || 0, t(s.shelters_pending > 1 ? '{n} refuges à vérifier' : '{n} refuge à vérifier', { n: s.shelters_pending }), Home, 'shelters'],
    [s.shelter_changes || 0, t(s.shelter_changes > 1 ? '{n} modifications de refuge à valider' : '{n} modification de refuge à valider', { n: s.shelter_changes }), Home, 'shelters'],
    [s.shelter_replies || 0, t(s.shelter_replies > 1 ? '{n} réponses de refuges non lues' : '{n} réponse de refuge non lue', { n: s.shelter_replies }), Mail, 'shelters'],
    [s.errors_24h || 0, t(s.errors_24h > 1 ? '{n} erreurs du site ces dernières 24 h' : '{n} erreur du site ces dernières 24 h', { n: s.errors_24h }), Bug, 'errors'],
  ].filter(([n, , , tab]) => n > 0 && (isAdmin || tab === 'reports'));
  const trend = s.members_7d - (s.members_prev_7d ?? s.members_7d);
  const days = s.signups_14d || [];
  const maxDay = Math.max(1, ...days.map((d) => d.n));
  const Metric = ({ value, label, sub, tab }) => (
    <button type="button" disabled={!tab} onClick={() => tab && setTab(tab)}
      className="rounded-xl bg-emerald-50/60 p-3 text-left enabled:hover:ring-2 enabled:hover:ring-teal-200 dark:bg-stone-800/60">
      <div className="text-2xl font-extrabold text-stone-800">{value ?? '—'}</div>
      <div className="text-xs text-stone-500">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] font-semibold text-stone-500">{sub}</div>}
    </button>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        {t('Bonjour {name} 👋', { name: currentUser.name })}
        {s.online > 0 && <span className="ml-2 inline-flex items-center gap-1 text-green-700"><span className="h-2 w-2 rounded-full bg-green-500" />{t(s.online > 1 ? '{n} membres en ligne' : '{n} membre en ligne', { n: s.online })}</span>}
      </p>

      <section className={`card space-y-2 ${todo.length ? 'ring-2 ring-teal-300' : ''}`}>
        <h2 className="font-bold text-stone-800">{t('À traiter')}</h2>
        {todo.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 size={16} /> {t('Rien à traiter : tout est à jour 🎉')}</p>
        ) : todo.map(([n, label, Icon, tab]) => (
          <button key={label} onClick={() => setTab(tab)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-stone-800">
            <Icon size={18} className="shrink-0 text-teal-600" />
            <span className="flex-1 font-semibold text-stone-700">{label}</span>
            <span className="text-xs font-semibold text-teal-600">{t('Ouvrir →')}</span>
          </button>
        ))}
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold text-stone-800">{t('Communauté')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric value={s.members} label={t('Membres')} tab={isAdmin ? 'members' : null}
            sub={<span className={`inline-flex items-center gap-0.5 ${trend > 0 ? 'text-green-700' : trend < 0 ? 'text-red-600' : ''}`}>
              {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : null}
              {t('+{n} cette semaine', { n: s.members_7d })}
            </span>} />
          <Metric value={s.active_7d} label={t('Actifs (7 j)')} sub={s.members ? t('{p} % des membres', { p: Math.round((100 * s.active_7d) / s.members) }) : null} />
          <Metric value={s.pets} label={t('Animaux')} />
          <Metric value={s.online} label={t('En ligne maintenant')} />
        </div>
        {days.length > 0 && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-stone-500">
              <span>{t('Inscriptions des 14 derniers jours')}</span>
              <span>{days.reduce((a, d) => a + d.n, 0)}</span>
            </div>
            <div className="flex h-14 items-end gap-1" role="img" aria-label={t('Inscriptions des 14 derniers jours')}>
              {days.map((d) => (
                <div key={d.day} title={`${String(d.day).slice(0, 10)} : ${d.n}`}
                  className={`flex-1 rounded-t ${d.n ? 'bg-teal-500' : 'bg-emerald-100 dark:bg-stone-700'}`}
                  style={{ height: `${Math.max(6, (100 * d.n) / maxDay)}%` }} />
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="card space-y-2">
          <h2 className="font-bold text-stone-800">{t('Activité (7 derniers jours)')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Metric value={s.rides_upcoming} label={t('Sorties à venir')} sub={t('{n} créées', { n: s.rides_7d })} />
            <Metric value={s.posts_7d} label={t('Publications')} sub={t('{n} au total', { n: s.posts })} />
            <Metric value={s.messages_7d} label={t('Messages privés')} sub={t('{n} au total', { n: s.messages })} />
            <Metric value={s.chat_7d} label={t('Tchat général')} />
          </div>
        </section>
        <section className="card space-y-2">
          <h2 className="font-bold text-stone-800">{t('Entraide et adoptions')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Metric value={s.lost_active} label={t('Alertes animal perdu')} />
            <Metric value={s.listings_active} label={t('Animaux à adopter')} />
            <Metric value={s.shelters_verified} label={t('Refuges vérifiés')} tab={isAdmin ? 'shelters' : null} />
            <Metric value={s.reports_open} label={t('Signalements ouverts')} tab="reports" />
          </div>
        </section>
      </div>
    </div>
  );
}

function EmailQuota() {
  const [quota, setQuota] = useState(null);
  useEffect(() => { emailQuota().then(setQuota).catch(() => setQuota(null)); }, []);
  if (!quota || quota.credits == null) return null;
  const free = quota.type === 'free';
  const low = free ? quota.credits < 60 : quota.credits < 200;
  const empty = quota.credits <= 0;
  return (
    <div className={`rounded-xl px-3 py-2 text-xs ${empty ? 'bg-red-50 text-red-700' : low ? 'bg-emerald-50 text-emerald-800' : 'bg-green-50 text-green-700'}`}>
      📧 {free
        ? t('E-mails restants aujourd’hui : {n} / {max}', { n: quota.credits, max: FREE_DAILY_EMAILS })
        : t('Crédits d’e-mails restants : {n}', { n: quota.credits })}
      {empty
        ? ` — ${t('Limite atteinte : plus aucun e-mail ne part avant demain (notifications et propositions comprises).')}`
        : low && ` — ${t('Bientôt à court : garde-en pour les notifications des membres.')}`}
    </div>
  );
}

function ShelterInvite() {
  const { actions } = useApp();
  const empty = { email: '', name: '', lang: 'fr', note: '' };
  const [form, setForm] = useDraft('shelter-invite', empty);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // { ok, text }
  const [history, setHistory] = useState(null);
  // historique replié : les 3 plus récentes, le reste sur demande
  const [showHistory, setShowHistory] = usePageState('admin:invites-all', false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const loadHistory = () => actions.shelters.invites().then(setHistory).catch(() => setHistory([]));
  const removeInvite = async (h) => {
    if (!window.confirm(t('Retirer la proposition envoyée à {email} de l’historique ?', { email: h.email }))) return;
    const err = await actions.shelters.removeInvite(h.id);
    if (err) setStatus({ ok: false, text: err }); else setHistory((list) => list.filter((x) => x.id !== h.id));
  };
  useEffect(() => { loadHistory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e) => {
    e.preventDefault();
    if (!window.confirm(t('Envoyer la proposition à {email} ?', { email: form.email.trim() }))) return;
    setSending(true);
    setStatus(null);
    const err = await actions.shelters.invite(form);
    setSending(false);
    if (err) setStatus({ ok: false, text: err });
    else {
      setStatus({ ok: true, text: t('Proposition envoyée à {email} ✔', { email: form.email.trim() }) });
      setForm(empty);
      loadHistory();
    }
  };
  // e-mail de test : même contenu, objet « [TEST] », n'entre pas dans l'historique
  const sendTest = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(form.email.trim())) return setStatus({ ok: false, text: t('Adresse e-mail invalide.') });
    setSending(true);
    setStatus(null);
    const err = await actions.shelters.invite(form, true);
    setSending(false);
    setStatus(err ? { ok: false, text: err } : { ok: true, text: t('E-mail de test envoyé à {email} ✔', { email: form.email.trim() }) });
  };
  const toRelaunch = (history || []).filter((h) => h.can_relaunch).length;
  const relaunch = async () => {
    const n = Math.min(toRelaunch, 20);
    if (!window.confirm(t('Envoyer un court rappel à {n} refuge(s) qui n’ont ni répondu ni créé de compte depuis au moins 14 jours ? Chaque refuge n’est relancé qu’une seule fois.', { n }))) return;
    setSending(true);
    setStatus(null);
    try {
      const r = await actions.shelters.relaunch(20);
      setStatus({ ok: true, text: t('{n} rappel(s) envoyé(s) ✔', { n: r?.sent ?? 0 }) + (r?.remaining ? ` ${t('Encore {n} à relancer (20 par envoi).', { n: r.remaining })}` : '') });
      loadHistory();
    } catch (e) {
      setStatus({ ok: false, text: friendlyError(e) });
    }
    setSending(false);
  };
  const optOut = async (email) => {
    if (!window.confirm(t('Ne plus jamais écrire à {email} ?', { email }))) return;
    const err = await actions.shelters.optOut(email);
    if (err) setStatus({ ok: false, text: err }); else loadHistory();
  };

  return (
    <section className="card space-y-3">
      <div className="flex items-center gap-2 font-bold text-stone-800"><Mail size={18} className="text-teal-500" /> {t('Proposer Cyclami à un refuge')}</div>
      <p className="text-xs text-stone-500">{t('Un e-mail professionnel présente le projet et explique comment inscrire le refuge (gratuit, adoptions réservées aux refuges vérifiés). Les réponses arrivent dans les discussions ci-dessus.')}</p>
      <EmailQuota />
      <form onSubmit={send} className="space-y-2">
        <input className="input" type="email" required placeholder={t('Adresse e-mail du refuge')} value={form.email} onChange={set('email')} />
        <div className="flex gap-2">
          <input className="input min-w-0 flex-1" maxLength={100} placeholder={t('Nom du refuge (facultatif)')} value={form.name} onChange={set('name')} />
          <select className="input w-auto" value={form.lang} onChange={set('lang')} aria-label={t('Langue de l’e-mail')}>
            <option value="fr">FR</option><option value="nl">NL</option><option value="en">EN</option>
          </select>
        </div>
        <textarea className="input" rows="2" maxLength={1000} placeholder={t('Message personnel ajouté à l’e-mail (facultatif)')} value={form.note} onChange={set('note')} />
        {status && <p className={`text-sm ${status.ok ? 'text-green-700' : 'text-red-600'}`}>{status.text}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" disabled={sending} onClick={sendTest}>{t('Envoyer un test')}</button>
          <button className="btn-primary flex-1" disabled={sending}><Send size={16} /> {sending ? t('Envoi…') : t('Envoyer la proposition')}</button>
        </div>
        <p className="text-xs text-stone-400">{t('Le test envoie le même e-mail (objet « [TEST] ») sans bloquer l’adresse ni l’ajouter à l’historique : utile pour l’envoyer à ta propre adresse.')}</p>
      </form>
      {history?.length > 0 && (
        <div className="space-y-2 border-t border-emerald-100 pt-2 text-xs text-stone-600">
          <p>
            {t('{n} propositions · {joined} refuges inscrits · {replied} ont répondu', {
              n: history.length, joined: history.filter((h) => h.joined).length, replied: history.filter((h) => h.replied).length,
            })}
          </p>
          {toRelaunch > 0 && (
            <button type="button" className="btn-ghost w-full !py-1.5 text-sm" disabled={sending} onClick={relaunch}>
              🔁 {t('Relancer les refuges sans réponse ({n})', { n: toRelaunch })}
            </button>
          )}
        </div>
      )}
      {history?.length > 0 && (
        <div className="space-y-1 border-t border-emerald-100 pt-2">
          <button type="button" className="flex w-full items-center justify-between text-left text-xs font-semibold text-stone-500"
            onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
            <span>{t('Propositions envoyées ({n})', { n: history.length })}</span>
            {history.length > 3 && <span className="text-teal-600">{showHistory ? t('Masquer') : t('Tout afficher')}</span>}
          </button>
          {(showHistory ? history : history.slice(0, 3)).map((h) => (
            <div key={h.id} className="flex items-center gap-2 text-xs text-stone-600">
              <span className="min-w-0 flex-1 truncate">
                {h.joined && <span title={t('Refuge inscrit sur Cyclami')}>✅ </span>}
                {h.replied && !h.joined && <span title={t('A répondu')}>💬 </span>}
                {h.shelter_name ? `${h.shelter_name} · ` : ''}{h.email} · {h.lang.toUpperCase()} · {timeAgo(h.created_at)}{h.sent_by ? ` · ${h.sent_by}` : ''}
                {h.relaunched_at && ` · ${t('relancé {when}', { when: timeAgo(h.relaunched_at) })}`}
              </span>
              {h.opted_out
                ? <span className="rounded-full bg-stone-100 px-2 text-stone-500">{t('ne plus contacter')}</span>
                : <button className="underline" onClick={() => optOut(h.email)}>{t('A dit STOP')}</button>}
              <button className="shrink-0 p-1 text-stone-400 hover:text-red-600" onClick={() => removeInvite(h)}
                aria-label={t('Retirer la proposition envoyée à {email}', { email: h.email })}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Google (Search Console) : clics et affichages dans les résultats de recherche, 28 derniers jours.
// Rempli chaque jour par le workflow GitHub « Statistiques Google ».
function SearchStats() {
  const { actions } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { actions.admin.searchStats().then(setData).catch((e) => setError(friendlyError(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <div className="card h-32 animate-pulse" />;
  const head = <h2 className="font-bold text-stone-800">🔎 {t('Google (recherche)')}</h2>;
  if (!data.updated_at) {
    return (
      <section className="card space-y-2 text-sm text-stone-600">
        {head}
        <p>{t('Pas encore de données. Inscris le site sur Google Search Console, puis ajoute le secret GSC_SERVICE_ACCOUNT_JSON sur GitHub (étapes détaillées dans le workflow « Statistiques Google »). Les chiffres arrivent ensuite chaque matin.')}</p>
      </section>
    );
  }
  const sum = (k) => data.days.reduce((n, d) => n + d[k], 0);
  const max = Math.max(1, ...data.days.map((d) => d.impressions));
  const Top = ({ title, rows, short }) => (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-stone-500">{title}</div>
      {rows.length === 0 && <p className="text-xs text-stone-400">{t('Rien pour l’instant.')}</p>}
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-stone-700">{short ? r.key.replace(/^https?:\/\/[^/]+/, '') || '/' : r.key}</span>
          <span className="shrink-0 text-stone-500">{t('{c} clics · {i} affichages', { c: r.clicks, i: r.impressions })}</span>
        </div>
      ))}
    </div>
  );
  return (
    <section className="card space-y-3">
      {head}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><div className="text-xl font-extrabold text-stone-800">{sum('clicks')}</div><div className="text-xs text-stone-500">{t('Clics')}</div></div>
        <div><div className="text-xl font-extrabold text-stone-800">{sum('impressions')}</div><div className="text-xs text-stone-500">{t('Affichages')}</div></div>
        <div><div className="text-xl font-extrabold text-stone-800">{sum('impressions') ? `${Math.round((100 * sum('clicks')) / sum('impressions'))} %` : '—'}</div><div className="text-xs text-stone-500">{t('Taux de clic')}</div></div>
      </div>
      <div className="flex h-16 items-end gap-0.5" aria-label={t('Affichages par jour')}>
        {data.days.map((d) => (
          <div key={d.day} className="flex-1 rounded-t bg-teal-400" style={{ height: `${Math.max(4, (100 * d.impressions) / max)}%` }}
            title={`${d.day} : ${d.impressions} / ${d.clicks}`} />
        ))}
      </div>
      <Top title={t('Recherches qui mènent au site')} rows={data.queries} />
      <Top title={t('Pages les plus vues depuis Google')} rows={data.pages} short />
      <p className="text-xs text-stone-400">{t('28 derniers jours · mis à jour le {date}', { date: new Date(data.updated_at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) })}</p>
    </section>
  );
}

function Traffic() {
  const { actions } = useApp();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    actions.admin.traffic(days).then(setData).catch((e) => setError(friendlyError(e)));
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <div className="card h-48 animate-pulse" />;
  const total = (k) => data.days.reduce((n, d) => n + d[k], 0);
  const max = Math.max(1, ...data.days.map((d) => d.visits));
  const maxPage = Math.max(1, ...data.pages.map((p) => p.views));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[7, 30, 90].map((n) => (
          <button key={n} onClick={() => setDays(n)}
            className={`chip ${days === n ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>{t('{n} jours', { n })}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[[t('Visites'), total('visits')], [t('Pages vues'), total('views')], [t('Inscriptions'), total('signups')], [t('Actifs (7 j)'), data.active_7d]].map(([label, value]) => (
          <div key={label} className="card p-3 text-center">
            <div className="text-2xl font-extrabold text-stone-800">{value}</div>
            <div className="text-xs text-stone-500">{label}</div>
          </div>
        ))}
      </div>
      <section className="card space-y-2">
        <h2 className="font-bold text-stone-800">{t('Visites par jour')}</h2>
        <div className="flex h-40 items-end gap-0.5" role="img" aria-label={t('Visites par jour')}>
          {data.days.map((d) => (
            <div key={d.day} className="group relative flex-1" style={{ height: '100%' }}
              title={t('{date} : {visits} visite(s), {signups} inscription(s)', { date: new Date(d.day).toLocaleDateString(locale()), visits: d.visits, signups: d.signups })}>
              <div className="absolute bottom-0 w-full rounded-t bg-teal-400" style={{ height: `${(d.visits / max) * 100}%` }} />
              {d.signups > 0 && <div className="absolute bottom-0 w-full rounded-t bg-green-500" style={{ height: `${Math.min(100, (d.signups / max) * 100)}%` }} />}
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-500"><span className="text-teal-500">■</span> {t('visites')} · <span className="text-green-600">■</span> {t('inscriptions')} · {t('{n} membres actifs sur 30 jours', { n: data.active_30d })}</p>
      </section>
      <section className="card space-y-2">
        <h2 className="font-bold text-stone-800">{t('Pages les plus vues')}</h2>
        {data.pages.length === 0 && <p className="text-sm text-stone-500">{t('Pas encore de données.')}</p>}
        {data.pages.map((p) => (
          <div key={p.page} className="flex items-center gap-2 text-sm">
            <span className="w-36 shrink-0 truncate text-stone-600">{PAGE_LABELS[p.page] || p.page}</span>
            <div className="h-3 flex-1 rounded bg-emerald-100"><div className="h-3 rounded bg-teal-400" style={{ width: `${(p.views / maxPage) * 100}%` }} /></div>
            <span className="w-12 text-right text-stone-500">{p.views}</span>
          </div>
        ))}
      </section>
      <p className="text-xs text-stone-500">{t('Aucun traceur : seuls des compteurs anonymes par page et par jour sont enregistrés.')}</p>
    </div>
  );
}

// Erreurs survenues chez les membres (regroupées), pour corriger les bugs avant qu'on nous les signale.
const FEEDBACK_KIND = { bug: t('🐞 Bug'), idee: t('💡 Idée'), autre: t('💬 Autre') };

// Retours des membres (« Donner mon avis ») : à traiter puis archiver ou supprimer.
function FeedbackList({ go }) {
  const { actions, getUser } = useApp();
  const [rows, setRows] = useState(null);
  const [showDone, setShowDone] = usePageState('admin:feedback-done', false);
  const load = () => actions.admin.feedback().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows) return <div className="card h-32 animate-pulse" />;
  const visible = rows.filter((r) => showDone || r.status === 'new');
  const pending = rows.filter((r) => r.status === 'new').length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-stone-500">
        <span>{t(pending > 1 ? '{n} retours à lire' : '{n} retour à lire', { n: pending })}</span>
        <label className="flex items-center gap-1">
          <input type="checkbox" className="accent-teal-500" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> {t('Voir les retours traités')}
        </label>
      </div>
      {!visible.length && <div className="card text-center text-stone-500">{t('Aucun retour à lire pour l’instant.')}</div>}
      {visible.map((r) => {
        const u = r.user_id && getUser(r.user_id);
        const d = r.device || {};
        return (
          <article key={r.id} className={`card space-y-2 text-sm ${r.status === 'done' ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span className="font-semibold text-stone-700">{FEEDBACK_KIND[r.kind] || r.kind}</span>
              <span>{timeAgo(r.created_at)} · {t('page « {page} »', { page: r.page || '?' })}</span>
            </div>
            <p className="whitespace-pre-line break-words text-stone-800">{r.body}</p>
            {r.photo_url && (
              <a href={r.photo_url} target="_blank" rel="noreferrer">
                <img src={r.photo_url} alt={t('Capture d’écran')} loading="lazy" className="max-h-72 rounded-xl bg-emerald-50 object-contain" />
              </a>
            )}
            <div className="text-[11px] text-stone-400">
              {[d.screen, d.lang, d.standalone === 'true' ? t('appli installée') : null, d.theme === 'dark' ? t('mode sombre') : null].filter(Boolean).join(' · ')}
              <div className="break-words">{d.ua}</div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {r.user_id && (
                <>
                  <button className="font-semibold text-teal-600" onClick={() => go('user', { userId: r.user_id })}>{u?.name || t('Voir le membre')}</button>
                  <button className="font-semibold text-teal-600" onClick={() => go('messages', { userId: r.user_id })}>{t('Lui répondre')}</button>
                </>
              )}
              <button className="text-stone-600 underline" onClick={() => actions.admin.setFeedbackStatus(r.id, r.status === 'new' ? 'done' : 'new').then(load)}>
                {r.status === 'new' ? t('Marquer comme traité') : t('Remettre à lire')}
              </button>
              <button className="text-red-600 underline" onClick={() => window.confirm(t('Supprimer ce retour ?')) && actions.admin.deleteFeedback(r).then(load)}>{t('Supprimer')}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ClientErrors() {
  const { actions } = useApp();
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const load = () => actions.admin.errors().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows) return <div className="card h-32 animate-pulse" />;
  if (!rows.length) return <div className="card text-center text-stone-500">{t('Aucune erreur ces 30 derniers jours 🎉')}</div>;
  return (
    <div className="space-y-2">
      {rows.map((e) => (
        <div key={e.id} className="card space-y-1 text-sm">
          <button className="w-full text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
            <div className="break-words font-semibold text-stone-800">{e.message}</div>
            <div className="text-xs text-stone-500">
              {t('{n} fois · page « {page} » · dernière fois {when}', { n: e.count, page: e.page || '?', when: timeAgo(e.last_at) })}
            </div>
          </button>
          {open === e.id && (
            <>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-100 p-2 text-[11px] text-stone-700">{e.stack || '—'}</pre>
              <div className="text-[11px] text-stone-400">{e.user_agent}</div>
            </>
          )}
          <button className="text-xs text-stone-500 underline" onClick={() => actions.admin.clearError(e.id).then(load)}>{t('Marquer comme corrigée')}</button>
        </div>
      ))}
    </div>
  );
}
