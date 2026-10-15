// GET /api/email-quota — crédits d'envoi Brevo restants (administrateurs seulement).
// Formule gratuite de Brevo : environ 300 e-mails par jour pour tout le site.
import { brevoKey, isAdmin, json } from '../lib/shared.js';

export default async (req) => {
  const noStore = { 'Cache-Control': 'no-store' };
  if (req.method !== 'GET') return json({ error: 'Méthode non autorisée' }, 405, { Allow: 'GET' });
  if (!(req.headers.get('Authorization') || '').startsWith('Bearer ')) return json({ error: 'Non autorisé' }, 401, noStore);
  if (!(await isAdmin(req))) return json({ error: 'Réservé aux administrateurs' }, 403, noStore);
  if (!brevoKey()) return json({ error: 'Envoi d’e-mails non configuré' }, 503, noStore);
  const res = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': brevoKey(), Accept: 'application/json' } });
  if (!res.ok) return json({ error: 'Brevo indisponible', status: res.status }, 502, noStore);
  const account = await res.json();
  const plans = Array.isArray(account.plan) ? account.plan : [];
  const plan = plans.find((x) => x.creditsType === 'sendLimit') || plans[0] || {};
  return json({ type: plan.type || null, credits: typeof plan.credits === 'number' ? plan.credits : null }, 200, noStore);
};

export const config = { path: '/api/email-quota' };
