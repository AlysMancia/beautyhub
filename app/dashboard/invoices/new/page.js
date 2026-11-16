'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import InvoiceEditor from '../../../components/InvoiceEditor';

export default function NewInvoicePage() {
  const router = useRouter();
  return (
    <>
      <header className="dash-top">
        <div>
          <p className="muted" style={{ margin: 0 }}><Link href="/dashboard/invoices">← Invoices</Link></p>
          <h1>New invoice</h1>
        </div>
      </header>
      <InvoiceEditor onSaved={(inv) => router.push(`/dashboard/invoices/${inv.id}`)} />
    </>
  );
}
