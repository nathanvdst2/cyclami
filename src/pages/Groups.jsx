import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Footprints, LogIn, LogOut, MapPin, Pencil, Plus, Search, Send, Trash2, Users, X } from 'lucide-react';
import { useApp, friendlyError } from '../context/AppContext.jsx';
import { distanceKm, formatDate, formatDistance, timeAgo } from '../utils/geo.js';
import UserAvatar from '../components/UserAvatar.jsx';
import StaffBadge from '../components/StaffBadge.jsx';
import { t } from '../i18n/index.js';
import { MAX_INPUT_BYTES } from '../utils/image.js';
import ShareButton from '../components/ShareButton.jsx';
import { ReportButton } from '../components/ModerationTools.jsx';
import CooldownNote from '../components/CooldownNote.jsx';
import { EmptyState } from '../components/Illustration.jsx';
import { useDraft, usePageState } from '../lib/persist.js';
import InviteNeighbors from '../components/InviteNeighbors.jsx';

const EMOJIS = ['🚴', '🐕', '🦮', '🐩', '🐈', '🐇', '🐴', '🌳', '🏃', '❤️'];

export default function Groups({ go, back, params }) {
  if (params.groupId) return <GroupView key={params.groupId} groupId={params.groupId} go={go} back={back} />;
  if (params.new) return <GroupForm go={go} back={back} />;
  return <GroupList go={go} back={back} />;
}

function GroupList({ go, back }) {
  const { actions, currentUser } = useApp();
  const [tab, setTab] = usePageState('groups:tab', 'nearby');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setState(null);
    actions.loadGroups({ search: query }).then(setState).catch((e) => setError(friendlyError(e)));
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // les plus proches d'abord (les groupes sans position à la fin)
  const groups = useMemo(() => {
    if (!state) return null;
    const me = currentUser.coords;
    const list = state.groups.map((g) => ({
      ...g, km: me && g.lat != null && g.lng != null ? distanceKm(me, { lat: g.lat, lng: g.lng }) : null,
    }));
    list.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || b.member_count - a.member_count);
    return tab === 'mine' ? list.filter((g) => state.memberships[g.id]) : list;
  }, [state, tab, currentUser.coords]);

  const chip = (active) => `chip ${active ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`;
  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('discover')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-stone-800">{t('Groupes')}</h1>
        <button className="btn-primary shrink-0" onClick={() => go('groups', { new: true })}>
          <Plus size={16} /> {t('Créer un groupe')}
        </button>
      </div>
      <p className="text-sm text-stone-500">{t('Retrouve les propriétaires de ton quartier ou de ta race préférée : sorties en groupe, conseils et entraide.')}</p>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="input pl-9" placeholder={t('Chercher un groupe, une ville…')} value={search}
            onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setQuery(''); }} />
        </div>
        <button className="btn-ghost">{t('Chercher')}</button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button className={chip(tab === 'nearby')} onClick={() => setTab('nearby')}>📍 {t('À proximité')}</button>
        <button className={chip(tab === 'mine')} onClick={() => setTab('mine')}>⭐ {t('Mes groupes')}</button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!groups && !error && <div className="card h-40 animate-pulse" />}
      {groups?.length === 0 && (
        <EmptyState name="groupes-vide">
          {tab === 'mine' ? t('Tu ne fais encore partie d’aucun groupe.')
            : query ? t('Aucun groupe ne correspond à ta recherche.') : t('Aucun groupe ici pour l’instant. Crée le premier !')}
          {tab !== 'mine' && !query && <div className="mt-3"><InviteNeighbors go={go} /></div>}
        </EmptyState>
      )}

      <div className="space-y-2">
        {groups?.map((g) => (
          <button key={g.id} onClick={() => go('groups', { groupId: g.id })} className="card flex w-full items-center gap-3 text-left">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl">{g.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-stone-800">{g.name}</span>
              <span className="block truncate text-xs text-stone-500">
                {[g.city, g.km != null ? formatDistance(g.km) : null].filter(Boolean).join(' · ') || t('Lieu non précisé')}
              </span>
              {state.memberships[g.id] && <span className="text-xs font-semibold text-teal-600">{t('Membre')}</span>}
              {g.hidden_at && <span className="ml-2 text-xs text-teal-600">{t('Masqué')}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-sm text-stone-500"><Users size={14} /> {g.member_count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Création d'un groupe, ou modification (initial = le groupe, onSaved appelé après l'enregistrement).
function GroupForm({ go, back, initial = null, onSaved }) {
  const { actions, currentUser } = useApp();
  const [form, setForm, clearDraft] = useDraft(`group-form:${initial?.id || 'new'}`, initial
    ? { emoji: initial.emoji, name: initial.name, city: initial.city || '', description: initial.description || '' }
    : { emoji: '🚴', name: '', city: currentUser.city || '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    if (initial) {
      const err = await actions.updateGroup(initial.id, form);
      setSaving(false);
      if (err) setError(err); else { clearDraft(); onSaved(); }
      return;
    }
    const res = await actions.createGroup(form);
    setSaving(false);
    if (res.error) setError(res.error); else { clearDraft(); go('groups', { groupId: res.id }); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 pb-4">
      <button type="button" onClick={() => back('groups')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <h1 className="text-2xl font-extrabold text-stone-800">{initial ? t('Modifier le groupe') : t('Nouveau groupe')}</h1>
      <section className="card space-y-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Emoji du groupe')}>
          {EMOJIS.map((e) => (
            <button key={e} type="button" role="radio" aria-checked={form.emoji === e} onClick={() => set('emoji', e)}
              className={`h-10 w-10 rounded-full text-xl ring-1 ${form.emoji === e ? 'bg-teal-100 ring-teal-400' : 'bg-white ring-emerald-200'}`}>
              {e}
            </button>
          ))}
        </div>
        <input className="input" required minLength={3} maxLength={60} placeholder={t('Nom (ex : Bergers australiens de Namur)')}
          value={form.name} onChange={(e) => set('name', e.target.value)} />
        <input className="input" maxLength={80} placeholder={t('Ville ou quartier')} value={form.city} onChange={(e) => set('city', e.target.value)} />
        <textarea className="input" rows="5" maxLength={1000} placeholder={t('Présente le groupe : pour qui, quelles activités, à quel rythme…')}
          value={form.description} onChange={(e) => set('description', e.target.value)} />
        {!initial && <p className="text-xs text-stone-500">📍 {t('Le groupe est placé à ta position approximative, pour que les voisins le trouvent.')}</p>}
      </section>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!initial && <CooldownNote kind="group" />}
      <button className="btn-primary w-full py-3" disabled={saving}>
        {saving ? t('Enregistrement…') : initial ? t('Enregistrer les modifications') : t('Créer le groupe')}
      </button>
    </form>
  );
}

function GroupView({ groupId, go, back }) {
  const { actions, currentUser, getUser, isStaff } = useApp();
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useDraft(`group-message:${groupId}`, '');
  const [photo, setPhoto] = useState(null); // { file, preview }
  useEffect(() => () => photo && URL.revokeObjectURL(photo.preview), [photo]);
  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) return setError(t('Image trop lourde (25 Mo maximum).'));
    setError(null);
    setPhoto({ file, preview: URL.createObjectURL(file) });
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const wallEnd = useRef(null);

  const load = () => actions.loadGroup(groupId).then(setState).catch((e) => setError(friendlyError(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const myRole = state?.members.find((m) => m.user_id === currentUser.id)?.role || null;
  const canRead = !!myRole || isStaff;

  // Mur : chargement puis temps réel
  useEffect(() => {
    if (!canRead) return undefined;
    actions.loadGroupMessages(groupId).then(setMessages).catch((e) => setError(friendlyError(e)));
    return actions.subscribeGroupMessages(groupId, (payload) => {
      if (payload.eventType === 'DELETE') {
        setMessages((list) => list.filter((m) => m.id !== payload.old?.id));
        return;
      }
      const msg = payload.new;
      if (!msg?.id) return;
      if (!getUser(msg.author_id)) actions.loadGroupMessages(groupId).then(setMessages).catch(() => {});
      else setMessages((list) => [...list.filter((m) => m.id !== msg.id), msg].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    });
  }, [groupId, canRead]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state && !error) return <div className="card h-64 animate-pulse" />;
  if (!state?.group) {
    return (
      <div className="card space-y-3 text-center text-stone-500">
        <p>{error || t('Ce groupe n’existe plus.')}</p>
        <button className="btn-ghost" onClick={() => go('groups')}>{t('Voir les groupes')}</button>
      </div>
    );
  }
  const { group, members, rides } = state;
  const owner = group.owner_id === currentUser.id;
  if (editing) {
    return <GroupForm go={go} initial={group} back={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />;
  }

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err); else await load();
    return err;
  };
  const leave = () => {
    if (!window.confirm(t('Quitter ce groupe ?'))) return;
    run(() => actions.leaveGroup(group.id));
  };
  const remove = async () => {
    if (!window.confirm(t('Supprimer ce groupe, ses membres et tout son mur ?'))) return;
    const err = await actions.deleteGroup(group.id);
    if (err) setError(err); else go('groups');
  };
  const send = async (e) => {
    e.preventDefault();
    if (!body.trim() && !photo) return;
    setBusy(true);
    setError(null);
    const err = await actions.sendGroupMessage(group.id, body, photo?.file);
    setBusy(false);
    if (err) return setError(err);
    setBody('');
    setPhoto(null);
    actions.loadGroupMessages(group.id).then(setMessages).catch(() => {});
    setTimeout(() => wallEnd.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), 100);
  };
  const removeMessage = async (m) => {
    const id = m.id;
    if (!window.confirm(t('Supprimer ce message ?'))) return;
    const err = await actions.deleteGroupMessage(id, m.photo_url, m.author_id);
    if (err) setError(err); else setMessages((list) => list.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('groups')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Groupes')}
      </button>

      <article className="card space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-3xl">{group.emoji}</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold text-stone-800">{group.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-stone-500">
              {group.city && <span className="flex items-center gap-1"><MapPin size={12} /> {group.city}</span>}
              <span className="flex items-center gap-1"><Users size={12} /> {t(group.member_count > 1 ? '{n} membres' : '{n} membre', { n: group.member_count })}</span>
            </div>
          </div>
          <ShareButton path={`/g/${group.id}`} label={false} className="p-2 text-stone-400 hover:text-teal-600" title={group.name}
            text={t('Rejoins le groupe « {name} » sur Cyclami {emoji}', { name: group.name, emoji: group.emoji })} />
          {!owner && <ReportButton type="group" id={group.id} userId={group.owner_id} />}
        </div>
        {group.hidden_at && <p className="text-xs text-teal-600">{t('Ce groupe a été masqué par l’équipe.')}</p>}
        {group.description && <p className="whitespace-pre-line break-words text-stone-700">{group.description}</p>}
        <div className="flex flex-wrap gap-2">
          {!myRole && !group.hidden_at && (
            <button className="btn-primary" disabled={busy} onClick={() => run(() => actions.joinGroup(group.id))}>
              <LogIn size={16} /> {t('Rejoindre le groupe')}
            </button>
          )}
          {myRole === 'member' && (
            <button className="btn-ghost" disabled={busy} onClick={leave}><LogOut size={16} /> {t('Quitter le groupe')}</button>
          )}
          {(owner || isStaff) && (
            <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={16} /> {t('Modifier')}</button>
          )}
          {(owner || isStaff) && (
            <button className="btn-ghost text-red-600" onClick={remove}><Trash2 size={16} /> {t('Supprimer le groupe')}</button>
          )}
        </div>
        {owner && <p className="text-xs text-stone-500">{t('Tu as créé ce groupe : pour le quitter, il faut le supprimer.')}</p>}
      </article>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-bold text-stone-800"><Footprints size={18} /> {t('Prochaines sorties du groupe')}</h2>
        {rides.length === 0 ? (
          <p className="card text-sm text-stone-500">
            {myRole ? t('Aucune sortie prévue. Organise-en une et choisis ce groupe dans le formulaire !') : t('Aucune sortie prévue pour l’instant.')}
          </p>
        ) : rides.map((w) => (
          <button key={w.id} className="card flex w-full items-center gap-3 text-left" onClick={() => go('rides')}>
            <span className="text-2xl">🌳</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-stone-800">{w.title}</span>
              <span className="block truncate text-xs text-stone-500">{formatDate(w.starts_at)} · {w.place}</span>
            </span>
          </button>
        ))}
        {myRole && (
          <button className="btn-ghost w-full" onClick={() => go('rides')}><Plus size={16} /> {t('Organiser une sortie')}</button>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-bold text-stone-800">💬 {t('Le mur du groupe')}</h2>
        {!canRead ? (
          <p className="card text-sm text-stone-500">{t('Rejoins le groupe pour lire et écrire sur son mur.')}</p>
        ) : (
          <>
            {messages.length === 0 && <p className="card text-sm text-stone-500">{t('Aucun message pour l’instant. Dis bonjour !')}</p>}
            {messages.map((m) => {
              const u = getUser(m.author_id);
              const mine = m.author_id === currentUser.id;
              return (
                <article key={m.id} className="card space-y-1 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <button className="flex items-center gap-2 text-left" onClick={() => u && go('user', { userId: m.author_id })}>
                      <UserAvatar user={u} size="sm" />
                      <span className="text-sm">
                        <span className="font-semibold text-stone-800">{u?.name || t('Membre')}</span>
                        <StaffBadge userId={m.author_id} />
                        <span className="block text-xs text-stone-400">{timeAgo(m.created_at)}</span>
                      </span>
                    </button>
                    <span className="flex items-center">
                      {!mine && <ReportButton type="group_message" id={m.id} userId={m.author_id} size={14} className="!p-1" />}
                      {(mine || owner || isStaff) && (
                        <button className="p-1 text-stone-400 hover:text-red-600" onClick={() => removeMessage(m)} aria-label={t('Supprimer ce message')}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </span>
                  </div>
                  {m.body && <p className="whitespace-pre-line break-words text-sm text-stone-700">{m.body}</p>}
                  {m.photo_url && (
                    <a href={m.photo_url} target="_blank" rel="noreferrer">
                      <img src={m.photo_url} alt={t('Photo du groupe')} loading="lazy" className="mt-1 max-h-80 w-full rounded-xl bg-emerald-100 object-contain" />
                    </a>
                  )}
                </article>
              );
            })}
            <div ref={wallEnd} />
            {myRole && !group.hidden_at && (
              <form onSubmit={send} className="card space-y-2">
                <textarea className="input" rows="2" maxLength={1000} placeholder={t('Écris aux membres du groupe…')}
                  value={body} onChange={(e) => setBody(e.target.value)} />
                {photo && (
                  <div className="relative">
                    <img src={photo.preview} alt={t('Aperçu')} className="max-h-64 w-full rounded-xl bg-emerald-100 object-contain" />
                    <button type="button" onClick={() => setPhoto(null)} className="absolute right-2 top-2 rounded-full bg-white/90 p-1" aria-label={t('Retirer la photo')}>
                      <X size={16} />
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <label className="btn-ghost cursor-pointer px-3" aria-label={t('Ajouter une photo')}>
                    <Camera size={18} />
                    <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                  </label>
                  <button className="btn-primary flex-1" disabled={busy || (!body.trim() && !photo)}>
                    <Send size={16} /> {busy && photo ? t('Envoi de la photo…') : t('Publier sur le mur')}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-bold text-stone-800"><Users size={18} /> {t('Membres')}</h2>
        <div className="card flex flex-wrap gap-3">
          {members.map((m) => {
            const u = getUser(m.user_id);
            return (
              <button key={m.user_id} className="flex items-center gap-2 text-left" onClick={() => u && go('user', { userId: m.user_id })}>
                <UserAvatar user={u} size="sm" />
                <span className="text-sm">
                  <span className="font-semibold text-stone-800">{u?.name || t('Membre')}</span>
                  {m.role === 'owner' && <span className="block text-xs text-teal-600">{t('Créateur')}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
