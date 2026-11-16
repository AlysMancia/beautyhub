'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { lineTotal } from '../lib/invoice';

/**
 * Type-ahead that asks the server (no big lists in the browser).
 * `search(q)` resolves to items; `render(item)` draws one result.
 */
function ServerSearch({ placeholder, search, render, onPick, minLength = 1 }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (q.trim().length < minLength) {
      setItems([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const result = await search(q.trim());
      if (!cancelled) {
        setItems(result);
        setActive(0);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (item) => {
    onPick(item);
    setQ('');
    setItems([]);
  };

  return (
    <div className="product-search" ref={box}>
      <input
        className="dash-input"
        placeholder={placeholder}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); if (items[active]) pick(items[active]); }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && items.length > 0 && (
        <ul className="search-results" role="listbox">
          {items.map((item, i) => (
            <li
              key={item.id ?? item.user_id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(item); }}
              onMouseEnter={() => setActive(i)}
            >
              {render(item)}
            </li>
          ))}
        </ul>
      )}
      {open && q.trim().length >= minLength && !loading && items.length === 0 && (
        <div className="search-results empty">No matches for “{q}”.</div>
      )}
    </div>
  );
}

const stockClass = (p) => (p.stock_qty <= 0 ? 'out' : p.stock_qty <= 5 ? 'low' : '');

/**
 * Invoice form. `invoice` = existing pending order (or null for a new invoice).
 * Prices come from the server for the chosen tier (tier_price fallback).
 */
export default function InvoiceEditor({ invoice = null, onSaved, extraActions }) {
  const isEdit = !!invoice;
  const [roles, setRoles] = useState(null);
  const [customer, setCustomer] = useState(
    invoice?.customer_user_id ? { user_id: invoice.customer_user_id, name: invoice.customer_name } : null
  );
  const [walkInName, setWalkInName] = useState(invoice && !invoice.customer_user_id ? invoice.customer_name : '');
  const [contact, setContact] = useState(invoice?.customer_contact ?? '');
  const [roleId, setRoleId] = useState(invoice?.role_id ? String(invoice.role_id) : '');
  const [lines, setLines] = useState(
    invoice?.items.map((it) => ({
      key: it.id, product_id: it.product_id, name: it.product_name, brand: it.brand_name, uom: it.uom,
      qty: String(it.qty), unit_price: Number(it.unit_price).toFixed(2), cost: it.unit_cost, stock_qty: null,
    })) ?? []
  );
  const [discount, setDiscount] = useState(invoice && Number(invoice.discount) ? Number(invoice.discount).toFixed(2) : '');
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [error, setError] = useState('');
  const [shortages, setShortages] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api('list_catalog').then((d) => {
      if (!d.success) return setError(d.message);
      setRoles(d.roles);
      if (!invoice) setRoleId((r) => r || String(d.roles.find((x) => x.is_default)?.id ?? ''));
    });
  }, [invoice]);

  // Current stock for the lines of an existing order.
  useEffect(() => {
    if (!isEdit || !roleId) return;
    const ids = lines.map((l) => l.product_id).filter(Boolean);
    if (!ids.length) return;
    api('quote_prices', { role_id: roleId, ids: JSON.stringify(ids) }).then((d) => {
      if (!d.success) return;
      const byId = Object.fromEntries(d.products.map((p) => [p.id, p]));
      setLines((ls) => ls.map((l) => (byId[l.product_id] ? { ...l, stock_qty: byId[l.product_id].stock_qty } : l)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  /** Re-price every line for a tier (the server decides, incl. fallback & promos). */
  const repriceAll = async (newRoleId) => {
    const ids = lines.map((l) => l.product_id).filter(Boolean);
    if (!ids.length) return;
    const d = await api('quote_prices', { role_id: newRoleId, ids: JSON.stringify(ids) });
    if (!d.success) return;
    const byId = Object.fromEntries(d.products.map((p) => [p.id, p]));
    setLines((ls) =>
      ls.map((l) => {
        const p = byId[l.product_id];
        return p ? { ...l, unit_price: p.price === null ? '' : Number(p.price).toFixed(2), cost: p.cost, stock_qty: p.stock_qty } : l;
      })
    );
  };

  const chooseCustomer = (c) => {
    setCustomer(c);
    setContact(c?.email ?? '');
    if (c?.role_id) {
      setRoleId(String(c.role_id));
      repriceAll(c.role_id);
    }
  };

  const chooseRole = (value) => {
    setRoleId(value);
    if (lines.length && window.confirm('Update all line prices to this price tier?')) repriceAll(value);
  };

  const addProduct = (p) => {
    setLines((ls) => {
      const existing = ls.find((l) => l.product_id === p.id);
      if (existing) return ls.map((l) => (l === existing ? { ...l, qty: String(Number(l.qty || 0) + 1) } : l));
      return [
        ...ls,
        {
          key: `n${Date.now()}`, product_id: p.id, name: p.name, brand: p.brand, uom: p.uom, qty: '1',
          unit_price: p.price === null ? '' : Number(p.price).toFixed(2), cost: p.cost, stock_qty: p.stock_qty,
        },
      ];
    });
  };

  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((ls) => ls.filter((l) => l.key !== key));

  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const total = subtotal - (Number(discount) || 0);
  const costRole = roles?.find((r) => r.is_cost);
  const cost = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.cost ?? 0), 0);
  const hasCost = lines.some((l) => l.cost !== null && l.cost !== undefined);

  const submit = async (approve, allowOversell = false) => {
    setError('');
    setShortages(null);
    if (!lines.length) return setError('Add at least one product.');
    setBusy(approve ? 'approve' : 'save');
    const result = await api('save_invoice', {
      id: invoice?.id ?? '',
      customer_user_id: customer?.user_id ?? '',
      customer_name: customer ? '' : walkInName,
      customer_contact: contact,
      role_id: roleId,
      discount,
      notes,
      items: JSON.stringify(lines.map((l) => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price }))),
      approve: approve ? '1' : '',
      allow_oversell: allowOversell ? '1' : '',
    });
    setBusy('');
    if (result.code === 'insufficient_stock') {
      setShortages({ items: result.shortages, approve });
      return;
    }
    if (!result.success) return setError(result.message || 'Could not save.');
    onSaved(result.invoice);
  };

  if (!roles) return error ? <p className="dash-error">{error}</p> : <p className="muted">Loading…</p>;

  const lockedCustomer = isEdit && invoice.customer_user_id;

  return (
    <div className="invoice-editor">
      <article className="card">
        <div className="form-grid four">
          <label className="span-2">
            Customer
            {lockedCustomer ? (
              <input className="dash-input" value={invoice.customer_name} disabled />
            ) : customer ? (
              <span className="chosen">
                <strong>{customer.name}</strong>
                {customer.role_name && <span className="default-tag">{customer.role_name}</span>}
                <button type="button" className="icon-btn" title="Change customer" onClick={() => chooseCustomer(null)}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </span>
            ) : (
              <span className="customer-pick">
                <ServerSearch
                  placeholder="Search registered customer…"
                  search={async (q) => (await api('invoice_customers', { q })).customers ?? []}
                  render={(c) => (
                    <span>
                      <strong>{c.name}</strong>
                      <small>@{c.username} · {c.email}{c.role_name ? ` · ${c.role_name}` : ''}</small>
                    </span>
                  )}
                  onPick={chooseCustomer}
                />
                <input className="dash-input" value={walkInName} maxLength={160} onChange={(e) => setWalkInName(e.target.value)} placeholder="…or walk-in name" />
              </span>
            )}
          </label>
          <label>
            Contact
            <input className="dash-input" value={contact} maxLength={160} onChange={(e) => setContact(e.target.value)} placeholder="Phone / email (optional)" />
          </label>
          <label>
            Price tier
            <select className="dash-select full" value={roleId} onChange={(e) => chooseRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.tier_level}. {r.name}{r.is_default ? ' (default)' : ''}</option>
              ))}
            </select>
          </label>
        </div>
      </article>

      <article className="card">
        <ServerSearch
          placeholder="Add product: type a name, brand or SKU…"
          search={async (q) => (await api('search_products', { q, role_id: roleId })).products ?? []}
          render={(p) => (
            <>
              {p.cover ? <img src={p.cover} alt="" className="thumb sm" /> : <span className="thumb sm empty"><i className="fa-regular fa-image" /></span>}
              <span className="grow">
                <strong>{p.name}</strong>
                <small>{p.brand}{!p.is_active && ' · hidden'} · {p.price === null ? 'no price' : money(p.price)}</small>
              </span>
              <span className={`stock-pill ${stockClass(p)}`}>{p.stock_qty} in stock</span>
            </>
          )}
          onPick={addProduct}
        />
        {lines.length === 0 ? (
          <p className="muted" style={{ margin: '10px 0 0' }}>No items yet. Search above to add products.</p>
        ) : (
          <div className="table-scroll">
            <table className="dash-table invoice-lines dense">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const known = l.stock_qty !== null && l.stock_qty !== undefined;
                  const short = known && Number(l.qty) > l.stock_qty;
                  return (
                    <tr key={l.key}>
                      <td>
                        {l.name}
                        <small>
                          {l.brand}
                          {!l.product_id ? ' · product deleted' : known && <span className={short ? 'warn' : ''}> · {l.stock_qty} in stock</span>}
                        </small>
                      </td>
                      <td className="num">
                        <input className="dash-input qty" inputMode="numeric" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/\D/g, '') })} aria-label={`Quantity of ${l.name}`} />
                      </td>
                      <td className="num">
                        <span className="money-input">
                          <span>₱</span>
                          <input className="dash-input price" inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} aria-label={`Price of ${l.name}`} />
                        </span>
                      </td>
                      <td className="num">{money(lineTotal(l))}</td>
                      <td>
                        <button type="button" className="icon-btn" title="Remove" onClick={() => removeLine(l.key)}>
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="invoice-bottom">
          <label className="notes">
            Notes
            <textarea className="dash-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. delivery details" />
          </label>
          <div className="totals">
            <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div>
              <span>Discount</span>
              <span className="money-input">
                <span>−₱</span>
                <input className="dash-input price" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
              </span>
            </div>
            <div className="grand"><span>Total</span><span>{money(total)}</span></div>
            {costRole && hasCost && (
              <div className="profit"><span>Profit vs {costRole.name}</span><span>{money(total - cost)}</span></div>
            )}
          </div>
        </div>
      </article>

      {shortages && (
        <div className="card warn-box">
          <strong>Not enough stock:</strong>
          <ul>
            {shortages.items.map((s) => (
              <li key={s.name}>{s.name}: need {s.qty}, have {s.stock}</li>
            ))}
          </ul>
          <p className="muted" style={{ margin: '4px 0 10px' }}>You can still continue; stock will go below zero until you restock.</p>
          <button type="button" className="dash-btn small" onClick={() => submit(shortages.approve, true)}>Continue anyway</button>{' '}
          <button type="button" className="dash-btn small ghost" onClick={() => setShortages(null)}>Go back</button>
        </div>
      )}

      {error && <p className="dash-error">{error}</p>}

      <div className="form-actions">
        {isEdit ? (
          <>
            <button type="button" className="dash-btn" onClick={() => submit(true)} disabled={!!busy}>
              <i className="fa-solid fa-check" /> {busy === 'approve' ? 'Approving…' : 'Approve order'}
            </button>
            <button type="button" className="dash-btn ghost" onClick={() => submit(false)} disabled={!!busy}>
              {busy === 'save' ? 'Saving…' : 'Save changes'}
            </button>
            {extraActions}
          </>
        ) : (
          <button type="button" className="dash-btn" onClick={() => submit(false)} disabled={!!busy}>
            {busy ? 'Saving…' : 'Create invoice'}
          </button>
        )}
        <span className="muted">
          {isEdit
            ? 'Approving confirms the order and takes the items out of your inventory.'
            : 'Creating the invoice confirms it right away and takes the items out of your inventory.'}
        </span>
      </div>
    </div>
  );
}
