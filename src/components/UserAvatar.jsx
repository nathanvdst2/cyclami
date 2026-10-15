// Photo de profil du membre, sinon l'initiale de son prénom (ou 🚴) sur une pastille de couleur
// (toujours la même couleur pour un même membre, chargé ou non).
const SIZES = {
  sm: 'h-7 w-7 text-xs rounded-full',
  md: 'h-12 w-12 text-lg rounded-full',
  lg: 'h-14 w-14 text-2xl rounded-2xl',
};
const COLORS = [
  'bg-teal-100 text-teal-800', 'bg-emerald-100 text-emerald-800', 'bg-sky-100 text-sky-800',
  'bg-lime-100 text-lime-800', 'bg-cyan-100 text-cyan-800', 'bg-indigo-100 text-indigo-800',
];

function colorOf(seed) {
  let h = 0;
  for (const c of String(seed || '')) h = (h * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export default function UserAvatar({ user, size = 'md', className = '' }) {
  const box = SIZES[size] || SIZES.md;
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={user.name || ''} loading="lazy"
      className={`shrink-0 bg-emerald-100 object-cover ${box} ${className}`} />;
  }
  const initial = String(user?.name || '').trim().charAt(0).toUpperCase();
  return (
    <span aria-hidden={!user?.name} title={user?.name || undefined}
      className={`flex shrink-0 select-none items-center justify-center overflow-hidden font-extrabold ${colorOf(user?.id || user?.name)} ${box} ${className}`}>
      {initial || '🚴'}
    </span>
  );
}
