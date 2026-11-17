'use client';

import '../dashboard/dashboard.css';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AccountCode from '../components/AccountCode';
import NotificationBell from '../components/NotificationBell';
import SiteHeader from '../components/SiteHeader';
import { api, homeFor, logout, storeHref, useSession } from '../lib/api';
import { money } from '../lib/format';
import { PAYMENT, STATUS } from '../lib/invoice';

const day = (d) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const balanceOf = (o) => Math.max(0, Number(o.total) - Number(o.amount_paid || 0));
const live = (o) => ['pending', 'confirmed'].includes(o.status);
const toPay = (o) => o.status === 'confirmed' && balanceOf(o) > 0;
const done = (o) => o.status === 'confirmed' && balanceOf(o) === 0;

const TABS = [
  ['all', 'All', () => true],
  ['waiting', 'Waiting', (o) => o.status === 'pending'],
  ['pay', 'To pay', toPay],
  ['done', 'Completed', done],
  ['closed', 'Cancelled', (o) => ['rejected', 'cancelled'].includes(o.status)],
];

/** Placed → Confirmed → Paid → Released. */
function Progress({ o }) {
  if (!live(o)) return null;
  const steps = [
    ['Placed', true],
    ['Confirmed', o.status === 'confirmed'],
    ['Paid', o.payment_status === 'paid' || o.payment_status === 'overpaid'],
    ['Released', o.release_status === 'released'],
  ];
  return (
    <ol className="acct-steps" aria-label="Order progress">
      {steps.map(([label, ok]) => (
        <li key={label} className={ok ? 'ok' : ''}>
          <span className="dot">{ok && <i className="fa-solid fa-check" />}</span>
          <small>{label}</small>
        </li>
      ))}
    </ol>
  );
}

function OrderRow({ o }) {
  const status = STATUS[o.status];
  const pay = PAYMENT[o.payment_status] ?? PAYMENT.unpaid;
  const balance = balanceOf(o);
  return (
    <li className="acct-order">
      <Link href={`/account/orders/${o.id}`}>
        <span className="acct-logo">{o.store_logo ? <img src={o.store_logo} alt="" /> : o.store_name?.[0]}</span>
        <span className="acct-main">
          <strong>{o.invoice_no}</strong>
          <small>{o.store_name} · {day(o.created_at)} · {o.line_count} item{o.line_count === 1 ? '' : 's'}</small>
          <span className="acct-pills">
            {o.status !== 'confirmed' && <span className={`status-pill ${status?.className}`}>{status?.short ?? o.status}</span>}
            {live(o) && <span className={`pay-pill ${pay.className}`}>{pay.label}</span>}
            {o.release_status === 'released' && <span className="rel-pill released">Released</span>}
          </span>
          <Progress o={o} />
        </span>
        <span className="acct-amt">
          <strong>{money(o.total)}</strong>
          {toPay(o) && <small className="due">{money(balance)} to pay</small>}
        </span>
      </Link>
    </li>
  );
}

/** Customer home: what needs attention, orders, stores, recent updates. */
export default function AccountPage() {
  const router = useRouter();
  const { loading, user, memberships } = useSession();
  const [orders, setOrders] = useState(null);
  const [updates, setUpdates] = useState(null);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.account_type !== 'customer') router.replace(homeFor(user));
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || user.account_type !== 'customer') return;
    api('my_orders').then((d) => setOrders(d.success ? d.orders : []));
    api('list_notifications', { limit: 6 }).then((d) => setUpdates(d.success ? d.notifications : []));
  }, [user]);

  const counts = useMemo(() => {
    const list = orders ?? [];
    return {
      total: list.length,
      waiting: list.filter((o) => o.status === 'pending').length,
      pay: list.filter(toPay),
      done: list.filter(done).length,
    };
  }, [orders]);

  if (loading || !user || user.account_type !== 'customer') {
    return <div className="center_note">Loading…</div>;
  }

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const owed = counts.pay.reduce((s, o) => s + balanceOf(o), 0);
  const shown = (orders ?? []).filter(TABS.find(([k]) => k === tab)[2]);
  const firstName = (user.name || '').split(' ')[0] || 'there';

  return (
    <main className="acct-page">
      <SiteHeader>
        <NotificationBell />
        <Link href="/account/profile" className="btn login_btn">Profile</Link>
        <button type="button" className="btn signup_btn" onClick={handleLogout}>Logout</button>
      </SiteHeader>

      <div className="acct-wrap">
        <header className="acct-hero">
          <div>
            <h1>Hi, {firstName}!</h1>
            <p>Your orders and the stores you buy from.</p>
          </div>
          {memberships.length === 1 && (
            <Link href={storeHref(memberships[0].slug)} className="btn btn-primary acct-shop">
              <i className="fa-solid fa-bag-shopping" /> Shop {memberships[0].name}
            </Link>
          )}
        </header>

        <section className="acct-stats">
          <div><span>Orders</span><strong>{orders ? counts.total : '—'}</strong></div>
          <div className={counts.waiting ? 'warn' : ''}><span>Waiting for approval</span><strong>{orders ? counts.waiting : '—'}</strong></div>
          <div className={owed > 0 ? 'bad' : ''}><span>To pay</span><strong>{orders ? money(owed) : '—'}</strong></div>
          <div className="good"><span>Completed</span><strong>{orders ? counts.done : '—'}</strong></div>
        </section>

        <div className="acct-grid">
          <section className="acct-col">
            {counts.pay.length > 0 && (
              <article className="acct-card attention">
                <h2><i className="fa-solid fa-circle-exclamation" /> Needs your attention</h2>
                {counts.pay.slice(0, 3).map((o) => (
                  <div key={o.id} className="attn-row">
                    <span>
                      <strong>{o.invoice_no}</strong> · {o.store_name}
                      <small>{money(balanceOf(o))} left to pay{Number(o.amount_paid) > 0 ? ` (paid ${money(o.amount_paid)})` : ''}</small>
                    </span>
                    <Link href={`/account/orders/${o.id}`} className="btn btn-primary btn-sm">Pay</Link>
                  </div>
                ))}
              </article>
            )}

            <article className="acct-card">
              <div className="acct-card-head">
                <h2>My orders</h2>
                <div className="acct-tabs" role="tablist">
                  {TABS.map(([k, label, fn]) => {
                    const n = (orders ?? []).filter(fn).length;
                    return (
                      <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                        {label}{k !== 'all' && n > 0 && <span>{n}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {orders === null ? (
                <p className="price_note">Loading…</p>
              ) : shown.length === 0 ? (
                <div className="acct-empty">
                  <i className="fa-solid fa-bag-shopping" />
                  <p>{orders.length === 0 ? 'No orders yet. Open a store and tap “Add to order” on what you want.' : 'Nothing here.'}</p>
                  {orders.length === 0 && memberships[0] && (
                    <Link href={storeHref(memberships[0].slug)} className="btn btn-primary btn-sm">Start shopping</Link>
                  )}
                </div>
              ) : (
                <ul className="acct-orders">{shown.map((o) => <OrderRow key={o.id} o={o} />)}</ul>
              )}
            </article>
          </section>

          <aside className="acct-col side">
            <article className="acct-card">
              <h2>My stores</h2>
              {memberships.length === 0 ? (
                <p className="price_note">You haven&apos;t joined a store yet. Open the store link your seller gave you.</p>
              ) : (
                <ul className="acct-stores">
                  {memberships.map((m) => (
                    <li key={m.slug}>
                      <span className="acct-logo">{m.logo_path ? <img src={m.logo_path} alt="" /> : m.name[0]}</span>
                      <span className="acct-main">
                        <strong>{m.name}</strong>
                        <span className="role_badge">{m.role || 'Customer'} prices</span>
                      </span>
                      <Link href={storeHref(m.slug)} className="btn login_btn btn-sm">Shop</Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="acct-card">
              <h2>Recent updates</h2>
              {updates === null ? (
                <p className="price_note">Loading…</p>
              ) : updates.length === 0 ? (
                <p className="price_note">You&apos;ll see updates here when a store confirms your order or your payment.</p>
              ) : (
                <ul className="acct-updates">
                  {updates.map((n) => (
                    <li key={n.id} className={n.is_read ? '' : 'unread'}>
                      {n.link ? <Link href={n.link}>{n.title}</Link> : <span>{n.title}</span>}
                      {n.body && <small>{n.body}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <AccountCode code={user.code} />
          </aside>
        </div>
      </div>
    </main>
  );
}
