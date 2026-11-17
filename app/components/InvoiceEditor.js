'use client';

import SearchSelect from './SearchSelect';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { lineTotal, priceAtQty } from '../lib/invoice';
import { confirmDialog } from './Dialogs';

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
 * Quantity prices: lines whose price you haven't typed yourself follow the
 * product's "buy more, pay less" steps for the product's total quantity
 * (all variants together). A variant with its own special price keeps it.
 */
function applySteps(lines) {
  const totals = {};
  lines.forEach((l) => { totals[l.product_id] = (totals[l.product_id] ?? 0) + Number(l.qty || 0); });
  return lines.map((l) => {
    if (l.manual || l.base_price == null || !l.qty_prices?.length) return l;
    const follows = !l.variant_id || Number(l.base_price) === Number(l.product_price);
    const price = follows ? priceAtQty(l.base_price, l.qty_prices, totals[l.product_id]) : Number(l.base_price);
    return price == null ? l : { ...l, unit_price: price.toFixed(2) };
  });
}

/**
 * Invoice form. `invoice` = existing pending order or confirmed invoice to edit (or null for a new invoice).
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
      qty: String(it.qty), unit_price: Number(it.unit_price).toFixed(2), cost: it.unit_cost, stock_qty: null, image: it.image,
      held: invoice.status === 'confirmed' ? it.qty : 0,
      variant_id: it.variant_id ? String(it.variant_id) : '', variant_name: it.variant_name, variants: [], variant_label: '',
      manual: true, base_price: null, product_price: null, qty_prices: [],
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
      setLines((ls) => ls.map((l) => {
        const p = byId[l.product_id];
        if (!p) return l;
        const v = p.variants?.find((x) => String(x.id) === String(l.variant_id));
        const next = {
          ...l, stock_qty: p.stock_qty, variants: p.variants ?? [], variant_label: p.variant_label ?? '',
          base_price: v ? v.price : p.price, product_price: p.price, qty_prices: p.qty_prices ?? [], manual: false,
        };
        // Keep a price you typed before: only lines that match the suggestion keep following it.
        const suggested = applySteps(ls.map((x) => (x.key === l.key ? next : x))).find((x) => x.key === l.key);
        return Number(suggested.unit_price) === Number(l.unit_price) ? next : { ...next, manual: true };
      }));
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
        if (!p) return l;
        const v = p.variants?.find((x) => String(x.id) === String(l.variant_id));
        const price = v ? v.price : p.price;
        return {
          ...l, unit_price: price == null ? '' : Number(price).toFixed(2), cost: v ? v.cost : p.cost, stock_qty: p.stock_qty, variants: p.variants ?? l.variants,
          base_price: price, product_price: p.price, qty_prices: p.qty_prices ?? [], manual: false,
        };
      })
    );
    setLines((ls) => applySteps(ls));
  };

  const chooseCustomer = (c) => {
    setCustomer(c);
    setContact(c?.phone || c?.email || '');
    if (c?.role_id) {
      setRoleId(String(c.role_id));
      repriceAll(c.role_id);
    }
  };

  const chooseRole = async (value) => {
    setRoleId(value);
    if (lines.length && (await confirmDialog('Prices you typed yourself are replaced too.', { title: 'Update all line prices to this tier?', confirmLabel: 'Update prices', cancelLabel: 'Keep prices' }))) repriceAll(value);
  };

  const addProduct = (p) => {
    setError('');
    if (!p.has_variants && p.stock_qty <= 0) return setError(`${p.name} is out of stock. Restock it in Inventory first.`);
    const already = !p.has_variants && lines.find((l) => l.product_id === p.id);
    if (already && Number(already.qty || 0) + 1 > p.stock_qty + (already.held || 0)) {
      return setError(`Only ${p.stock_qty + (already.held || 0)} of ${p.name} in stock.`);
    }
    setLines((ls) => applySteps((() => {
      const existing = !p.has_variants && ls.find((l) => l.product_id === p.id);
      if (existing) return ls.map((l) => (l === existing ? { ...l, qty: String(Number(l.qty || 0) + 1) } : l));
      const only = p.variants?.length === 1 ? p.variants[0] : null;
      return [
        ...ls,
        {
          key: `n${Date.now()}`, product_id: p.id, name: p.name, brand: p.brand, uom: p.uom, qty: '1',
          unit_price: p.price === null ? '' : Number(p.price).toFixed(2), cost: p.cost, stock_qty: p.stock_qty, image: p.cover,
          variants: p.variants ?? [], variant_label: p.variant_label ?? '', variant_id: only ? String(only.id) : '', variant_name: '',
          base_price: only?.price ?? p.price, product_price: p.price, qty_prices: p.qty_prices ?? [], manual: false,
          ...(only && only.price != null ? { unit_price: Number(only.price).toFixed(2), cost: only.cost } : {}),
        },
      ];
    })()));
  };

  const setLine = (key, patch) => setLines((ls) => applySteps(ls.map((l) => (l.key === key ? { ...l, ...patch } : l))));
  const removeLine = (key) => setLines((ls) => applySteps(ls.filter((l) => l.key !== key)));

  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const total = subtotal - (Number(discount) || 0);
  const costRole = roles?.find((r) => r.is_cost);
  const cost = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.cost ?? 0), 0);
  const hasCost = lines.some((l) => l.cost !== null && l.cost !== undefined);

  const submit = async (approve) => {
    setError('');
    setShortages(null);
    if (!lines.length) return setError('Add at least one product.');
    const missing = lines.find((l) => l.variants?.length && !l.variant_id);
    if (missing) return setError(`${missing.name}: choose a ${(missing.variant_label || 'variant').toLowerCase()}.`);
    setBusy(approve ? 'approve' : 'save');
    const result = await api('save_invoice', {
      id: invoice?.id ?? '',
      customer_user_id: customer?.user_id ?? '',
      customer_name: customer ? '' : walkInName,
      customer_contact: contact,
      role_id: roleId,
      discount,
      notes,
      items: JSON.stringify(lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id || '', qty: l.qty, unit_price: l.unit_price }))),
      approve: approve ? '1' : '',
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
                      <small>{[c.phone, c.email, c.role_name].filter(Boolean).join(' · ')}</small>
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
            <SearchSelect className="dash-select full" value={roleId} onChange={(e) => chooseRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.tier_level}. {r.name}{r.is_default ? ' (default)' : ''}</option>
              ))}
            </SearchSelect>
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
                <small>{p.brand}{!p.is_active && ' · hidden'}{p.has_variants && ` · ${p.variants.length} ${(p.variant_label || 'variant').toLowerCase()}s`} · {p.price === null ? 'no price' : money(p.price)}</small>
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
                  // For a variant product, stock is the chosen variant's.
                  const variant = l.variants?.find((v) => String(v.id) === String(l.variant_id));
                  const stock = l.variants?.length ? variant?.stock_qty : l.stock_qty;
                  const known = stock !== null && stock !== undefined;
                  const available = known ? stock + (l.held || 0) : null;
                  const short = known && Number(l.qty) > available;
                  const image = variant?.image || l.image;
                  return (
                    <tr key={l.key}>
                      <td>
                        <span className="line-item">
                        {image && <img src={image} alt="" className="line-img" />}
                        <span>
                        {l.name}
                        {l.variants?.length > 0 ? (
                          <SearchSelect
                            className={`dash-select variant-select${l.variant_id ? '' : ' missing'}`}
                            value={l.variant_id}
                            onChange={(e) => {
                              // A variant can have its own price: use it.
                              const v = l.variants.find((x) => String(x.id) === e.target.value);
                              setLine(l.key, { variant_id: e.target.value, ...(v && v.price != null ? { unit_price: Number(v.price).toFixed(2), cost: v.cost, base_price: v.price } : {}) });
                            }}
                            placeholder={`Choose ${(l.variant_label || 'variant').toLowerCase()}…`}
                            aria-label={`${l.variant_label || 'Variant'} of ${l.name}`}
                          >
                            {l.variants.map((v) => (
                              <option key={v.id} value={v.id} disabled={v.stock_qty <= 0 && String(v.id) !== String(l.variant_id)}>{v.name} — {v.stock_qty <= 0 ? 'out of stock' : `${v.stock_qty} in stock`}{v.price != null ? ` · ${money(v.price)}` : ''}{v.is_active ? '' : ' (not on sale)'}</option>
                            ))}
                          </SearchSelect>
                        ) : (
                          l.variant_name && <small>{l.variant_name}</small>
                        )}
                        <small>
                          {l.brand}
                          {!l.product_id ? ' · product deleted' : known && <span className={short ? 'warn' : ''}> · {short ? `only ${available} in stock` : `${available} in stock`}</span>}
                        </small>
                        </span>
                        </span>
                      </td>
                      <td className="num">
                        <input className="dash-input qty" inputMode="numeric" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/\D/g, '') })} aria-label={`Quantity of ${l.name}`} />
                      </td>
                      <td className="num">
                        <span className="money-input">
                          <span>₱</span>
                          <input className="dash-input price" inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value, manual: true })} aria-label={`Price of ${l.name}`} />
                        </span>
                        {!l.manual && l.qty_prices?.length > 0 && l.base_price != null && Number(l.unit_price) < Number(l.base_price) && (
                          <small className="qty-hint" title="Quantity price">qty price · was {money(l.base_price)}</small>
                        )}
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
              <li key={s.name}>{s.name}: {s.stock <= 0 ? 'out of stock' : `only ${s.stock} left`} (you entered {s.qty})</li>
            ))}
          </ul>
          <p className="muted" style={{ margin: '4px 0 10px' }}>Lower the quantity, or add stock in Inventory first.</p>
          <button type="button" className="dash-btn small ghost" onClick={() => setShortages(null)}>OK</button>
        </div>
      )}

      {error && <p className="dash-error">{error}</p>}

      <div className="form-actions">
        {isEdit && invoice.status === 'confirmed' ? (
          <>
            <button type="button" className="dash-btn" onClick={() => submit(false)} disabled={!!busy}>
              <i className="fa-solid fa-check" /> {busy ? 'Saving…' : 'Save changes'}
            </button>
            {extraActions}
          </>
        ) : isEdit ? (
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
          {isEdit && invoice.status === 'confirmed'
            ? 'Stock is updated for what changed. If the total goes up, a paid invoice becomes partly paid.'
            : isEdit
            ? 'Approving confirms the order and takes the items out of your inventory.'
            : 'Creating the invoice confirms it right away and takes the items out of your inventory.'}
        </span>
      </div>
    </div>
  );
}
