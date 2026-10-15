// Logo Cyclami : l'emblème + le nom aux couleurs du logo (« Cycl » turquoise foncé, « ami » vert).
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
        <span className="brand-ink">Cycl</span><span className="brand-pink">ami</span>
      </span>
    </span>
  );
}
