// Suivi des erreurs : chaque plantage du site chez un membre est envoyé (anonymement si non connecté)
// dans le journal visible par l'admin (Administration → Erreurs). 10 envois au plus par visite.
import { supabase } from './supabase.js';

const sent = new Set();
const IGNORED = [/ResizeObserver loop/i, /Script error\.?$/i, /extension:\/\//i, /AbortError/i, /Failed to fetch/i, /Load failed/i, /NetworkError/i,
  /runtime\.sendMessage/i]; // extension du navigateur, pas le site
// morceau du site introuvable : le site a été mis à jour pendant la visite
const STALE = /Importing a module script failed|dynamically imported module|error loading dynamically imported/i;

// recharge une seule fois (par onglet et par minute) pour récupérer la nouvelle version
function reloadForUpdate() {
  try {
    const last = Number(sessionStorage.getItem('cyclami:reloaded') || 0);
    if (Date.now() - last < 60e3) return false;
    sessionStorage.setItem('cyclami:reloaded', String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
}

export function currentPage() {
  return (window.history.state && window.history.state.page) || 'landing';
}

export function reportError(error, extra = '') {
  try {
    const message = String(error?.message || error || 'Erreur inconnue').slice(0, 500);
    const stack = `${error?.stack || ''}${extra ? `\n${extra}` : ''}`.slice(0, 3000);
    if (IGNORED.some((re) => re.test(message) || re.test(stack))) return;
    if (STALE.test(message) && reloadForUpdate()) return;
    const key = `${message}|${currentPage()}`;
    if (sent.has(key) || sent.size >= 10) return;
    sent.add(key);
    supabase.rpc('log_client_error', {
      p_message: message, p_stack: stack, p_page: currentPage(), p_agent: navigator.userAgent.slice(0, 300),
    }).then(() => {}, () => {});
  } catch {
    // le suivi ne doit jamais casser le site
  }
}

export function installErrorReporting() {
  window.addEventListener('vite:preloadError', (e) => { if (reloadForUpdate()) e.preventDefault(); });
  window.addEventListener('error', (e) => reportError(e.error || e.message, e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : ''));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}
