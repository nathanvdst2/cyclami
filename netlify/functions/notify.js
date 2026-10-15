// POST /api/notify — e-mail de notification demandé par la base de données (clé partagée),
// envoyé via l'API Brevo. Corps : { to, name, subject, text, link, kind, hello?, lang?, reply_to?, from? }
import { checkNotifySecret, emailConfigured, emailHtml, json, sendBrevo, siteUrl } from '../lib/shared.js';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405, { Allow: 'POST' });
  if (!(await checkNotifySecret(req))) return json({ error: 'Non autorisé' }, 401);
  if (!emailConfigured()) return json({ error: 'Envoi d’e-mails non configuré' }, 503);
  const msg = await req.json().catch(() => null);
  if (!msg?.to || !msg?.subject || !msg?.text) return json({ error: 'E-mail incomplet' }, 400);
  const res = await sendBrevo({
    to: msg.to,
    name: msg.name,
    subject: msg.subject,
    html: emailHtml(msg),
    text: `${msg.hello ? `${msg.hello}\n\n` : ''}${msg.text}\n\nCyclami : ${siteUrl()}`,
    tag: `cyclami-${String(msg.kind || 'notification').replace(/[^a-z0-9_-]/gi, '').slice(0, 40)}`,
    replyTo: /^[^@\s]+@[^@\s]+$/.test(msg.reply_to || '') ? msg.reply_to : undefined,
    from: msg.from,
  });
  if (!res.ok) return json({ error: 'Brevo a refusé l’envoi', status: res.status, detail: (await res.text()).slice(0, 500) }, 502);
  return json({ sent: true });
};

export const config = { path: '/api/notify' };
