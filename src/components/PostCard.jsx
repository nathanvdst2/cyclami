import { useState } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { timeAgo } from '../utils/geo.js';
import UserAvatar from './UserAvatar.jsx';
import Comments from './Comments.jsx';
import StaffBadge from './StaffBadge.jsx';
import { ModerationBar, ReportButton } from './ModerationTools.jsx';
import { t } from '../i18n/index.js';

export default function PostCard({ post, go }) {
  const { currentUser, getUser, actions, isAdmin } = useApp();
  const [error, setError] = useState(null);
  const author = getUser(post.authorId);
  if (!author) return null;
  const liked = post.likes.includes(currentUser.id);
  const mine = post.authorId === currentUser.id;
  const openAuthor = () => go('user', { userId: author.id });

  const run = async (fn) => {
    const err = await fn();
    setError(err);
  };

  return (
    <article className="card space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={openAuthor} aria-label={author.name}><UserAvatar user={author} size="md" className="!h-10 !w-10" /></button>
        <div className="min-w-0 flex-1 text-left">
          <div className="font-bold text-stone-800">
            <button type="button" onClick={openAuthor}>{author.name}</button><StaffBadge userId={author.id} />
            {author.city && <span className="font-normal text-stone-500"> · {author.city}</span>}
          </div>
          <div className="text-xs text-stone-400">{timeAgo(post.createdAt)}</div>
        </div>
        {!mine && <ReportButton type="post" id={post.id} userId={author.id} />}
        {(mine || isAdmin) && (
          <button onClick={() => window.confirm(t('Supprimer cette publication ?')) && run(() => actions.deletePost(post.id))}
            className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-500" aria-label={t('Supprimer')}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <ModerationBar type="post" id={post.id} hidden={post.hidden} isAuthor={mine} />
      {post.photoUrl ? (
        <img src={post.photoUrl} alt="" loading="lazy" className="max-h-[32rem] w-full rounded-xl bg-emerald-100 object-contain" />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 text-7xl">
          {post.scene || '🚴'}
        </div>
      )}
      <p className="whitespace-pre-line break-words text-stone-700">{post.text}</p>
      <div className="flex items-center gap-4">
        <button onClick={() => run(() => actions.toggleLike(post))} className="flex items-center gap-1 text-sm text-stone-600">
          <Heart size={20} className={liked ? 'fill-red-500 text-red-500' : ''} />
          {post.likes.length}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Comments postId={post.id} go={go} />
    </article>
  );
}
