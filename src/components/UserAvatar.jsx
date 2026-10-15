import PetAvatar from './PetAvatar.jsx';

// Photo de profil du membre, sinon la photo de son premier animal qui en a une, sinon l'illustration par défaut
// (jamais l'emoji de l'animal : le même membre doit avoir la même image partout, chargé ou non).
export default function UserAvatar({ user, size = 'md', className = '' }) {
  if (user?.avatarUrl) {
    const sizes = { sm: 'h-7 w-7 rounded-full', md: 'h-12 w-12 rounded-full', lg: 'h-14 w-14 rounded-2xl' };
    return <img src={user.avatarUrl} alt={user.name} loading="lazy"
      className={`shrink-0 bg-emerald-100 object-cover ${sizes[size]} ${className}`} />;
  }
  const photo = user?.petPhotoUrl || user?.pets?.find((p) => p.photoUrl)?.photoUrl;
  return <PetAvatar pet={photo ? { photoUrl: photo, name: user?.name } : null} size={size} className={className} />;
}
