import { useCallback, useEffect, useRef, useState } from 'react';

// État d'une page (onglet, vue, filtres…) gardé dans l'entrée d'historique du navigateur :
// il survit à l'actualisation de la page et au bouton « retour ». La clé doit être unique sur le site.
export function usePageState(key, initial) {
  const [value, setValue] = useState(() => {
    const ui = window.history.state?.ui;
    return ui && key in ui ? ui[key] : initial;
  });
  useEffect(() => {
    try {
      const st = window.history.state || {};
      window.history.replaceState({ ...st, ui: { ...(st.ui || {}), [key]: value } }, '');
    } catch { /* historique indisponible */ }
  }, [key, value]);
  return [value, setValue];
}

// Brouillon d'un formulaire : ce qui est écrit est gardé pendant la session (actualisation comprise),
// puis effacé avec clear() une fois le formulaire envoyé. Les fichiers (photos) ne sont pas gardés.
export function useDraft(key, initial) {
  const storageKey = `cyclami:draft:${key}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved != null) {
        const v = JSON.parse(saved);
        const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
        return isObj(initial) && isObj(v) ? { ...initial, ...v } : v;
      }
    } catch { /* stockage indisponible */ }
    return initial;
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try {
      // revenu à l'état de départ (formulaire vidé ou envoyé) : plus rien à garder
      if (value == null || value === '' || JSON.stringify(value) === JSON.stringify(initial)) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch { /* stockage indisponible */ }
  }, [storageKey, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const clear = useCallback(() => {
    try { sessionStorage.removeItem(storageKey); } catch { /* stockage indisponible */ }
  }, [storageKey]);
  return [value, setValue, clear];
}

// Un brouillon a-t-il été gardé pour cette clé ? (pour rouvrir un formulaire après actualisation)
export function hasDraft(key) {
  try { return sessionStorage.getItem(`cyclami:draft:${key}`) != null; } catch { return false; }
}
