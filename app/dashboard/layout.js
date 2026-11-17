'use client';

import './dashboard.css';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, homeFor, logout, useSession } from '../lib/api';
import { useNavCollapsed } from '../lib/useNavCollapsed';
import { useIsPhone } from '../lib/useIsPhone';
import NotificationBell from '../components/NotificationBell';
import { SellerContext } from './SellerContext';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'fa-gauge' },
  { href: '/dashboard/invoices', label: 'Invoices', icon: 'fa-file-invoice', badge: 'pending' },
  { href: '/dashboard/expenses', label: 'Expenses & income', icon: 'fa-receipt' },
  { href: '/dashboard/products', label: 'Products', icon: 'fa-box-open' },
  { href: '/dashboard/inventory', label: 'Inventory', icon: 'fa-warehouse' },
  { href: '/dashboard/price-list', label: 'Price list', icon: 'fa-tags' },
  { href: '/dashboard/customers', label: 'Customers', icon: 'fa-users' },
  { label: 'Reports', icon: 'fa-chart-line' },
];

/** Collapsible "Settings" group: one page per setting. */
const SETTINGS = [
  { href: '/dashboard/settings/store', label: 'Store details', icon: 'fa-store' },
  { href: '/dashboard/settings/payments', label: 'Payment methods', icon: 'fa-wallet' },
  { href: '/dashboard/settings/money', label: 'Expense categories', icon: 'fa-list-check' },
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
  const [navCollapsed, toggleNav] = useNavCollapsed();
  const isPhone = useIsPhone();
  // Phones: the menu is a drawer opened from the top bar; it closes when you go to a page.
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [pathname]);

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
        <header className="dash-mobilebar">
          <button type="button" className="mb-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}>
            <i className="fa-solid fa-bars" />
            {pending > 0 && <span className="mb-dot" title="Orders waiting for approval">{pending}</span>}
          </button>
          <Link href="/dashboard" className="mb-brand">
            <span className="brand-circle">{store.logo_path ? <img src={store.logo_path} alt="" /> : initials}</span>
            <strong>{store.name}</strong>
          </Link>
          {isPhone && <NotificationBell wsToken={store.ws_token} className="mb-bell" />}
        </header>
        <div className={`dash-app${navCollapsed ? ' nav-collapsed' : ''}${mobileOpen ? ' nav-open' : ''}`}>
          {mobileOpen && <div className="dash-backdrop" onClick={() => setMobileOpen(false)} />}
          <aside className="dash-sidebar">
            <button type="button" className="nav-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <i className="fa-solid fa-xmark" />
            </button>
            <button
              type="button"
              className="nav-toggle"
              onClick={toggleNav}
              title={navCollapsed ? 'Show menu' : 'Hide menu'}
              aria-label={navCollapsed ? 'Show menu' : 'Hide menu'}
              aria-expanded={!navCollapsed}
            >
              <i className={`fa-solid ${navCollapsed ? 'fa-angles-right' : 'fa-angles-left'}`} />
            </button>
            {!isPhone && <NotificationBell wsToken={store.ws_token} className="side-bell" />}
            <div className="dash-brand">
              <div className="brand-circle">{store.logo_path ? <img src={store.logo_path} alt="" /> : initials}</div>
              <h2>{store.name}</h2>
              <p>BEAUTY · SALES · INVENTORY</p>
            </div>

            <nav className="dash-nav">
              {NAV.map((item) =>
                item.href ? (
                  <Link key={item.label} href={item.href} className={isActive(item.href, pathname) ? 'active' : ''} title={navCollapsed ? item.label : undefined}>
                    <span><i className={`fa-solid ${item.icon} nav-icon`} /><span className="nav-label">{item.label}</span></span>
                    {item.badge === 'pending' && pending > 0 && <span className="nav-badge" title="Orders waiting for approval">{pending}</span>}
                  </Link>
                ) : (
                  <a key={item.label} className="soon" title={navCollapsed ? `${item.label} (coming soon)` : 'Coming soon'} aria-disabled="true">
                    <span><i className={`fa-solid ${item.icon} nav-icon`} /><span className="nav-label">{item.label}</span></span>
                  </a>
                )
              )}

              <button
                type="button"
                className={`nav-group${inSettings ? ' has-active' : ''}`}
                aria-expanded={settingsOpen}
                aria-controls="nav-settings"
                onClick={toggleSettings}
                title={navCollapsed ? 'Settings' : undefined}
              >
                <span><i className="fa-solid fa-gear nav-icon" /><span className="nav-label">Settings</span></span>
                <i className={`fa-solid fa-chevron-down chevron${settingsOpen ? ' open' : ''}`} />
              </button>
              <div id="nav-settings" className={`nav-sub${settingsOpen ? ' open' : ''}`} hidden={!settingsOpen}>
                {SETTINGS.map((item) => (
                  <Link key={item.href} href={item.href} className={pathname.startsWith(item.href) ? 'active' : ''} title={navCollapsed ? item.label : undefined}>
                    <span><i className={`fa-solid ${item.icon} nav-icon`} /><span className="nav-label">{item.label}</span></span>
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
              <button type="button" onClick={handleLogout} title="Log out">
                <i className="fa-solid fa-right-from-bracket logout-icon" />
                <span className="nav-label">Logout</span>
              </button>
            </div>
          </aside>

          <section className="dash-main">{children}</section>
        </div>
      </main>
    </SellerContext.Provider>
  );
}
