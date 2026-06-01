<?php
session_start();

if (isset($_SESSION['user_id']) && !empty($_SESSION['user_id'])) {
  header('Location: pages/dashboard.php');
  exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InVoice Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    :root {
      --bg: #fcfbfc;
      --panel: #ffffff;
      --text: #1f1b20;
      --muted: #8f8791;
      --accent: #f05f88;
      --accent-soft: #fdeaf1;
      --line: #f1e8ee;
      --success: #16a34a;
      --radius: 16px;
      --shadow: 0 10px 30px rgba(240, 95, 136, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "Manrope", sans-serif;
      background: radial-gradient(circle at top right, #fff4f8, #fcfbfc 35%);
      color: var(--text);
    }

    .app {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: 100vh;
    }

    .sidebar {
      background: linear-gradient(180deg, #fff, #fffafc);
      border-right: 1px solid var(--line);
      padding: 28px 20px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .brand {
      text-align: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
    }

    .brand .logo-mark {
      font-family: "Playfair Display", serif;
      font-size: 54px;
      color: #f3a3bc;
      line-height: 1;
    }

    .brand .logo-text {
      font-family: "Playfair Display", serif;
      font-size: 54px;
      color: #f3a3bc;
      line-height: 0.9;
    }

    .brand h2 {
      margin: 4px 0 0;
      font-family: "Playfair Display", serif;
      font-size: 54px;
      color: #222;
      line-height: 1;
    }

    .brand p {
      margin: 6px 0 0;
      font-size: 10px;
      letter-spacing: 0.25em;
      color: #b7aeb7;
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .nav a {
      text-decoration: none;
      color: #362f35;
      font-weight: 600;
      font-size: 15px;
      padding: 14px 16px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .nav a.active {
      background: var(--accent-soft);
      color: var(--accent);
    }

    .nav a i {
      width: 16px;
    }

    .profile {
      margin-top: auto;
      border-top: 1px solid var(--line);
      padding-top: 18px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #f7dbe5;
      display: grid;
      place-items: center;
      color: #e05f89;
    }

    .profile small { color: var(--muted); display: block; }
    .profile strong { font-size: 22px; font-weight: 700; }

    .main {
      padding: 26px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .title h1 {
      margin: 0;
      font-family: "Playfair Display", serif;
      font-size: 50px;
      font-weight: 600;
    }

    .title p { margin: 2px 0 0; color: var(--muted); }

    .actions {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .guest-menu {
      position: relative;
    }

    .guest-toggle {
      border: 1px solid var(--line);
      background: #fff;
      color: #4b434a;
      border-radius: 12px;
      padding: 10px 14px;
      font-weight: 600;
      cursor: pointer;
    }

    .guest-dropdown {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      min-width: 180px;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 12px;
      box-shadow: var(--shadow);
      padding: 10px;
      display: none;
      z-index: 5;
    }

    .guest-menu:hover .guest-dropdown {
      display: block;
    }

    .dashboard-link {
      display: block;
      text-decoration: none;
      text-align: center;
      background: linear-gradient(135deg, #f57fa1, #ec5a86);
      color: #fff;
      padding: 10px 12px;
      border-radius: 10px;
      font-weight: 700;
    }

    .search {
      border: 1px solid #efcad8;
      border-radius: 999px;
      height: 46px;
      width: 340px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #b58f9d;
      background: #fff;
    }

    .search input { border: none; outline: none; width: 100%; font: inherit; }

    .btn {
      border: none;
      background: linear-gradient(135deg, #f57fa1, #ec5a86);
      color: #fff;
      border-radius: 12px;
      padding: 12px 20px;
      font-weight: 700;
      cursor: pointer;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }

    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 18px;
    }

    .card h4 { margin: 0; font-size: 20px; }
    .metric { font-size: 46px; margin: 8px 0 6px; font-weight: 700; }
    .trend { color: var(--success); font-weight: 600; }

    .grid {
      display: grid;
      grid-template-columns: 1.4fr 1.2fr 1.2fr;
      gap: 16px;
    }

    .panel-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }

    .panel-title h3 {
      margin: 0;
      font-family: "Playfair Display", serif;
      font-size: 36px;
      font-weight: 600;
    }

    .chip {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 7px 10px;
      color: #6e6570;
      background: #fff;
    }

    .chart {
      height: 250px;
      background: linear-gradient(to top, rgba(240,95,136,.15), transparent 65%);
      border-radius: 12px;
      border: 1px dashed #f3d5df;
      position: relative;
      overflow: hidden;
    }

    .chart svg {
      width: 100%;
      height: 100%;
      position: absolute;
      inset: 0;
    }

    .list-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid #f8f0f4;
      font-size: 14px;
    }

    .tag {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
    }

    .paid { background: #eaf8ef; color: #2d9d55; }
    .pending { background: #ffeef2; color: #e46088; }
    .low { background: #ffeef2; color: #dc4f79; }

    .bottom {
      display: grid;
      grid-template-columns: 1fr 1fr 0.9fr;
      gap: 16px;
    }

    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 4px; text-align: left; border-bottom: 1px solid #f8f0f4; }
    th { color: var(--muted); font-weight: 600; font-size: 13px; }

    .cta {
      background: linear-gradient(180deg, #fff4f8, #fff);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .cta p { color: #e06088; font-size: 26px; line-height: 1.35; }

    @media (max-width: 1400px) {
      .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid, .bottom { grid-template-columns: 1fr; }
    }

    @media (max-width: 980px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { display: none; }
      .topbar { flex-direction: column; align-items: flex-start; }
      .search { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo-mark">I</div>
        <div class="logo-text">V</div>
        <h2>InVoice</h2>
        <p>BEAUTY · SALES · INVENTORY</p>
      </div>

      <nav class="nav">
        <a class="active" href="#"><i class="fa-solid fa-house"></i>Dashboard</a>
        <a href="#"><i class="fa-solid fa-box"></i>Inventory</a>
        <a href="#"><i class="fa-regular fa-user"></i>Customers</a>
        <a href="#"><i class="fa-regular fa-file-lines"></i>Invoices</a>
        <a href="#"><i class="fa-solid fa-arrow-trend-up"></i>Sales</a>
        <a href="#"><i class="fa-regular fa-chart-pie"></i>Reports</a>
        <a href="#"><i class="fa-solid fa-gear"></i>Settings</a>
      </nav>

      <div class="profile">
        <div class="avatar"><i class="fa-solid fa-user"></i></div>
        <div>
          <small>Welcome,</small>
          <strong>Admin</strong>
        </div>
      </div>
    </aside>

    <main class="main">
      <div class="topbar">
        <div class="title">
          <h1>Dashboard</h1>
          <p>Here's what's happening with your business today.</p>
        </div>
        <div class="actions">
          <div class="search"><i class="fa-solid fa-magnifying-glass"></i><input placeholder="Search..." /></div>
          <?php if (isset($_SESSION['user_id']) && !empty($_SESSION['user_id'])): ?>
            <div class="guest-menu login_dropdown">
              <button class="guest-toggle">Hello, Admin <i class="fa-solid fa-chevron-down"></i></button>
              <div class="guest-dropdown">
                <a class="dashboard-link" href="pages/dashboard.php">Go to Dashboard</a>
              </div>
            </div>
          <?php else: ?>
            <div class="guest-menu">
              <button class="guest-toggle">Hello, Guest <i class="fa-solid fa-chevron-down"></i></button>
              <div class="guest-dropdown">
                <a class="dashboard-link" href="pages/dashboard.php">Go to Dashboard</a>
              </div>
            </div>
          <?php endif; ?>
          <button class="btn"><i class="fa-solid fa-plus"></i> New Invoice</button>
        </div>
      </div>

      <section class="cards">
        <article class="card"><h4>Total Sales</h4><div class="metric">$24,680.00</div><div class="trend"><i class="fa-solid fa-arrow-up"></i> 12.5% from last month</div></article>
        <article class="card"><h4>Total Invoices</h4><div class="metric">132</div><div class="trend"><i class="fa-solid fa-arrow-up"></i> 8.3% from last month</div></article>
        <article class="card"><h4>Total Customers</h4><div class="metric">215</div><div class="trend"><i class="fa-solid fa-arrow-up"></i> 15.2% from last month</div></article>
        <article class="card"><h4>Low Stock Items</h4><div class="metric">18</div><div style="color:#e15f88;font-weight:600;">View and restock items</div></article>
      </section>

      <section class="grid">
        <article class="card">
          <div class="panel-title"><h3>Sales Overview</h3><span class="chip">This Month</span></div>
          <div class="chart">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline fill="none" stroke="#ec5a86" stroke-width="1.4" points="0,80 12,62 20,67 30,52 42,58 54,38 61,42 71,30 82,36 91,20 100,9"></polyline>
            </svg>
          </div>
          <div style="margin-top:12px;color:#807884;">Total Sales <strong style="display:block;color:#1f1b20;font-size:30px;">$24,680.00</strong></div>
        </article>

        <article class="card">
          <div class="panel-title"><h3>Recent Invoices</h3><a href="#" style="color:#e06088;text-decoration:none;">View All</a></div>
          <div class="list-row"><div>INV-2024-0132</div><strong>$320.00</strong><span class="tag paid">Paid</span></div>
          <div class="list-row"><div>INV-2024-0131</div><strong>$560.00</strong><span class="tag paid">Paid</span></div>
          <div class="list-row"><div>INV-2024-0130</div><strong>$120.00</strong><span class="tag pending">Pending</span></div>
          <div class="list-row"><div>INV-2024-0129</div><strong>$450.00</strong><span class="tag paid">Paid</span></div>
          <div class="list-row" style="border-bottom:0;"><div>INV-2024-0128</div><strong>$815.00</strong><span class="tag paid">Paid</span></div>
        </article>

        <article class="card">
          <div class="panel-title"><h3>Low Stock Alerts</h3><a href="#" style="color:#e06088;text-decoration:none;">View All</a></div>
          <div class="list-row"><div>Vitamin C Serum</div><span>Stock: 5</span><span class="tag low">Low</span></div>
          <div class="list-row"><div>Moisturizer 50ml</div><span>Stock: 8</span><span class="tag low">Low</span></div>
          <div class="list-row"><div>Lipstick Matte - 01</div><span>Stock: 3</span><span class="tag low">Low</span></div>
          <div class="list-row"><div>Hair Shampoo 250ml</div><span>Stock: 6</span><span class="tag low">Low</span></div>
          <div class="list-row" style="border-bottom:0;"><div>Face Wash 100ml</div><span>Stock: 4</span><span class="tag low">Low</span></div>
        </article>
      </section>

      <section class="bottom">
        <article class="card">
          <div class="panel-title"><h3>Top Selling Products</h3><a href="#" style="color:#e06088;text-decoration:none;">View All</a></div>
          <table>
            <thead><tr><th>#</th><th>Product</th><th>Sold</th><th>Revenue</th></tr></thead>
            <tbody>
              <tr><td>1</td><td>Vitamin C Serum</td><td>120</td><td>$3,600.00</td></tr>
              <tr><td>2</td><td>Glow Face Cream</td><td>98</td><td>$2,940.00</td></tr>
              <tr><td>3</td><td>Lipstick Matte - 01</td><td>85</td><td>$2,550.00</td></tr>
            </tbody>
          </table>
        </article>

        <article class="card">
          <div class="panel-title"><h3>Recent Customers</h3><a href="#" style="color:#e06088;text-decoration:none;">View All</a></div>
          <table>
            <thead><tr><th>#</th><th>Customer</th><th>Email</th><th>Total Orders</th></tr></thead>
            <tbody>
              <tr><td>1</td><td>Sarah Johnson</td><td>sarah.j@example.com</td><td>8</td></tr>
              <tr><td>2</td><td>Emily Davis</td><td>emily.d@example.com</td><td>5</td></tr>
              <tr><td>3</td><td>Jessica Brown</td><td>jessica.b@example.com</td><td>4</td></tr>
            </tbody>
          </table>
        </article>

        <article class="card cta">
          <p>Create beautiful invoices in seconds.</p>
          <div><button class="btn"><i class="fa-solid fa-plus"></i> New Invoice</button></div>
        </article>
      </section>
    </main>
  </div>
</body>
</html>
