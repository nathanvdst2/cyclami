// Logo Cyclami : l'emblème (chien et chat dans le cœur) + le nom aux couleurs du logo.
export default function Brand({ size = 'md' }) {
  const s = {
    sm: { img: 'h-6 w-6', text: 'text-sm' },
    md: { img: 'h-9 w-9', text: 'text-xl' },
    lg: { img: 'h-12 w-12', text: 'text-2xl' },
  }[size];
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/logo-mark-96.webp" alt="" width="48" height="48" className={`${s.img} shrink-0 object-contain`} />
      <span className={`${s.text} font-extrabold tracking-tight`}>
        <span className="brand-ink">Ani</span><span className="brand-pink">grame</span>
      </span>
    </span>
  );
}
