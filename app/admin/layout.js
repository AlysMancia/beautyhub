'use client';

import '../dashboard/dashboard.css';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { homeFor, logout, useSession } from '../lib/api';
import { useNavCollapsed } from '../lib/useNavCollapsed';

const NAV = [
  { href: '/admin', label: 'Accounts', icon: 'fa-users-gear' },
  { href: '/admin/store-categories', label: 'Store categories', icon: 'fa-tags' },
];

/** Admin-only area. Everyone else is sent to their own home page. */
export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, user } = useSession();
  const [navCollapsed, toggleNav] = useNavCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.account_type !== 'admin') router.replace(homeFor(user));
  }, [loading, user, router]);

  if (loading || !user || user.account_type !== 'admin') return <div className="center_note">Loading…</div>;

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <main className="dash-page">
      <header className="dash-mobilebar">
        <button type="button" className="mb-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen}>
          <i className="fa-solid fa-bars" />
        </button>
        <Link href="/admin" className="mb-brand">
          <span className="brand-circle"><i className="fa-solid fa-user-shield" /></span>
          <strong>Admin</strong>
        </Link>
      </header>
      <div className={`dash-app${navCollapsed ? ' nav-collapsed' : ''}${mobileOpen ? ' nav-open' : ''}`}>
        {mobileOpen && <div className="dash-backdrop" onClick={() => setMobileOpen(false)} />}
        <aside className="dash-sidebar">
          <button type="button" className="nav-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <i className="fa-solid fa-xmark" />
          </button>
          <button type="button" className="nav-toggle" onClick={toggleNav} title={navCollapsed ? 'Show menu' : 'Hide menu'} aria-label={navCollapsed ? 'Show menu' : 'Hide menu'} aria-expanded={!navCollapsed}>
            <i className={`fa-solid ${navCollapsed ? 'fa-angles-right' : 'fa-angles-left'}`} />
          </button>
          <div className="dash-brand">
            <div className="brand-circle"><i className="fa-solid fa-user-shield" /></div>
            <h2>Admin</h2>
            <p>MANAGE ALL ACCOUNTS</p>
          </div>
          <nav className="dash-nav">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''} title={navCollapsed ? item.label : undefined}>
                <span><i className={`fa-solid ${item.icon} nav-icon`} /><span className="nav-label">{item.label}</span></span>
              </Link>
            ))}
          </nav>
          <div className="dash-user">
            <span className="avatar">{user.name?.[0]?.toUpperCase() || 'A'}</span>
            <div>
              <small>Admin</small>
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
  );
}
