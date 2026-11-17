'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { PAYMENT } from '../lib/invoice';
import { Attachment } from './HowToPay';
import PaymentForm from './PaymentForm';
import SearchSelect from './SearchSelect';
import { confirmDialog } from './Dialogs';

const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/**
 * Payments on an invoice, compact (fits a side column).
 * seller: Mark paid (the balance, one click), add a payment, confirm / reject a customer's, delete.
 * customer: send a payment with proof for the seller to check.
 */
export default function InvoicePayments({ invoice, seller = false, onChange }) {
  const [mode, setMode] = useState(''); // '' | 'add' | 'mark'
  const [markMethod, setMarkMethod] = useState('');
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  const status = PAYMENT[invoice.payment_status] ?? PAYMENT.unpaid;
  const closed = ['rejected', 'cancelled'].includes(invoice.status);
  const balance = Number(invoice.balance);
  const over = Number(invoice.amount_paid) - Number(invoice.total);

  const act = async (fnName, data, confirmText) => {
    if (confirmText && !(await confirmDialog(confirmText, { title: 'Delete payment?', confirmLabel: 'Delete', danger: true }))) return;
    setBusy(data.id ?? -1);
    setError('');
    const result = await api(fnName, data);
    setBusy(0);
    if (!result.success) return setError(result.message);
    setMode('');
    onChange(result.invoice);
  };

  return (
    <section className="side-box no-print">
      <header className="side-head">
        <h3>Payment</h3>
        <span className={`pay-pill ${status.className}`}>{status.label}</span>
      </header>

      <dl className="side-sums">
        <div><dt>Total</dt><dd>{money(invoice.total)}</dd></div>
        <div><dt>Paid</dt><dd>{money(invoice.amount_paid)}</dd></div>
        {over > 0 ? (
          <div><dt>Overpaid</dt><dd>{money(over)}</dd></div>
        ) : (
          <div className={balance > 0 ? 'due' : ''}><dt>Balance</dt><dd>{money(balance)}</dd></div>
        )}
      </dl>

      {seller && !closed && mode === '' && (
        <div className="side-actions">
          {balance > 0 && (
            <button type="button" className="mini-btn primary" onClick={() => (invoice.payment_methods.length ? setMode('mark') : act('mark_paid', { invoice_id: invoice.id }))}>
              <i className="fa-solid fa-check" /> Mark paid
            </button>
          )}
          <button type="button" className="mini-btn" onClick={() => setMode('add')}>
            <i className="fa-solid fa-plus" /> Add payment
          </button>
        </div>
      )}

      {seller && mode === 'mark' && (
        <div className="mark-row">
          <span>Paid {money(balance)} via</span>
          <SearchSelect className="dash-select" value={markMethod} onChange={(e) => setMarkMethod(e.target.value)} aria-label="Paid with">
            <option value="">—</option>
            {invoice.payment_methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </SearchSelect>
          <button type="button" className="mini-btn primary" disabled={busy === -1} onClick={() => act('mark_paid', { invoice_id: invoice.id, payment_method_id: markMethod })}>
            {busy === -1 ? '…' : 'Confirm'}
          </button>
          <button type="button" className="link-btn" onClick={() => setMode('')}>Cancel</button>
        </div>
      )}

      {mode === 'add' && (
        <PaymentForm
          fn={seller ? 'add_payment' : 'submit_payment'}
          invoiceId={invoice.id}
          methods={invoice.payment_methods}
          balance={invoice.balance}
          submitLabel={seller ? 'Save payment' : 'Send payment'}
          onCancel={() => setMode('')}
          onDone={(inv) => {
            setMode('');
            onChange(inv);
          }}
        />
      )}

      {!seller && !closed && mode === '' && balance > 0 && (
        <div className="side-actions">
          <button type="button" className="mini-btn primary" onClick={() => setMode('add')}>
            <i className="fa-solid fa-paper-plane" /> I&apos;ve paid — send proof
          </button>
        </div>
      )}

      {invoice.payments.length > 0 && (
        <ul className="pay-list">
          {invoice.payments.map((p) => (
            <li key={p.id} className={`pay-${p.status}`}>
              {p.proof_path && <Attachment file={{ path: p.proof_path, thumb_path: p.proof_thumb, mime: p.proof_mime, name: 'Receipt' }} size="sm" />}
              <div className="pay-main">
                <span className="pay-amt">{money(p.amount)}</span>
                <small>
                  {day(p.paid_on)} · {p.method_name || 'Payment'}
                  {p.reference && ` · ${p.reference}`}
                </small>
                {p.status === 'pending' && <small className="pay-state pending">Waiting for check</small>}
                {p.status === 'rejected' && <small className="pay-state">Rejected</small>}
                {p.note && <small>{p.note}</small>}
              </div>
              {seller && (
                <span className="pay-actions">
                  {p.status === 'pending' && (
                    <>
                      <button type="button" className="icon-btn ok" title="Confirm payment" disabled={busy === p.id} onClick={() => act('review_payment', { id: p.id, decision: 'confirm' })}><i className="fa-solid fa-check" /></button>
                      <button type="button" className="icon-btn" title="Reject payment" disabled={busy === p.id} onClick={() => act('review_payment', { id: p.id, decision: 'reject' })}><i className="fa-solid fa-ban" /></button>
                    </>
                  )}
                  <button type="button" className="icon-btn" title="Delete payment" disabled={busy === p.id} onClick={() => act('delete_payment', { id: p.id }, `The ${money(p.amount)} payment is removed and the balance goes back up.`)}>
                    <i className="fa-regular fa-trash-can" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="dash-error">{error}</p>}
      {!seller && !closed && invoice.payments.some((p) => p.status === 'pending') && (
        <p className="muted small-note">Sent payments show “waiting for check” until {invoice.store_name} confirms them.</p>
      )}
    </section>
  );
}
