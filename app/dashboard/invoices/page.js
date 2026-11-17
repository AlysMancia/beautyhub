'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Pager from '../../components/Pager';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import SearchSelect from '../../components/SearchSelect';
import { PAYMENT, RELEASE, STATUS } from '../../lib/invoice';
import { useServerList } from '../../lib/useServerList';
import { confirmDialog, alertDialog } from '../../components/Dialogs';

const TABS = [
  ['', 'All'],
  ['pending', 'Pending approval'],
  ['confirmed', 'Confirmed'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Cancelled'],
];

export default function InvoicesPage() {
  const router = useRouter();
  const list = useServerList('list_invoices', { q: '', status: '', payment: '', release: '' }, { perPage: 25 });
  const { data, filters, setFilter } = list;

  // One click from the list: the balance is recorded as paid today.
  const markPaid = async (e, i) => {
    e.stopPropagation();
    const balance = Number(i.total) - Number(i.amount_paid);
    if (!(await confirmDialog(`Records ${money(balance)} as paid today.`, { title: `Mark ${i.invoice_no} as paid?`, confirmLabel: 'Mark paid' }))) return;
    const result = await api('mark_paid', { invoice_id: i.id });
    if (!result.success) return alertDialog(result.message, { title: 'Could not mark as paid' });
    list.reload();
  };

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
          <SearchSelect className="dash-select" value={filters.payment} onChange={(e) => setFilter('payment', e.target.value)} aria-label="Payment">
            <option value="">Any payment</option>
            <option value="due">Not fully paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partly paid</option>
            <option value="paid">Paid</option>
            <option value="overpaid">Overpaid</option>
          </SearchSelect>
          <SearchSelect className="dash-select" value={filters.release} onChange={(e) => setFilter('release', e.target.value)} aria-label="Release">
            <option value="">Open or released</option>
            <option value="open">Open (not released)</option>
            <option value="released">Released</option>
          </SearchSelect>
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
                  <th>Payment</th>
                  <th>Release</th>
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
                    <td>
                      {['pending', 'confirmed'].includes(i.status) && (
                        <span className={`pay-pill ${PAYMENT[i.payment_status]?.className}`}>{PAYMENT[i.payment_status]?.short ?? PAYMENT[i.payment_status]?.label}</span>
                      )}
                      {Number(i.payments_to_check) > 0 && <span className="pay-pill pending" title="Payments sent by the customer">{i.payments_to_check} to check</span>}
                      {['unpaid', 'partial'].includes(i.payment_status) && ['pending', 'confirmed'].includes(i.status) && (
                        <button type="button" className="icon-btn row-pay" title="Mark paid" onClick={(e) => markPaid(e, i)}>
                          <i className="fa-solid fa-check" />
                        </button>
                      )}
                      {i.payment_status === 'partial' && <small>{money(i.amount_paid)} paid</small>}
                    </td>
                    <td>
                      {i.status === 'confirmed' && (
                        <span className={`rel-pill ${RELEASE[i.release_status]?.className}`} title={i.released_to ? `Released to ${i.released_to}` : ''}>
                          {RELEASE[i.release_status]?.label}
                        </span>
                      )}
                      {i.released_to && <small>{i.released_to}</small>}
                    </td>
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
