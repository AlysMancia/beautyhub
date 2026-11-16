'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import LiveActivity from '../components/LiveActivity';
import StoreLinkCard from '../components/StoreLinkCard';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { STATUS } from '../lib/invoice';
import { useSeller } from './SellerContext';

function change(now, before) {
  const a = Number(now);
  const b = Number(before);
  if (!b) return a ? 'First sales this month' : 'No sales yet this month';
  const pct = Math.round(((a - b) / b) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}% vs last month`;
}

/** 30-day sales bars. */
function SalesChart({ days }) {
  const max = Math.max(...days.map((d) => Number(d.total)), 1);
  const total = days.reduce((s, d) => s + Number(d.total), 0);
  if (!total) return <div className="chart empty-chart">Confirmed sales from the last 30 days will show here.</div>;
  return (
    <div className="bars" role="img" aria-label="Sales for the last 30 days">
      {days.map((d) => (
        <div key={d.day} className="bar-wrap" title={`${new Date(`${d.day}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}: ${money(d.total)}`}>
          <div className="bar" style={{ height: `${(Number(d.total) / max) * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { store, refreshPending } = useSeller();
  const [stats, setStats] = useState(null);

  const load = useCallback(() => {
    api('dashboard_stats').then((d) => d.success && setStats(d));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onEvent = (e) => {
    if (e.type === 'order_placed' || e.type === 'member_joined') {
      load();
      refreshPending?.();
    }
  };

  return (
    <>
      <header className="dash-top">
        <div>
          <h1>Dashboard</h1>
          <p>Here&apos;s what&apos;s happening with your business.</p>
        </div>
        <div className="top-actions">
          <Link href="/dashboard/invoices/new" className="dash-btn" style={{ textDecoration: 'none' }}>+ New Invoice</Link>
        </div>
      </header>

      {stats?.pending_orders > 0 && (
        <Link href="/dashboard/invoices" className="card pending-banner">
          <i className="fa-solid fa-bell" /> {stats.pending_orders} customer order{stats.pending_orders > 1 ? 's' : ''} waiting for your approval
          <span>Review →</span>
        </Link>
      )}

      <StoreLinkCard slug={store.slug} />

      <div className="kpi-grid">
        <article className="card">
          <h4>Sales this month</h4>
          <strong>{stats ? money(stats.month_sales) : '–'}</strong>
          <span>{stats ? change(stats.month_sales, stats.last_month_sales) : ''}</span>
        </article>
        <article className="card">
          <h4>Profit this month</h4>
          <strong>{stats ? money(stats.month_profit) : '–'}</strong>
          <span>{stats ? `${stats.month_invoices} confirmed invoice${stats.month_invoices === 1 ? '' : 's'}` : ''}</span>
        </article>
        <article className="card">
          <h4>Customers</h4>
          <strong>{stats?.customers ?? '–'}</strong>
          <span><Link href="/dashboard/customers">Manage customers &amp; roles</Link></span>
        </article>
        <article className="card">
          <h4>Low stock items</h4>
          <strong>{stats?.low_stock ?? '–'}</strong>
          <span><Link href="/dashboard/inventory">Of {stats?.products ?? '–'} products · restock</Link></span>
        </article>
      </div>

      <div className="content-grid">
        <article className="card tall">
          <h3>Sales, last 30 days</h3>
          {stats ? <SalesChart days={stats.daily_sales} /> : <div className="chart" />}
        </article>
        <article className="card">
          <h3>Recent invoices</h3>
          {!stats ? (
            <p className="muted">Loading…</p>
          ) : stats.recent_invoices.length === 0 ? (
            <p className="muted">No invoices yet. <Link href="/dashboard/invoices/new">Make your first one</Link>.</p>
          ) : (
            <ul className="plain-list">
              {stats.recent_invoices.map((i) => (
                <li key={i.id}>
                  <Link href={`/dashboard/invoices/${i.id}`}>{i.invoice_no}</Link>
                  <span className="muted">{i.customer_name}</span>
                  <span>{money(i.total)}</span>
                  <span className={`status-pill ${STATUS[i.status]?.className}`}>{STATUS[i.status]?.short}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="card">
          <h3>Low stock</h3>
          {!stats ? (
            <p className="muted">Loading…</p>
          ) : stats.low_stock_items.length === 0 ? (
            <p className="muted">Everything is stocked.</p>
          ) : (
            <ul className="plain-list">
              {stats.low_stock_items.map((p) => (
                <li key={p.id}>
                  <Link href={`/dashboard/inventory?product=${p.id}`}>{p.name}</Link>
                  <span className={p.stock_qty <= 0 ? 'out-text' : 'low-text'}>{p.stock_qty} left</span>
                </li>
              ))}
            </ul>
          )}
        </article>
        <LiveActivity token={store.ws_token} onEvent={onEvent} />
      </div>
    </>
  );
}
