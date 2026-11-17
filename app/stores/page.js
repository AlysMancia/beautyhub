'use client';

import Link from 'next/link';
import Pager from '../components/Pager';
import SiteHeader from '../components/SiteHeader';
import { homeFor, storeHref, useSession } from '../lib/api';
import { useServerList } from '../lib/useServerList';

/** Explore stores: every shop on the site, searchable and filtered by store category. */
export default function StoresPage() {
  const { user } = useSession();
  const list = useServerList('list_stores', { q: '', category: '' }, { perPage: 24 });
  const { data, filters, setFilter } = list;
  const categories = data?.categories ?? [];

  return (
    <main className="explore-page">
      <SiteHeader href="/">
        {user ? (
          <Link href={homeFor(user)} className="btn login_btn">{user.account_type === 'seller' ? 'Dashboard' : 'My account'}</Link>
        ) : (
          <>
            <Link href="/login" className="btn login_btn">Login</Link>
            <Link href="/signup" className="btn signup_btn">Sign Up</Link>
          </>
        )}
      </SiteHeader>

      <section className="explore-hero">
        <h1>Explore stores</h1>
        <p>Find beauty sellers and shop from them directly.</p>
        <div className="explore-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            className="form-control"
            placeholder="Search stores by name or place"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            aria-label="Search stores"
          />
        </div>
      </section>

      <section className="explore-body">
        <div className="explore-cats" role="tablist" aria-label="Store categories">
          <button type="button" className={!filters.category ? 'on' : ''} onClick={() => setFilter('category', '')}>
            <i className="fa-solid fa-border-all" /> All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={String(filters.category) === String(c.id) ? 'on' : ''}
              onClick={() => setFilter('category', String(c.id))}
            >
              <i className={`fa-solid ${c.icon}`} /> {c.name}
              {c.store_count > 0 && <span>{c.store_count}</span>}
            </button>
          ))}
        </div>

        {!data ? (
          <p className="price_note">Loading stores…</p>
        ) : data.stores.length === 0 ? (
          <div className="explore-empty">
            <i className="fa-solid fa-store-slash" />
            <p>No stores here yet.</p>
            {(filters.q || filters.category) && (
              <button type="button" className="btn login_btn btn-sm" onClick={() => { setFilter('q', ''); setFilter('category', ''); }}>
                Show all stores
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="explore-grid">
              {data.stores.map((s) => (
                <Link key={s.slug} href={storeHref(s.slug)} className="store-card">
                  <div className="sc-photos">
                    {[0, 1, 2].map((i) => (
                      <span key={i}>{s.photos[i] ? <img src={s.photos[i]} alt="" loading="lazy" /> : null}</span>
                    ))}
                    <span className="sc-logo">{s.logo_path ? <img src={s.logo_path} alt="" /> : s.name[0]}</span>
                  </div>
                  <div className="sc-body">
                    <strong>{s.name}</strong>
                    {s.place && <small><i className="fa-solid fa-location-dot" /> {s.place}</small>}
                    {s.description && <p>{s.description}</p>}
                    {s.categories.length > 0 && (
                      <span className="sc-cats">
                        {s.categories.map((c) => <span key={c.id}><i className={`fa-solid ${c.icon}`} /> {c.name}</span>)}
                      </span>
                    )}
                    <span className="sc-foot">
                      <span>{s.product_count} product{s.product_count === 1 ? '' : 's'}</span>
                      <span className="sc-visit">Visit store →</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <Pager list={list} label="stores" sizes={[]} className="store_pager" />
          </>
        )}
      </section>
    </main>
  );
}
