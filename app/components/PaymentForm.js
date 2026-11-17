'use client';

import { useState } from 'react';
import { api, uploadFile } from '../lib/api';
import SearchSelect from './SearchSelect';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Records a payment on an invoice, with an optional receipt (photo or PDF).
 * fn: 'add_payment' (seller, counted right away) or 'submit_payment'
 * (customer, waits for the seller to check it).
 */
export default function PaymentForm({ fn, invoiceId, methods, balance, onDone, onCancel, submitLabel = 'Save payment' }) {
  const [form, setForm] = useState({
    payment_method_id: methods[0] ? String(methods[0].id) : '',
    method_name: '',
    amount: Number(balance) > 0 ? Number(balance).toFixed(2) : '',
    paid_on: today(),
    reference: '',
    note: '',
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = { ...form, invoice_id: invoiceId };
    const result = file ? await uploadFile(fn, data, file, setProgress) : await api(fn, data);
    setBusy(false);
    setProgress(0);
    if (!result.success) return setError(result.message);
    onDone(result.invoice);
  };

  return (
    <form className="pay-form" onSubmit={submit}>
      <div className="form-grid compact-form">
        <label>
          Paid with
          <SearchSelect className="dash-select full" value={form.payment_method_id} onChange={set('payment_method_id')} aria-label="Payment method">
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value="">Other…</option>
          </SearchSelect>
        </label>
        {!form.payment_method_id && (
          <label>
            Method name
            <input className="dash-input" value={form.method_name} onChange={set('method_name')} placeholder="e.g. Cash" maxLength={80} />
          </label>
        )}
        <label>
          Amount
          <input className="dash-input" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" required />
        </label>
        <label>
          Date paid
          <input className="dash-input" type="date" value={form.paid_on} onChange={set('paid_on')} required />
        </label>
        <label>
          Reference no.
          <input className="dash-input" value={form.reference} onChange={set('reference')} placeholder="e.g. GCash ref." maxLength={120} />
        </label>
        <label>
          Note
          <input className="dash-input" value={form.note} onChange={set('note')} placeholder="Optional" />
        </label>
        <label className="span-2">
          Receipt (photo or PDF)
          <input className="dash-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
      </div>
      {error && <p className="dash-error">{error}</p>}
      <div className="side-actions">
        <button type="submit" className="mini-btn primary" disabled={busy}>
          {busy ? (progress ? `Uploading ${Math.round(progress * 100)}%…` : 'Saving…') : submitLabel}
        </button>
        {onCancel && <button type="button" className="link-btn" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}
