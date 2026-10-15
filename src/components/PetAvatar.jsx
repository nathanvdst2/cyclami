// Photo de l'animal si elle existe, sinon son emoji.
import { illu } from '../lib/illustrations.js';
export default function PetAvatar({ pet, size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-7 w-7 text-base rounded-full',
    md: 'h-12 w-12 text-2xl rounded-full',
    lg: 'h-14 w-14 text-3xl rounded-2xl',
  };
  const base = `flex shrink-0 items-center justify-center overflow-hidden bg-emerald-100 ${sizes[size]} ${className}`;
  if (pet?.photoUrl) {
    return <img src={pet.photoUrl} alt={pet.name} className={`${base} object-cover`} loading="lazy" />;
  }
  if (!pet) return <img src={illu('avatar-defaut')} alt="" className={`${base} object-cover`} loading="lazy" />;
  return <span className={base}>{pet.emoji || '🚴'}</span>;
}
