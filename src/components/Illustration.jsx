// Illustrations du site (public/illustrations/*.webp, fond transparent).
import { illu } from '../lib/illustrations.js';
const SIZES = { sm: 'h-16 w-16', md: 'h-28 w-28', lg: 'h-40 w-40', xl: 'h-52 w-52' };

export default function Illustration({ name, size = 'md', className = '', alt = '' }) {
  return (
    <img src={illu(name)} alt={alt} loading="lazy" draggable="false"
      className={`${SIZES[size]} mx-auto select-none object-contain ${className}`} />
  );
}

// Carte « rien ici pour l'instant » avec illustration.
export function EmptyState({ name, children }) {
  return (
    <div className="card space-y-2 text-center text-stone-500">
      <Illustration name={name} />
      <div>{children}</div>
    </div>
  );
}
