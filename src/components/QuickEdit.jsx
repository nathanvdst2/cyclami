import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { t } from '../i18n/index.js';

// Petit formulaire de correction d'un contenu (son auteur, ou l'administration pour n'importe quel contenu).
// fields : [{ key, label, max, multiline }] ; onSave(form) renvoie un message d'erreur ou rien.
export default function QuickEdit({ value, fields, onSave, onSaved }) {
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  if (!form) {
    return (
      <button className="btn-ghost" onClick={() => { setError(null); setForm(Object.fromEntries(fields.map((f) => [f.key, value[f.key] || '']))); }}
        aria-label={t('Modifier')} title={t('Modifier')}>
        <Pencil size={16} />
      </button>
    );
  }
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const err = await onSave(form);
    setSaving(false);
    if (err) return setError(err);
    setForm(null);
    onSaved?.();
  };
  return (
    <form onSubmit={submit} className="w-full space-y-2 rounded-xl bg-emerald-50 p-3">
      {fields.map((f) => (
        <label key={f.key} className="block text-xs font-semibold text-stone-600">{f.label}
          {f.multiline
            ? <textarea className="input mt-1 text-sm" rows={3} maxLength={f.max} value={form[f.key]} onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} />
            : <input className="input mt-1 text-sm" maxLength={f.max} required={f.required} value={form[f.key]} onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))} />}
        </label>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary !py-1 text-sm" disabled={saving}>{saving ? t('Enregistrement…') : t('Enregistrer')}</button>
        <button type="button" className="btn-ghost !py-1 text-sm" onClick={() => setForm(null)}>{t('Annuler')}</button>
      </div>
    </form>
  );
}
