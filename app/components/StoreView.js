'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import SiteHeader from './SiteHeader';
import { api, logout, storeHref } from '../lib/api';
import { formatAddress } from '../lib/format';
import StoreProducts from './StoreProducts';

/** A seller's own page. Rendered at /store/{slug}, and at / for the default store. */
export default function StoreView({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api('get_store', { slug, per_page: 1 });
    if (result.success) setData(result);
    else setError(result.message || 'Store not found.');
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const join = async () => {
    setBusy(true);
    const result = await api('join_store', { slug });
    if (!result.success) setError(result.message);
    await load();
    setBusy(false);
  };

  const handleLogout = async () => {
    await logout();
    await load();
  };

  if (error && !data) {
    return (
      <>
        <SiteHeader href="/start" />
        <div className="center_note">
          <div style={{ textAlign: 'center' }}>
            <h2>Store not found</h2>
            <p>Check the link you were given, or go to the <Link href="/start">start page</Link>.</p>
          </div>
        </div>
      </>
    );
  }

  if (!data) return <div className="center_note">Loading…</div>;

  const { store, viewer } = data;
  const loginHref = `/login?store=${encodeURIComponent(store.slug)}`;
  const signupHref = `/signup?store=${encodeURIComponent(store.slug)}`;

  return (
    <main>
      <SiteHeader title={store.name} tag="Powered by InVoice" href={storeHref(store.slug)} logo={store.logo_path || undefined}>
        {viewer.relation === 'guest' ? (
          <>
            <Link href={loginHref} className="btn login_btn">Login</Link>
            <Link href={signupHref} className="btn signup_btn">Sign Up</Link>
          </>
        ) : (
          <>
            {viewer.relation === 'owner' && <Link href="/dashboard" className="btn login_btn">Dashboard</Link>}
            {viewer.relation !== 'owner' && <Link href="/account" className="btn login_btn">My stores</Link>}
            <button type="button" className="btn signup_btn" onClick={handleLogout}>Logout</button>
          </>
        )}
      </SiteHeader>

      <section className="store_hero">
        <div className="store_hero_box">
          {store.logo_path && <img src={store.logo_path} alt="" className="store_logo" />}
          <h1>{store.name}</h1>
          <p className="store_owner">by {store.owner_name}</p>
          {store.description && <p className="store_desc">{store.description}</p>}
          {formatAddress(store.location) && (
            <p className="store_address">
              <span><i className="fa-solid fa-location-dot" /> {formatAddress(store.location)}</span>
              {store.location.latitude != null && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${store.location.latitude},${store.location.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on map
                </a>
              )}
            </p>
          )}

          <div className="store_status">
            {viewer.relation === 'guest' && (
              <>
                <span>Log in or sign up to buy from {store.name}.</span>
                <Link href={signupHref} className="btn btn-primary btn-sm">Sign up</Link>
              </>
            )}
            {viewer.relation === 'member' && (
              <span>You&apos;re a <span className="role_badge">{viewer.role || 'Customer'}</span> of this store.</span>
            )}
            {viewer.relation === 'customer' && (
              <>
                <span>You&apos;re not a customer of {store.name} yet.</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={join} disabled={busy}>
                  {busy ? 'Joining…' : 'Join this store'}
                </button>
              </>
            )}
            {viewer.relation === 'owner' && (
              <>
                <span>This is your store page. Share this link with your customers.</span>
                <Link href="/dashboard" className="btn btn-primary btn-sm">Manage store</Link>
              </>
            )}
            {viewer.relation === 'other_seller' && <span>You&apos;re logged in as a seller. Use a customer account to buy here.</span>}
          </div>
          {error && <p className="auth_error" style={{ marginTop: 12 }}>{error}</p>}
        </div>
      </section>

      <StoreProducts key={viewer.relation} store={store} viewer={viewer} />
    </main>
  );
}

