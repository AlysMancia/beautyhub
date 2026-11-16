'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Pager from '../../components/Pager';
import { money } from '../../lib/format';
import { STATUS } from '../../lib/invoice';
import { useServerList } from '../../lib/useServerList';

const TABS = [
  ['', 'All'],
  ['pending', 'Pending approval'],
  ['confirmed', 'Confirmed'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Cancelled'],
];

export default function InvoicesPage() {
  const router = useRouter();
  const list = useServerList('list_invoices', { q: '', status: '' }, { perPage: 25 });
  const { data, filters, setFilter } = list;

  const count = (s) => (s ? Number(data?.counts?.[s] ?? 0) : Object.values(data?.counts ?? {}).reduce((a, b) => a + Number(b), 0));

  return (
    <>
      <header className="dash-top compact">
        <h1>Invoices</h1>
        <p className="muted head-note">Yours are confirmed right away. Customer orders wait for your approval.</p>
        <div className="top-actions">
          <Link href="/dashboard/invoices/new" className="dash-btn" style={{ textDecoration: 'none' }}>+ New invoice</Link>
        </div>
      </header>

      {list.error && <p className="dash-error">{list.error}</p>}

      <article className="card list-card">
        <div className="toolbar">
          <div className="seg">
            {TABS.map(([v, l]) => (
              <button key={v} type="button" className={filters.status === v ? 'on' : ''} onClick={() => setFilter('status', v)}>
                {l}
                {data && count(v) > 0 && <span className={`seg-count${v === 'pending' ? ' hot' : ''}`}>{count(v)}</span>}
              </button>
            ))}
          </div>
          <input className="dash-input" placeholder="Search no., customer or contact" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          <Pager list={list} label="invoices" sizes={[25, 50, 100]} />
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.invoices.length === 0 ? (
          <div className="empty-state"><p className="muted">No invoices here yet.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="dash-table clickable dense">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Customer</th>
                  <th>From</th>
                  <th>Date</th>
                  <th className="num">Items</th>
                  <th>Status</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id} onClick={() => router.push(`/dashboard/invoices/${i.id}`)}>
                    <td><Link href={`/dashboard/invoices/${i.id}`} className="product-link">{i.invoice_no}</Link></td>
                    <td>{i.customer_name}{i.role_name && <small>{i.role_name}</small>}</td>
                    <td>{i.source === 'customer' ? 'Customer order' : 'You'}</td>
                    <td>{new Date(i.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</td>
                    <td className="num">{i.line_count}</td>
                    <td><span className={`status-pill ${STATUS[i.status]?.className}`}>{STATUS[i.status]?.short}</span></td>
                    <td className="num">{money(i.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager list={list} label="invoices" sizes={[]} className="bottom" />
      </article>
    </>
  );
}
