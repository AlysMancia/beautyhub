'use client';

import './dashboard.css';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, homeFor, logout, useSession } from '../lib/api';
import { SellerContext } from './SellerContext';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'fa-gauge' },
  { href: '/dashboard/invoices', label: 'Invoices', icon: 'fa-file-invoice', badge: 'pending' },
  { href: '/dashboard/products', label: 'Products', icon: 'fa-box-open' },
  { href: '/dashboard/inventory', label: 'Inventory', icon: 'fa-warehouse' },
  { href: '/dashboard/customers', label: 'Customers', icon: 'fa-users' },
  { label: 'Reports', icon: 'fa-chart-line' },
];

/** Collapsible "Settings" group: one page per setting. */
const SETTINGS = [
  { href: '/dashboard/settings/store', label: 'Store details', icon: 'fa-store' },
  { href: '/dashboard/settings/location', label: 'Location', icon: 'fa-location-dot' },
  { href: '/dashboard/settings/tiers', label: 'Customer tiers', icon: 'fa-layer-group' },
  { href: '/dashboard/settings/brands', label: 'Brands', icon: 'fa-tag' },
  { href: '/dashboard/settings/categories', label: 'Categories', icon: 'fa-shapes' },
  { href: '/dashboard/settings/units', label: 'Units of measure', icon: 'fa-ruler' },
  { href: '/dashboard/settings/profile', label: 'My profile', icon: 'fa-user' },
];

/** Highlights "Products" on /dashboard/products/123 too. */
const isActive = (href, pathname) => (href === '/dashboard' ? pathname === href : pathname.startsWith(href));

/** Seller-only area. Customers and logged-out visitors are redirected. */
export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, user, store, reload } = useSession();
  const [pending, setPending] = useState(0);
  const inSettings = pathname.startsWith('/dashboard/settings');
  const [settingsOpen, setSettingsOpen] = useState(inSettings);

  // Open the group when you land on a settings page; otherwise remember your choice.
  useEffect(() => {
    if (inSettings) setSettingsOpen(true);
    else {
      try {
        setSettingsOpen(localStorage.getItem('nav:settings') === 'open');
      } catch {
        /* no storage */
      }
    }
  }, [inSettings]);
  const toggleSettings = () => {
    setSettingsOpen((open) => {
      try {
        localStorage.setItem('nav:settings', open ? 'closed' : 'open');
      } catch {
        /* no storage */
      }
      return !open;
    });
  };

  // Count of customer orders waiting for approval, refreshed on every page change.
  const refreshPending = useCallback(() => {
    api('list_invoices', { status: 'pending' }).then((d) => d.success && setPending(Number(d.counts?.pending ?? 0)));
  }, []);
  useEffect(() => {
    if (user?.account_type === 'seller') refreshPending();
  }, [pathname, user, refreshPending]);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.account_type !== 'seller') router.replace(homeFor(user));
  }, [loading, user, router]);

  if (loading || !user || user.account_type !== 'seller' || !store) {
    return <div className="center_note">Loading…</div>;
  }

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const initials = store.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <SellerContext.Provider value={{ user, store, reload, refreshPending }}>
      <main className="dash-page">
        <div className="dash-app">
          <aside className="dash-sidebar">
            <div className="dash-brand">
              <div className="brand-circle">{store.logo_path ? <img src={store.logo_path} alt="" /> : initials}</div>
              <h2>{store.name}</h2>
              <p>BEAUTY · SALES · INVENTORY</p>
            </div>

            <nav className="dash-nav">
              {NAV.map((item) =>
                item.href ? (
                  <Link key={item.label} href={item.href} className={isActive(item.href, pathname) ? 'active' : ''}>
                    <span><i className={`fa-solid ${item.icon} nav-icon`} />{item.label}</span>
                    {item.badge === 'pending' && pending > 0 && <span className="nav-badge" title="Orders waiting for approval">{pending}</span>}
                  </Link>
                ) : (
                  <a key={item.label} className="soon" title="Coming soon" aria-disabled="true">
                    <span><i className={`fa-solid ${item.icon} nav-icon`} />{item.label}</span>
                  </a>
                )
              )}

              <button
                type="button"
                className={`nav-group${inSettings ? ' has-active' : ''}`}
                aria-expanded={settingsOpen}
                aria-controls="nav-settings"
                onClick={toggleSettings}
              >
                <span><i className="fa-solid fa-gear nav-icon" />Settings</span>
                <i className={`fa-solid fa-chevron-down chevron${settingsOpen ? ' open' : ''}`} />
              </button>
              <div id="nav-settings" className={`nav-sub${settingsOpen ? ' open' : ''}`} hidden={!settingsOpen}>
                {SETTINGS.map((item) => (
                  <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? 'active' : ''}>
                    <span><i className={`fa-solid ${item.icon} nav-icon`} />{item.label}</span>
                  </Link>
                ))}
              </div>
            </nav>

            <div className="dash-user">
              <span className="avatar">{user.name?.[0]?.toUpperCase() || 'S'}</span>
              <div>
                <small>Welcome,</small>
                <strong style={{ display: 'block' }}>{user.name}</strong>
              </div>
              <button type="button" onClick={handleLogout}>Logout</button>
            </div>
          </aside>

          <section className="dash-main">{children}</section>
        </div>
      </main>
    </SellerContext.Provider>
  );
}
