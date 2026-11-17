'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import SearchSelect from './SearchSelect';

let nextKey = 1;
const row = (r = {}) => ({ key: nextKey++, role_id: String(r.role_id ?? ''), min_qty: r.min_qty ? String(r.min_qty) : '', price: r.price != null ? Number(r.price).toFixed(2) : '' });

/**
 * "Buy more, pay less" steps for one product: per tier, from N pieces the
 * price per piece is X. Any number of steps. Saved on its own (not with the
 * product form). The quantity counted is the product's total on the order.
 */
export default function QtyPricesEditor({ productId, roles, initial, prices }) {
  const srp = roles.find((r) => r.is_srp) ?? roles.at(-1);
  const [rows, setRows] = useState(() => (initial?.length ? initial.map(row) : []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const set = (key, k) => (e) => {
    setMsg('');
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: k === 'min_qty' ? e.target.value.replace(/\D/g, '') : e.target.value } : r)));
  };
  const add = () => {
    setMsg('');
    // New row: same tier as the last one, else the SRP tier.
    const last = rows.at(-1);
    setRows((rs) => [...rs, row({ role_id: last?.role_id || srp?.id })]);
  };
  const remove = (key) => {
    setMsg('');
    setRows((rs) => rs.filter((r) => r.key !== key));
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setMsg('');
    const result = await api('save_qty_prices', {
      product_id: productId,
      steps: JSON.stringify(rows.map(({ role_id, min_qty, price }) => ({ role_id, min_qty, price }))),
    });
    setBusy(false);
    if (!result.success) return setError(result.message);
    setRows(result.qty_prices.map(row));
    setMsg('Saved.');
  };

  // Shown in tier order, then by quantity.
  const order = (r) => [roles.findIndex((x) => String(x.id) === r.role_id), Number(r.min_qty) || 0];
  const sorted = [...rows].sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1]);

  return (
    <div className="qty-prices">
      {sorted.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          None yet. Example: {srp?.name ?? 'Retailer'} pays {money(prices?.[srp?.id] || 10)} each, but from 10 pieces {money((Number(prices?.[srp?.id]) || 10) * 0.9)} each.
        </p>
      ) : (
        <table className="dash-table dense qty-table">
          <thead>
            <tr>
              <th>Tier</th>
              <th className="num">From qty</th>
              <th className="num">Price each</th>
              <th className="num">Normal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const normal = prices?.[r.role_id];
              const higher = normal && r.price && Number(r.price) >= Number(normal);
              return (
                <tr key={r.key}>
                  <td>
                    <SearchSelect className="dash-select" value={r.role_id} onChange={set(r.key, 'role_id')} aria-label="Tier">
                      <option value="">Choose…</option>
                      {roles.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_srp ? ' (SRP)' : ''}</option>)}
                    </SearchSelect>
                  </td>
                  <td className="num">
                    <input className="dash-input qty" inputMode="numeric" value={r.min_qty} onChange={set(r.key, 'min_qty')} placeholder="10" aria-label="From quantity" />
                    <span className="muted"> +</span>
                  </td>
                  <td className="num">
                    <input className={`dash-input price${higher ? ' warn' : ''}`} inputMode="decimal" value={r.price} onChange={set(r.key, 'price')} placeholder="0.00" aria-label="Price each" title={higher ? 'Not lower than the normal price, so it has no effect' : ''} />
                  </td>
                  <td className="num muted">{normal ? money(normal) : '—'}</td>
                  <td className="num">
                    <button type="button" className="icon-btn" title="Remove" onClick={() => remove(r.key)}><i className="fa-regular fa-trash-can" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="qty-actions">
        <button type="button" className="dash-btn small ghost" onClick={add}>+ Add quantity price</button>
        <button type="button" className="dash-btn small" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save quantity prices'}</button>
        {msg && <span className="form-ok" style={{ margin: 0 }}>{msg}</span>}
      </div>
      {error && <p className="dash-error">{error}</p>}
      <p className="muted small-note">
        Counts the product&apos;s total on an order (all shades together). Tiers without their own price use the next tier&apos;s
        quantity prices, like normal prices.
      </p>
    </div>
  );
}
