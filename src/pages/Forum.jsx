import { useEffect, useState } from 'react';
import { ArrowLeft, Lock, MessageSquare, Pencil, Pin, Plus, Search, Trash2, Unlock } from 'lucide-react';
import { useApp, friendlyError } from '../context/AppContext.jsx';
import { timeAgo } from '../utils/geo.js';
import UserAvatar from '../components/UserAvatar.jsx';
import StaffBadge from '../components/StaffBadge.jsx';
import LevelBadge from '../components/LevelBadge.jsx';
import { ModerationBar, ReportButton } from '../components/ModerationTools.jsx';
import { t } from '../i18n/index.js';
import ShareButton from '../components/ShareButton.jsx';
import CooldownNote from '../components/CooldownNote.jsx';
import { useDraft, usePageState } from '../lib/persist.js';
import ExampleTopic from '../components/ExampleTopic.jsx';

// Catégories (mêmes identifiants que la contrainte forum_topics.category en base, voir supabase/schema.sql)
export const FORUM_CATEGORIES = [
  { id: 'general', emoji: '💬', label: t('Discussions générales') },
  { id: 'sorties', emoji: '🚴', label: t('Sorties & rendez-vous') },
  { id: 'materiel', emoji: '🚲', label: t('Matériel & équipement') },
  { id: 'entrainement', emoji: '📈', label: t('Entraînement & nutrition') },
  { id: 'itineraires', emoji: '🗺️', label: t('Itinéraires & parcours') },
  { id: 'securite', emoji: '🦺', label: t('Sécurité routière') },
  { id: 'mecanique', emoji: '🔧', label: t('Mécanique & entretien') },
  { id: 'entraide', emoji: '🌱', label: t('Débutants & entraide') },
];
const categoryOf = (id) => FORUM_CATEGORIES.find((c) => c.id === id) || FORUM_CATEGORIES[0];

export default function Forum({ go, back, params }) {
  if (params.topicId) return <TopicView key={params.topicId} topicId={params.topicId} go={go} back={back} />;
  if (params.new) return <TopicForm go={go} back={back} category={params.category} />;
  return <TopicList go={go} back={back} />;
}

function TopicList({ go, back }) {
  const { actions, getUser } = useApp();
  const [category, setCategory] = usePageState('forum:category', 'all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [topics, setTopics] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setTopics(null);
    actions.forum.topics({ category, search: query }).then(setTopics).catch((e) => setError(friendlyError(e)));
  }, [category, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (active) => `chip ${active ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`;
  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('feed')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-stone-800">{t('Forum')}</h1>
        <button className="btn-primary shrink-0" onClick={() => go('forum', { new: true, category: category === 'all' ? 'general' : category })}>
          <Plus size={16} /> {t('Nouveau sujet')}
        </button>
      </div>
      <p className="text-sm text-stone-500">{t('Pose tes questions, partage tes astuces et aide les autres cyclistes.')}</p>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="input pl-9" placeholder={t('Chercher un sujet…')} value={search}
            onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setQuery(''); }} />
        </div>
        <button className="btn-ghost">{t('Chercher')}</button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button className={chip(category === 'all')} onClick={() => setCategory('all')}>{t('Tout')}</button>
        {FORUM_CATEGORIES.map((c) => (
          <button key={c.id} className={chip(category === c.id)} onClick={() => setCategory(c.id)}>{c.emoji} {c.label}</button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!topics && !error && <div className="card h-40 animate-pulse" />}
      {topics?.length === 0 && (
        <div className="card text-center text-stone-500">
          {query ? t('Aucun sujet ne correspond à ta recherche.') : t('Aucun sujet ici pour l’instant. Lance la discussion !')}
        </div>
      )}

      <div className="space-y-2">
        {topics && !query && ['all', 'entraide'].includes(category) && (
          <ExampleTopic onCreate={() => go('forum', { new: true, category: category === 'all' ? 'general' : category })} />
        )}
        {topics?.map((topic) => {
          const author = getUser(topic.author_id);
          const cat = categoryOf(topic.category);
          return (
            <button key={topic.id} onClick={() => go('forum', { topicId: topic.id })}
              className={`card flex w-full items-start gap-3 text-left ${topic.pinned ? 'ring-2 ring-teal-200' : ''}`}>
              <span className="text-2xl">{cat.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-bold text-stone-800">
                  {topic.pinned && <Pin size={14} className="shrink-0 text-teal-500" />}
                  {topic.locked && <Lock size={14} className="shrink-0 text-stone-400" />}
                  <span className="truncate">{topic.title}</span>
                </span>
                <span className="block truncate text-xs text-stone-500">
                  {cat.label} · {author?.name || t('Membre')} · {t('actif {when}', { when: timeAgo(topic.last_reply_at) })}
                </span>
                {topic.hidden_at && <span className="text-xs text-teal-600">{t('Masqué')}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm text-stone-500">
                <MessageSquare size={14} /> {topic.reply_count}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-stone-500">
        🛡️ {t('Reste bienveillant. Pour une douleur ou une blessure, le forum ne remplace pas l’avis d’un médecin.')}
      </p>
    </div>
  );
}

function TopicForm({ go, back, category, topic }) {
  const { actions } = useApp();
  const [form, setForm, clearDraft] = useDraft(`forum-topic:${topic?.id || 'new'}`, { category: topic?.category || category || 'general', title: topic?.title || '', body: topic?.body || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    if (topic) {
      const err = await actions.forum.updateTopic(topic.id, { category: form.category, title: form.title.trim(), body: form.body.trim() });
      setSaving(false);
      if (err) setError(err); else { clearDraft(); back('forum'); }
      return;
    }
    const res = await actions.forum.createTopic(form);
    setSaving(false);
    if (res.error) setError(res.error); else { clearDraft(); go('forum', { topicId: res.id }); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 pb-4">
      <button type="button" onClick={() => back('forum')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Retour')}
      </button>
      <h1 className="text-2xl font-extrabold text-stone-800">{topic ? t('Modifier le sujet') : t('Nouveau sujet')}</h1>
      <section className="card space-y-3">
        <select className="input" value={form.category} onChange={(e) => set('category', e.target.value)} aria-label={t('Catégorie')}>
          {FORUM_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
        </select>
        <input className="input" required minLength={3} maxLength={120} placeholder={t('Titre (ex : Quel braquet pour débuter en côte ?)')}
          value={form.title} onChange={(e) => set('title', e.target.value)} />
        <textarea className="input" rows="7" maxLength={5000} placeholder={t('Explique ta question ou partage ton expérience…')}
          value={form.body} onChange={(e) => set('body', e.target.value)} />
      </section>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!topic && <CooldownNote kind="topic" />}
      <button className="btn-primary w-full py-3" disabled={saving}>
        {saving ? t('Publication…') : topic ? t('Enregistrer') : t('Publier le sujet')}
      </button>
    </form>
  );
}

function TopicView({ topicId, go, back }) {
  const { actions, currentUser, getUser, isStaff, isAdmin } = useApp();
  const [state, setState] = useState(null);
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useDraft(`forum-reply:${topicId}`, '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const load = () => actions.forum.topic(topicId).then(setState).catch((e) => setError(friendlyError(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state && !error) return <div className="card h-64 animate-pulse" />;
  if (!state?.topic) {
    return (
      <div className="card space-y-3 text-center text-stone-500">
        <p>{error || t('Ce sujet n’existe plus.')}</p>
        <button className="btn-ghost" onClick={() => go('forum')}>{t('Voir le forum')}</button>
      </div>
    );
  }
  const { topic, replies } = state;
  if (editing) return <TopicForm go={go} back={() => { setEditing(false); load(); }} topic={topic} />;

  const mine = topic.author_id === currentUser.id;
  const cat = categoryOf(topic.category);
  const run = async (fn) => {
    setError(null);
    const err = await fn();
    if (err) setError(err); else load();
    return err;
  };
  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    const err = await run(() => actions.forum.reply(topic.id, reply));
    setSending(false);
    if (!err) setReply('');
  };
  const removeTopic = async () => {
    if (!window.confirm(t('Supprimer ce sujet et toutes ses réponses ?'))) return;
    const err = await actions.forum.deleteTopic(topic.id);
    if (err) setError(err); else go('forum');
  };

  return (
    <div className="space-y-4 pb-4">
      <button onClick={() => back('forum')} className="flex items-center gap-1 text-sm text-stone-500">
        <ArrowLeft size={16} /> {t('Forum')}
      </button>

      <article className="card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-teal-600">{cat.emoji} {cat.label}</div>
            <h1 className="flex items-center gap-1 text-xl font-extrabold text-stone-800">
              {topic.pinned && <Pin size={16} className="shrink-0 text-teal-500" />}
              {topic.locked && <Lock size={16} className="shrink-0 text-stone-400" />}
              {topic.title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ShareButton path={`/f/${topic.id}`} label={false} className="p-1 text-stone-400 hover:text-teal-600" title={topic.title}
              text={t('Discussion « {title} » sur le forum Cyclami', { title: topic.title })} />
            {!mine && <ReportButton type="forum_topic" id={topic.id} userId={topic.author_id} />}
          </div>
        </div>
        <ModerationBar type="forum_topic" id={topic.id} hidden={!!topic.hidden_at} isAuthor={mine} />
        <Author userId={topic.author_id} at={topic.created_at} edited={topic.updated_at > topic.created_at} go={go} getUser={getUser} />
        {topic.body && <p className="whitespace-pre-line break-words text-stone-700">{topic.body}</p>}
        {(mine || isStaff) && (
          <div className="flex flex-wrap gap-2">
            {(mine || isAdmin) && <button className="btn-ghost py-1" onClick={() => setEditing(true)}><Pencil size={14} /> {t('Modifier')}</button>}
            {isStaff && (
              <>
                <button className="btn-ghost py-1" onClick={() => run(() => actions.forum.updateTopic(topic.id, { pinned: !topic.pinned }))}>
                  <Pin size={14} /> {topic.pinned ? t('Désépingler') : t('Épingler')}
                </button>
                <button className="btn-ghost py-1" onClick={() => run(() => actions.forum.updateTopic(topic.id, { locked: !topic.locked }))}>
                  {topic.locked ? <><Unlock size={14} /> {t('Rouvrir')}</> : <><Lock size={14} /> {t('Verrouiller')}</>}
                </button>
              </>
            )}
            <button className="btn-ghost py-1 text-red-600" onClick={removeTopic}><Trash2 size={14} /> {t('Supprimer')}</button>
          </div>
        )}
      </article>

      <h2 className="font-bold text-stone-800">
        {t(replies.length > 1 ? '{n} réponses' : '{n} réponse', { n: replies.length })}
      </h2>
      {replies.map((r) => (
        <ReplyCard key={r.id} reply={r} go={go} onChange={load} onError={setError} />
      ))}

      {topic.locked && !isStaff ? (
        <p className="card text-center text-sm text-stone-500">🔒 {t('Ce sujet est verrouillé : on ne peut plus y répondre.')}</p>
      ) : (
        <form onSubmit={send} className="card space-y-2">
          <textarea className="input" rows="3" maxLength={3000} placeholder={t('Ta réponse…')} value={reply} onChange={(e) => setReply(e.target.value)} />
          <CooldownNote kind="reply" />
          <button className="btn-primary w-full" disabled={sending || !reply.trim()}>{sending ? t('Envoi…') : t('Répondre')}</button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function ReplyCard({ reply, go, onChange, onError }) {
  const { actions, currentUser, getUser, isStaff, isAdmin } = useApp();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(reply.body);
  const mine = reply.author_id === currentUser.id;

  const save = async () => {
    const err = await actions.forum.updateReply(reply.id, body);
    if (err) onError(err); else { setEditing(false); onChange(); }
  };
  const remove = async () => {
    if (!window.confirm(t('Supprimer cette réponse ?'))) return;
    const err = await actions.forum.deleteReply(reply.id);
    if (err) onError(err); else onChange();
  };

  return (
    <article className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Author userId={reply.author_id} at={reply.created_at} go={go} getUser={getUser} />
        {!mine && <ReportButton type="forum_reply" id={reply.id} userId={reply.author_id} size={14} />}
      </div>
      <ModerationBar type="forum_reply" id={reply.id} hidden={!!reply.hidden_at} isAuthor={mine} />
      {editing ? (
        <div className="space-y-2">
          <textarea className="input" rows="3" maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary py-1" onClick={save} disabled={!body.trim()}>{t('Enregistrer')}</button>
            <button className="btn-ghost py-1" onClick={() => { setEditing(false); setBody(reply.body); }}>{t('Annuler')}</button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line break-words text-sm text-stone-700">{reply.body}</p>
      )}
      {(mine || isStaff) && !editing && (
        <div className="flex gap-3 text-xs text-stone-500">
          {(mine || isAdmin) && <button className="hover:text-stone-800" onClick={() => setEditing(true)}>{t('Modifier')}</button>}
          <button className="text-red-600" onClick={remove}>{t('Supprimer')}</button>
        </div>
      )}
    </article>
  );
}

function Author({ userId, at, edited, go, getUser }) {
  const u = getUser(userId);
  return (
    <button className="flex items-center gap-2 text-left" onClick={() => u && go('user', { userId })}>
      <UserAvatar user={u} size="sm" />
      <span className="text-sm">
        <span className="font-semibold text-stone-800">{u?.name || t('Membre')}</span>
        <StaffBadge userId={userId} /><LevelBadge xp={u?.xp} />
        <span className="block text-xs text-stone-400">{timeAgo(at)}{edited ? ` · ${t('modifié')}` : ''}</span>
      </span>
    </button>
  );
}
