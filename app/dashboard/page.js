export default function DashboardPage() {
  return (
    <main className="dash-page">
      <div className="dash-app">
        <aside className="dash-sidebar">
          <div className="dash-brand">
            <div className="brand-circle">IV</div>
            <h2>InVoice</h2>
            <p>BEAUTY · SALES · INVENTORY</p>
          </div>

          <nav className="dash-nav">
            <a className="active" href="#">Dashboard</a>
            <a href="#">Inventory</a>
            <a href="#">Customers</a>
            <a href="#">Invoices</a>
            <a href="#">Sales</a>
            <a href="#">Reports</a>
            <a href="#">Settings</a>
          </nav>

          <div className="dash-user">
            <span className="avatar">A</span>
            <div>
              <small>Welcome,</small>
              <strong>Admin</strong>
            </div>
          </div>
        </aside>

        <section className="dash-main">
          <header className="dash-top">
            <div>
              <h1>Dashboard</h1>
              <p>Here's what's happening with your business today.</p>
            </div>
            <div className="top-actions">
              <input placeholder="Search..." />
              <button>+ New Invoice</button>
            </div>
          </header>

          <div className="kpi-grid">
            <article className="card"><h4>Total Sales</h4><strong>$24,680.00</strong><span>+12.5% from last month</span></article>
            <article className="card"><h4>Total Invoices</h4><strong>132</strong><span>+8.3% from last month</span></article>
            <article className="card"><h4>Total Customers</h4><strong>215</strong><span>+15.2% from last month</span></article>
            <article className="card"><h4>Low Stock Items</h4><strong>18</strong><span>View and restock items</span></article>
          </div>

          <div className="content-grid">
            <article className="card tall">
              <h3>Sales Overview</h3>
              <div className="chart" />
            </article>
            <article className="card">
              <h3>Recent Invoices</h3>
              <ul>
                <li>INV-2024-0132 · $320.00 · Paid</li>
                <li>INV-2024-0131 · $560.00 · Paid</li>
                <li>INV-2024-0130 · $120.00 · Pending</li>
              </ul>
            </article>
            <article className="card">
              <h3>Low Stock Alerts</h3>
              <ul>
                <li>Vitamin C Serum · Stock: 5</li>
                <li>Moisturizer 50ml · Stock: 8</li>
                <li>Lipstick Matte - 01 · Stock: 3</li>
              </ul>
            </article>
          </div>
        </section>
      </div>

      <style jsx>{`
        .dash-page { min-height: 100vh; background: #fcfbfc; }
        .dash-app { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
        .dash-sidebar { border-right: 1px solid #f0e5eb; background: #fff; padding: 20px; display: flex; flex-direction: column; }
        .dash-brand { text-align: center; padding-bottom: 16px; border-bottom: 1px solid #f0e5eb; }
        .brand-circle { width: 72px; height: 72px; border-radius: 50%; background: #fdeaf1; color: #e25a86; margin: 0 auto 10px; display: grid; place-items: center; font-weight: 800; }
        .dash-brand h2 { margin: 0; font-size: 30px; }
        .dash-brand p { margin: 4px 0 0; color: #9b8e98; font-size: 11px; letter-spacing: .12em; }
        .dash-nav { display: grid; gap: 8px; margin-top: 18px; }
        .dash-nav a { text-decoration: none; color: #3d333a; padding: 10px 12px; border-radius: 10px; font-weight: 600; }
        .dash-nav a.active { background: #fdeaf1; color: #e25a86; }
        .dash-user { margin-top: auto; border-top: 1px solid #f0e5eb; padding-top: 14px; display: flex; gap: 10px; align-items: center; }
        .avatar { width: 40px; height: 40px; border-radius: 50%; background: #f8dce6; display: grid; place-items: center; color: #d95d86; font-weight: 700; }
        .dash-main { padding: 24px; }
        .dash-top { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
        .dash-top h1 { margin: 0; font-size: 44px; }
        .dash-top p { margin: 4px 0 0; color: #8e808b; }
        .top-actions { display: flex; gap: 10px; }
        .top-actions input { border: 1px solid #f0cad9; border-radius: 999px; padding: 10px 14px; min-width: 260px; }
        .top-actions button { border: 0; background: #ec5a86; color: #fff; border-radius: 10px; padding: 10px 14px; font-weight: 700; }
        .kpi-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }
        .content-grid { margin-top: 14px; display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 14px; }
        .card { background: #fff; border: 1px solid #f2e8ed; border-radius: 14px; padding: 14px; box-shadow: 0 8px 24px rgba(230,90,134,.08); }
        .card h4 { margin: 0; color: #4f434a; }
        .card strong { display: block; font-size: 30px; margin: 8px 0 4px; }
        .card span { color: #2f9e59; font-weight: 600; font-size: 14px; }
        .card h3 { margin: 0 0 8px; }
        .card ul { margin: 0; padding-left: 16px; color: #554a52; }
        .card li { margin: 8px 0; }
        .tall { min-height: 300px; }
        .chart { height: 230px; border-radius: 10px; background: linear-gradient(180deg, rgba(236,90,134,.18), rgba(236,90,134,.03)); border: 1px dashed #efccd9; }
        @media (max-width: 1200px) {
          .kpi-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .content-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 900px) {
          .dash-app { grid-template-columns: 1fr; }
          .dash-sidebar { display: none; }
          .dash-top { flex-direction: column; align-items: flex-start; }
          .top-actions { width: 100%; }
          .top-actions input { min-width: 0; width: 100%; }
        }
      `}</style>
    </main>
  );
}
