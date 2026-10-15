// Parrainage : lien personnel cyclami.com/?p=<code>. Le code est gardé 30 jours sur l'appareil du visiteur,
// puis transmis à la base après son inscription (voir claim_referral).
const KEY = 'cyclami:referral';
const CODE_RE = /^[0-9a-f]{10}$/;

// à l'ouverture du site : ?p=<code> mémorisé, puis retiré de l'adresse
export function captureReferral() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('p');
    if (!code || !CODE_RE.test(code)) return;
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    url.searchParams.delete('p');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* stockage indisponible */ }
}

export function pendingReferral() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (r?.code && CODE_RE.test(r.code) && Date.now() - r.at < 30 * 86400e3) return r.code;
  } catch { /* stockage indisponible */ }
  return null;
}
export function clearReferral() {
  try { localStorage.removeItem(KEY); } catch { /* stockage indisponible */ }
}

export const referralLink = (code) => `${window.location.origin}/${code ? `?p=${code}` : ''}`;
export const AMBASSADOR_AT = 3;
