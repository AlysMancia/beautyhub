export default function DashboardPage() {
  return (
    <main style={{ padding: '3rem' }}>
      <section style={{ maxWidth: '960px', margin: '0 auto' }}>
        <h1>Dashboard</h1>
        <p>This is the new Next.js dashboard route.</p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', padding: '1rem', background: '#fff', borderRadius: '16px', boxShadow: 'rgba(0,0,0,0.12) 0 4px 12px' }}>
            <h2>Products</h2>
            <p>View products and inventory details here.</p>
          </div>
          <div style={{ flex: '1 1 220px', padding: '1rem', background: '#fff', borderRadius: '16px', boxShadow: 'rgba(0,0,0,0.12) 0 4px 12px' }}>
            <h2>Invoice List</h2>
            <p>Manage invoice history and orders.</p>
          </div>
          <div style={{ flex: '1 1 220px', padding: '1rem', background: '#fff', borderRadius: '16px', boxShadow: 'rgba(0,0,0,0.12) 0 4px 12px' }}>
            <h2>Create Invoice</h2>
            <p>Start new invoices with your customers.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
