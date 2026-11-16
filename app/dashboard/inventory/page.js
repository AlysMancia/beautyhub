'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useServerList } from '../../lib/useServerList';
import Pager from '../../components/Pager';

const REASONS = {
  opening: 'Opening stock',
  adjustment: 'Adjustment',
  import: 'Excel import',
  invoice: 'Sold',
  invoice_cancelled: 'Invoice cancelled',
};

function AdjustPanel({ product, onDone, onCancel }) {
  const [mode, setMode] = useState('add');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [level, setLevel] = useState(String(product.reorder_level));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    api('stock_history', { product_id: product.id }).then((d) => d.success && setHistory(d.movements));
  }, [product.id]);

  const preview =
    qty === '' || !/^\d+$/.test(qty)
      ? null
      : mode === 'add' ? product.stock_qty + Number(qty) : mode === 'remove' ? product.stock_qty - Number(qty) : Number(qty);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (qty === '' && level === String(product.reorder_level)) return onCancel();
    setBusy(true);
    const result =
      qty === ''
        ? await api('set_reorder_level', { product_id: product.id, reorder_level: level })
        : await api('adjust_stock', { product_id: product.id, mode, qty, note, reorder_level: level });
    setBusy(false);
    if (!result.success) return setError(result.message || 'Could not save.');
    onDone();
  };

  return (
    <tr className="adjust-row">
      <td colSpan={8}>
        <form className="adjust-form" onSubmit={save}>
          <select className="dash-select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Change type">
            <option value="add">Add stock (delivery)</option>
            <option value="remove">Remove (damaged, used, lost)</option>
            <option value="set">Set exact count</option>
          </select>
          <input className="dash-input" style={{ width: 100 }} inputMode="numeric" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} autoFocus />
          <input className="dash-input" style={{ flex: 1, minWidth: 160 }} placeholder="Note (optional), e.g. Delivery from supplier" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} />
          <label className="inline-label">
            Alert at
            <input className="dash-input" style={{ width: 70 }} inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button className="dash-btn small" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="dash-btn small ghost" type="button" onClick={onCancel}>Close</button>
          {preview !== null && <span className="muted">New stock: <strong>{preview}</strong></span>}
        </form>
        {error && <p className="dash-error">{error}</p>}
        <div className="history">
          <strong>History</strong>
          {history === null ? (
            <p className="muted">Loading…</p>
          ) : history.length === 0 ? (
            <p className="muted">No stock changes yet.</p>
          ) : (
            <table className="dash-table compact">
              <tbody>
                {history.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>{REASONS[m.reason] ?? m.reason}</td>
                    <td className={`num ${m.qty_change > 0 ? 'plus' : 'minus'}`}>{m.qty_change > 0 ? `+${m.qty_change}` : m.qty_change}</td>
                    <td className="num">→ {m.stock_after}</td>
                    <td>
                      {m.invoice_id ? <Link href={`/dashboard/invoices/${m.invoice_id}`}>{m.invoice_no}</Link> : m.note}
                    </td>
                    <td className="muted">{m.by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

function InventoryInner() {
  const params = useSearchParams();
  const focusId = Number(params.get('product')) || '';
  const list = useServerList('list_inventory', { q: '', filter: '', product: focusId }, { perPage: 50 });
  const { data, filters, setFilter } = list;
  const [open, setOpen] = useState(focusId || null);

  // Opened from a product (?product=12): show just that one, with its adjust panel.
  useEffect(() => {
    if (focusId) setOpen(focusId);
  }, [focusId]);

  const totals = data?.totals;

  return (
    <>
      <header className="dash-top compact">
        <h1>Inventory</h1>
        <p className="muted head-note">Stock goes down when an invoice is confirmed and back up when it is cancelled.</p>
      </header>

      {list.error && <p className="dash-error">{list.error}</p>}

      {totals && (
        <div className="kpi-row">
          <article className="kpi"><span>Units in stock</span><strong>{totals.units.toLocaleString()}</strong></article>
          <article className="kpi"><span>Stock value (at cost)</span><strong>{money(totals.value)}</strong></article>
          <article className="kpi warn"><span>Low stock</span><strong>{totals.low}</strong></article>
          <article className="kpi bad"><span>Out of stock</span><strong>{totals.out}</strong></article>
        </div>
      )}

      <article className="card list-card">
        <div className="toolbar">
          <input
            className="dash-input"
            placeholder="Search product, SKU, brand…"
            value={filters.q}
            onChange={(e) => {
              setFilter('q', e.target.value);
              if (filters.product) setFilter('product', '');
            }}
          />
          <div className="seg">
            {[['', 'All'], ['in', 'In stock'], ['low', 'Low'], ['out', 'Out']].map(([v, l]) => (
              <button key={v} type="button" className={filters.filter === v ? 'on' : ''} onClick={() => setFilter('filter', v)}>{l}</button>
            ))}
          </div>
          {filters.product && (
            <button type="button" className="dash-btn small ghost" onClick={() => setFilter('product', '')}>Show all products</button>
          )}
          <Pager list={list} label="products" sizes={[50, 100, 200]} />
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.products.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>No products here.</p>
        ) : (
          <div className="table-scroll">
            <table className="dash-table dense">
              <thead>
                <tr>
                  <th />
                  <th>Product</th>
                  <th>Category</th>
                  <th className="num">Stock</th>
                  <th className="num">Alert at</th>
                  <th className="num">Cost</th>
                  <th className="num">Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => [
                  <tr key={p.id} className={p.is_active ? '' : 'inactive'}>
                    <td className="thumb-cell">
                      {p.cover ? <img src={p.cover} alt="" className="thumb" loading="lazy" /> : <span className="thumb empty"><i className="fa-regular fa-image" /></span>}
                    </td>
                    <td>
                      {p.name}
                      <small>{p.brand}{p.size && ` · ${p.size}`}{p.sku && ` · ${p.sku}`}</small>
                    </td>
                    <td>{p.category || <span className="muted">—</span>}</td>
                    <td className={`num ${p.stock_qty <= 0 ? 'out' : p.stock_qty <= p.reorder_level ? 'low-stock' : ''}`}>{p.stock_qty}</td>
                    <td className="num muted">{p.reorder_level}</td>
                    <td className="num">{money(p.unit_cost) || <span className="muted">—</span>}</td>
                    <td className="num">{p.stock_qty > 0 && p.unit_cost ? money(p.stock_qty * Number(p.unit_cost)) : ''}</td>
                    <td className="row-actions">
                      <button type="button" className="dash-btn small ghost" onClick={() => setOpen(open === p.id ? null : p.id)}>
                        {open === p.id ? 'Close' : 'Adjust'}
                      </button>
                    </td>
                  </tr>,
                  open === p.id && (
                    <AdjustPanel
                      key={`adj-${p.id}`}
                      product={p}
                      onCancel={() => setOpen(null)}
                      onDone={async () => {
                        await list.reload();
                        setOpen(null);
                      }}
                    />
                  ),
                ])}
              </tbody>
            </table>
          </div>
        )}
        <Pager list={list} label="products" sizes={[]} className="bottom" />
      </article>
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <InventoryInner />
    </Suspense>
  );
}
