'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import InvoiceDownload from '../../../components/InvoiceDownload';
import InvoiceEditor from '../../../components/InvoiceEditor';
import InvoiceView from '../../../components/InvoiceView';
import { api } from '../../../lib/api';

export default function InvoicePage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
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
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError('');
    const result = await api(fn, { id, ...data });
    setBusy(false);
    if (!result.success) return setError(result.message);
    setMessage(done);
    load();
  };

  const reject = () => {
    const reason = window.prompt('Reject this order? You can add a reason for the customer (optional):', '');
    if (reason === null) return;
    act('reject_invoice', { reason }, null, 'Order rejected.');
  };

  if (!invoice) return error ? <p className="dash-error">{error}</p> : <p className="muted">Loading…</p>;

  const pending = invoice.status === 'pending';

  return (
    <>
      <header className="dash-top no-print">
        <div>
          <p className="muted" style={{ margin: 0 }}><Link href="/dashboard/invoices">← Invoices</Link></p>
          <h1>{pending ? `Order ${invoice.invoice_no}` : invoice.invoice_no}</h1>
          {pending && (
            <p>
              {invoice.customer_name} placed this order{invoice.source === 'customer' ? ' from your store page' : ''}. Check or change the
              items and prices, then approve it.
            </p>
          )}
        </div>
        {!pending && (
          <div className="top-actions">
            <InvoiceDownload targetId={`invoice-${invoice.id}`} fileName={`${invoice.store_name} ${invoice.invoice_no}`} />
            <button type="button" className="dash-btn ghost" onClick={() => window.print()}>
              <i className="fa-solid fa-print" /> Print
            </button>
            {invoice.status === 'confirmed' && (
              <button
                type="button"
                className="dash-btn ghost danger"
                disabled={busy}
                onClick={() => act('cancel_invoice', {}, `Cancel ${invoice.invoice_no}? Its items go back into your inventory.`, 'Invoice cancelled and stock returned.')}
              >
                Cancel invoice
              </button>
            )}
          </div>
        )}
      </header>

      {message && <p className="form-ok no-print" style={{ marginLeft: 0 }}>{message}</p>}
      {error && <p className="dash-error no-print">{error}</p>}

      <div style={{ marginTop: 18 }}>
        {pending ? (
          <InvoiceEditor
            key={invoice.updated_at}
            invoice={invoice}
            onSaved={(inv) => {
              setInvoice(inv);
              setMessage(inv.status === 'confirmed' ? 'Order approved. Stock has been updated.' : 'Changes saved.');
            }}
            extraActions={
              <button type="button" className="dash-btn ghost danger" onClick={reject} disabled={busy}>
                Reject
              </button>
            }
          />
        ) : (
          <InvoiceView invoice={invoice} showCost />
        )}
      </div>
    </>
  );
}
