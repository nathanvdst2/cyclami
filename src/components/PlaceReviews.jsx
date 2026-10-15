import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { supabase } from '../lib/supabase.js';
import { t } from '../i18n/index.js';
import { useDraft } from '../lib/persist.js';

export function Stars({ value, onChange, size = 14 }) {
  return (
    <span className="inline-flex" title={onChange ? undefined : t('{n} sur 5', { n: Number(value).toFixed(1) })}>
      {[1, 2, 3, 4, 5].map((i) => {
        const star = <Star size={size} className={i <= Math.round(value) ? 'fill-emerald-400 text-emerald-400' : 'text-stone-300'} />;
        return onChange
          ? <button key={i} type="button" className="p-0.5" onClick={() => onChange(i)} aria-label={t('{n} sur 5', { n: i })}>{star}</button>
          : <span key={i}>{star}</span>;
      })}
    </span>
  );
}

// Avis des membres sur un lieu de la carte (chargés à l'ouverture de la bulle).
export default function PlaceReviews({ placeId, onRated }) {
  const { currentUser, getUser } = useApp();
  const [list, setList] = useState(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useDraft(`place-review:${placeId}`, '');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const me = currentUser?.id;

  const load = () => supabase.from('place_reviews').select('user_id, rating, body, updated_at')
    .eq('place_id', placeId).order('updated_at', { ascending: false }).limit(20)
    .then(({ data }) => {
      setList(data || []);
      const mine = (data || []).find((r) => r.user_id === me);
      setRating(mine?.rating || 0);
      setBody(mine?.body || '');
    });
  useEffect(() => { load(); }, [placeId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return null;
  const mine = list?.find((r) => r.user_id === me);
  const average = list?.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;

  const save = async () => {
    if (!rating) return setError(t('Choisis une note de 1 à 5 étoiles.'));
    const { error: err } = await supabase.from('place_reviews')
      .upsert({ place_id: placeId, user_id: me, rating, body: body.trim() }, { onConflict: 'place_id,user_id' });
    if (err) return setError(/Trop d|suspendu/.test(err.message) ? t(err.message) : t('Avis non enregistré, réessaie.'));
    setError(null);
    setEditing(false);
    await load();
    onRated?.();
  };
  const remove = async () => {
    await supabase.from('place_reviews').delete().eq('place_id', placeId).eq('user_id', me);
    setEditing(false);
    await load();
    onRated?.();
  };

  return (
    <div className="mt-1 space-y-1 border-t border-stone-100 pt-1">
      {list === null ? <div className="text-xs text-stone-400">{t('Chargement…')}</div> : (
        <div className="flex items-center gap-1 text-xs text-stone-600">
          {list.length ? (<><Stars value={average} /> {average.toFixed(1)} · {t(list.length > 1 ? '{n} avis' : '{n} avis', { n: list.length })}</>)
            : t('Pas encore d’avis')}
        </div>
      )}
      <div className="max-h-28 space-y-1 overflow-y-auto">
        {list?.filter((r) => r.body).slice(0, 5).map((r) => (
          <div key={r.user_id} className="text-xs text-stone-600">
            <strong>{getUser(r.user_id)?.name || t('Membre')}</strong> <Stars value={r.rating} size={10} />
            <div className="break-words">{r.body}</div>
          </div>
        ))}
      </div>
      {editing ? (
        <div className="space-y-1">
          <Stars value={rating} onChange={setRating} size={18} />
          <textarea className="input w-full py-1 text-xs" rows={2} maxLength={500} placeholder={t('Ton avis (facultatif) : propreté, ombre, chiens bienvenus…')}
            value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-2 text-xs">
            <button type="button" className="font-semibold text-teal-600" onClick={save}>{t('Enregistrer')}</button>
            {mine && <button type="button" className="text-red-500" onClick={remove}>{t('Retirer mon avis')}</button>}
            <button type="button" className="text-stone-400" onClick={() => setEditing(false)}>{t('Annuler')}</button>
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      ) : (
        <button type="button" className="text-xs font-semibold text-teal-600" onClick={() => setEditing(true)}>
          {mine ? t('Modifier mon avis') : t('⭐ Donner mon avis')}
        </button>
      )}
    </div>
  );
}
