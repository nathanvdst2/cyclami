import { useEffect, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { MAX_INPUT_BYTES } from '../utils/image.js';
import PostCard from '../components/PostCard.jsx';
import { t } from '../i18n/index.js';
import CooldownNote from '../components/CooldownNote.jsx';
import FollowSuggestions from '../components/FollowSuggestions.jsx';
import { useDraft, usePageState } from '../lib/persist.js';

// Décor d'une publication sans photo
const SCENES = ['🚴', '🚵', '⛰️', '🌲', '🌅', '☀️', '🌧️', '☕'];

export default function Feed({ go }) {
  const { posts: allPosts, hasMorePosts, currentUser, following, actions } = useApp();
  // « Abonnements » : seulement mes publications et celles des membres que je suis
  const [scope, setScope] = usePageState('feed:scope', 'all');
  const posts = scope === 'following' ? allPosts.filter((p) => following.has(p.authorId) || p.authorId === currentUser.id) : allPosts;
  const [loadingMore, setLoadingMore] = useState(false);
  const [scene, setScene] = useDraft('post:scene', '🚴');
  const [text, setText] = useDraft('post:text', '');
  const [photoFile, setPhotoFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) return setError(t('Image trop lourde (25 Mo maximum).'));
    setError(null);
    setPhotoFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const clearPhoto = () => { setPhotoFile(null); setPreview(null); };

  const publish = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setPublishing(true);
    const err = await actions.createPost({ scene, text: text.trim(), photoFile });
    setPublishing(false);
    if (err) return setError(err);
    setText('');
    clearPhoto();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold text-stone-800">{t('Fil d’actualité')}</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => go('groups')}>👥 {t('Clubs et groupes')}</button>
          <button className="btn-ghost" onClick={() => go('forum')}>💬 {t('Forum')}</button>
        </div>
      </div>

      <form onSubmit={publish} className="card space-y-3">
        <textarea className="input" rows="2" maxLength={2000} placeholder={t('Raconte ta dernière sortie à vélo…')} value={text} onChange={(e) => setText(e.target.value)} />
        {preview && (
          <div className="relative">
            <img src={preview} alt={t('Aperçu')} className="max-h-64 w-full rounded-xl bg-emerald-100 object-contain" />
            <button type="button" onClick={clearPhoto} className="absolute right-2 top-2 rounded-full bg-white/90 p-1" aria-label={t('Retirer la photo')}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="btn-ghost cursor-pointer px-3" aria-label={t('Ajouter une photo')}>
            <Camera size={18} />
            <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          </label>
          {!preview && (
            <div className="flex flex-wrap gap-1">
              {SCENES.map((s) => (
                <button type="button" key={s} onClick={() => setScene(s)}
                  className={`h-9 w-9 rounded-lg ${scene === s ? 'bg-teal-100 ring-2 ring-teal-300' : ''}`}>{s}</button>
              ))}
            </div>
          )}
          <button className="btn-primary ml-auto" disabled={!text.trim() || publishing}>
            {publishing ? t('Publication…') : t('Publier')}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <CooldownNote kind="post" />
      </form>

      <div className="flex gap-2">
        {[['all', t('Tout le monde')], ['following', t('Mes abonnements')]].map(([id, label]) => (
          <button key={id} onClick={() => setScope(id)}
            className={`chip ${scope === id ? 'bg-stone-800 text-white ring-stone-800' : 'bg-white text-stone-600 ring-emerald-200'}`}>{label}</button>
        ))}
      </div>
      {scope === 'following' && <FollowSuggestions go={go} />}
      {posts.length === 0 && (
        <div className="card text-center text-stone-500">
          {scope === 'following'
            ? t('Rien ici pour l’instant : abonne-toi à des membres depuis leur profil pour voir leurs publications.')
            : <>{t('Aucune publication pour l’instant. Partage la première !')} 📸</>}
        </div>
      )}

      {posts.map((post, i) => (
        <div key={post.id} className="space-y-4">
          <PostCard post={post} go={go} />
          {/* suggestions de membres à suivre glissées après la 3e publication */}
          {scope === 'all' && i === 2 && <FollowSuggestions go={go} />}
        </div>
      ))}

      {hasMorePosts && (
        <button className="btn-ghost w-full" disabled={loadingMore}
          onClick={async () => { setLoadingMore(true); await actions.loadMorePosts(); setLoadingMore(false); }}>
          {loadingMore ? t('Chargement…') : t('Voir plus de publications')}
        </button>
      )}
    </div>
  );
}
