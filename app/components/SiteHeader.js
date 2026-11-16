'use client';

import Link from 'next/link';

/** Top bar shared by the public pages. `title`/`tag` let a store show its own name. */
export default function SiteHeader({ title = 'InVoice', tag = 'Beauty · Sales · Inventory', href = '/start', logo = '/Assets/InVoice.png', children }) {
  return (
    <header className="nav_sticky sticky-top">
      <nav>
        <div className="container-fluid nav_container">
          <Link href={href} className="brand_block" style={{ textDecoration: 'none' }}>
            <div className="brand_logo">
              <img src={logo} alt="" />
              <span className="brand_name">{title}</span>
            </div>
            <span className="brand_tag">{tag}</span>
          </Link>
          <div style={{ flex: 1 }} />
          <div className="users_tab header_actions">{children}</div>
        </div>
      </nav>
    </header>
  );
}
