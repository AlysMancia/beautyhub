'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import InvoiceDownload from '../../../components/InvoiceDownload';
import InvoiceEditor from '../../../components/InvoiceEditor';
import InvoicePayments from '../../../components/InvoicePayments';
import InvoiceView from '../../../components/InvoiceView';
import { api } from '../../../lib/api';
import { STATUS } from '../../../lib/invoice';
import { confirmDialog, promptDialog } from '../../../components/Dialogs';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Open (items not handed over yet) or released to someone. Compact, for the side column. */
function ReleaseBox({ invoice, onChange }) {
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState(invoice.released_to || invoice.customer_name || '');
  const [note, setNote] = useState(invoice.release_note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const released = invoice.release_status === 'released';

  const save = async (status) => {
    setBusy(true);
    setError('');
    const result = await api('set_release', { invoice_id: invoice.id, status, released_to: to, note });
    setBusy(false);
    if (!result.success) return setError(result.message);
    setEditing(false);
    onChange(result.invoice);
  };

  return (
    <section className="side-box no-print">
      <header className="side-head">
        <h3>Release</h3>
        <span className={`rel-pill ${released ? 'released' : 'open'}`}>{released ? 'Released' : 'Open'}</span>
      </header>
      {released && !editing && (
        <p className="side-text">
          To <strong>{invoice.released_to}</strong>
          <small>{fmt(invoice.released_at)}{invoice.release_note && ` · ${invoice.release_note}`}</small>
        </p>
      )}
      {editing ? (
        <form className="form-grid compact-form" onSubmit={(e) => { e.preventDefault(); save('released'); }}>
          <label className="span-2">
            Released to
            <input className="dash-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Who received it / courier" maxLength={160} autoFocus required />
          </label>
          <label className="span-2">
            Note
            <input className="dash-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. tracking no." />
          </label>
          <div className="side-actions span-2">
            <button type="submit" className="mini-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Mark released'}</button>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="side-actions">
          <button type="button" className={`mini-btn${released ? '' : ' primary'}`} onClick={() => setEditing(true)}>
            <i className="fa-solid fa-box" /> {released ? 'Change' : 'Release items'}
          </button>
          {released && (
            <button type="button" className="link-btn" disabled={busy} onClick={async () => (await confirmDialog('The items will show as not handed over yet.', { title: 'Mark as open again?', confirmLabel: 'Mark open' })) && save('open')}>
              Mark open
            </button>
          )}
        </div>
      )}
      {error && <p className="dash-error">{error}</p>}
    </section>
  );
}

export default function InvoicePage() {
  const { id } = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api('get_invoice', { id });
    if (result.success) setInvoice(result.invoice);
    else setError(result.message);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn, data, confirmText, done) => {
    if (confirmText && !(await confirmDialog(confirmText, { title: 'Cancel this invoice?', confirmLabel: 'Cancel invoice', cancelLabel: 'Keep it', danger: true }))) return;
    setBusy(true);
    setError('');
    const result = await api(fn, { id, ...data });
    setBusy(false);
    if (!result.success) return setError(result.message);
    setMessage(done);
    load();
  };

  const reject = async () => {
    const reason = await promptDialog('You can add a reason for the customer (optional).', { title: 'Reject this order?', placeholder: 'e.g. Out of stock', confirmLabel: 'Reject order', danger: true, multiline: true });
    if (reason === null) return;
    act('reject_invoice', { reason }, null, 'Order rejected.');
  };

  const remove = async () => {
    const restock = invoice.status === 'confirmed';
    const paid = invoice.payments.length > 0;
    const text = [
      restock ? 'Its items go back into your inventory.' : null,
      paid ? 'Its payments and receipts are deleted too.' : null,
      'This cannot be undone. The invoice number is not reused.',
    ].filter(Boolean).join(' ');
    if (!(await confirmDialog(text, { title: `Delete ${invoice.invoice_no}?`, confirmLabel: 'Delete invoice', cancelLabel: 'Keep it', danger: true }))) return;
    setBusy(true);
    const result = await api('delete_invoice', { id });
    setBusy(false);
    if (!result.success) return setError(result.message);
    router.push('/dashboard/invoices');
  };

  if (!invoice) return error ? <p className="dash-error">{error}</p> : <p className="muted">Loading…</p>;

  const pending = invoice.status === 'pending';
  const confirmed = invoice.status === 'confirmed';
  const update = (inv) => {
    setInvoice(inv);
    setMessage('');
  };
  const status = STATUS[invoice.status];

  return (
    <>
      <header className="inv-top no-print">
        <Link href="/dashboard/invoices" className="back-link" title="All invoices"><i className="fa-solid fa-arrow-left" /></Link>
        <h1>{editing ? `Edit ${invoice.invoice_no}` : pending ? `Order ${invoice.invoice_no}` : invoice.invoice_no}</h1>
        {!confirmed && status && <span className={`status-pill ${status.className}`}>{status.short}</span>}
        {!editing && (
          <div className="inv-tools">
            {!pending && (<>
            {confirmed && (
              <button type="button" className="mini-btn" onClick={() => setEditing(true)} title="Edit items, prices or customer">
                <i className="fa-solid fa-pen" /> Edit
              </button>
            )}
            <InvoiceDownload targetId={`invoice-${invoice.id}`} fileName={`${invoice.store_name} ${invoice.invoice_no}`} className="mini-btn" />
            <button type="button" className="mini-btn" onClick={() => window.print()} title="Print">
              <i className="fa-solid fa-print" /> Print
            </button>
            {confirmed && (
              <button
                type="button"
                className="mini-btn danger"
                disabled={busy}
                title="Cancel this invoice and put the items back in stock"
                onClick={() => act('cancel_invoice', {}, `${invoice.invoice_no}'s items go back into your inventory.`, 'Invoice cancelled and stock returned.')}
              >
                Cancel invoice
              </button>
            )}
            </>)}
            <button type="button" className="mini-btn danger" disabled={busy} onClick={remove} title="Delete this invoice for good">
              <i className="fa-regular fa-trash-can" /> Delete
            </button>
          </div>
        )}
      </header>
      {pending && (
        <p className="muted inv-sub no-print">
          {invoice.customer_name} placed this order{invoice.source === 'customer' ? ' from your store page' : ''}. Check the items and prices, then approve it.
        </p>
      )}

      {message && <p className="form-ok no-print" style={{ marginLeft: 0 }}>{message}</p>}
      {error && <p className="dash-error no-print">{error}</p>}

      {pending || editing ? (
        <div className="inv-edit">
          <InvoiceEditor
            key={invoice.updated_at}
            invoice={invoice}
            onSaved={(inv) => {
              setInvoice(inv);
              setEditing(false);
              setMessage(
                editing
                  ? `Invoice updated.${inv.payment_status === 'partial' ? ' It is now partly paid.' : ''}`
                  : inv.status === 'confirmed' ? 'Order approved. Stock has been updated.' : 'Changes saved.'
              );
            }}
            extraActions={
              editing ? (
                <button type="button" className="dash-btn ghost" onClick={() => setEditing(false)}>Cancel</button>
              ) : (
                <button type="button" className="dash-btn ghost danger" onClick={reject} disabled={busy}>Reject</button>
              )
            }
          />
          {pending && <InvoicePayments invoice={invoice} seller onChange={update} />}
        </div>
      ) : (
        <div className="inv-layout">
          <InvoiceView invoice={invoice} showCost />
          {confirmed && (
            <aside className="inv-side">
              <InvoicePayments invoice={invoice} seller onChange={update} />
              <ReleaseBox invoice={invoice} onChange={update} />
            </aside>
          )}
        </div>
      )}
    </>
  );
}
