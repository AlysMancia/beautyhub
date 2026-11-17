'use client';

import '../../../dashboard/dashboard.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import InvoiceDownload from '../../../components/InvoiceDownload';
import InvoicePayments from '../../../components/InvoicePayments';
import NotificationBell from '../../../components/NotificationBell';
import InvoiceView from '../../../components/InvoiceView';
import SiteHeader from '../../../components/SiteHeader';
import { api, storeHref, useSession } from '../../../lib/api';
import { STATUS } from '../../../lib/invoice';

/** A customer's own order / invoice. */
export default function CustomerOrderPage() {
  const { id } = useParams();
  const router = useRouter();
  const { loading, user } = useSession();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) return router.replace('/login');
    api('get_invoice', { id }).then((d) => (d.success ? setInvoice(d.invoice) : setError(d.message)));
  }, [loading, user, id, router]);

  return (
    <main>
      <SiteHeader>
        <NotificationBell />
        <Link href="/account" className="btn login_btn">My orders</Link>
      </SiteHeader>
      <div className="page_wrap">
        {error && <p className="auth_error">{error}</p>}
        {!invoice && !error && <p className="price_note">Loading…</p>}
        {invoice && (
          <>
            <p className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href={storeHref(invoice.store_slug)}>← {invoice.store_name}</Link>
              <span className={`status-pill ${STATUS[invoice.status]?.className}`}>{STATUS[invoice.status]?.label}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <InvoiceDownload
                  targetId={`invoice-${invoice.id}`}
                  fileName={`${invoice.store_name} ${invoice.invoice_no}`}
                  className="btn btn-sm login_btn"
                />
                <button type="button" className="btn btn-sm login_btn" onClick={() => window.print()}>
                  <i className="fa-solid fa-print" /> Print
                </button>
              </span>
            </p>
            {invoice.status === 'pending' && (
              <p className="joining_banner no-print">
                {invoice.store_name} hasn&apos;t confirmed this order yet. Prices and quantities may still change.
              </p>
            )}
            <InvoiceView invoice={invoice} />
            {['pending', 'confirmed'].includes(invoice.status) && (
              <div style={{ marginTop: 14 }}>
                <InvoicePayments invoice={invoice} onChange={setInvoice} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
