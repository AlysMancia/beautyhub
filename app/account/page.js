'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import SiteHeader from '../components/SiteHeader';
import { api, logout, storeHref, useSession } from '../lib/api';
import { money } from '../lib/format';
import { STATUS } from '../lib/invoice';

/** Customer home: the stores they belong to and their role in each. */
export default function AccountPage() {
  const router = useRouter();
  const { loading, user, memberships } = useSession();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.account_type === 'seller') router.replace('/dashboard');
  }, [loading, user, router]);

  if (loading || !user || user.account_type !== 'customer') {
    return <div className="center_note">Loading…</div>;
  }

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <main>
      <SiteHeader>
        <span className="header_user">Hello, {user.name}</span>
        <Link href="/account/profile" className="btn login_btn">Profile</Link>
        <button type="button" className="btn signup_btn" onClick={handleLogout}>Logout</button>
      </SiteHeader>

      <div className="page_wrap">
        <h1>My stores</h1>
        {memberships.length === 0 ? (
          <div className="store_empty" style={{ marginTop: '1rem' }}>
            You haven&apos;t joined a store yet. Open the store link your seller gave you to join.
          </div>
        ) : (
          <div className="store_list">
            {memberships.map((m) => (
              <Link key={m.slug} href={storeHref(m.slug)} className="store_tile">
                <strong>{m.name}</strong>
                <span className="role_badge">{m.role || 'Customer'}</span>
              </Link>
            ))}
          </div>
        )}

        <h2 style={{ marginTop: '2rem', fontSize: '1.5rem' }}>My orders</h2>
        <MyOrders />
      </div>
    </main>
  );
}

function MyOrders() {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    api('my_orders').then((d) => setOrders(d.success ? d.orders : []));
  }, []);

  if (orders === null) return <p className="price_note">Loading…</p>;
  if (orders.length === 0) {
    return <p className="price_note">No orders yet. Open a store and tap “Add to order” on the products you want.</p>;
  }
  return (
    <ul className="order_list">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/account/orders/${o.id}`}>
            <span className="o_main">
              <strong>{o.invoice_no}</strong> · {o.store_name}
              <small>
                {new Date(o.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })} · {o.line_count} item
                {o.line_count === 1 ? '' : 's'}
              </small>
            </span>
            <span className={`status-pill ${STATUS[o.status]?.className}`}>{STATUS[o.status]?.label}</span>
            <strong>{money(o.total)}</strong>
          </Link>
        </li>
      ))}
    </ul>
  );
}
