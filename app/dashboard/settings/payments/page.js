'use client';

import { useEffect, useState } from 'react';
import { Attachment } from '../../../components/HowToPay';
import Modal from '../../../components/Modal';
import SearchSelect from '../../../components/SearchSelect';
import { api, uploadFile } from '../../../lib/api';
import { PAYMENT_KINDS } from '../../../lib/invoice';
import { useSeller } from '../../SellerContext';
import { confirmDialog } from '../../../components/Dialogs';

const EMPTY = { id: '', kind: 'gcash', name: 'GCash', account_name: '', account_number: '', instructions: '', is_active: '1' };

/** Add / edit one payment method. */
function MethodModal({ method, onClose, onSaved }) {
  const [form, setForm] = useState(
    method
      ? { ...method, id: String(method.id), account_name: method.account_name ?? '', account_number: method.account_number ?? '', instructions: method.instructions ?? '', is_active: method.is_active ? '1' : '0' }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Picking a type fills in a name when the name is still a default one.
  const setKind = (e) => {
    const kind = e.target.value;
    setForm((f) => ({
      ...f,
      kind,
      name: !f.name || Object.values(PAYMENT_KINDS).some((k) => k.label === f.name) ? PAYMENT_KINDS[kind].label : f.name,
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const result = await api('save_payment_method', form);
    setBusy(false);
    if (!result.success) return setError(result.message);
    onSaved(result.methods);
    onClose();
  };

  return (
    <Modal title={method ? `Edit ${method.name}` : 'Add payment method'} onClose={onClose} width={560}>
      <form onSubmit={save} className="form-grid">
        <label>
          Type
          <SearchSelect className="dash-select full" value={form.kind} onChange={setKind} aria-label="Type">
            {Object.entries(PAYMENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </SearchSelect>
        </label>
        <label>
          Name shown to customers
          <input className="dash-input" value={form.name} onChange={set('name')} maxLength={80} required placeholder="e.g. GCash, BDO Savings" />
        </label>
        <label>
          Account name
          <input className="dash-input" value={form.account_name} onChange={set('account_name')} maxLength={120} placeholder="e.g. Juan Dela Cruz" />
        </label>
        <label>
          Account / mobile number
          <input className="dash-input" value={form.account_number} onChange={set('account_number')} maxLength={80} placeholder="e.g. 0917 123 4567" />
        </label>
        <label>
          Instructions
          <textarea className="dash-input" rows={3} value={form.instructions} onChange={set('instructions')} placeholder="e.g. Send a screenshot of your receipt after paying." />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.is_active === '1'} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked ? '1' : '0' }))} />
          Show to customers (on your store page and invoices)
        </label>
        {error && <p className="dash-error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="dash-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="dash-btn ghost" onClick={onClose}>Cancel</button>
        </div>
        {!method && <p className="muted small-note">After saving, you can add a QR code or other attachments.</p>}
      </form>
    </Modal>
  );
}

export default function PaymentMethodsPage() {
  useSeller();
  const [methods, setMethods] = useState(null);
  const [editing, setEditing] = useState(null); // method | 'new' | null
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('list_payment_methods').then((d) => (d.success ? setMethods(d.methods) : setError(d.message)));
  }, []);

  const call = async (key, promise) => {
    setBusy(key);
    setError('');
    const result = await promise;
    setBusy('');
    if (!result.success) return setError(result.message);
    setMethods(result.methods);
  };

  const upload = (method) => (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    (async () => {
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        await call(`up-${method.id}`, uploadFile('upload_payment_method_file', { id: method.id }, file));
      }
    })();
  };

  const remove = async (m) => (await confirmDialog('Past payments keep its name.', { title: `Delete ${m.name}?`, confirmLabel: 'Delete', danger: true })) && call(`del-${m.id}`, api('delete_payment_method', { id: m.id }));

  return (
    <>
      <header className="dash-top compact">
        <h1>Payment methods</h1>
        <p className="muted head-note">How customers can pay you. Shown on your store page and on unpaid invoices.</p>
        <div className="top-actions">
          <button type="button" className="dash-btn" onClick={() => setEditing('new')}>+ Add payment method</button>
        </div>
      </header>

      {error && <p className="dash-error">{error}</p>}

      {!methods ? (
        <p className="muted">Loading…</p>
      ) : methods.length === 0 ? (
        <article className="card empty-state">
          <p className="muted">No payment methods yet. Add GCash, a bank account, cash and so on — with a QR code if you have one.</p>
        </article>
      ) : (
        <div className="pm-grid">
          {methods.map((m) => (
            <article key={m.id} className={`card pm-card${m.is_active ? '' : ' off'}`}>
              <header className="pm-head">
                <i className={`fa-solid ${PAYMENT_KINDS[m.kind]?.icon ?? 'fa-wallet'}`} />
                <div>
                  <strong>{m.name}</strong>
                  <small className="muted">{PAYMENT_KINDS[m.kind]?.label}{!m.is_active && ' · hidden from customers'}</small>
                </div>
                <span className="pm-actions">
                  <button type="button" className="icon-btn" title="Edit" onClick={() => setEditing(m)}><i className="fa-solid fa-pen" /></button>
                  <button type="button" className="icon-btn" title="Delete" disabled={busy === `del-${m.id}`} onClick={() => remove(m)}><i className="fa-regular fa-trash-can" /></button>
                </span>
              </header>
              {(m.account_name || m.account_number) && (
                <p className="pm-account">{m.account_name}{m.account_name && m.account_number && ' · '}<span className="htp-number">{m.account_number}</span></p>
              )}
              {m.instructions && <p className="muted pm-note">{m.instructions}</p>}
              <div className="pm-files">
                {m.files.map((f) => (
                  <span key={f.id} className="pm-file">
                    <Attachment file={f} />
                    <button
                      type="button"
                      className="pm-file-x"
                      title="Remove attachment"
                      onClick={async () => (await confirmDialog('Customers will no longer see it.', { title: 'Remove this attachment?', confirmLabel: 'Remove', danger: true })) && call(`f-${f.id}`, api('delete_payment_method_file', { id: f.id }))}
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </span>
                ))}
                {m.files.length < 6 && (
                  <label className={`pm-add${busy === `up-${m.id}` ? ' busy' : ''}`} title="Add QR code, photo or PDF">
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={upload(m)} hidden />
                    <i className={`fa-solid ${busy === `up-${m.id}` ? 'fa-spinner fa-spin' : 'fa-paperclip'}`} />
                    <span>{busy === `up-${m.id}` ? 'Uploading…' : 'Attach QR / file'}</span>
                  </label>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && <MethodModal method={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={setMethods} />}
    </>
  );
}
