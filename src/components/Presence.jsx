import { isOnline, presenceLabel } from '../utils/presence.js';

// Pastille verte (en ligne) à poser sur un avatar : le parent doit être en position relative.
export function OnlineDot({ lastSeen, className = '' }) {
  if (!isOnline(lastSeen)) return null;
  return <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white ${className}`} aria-hidden="true" />;
}

// Texte « En ligne » (vert) ou « Vu il y a… » (gris) ; rien si le membre a masqué son statut.
export default function Presence({ lastSeen, className = '' }) {
  const label = presenceLabel(lastSeen);
  if (!label) return null;
  const online = isOnline(lastSeen);
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${online ? 'font-semibold text-green-600' : 'text-stone-400'} ${className}`}>
      {online && <span className="h-2 w-2 rounded-full bg-green-500" />}
      {label}
    </span>
  );
}
