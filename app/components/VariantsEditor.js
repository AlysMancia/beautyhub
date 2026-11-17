'use client';

import { useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '../lib/api';

const LABELS = ['Shade', 'Color', 'Size', 'Scent', 'Flavor', 'Type'];

/** Small popover to pick one of the product's photos for a variant. */
function PhotoPick({ media, value, onChange, productId, onUploaded }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const file = useRef(null);

  // Upload a new photo for this variant: it is added to the product's photos and picked.
  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    const result = await uploadFile('upload_product_media', { product_id: productId }, f);
    setBusy(false);
    if (!result.success) return window.alert(result.message);
    onUploaded(result.media);
    const newest = result.media.filter((m) => m.kind === 'image').reduce((a, b) => (b.id > a.id ? b : a));
    onChange(newest.id);
    setOpen(false);
  };
  const photos = media.filter((m) => m.kind === 'image');
  const current = photos.find((m) => m.id === value);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <span className="photo-pick" ref={box}>
      <button type="button" className="pp-btn" onClick={() => setOpen((o) => !o)} title="Choose or upload a photo for this variant">
        {busy ? <i className="fa-solid fa-spinner fa-spin" /> : current ? <img src={current.thumb_path || current.path} alt="" /> : <i className="fa-regular fa-image" />}
      </button>
      {open && (
        <span className="pp-pop">
          <button type="button" className="pp-opt upload" onClick={() => file.current?.click()} title="Upload a new photo">
            <i className="fa-solid fa-upload" />
          </button>
          {photos.length > 0 && (
            <>
              <button type="button" className={`pp-opt none${!value ? ' on' : ''}`} onClick={() => { onChange(null); setOpen(false); }}>None</button>
              {photos.map((m) => (
                <button key={m.id} type="button" className={`pp-opt${m.id === value ? ' on' : ''}`} onClick={() => { onChange(m.id); setOpen(false); }}>
                  <img src={m.thumb_path || m.path} alt="" />
                </button>
              ))}
            </>
          )}
        </span>
      )}
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
    </span>
  );
}

let tempId = 0;
const blankRow = () => ({ key: `new${++tempId}`, id: null, name: '', sku: '', stock: '0', media_id: null, is_active: true, prices: {} });
const toRow = (v) => ({
  key: `v${v.id}`, id: v.id, name: v.name, sku: v.sku ?? '', stock: String(v.stock_qty), media_id: v.media_id, is_active: v.is_active,
  prices: Object.fromEntries(Object.entries(v.prices ?? {}).map(([k, p]) => [k, Number(p).toFixed(2)])),
});

/**
 * "This product has variants" tickbox + the list of variants (shades, colors, sizes…).
 * Each variant has its own stock, SKU and photo; all share the product's prices.
 */
export default function VariantsEditor({ productId, product, media, onSaved, roles = [], productPrices = {}, onMediaChange }) {
  const [pricesOpen, setPricesOpen] = useState(null); // row key whose prices are shown
  const [enabled, setEnabled] = useState(!!product.has_variants);
  const [label, setLabel] = useState(product.variant_label || 'Shade');
  const [rows, setRows] = useState(() =>
    product.variants?.length
      ? product.variants.map(toRow)
      : [blankRow(), blankRow()]
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const edit = (key, patch) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const toggle = async (on) => {
    if (!on && product.has_variants) {
      if (!window.confirm(`Turn off variants? The ${rows.length} ${label.toLowerCase()}s are removed and their total stock stays on the product.`)) return;
      setBusy(true);
      const result = await api('save_variants', { product_id: productId, has_variants: '0' });
      setBusy(false);
      if (!result.success) return setMessage({ ok: false, text: result.message });
      setEnabled(false);
      setRows([blankRow(), blankRow()]);
      setDirty(false);
      setMessage({ ok: true, text: 'Variants turned off.' });
      onSaved();
      return;
    }
    setEnabled(on);
    setDirty(on);
  };

  const save = async () => {
    const list = rows.filter((r) => r.name.trim() || r.id);
    if (!list.length) return setMessage({ ok: false, text: `Add at least one ${label.toLowerCase()}.` });
    if (!product.has_variants && product.stock_qty && !window.confirm(`This product has ${product.stock_qty} in stock. That stock is replaced by the stock you enter per ${label.toLowerCase()}. Continue?`)) return;
    setBusy(true);
    setMessage(null);
    const result = await api('save_variants', {
      product_id: productId,
      has_variants: '1',
      variant_label: label,
      variants: JSON.stringify(list.map((r) => ({ id: r.id, name: r.name, sku: r.sku, stock: r.stock || '0', media_id: r.media_id, is_active: r.is_active, prices: r.prices }))),
    });
    setBusy(false);
    if (!result.success) return setMessage({ ok: false, text: result.message });
    setRows(result.variants.map(toRow));
    setDirty(false);
    setMessage({ ok: true, text: 'Variants saved.' });
    onSaved();
  };

  const total = rows.reduce((s, r) => s + (Number(r.stock) || 0), 0);

  return (
    <div className="variants">
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} disabled={busy} />
        <strong>This product has variants</strong>
        <span className="muted" style={{ fontWeight: 400 }}>e.g. a lipstick in several shades</span>
      </label>

      {enabled && (
        <>
          <div className="variant-label">
            <span>Variants are called</span>
            <input className="dash-input" value={label} maxLength={40} onChange={(e) => { setLabel(e.target.value); setDirty(true); }} list="variant-labels" />
            <datalist id="variant-labels">{LABELS.map((l) => <option key={l} value={l} />)}</datalist>
          </div>
          <table className="dash-table dense variant-table">
            <thead>
              <tr><th>Photo</th><th>{label || 'Variant'} name *</th><th>SKU</th><th className="num">Stock</th><th>Price</th><th>On sale</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => [
                <tr key={r.key} className={r.is_active ? '' : 'inactive'}>
                  <td><PhotoPick media={media} value={r.media_id} productId={productId} onUploaded={onMediaChange} onChange={(id) => edit(r.key, { media_id: id })} /></td>
                  <td><input className="dash-input" value={r.name} maxLength={120} placeholder={`e.g. ${label === 'Size' ? '50ml' : 'Ruby Red'}`} onChange={(e) => edit(r.key, { name: e.target.value })} /></td>
                  <td><input className="dash-input" value={r.sku} maxLength={100} placeholder="Optional" onChange={(e) => edit(r.key, { sku: e.target.value })} /></td>
                  <td className="num"><input className="dash-input stock-in" inputMode="numeric" value={r.stock} onChange={(e) => edit(r.key, { stock: e.target.value.replace(/[^\d-]/g, '') })} /></td>
                  <td>
                    {(() => {
                      const own = Object.values(r.prices ?? {}).filter((v) => String(v).trim() !== '').length;
                      return (
                        <button
                          type="button"
                          className={`dash-btn small ${own ? '' : 'ghost'}`}
                          onClick={() => setPricesOpen(pricesOpen === r.key ? null : r.key)}
                          title="Give this variant its own prices"
                        >
                          {own ? `Own price (${own})` : 'Same as product'} <i className={`fa-solid fa-chevron-${pricesOpen === r.key ? 'up' : 'down'}`} />
                        </button>
                      );
                    })()}
                  </td>
                  <td>
                    <label className="check inline-check" title="Untick to stop selling this one">
                      <input type="checkbox" checked={r.is_active} onChange={(e) => edit(r.key, { is_active: e.target.checked })} /> on sale
                    </label>
                  </td>
                  <td>
                    <button type="button" className="icon-btn" title="Remove" onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); setDirty(true); }}>
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </td>
                </tr>,
                pricesOpen === r.key && (
                  <tr key={`${r.key}-prices`} className="variant-price-row">
                    <td />
                    <td colSpan={6}>
                      <div className="variant-prices">
                        {roles.map((role) => (
                          <label key={role.id}>
                            <span>{role.tier_level}. {role.name}{role.is_cost ? ' (my cost)' : ''}</span>
                            <span className="money-input">
                              <span>₱</span>
                              <input
                                className="dash-input"
                                inputMode="decimal"
                                value={r.prices?.[role.id] ?? ''}
                                placeholder={productPrices[role.id] ? Number(productPrices[role.id]).toFixed(2) : '—'}
                                onChange={(e) => edit(r.key, { prices: { ...r.prices, [role.id]: e.target.value } })}
                              />
                            </span>
                          </label>
                        ))}
                      </div>
                      <small className="muted">Leave a tier empty to use the product&apos;s price (shown in grey). Remember to “Save variants”.</small>
                    </td>
                  </tr>
                ),
              ])}
            </tbody>
          </table>
          <div className="variant-actions">
            <button type="button" className="dash-btn small ghost" onClick={() => { setRows((rs) => [...rs, blankRow()]); setDirty(true); }}>
              + Add {label.toLowerCase() || 'variant'}
            </button>
            <span className="muted">Total stock: <strong>{total}</strong> · each {label.toLowerCase()} uses the product prices unless you give it its own</span>
            <button type="button" className="dash-btn small" onClick={save} disabled={busy || !dirty} style={{ marginLeft: 'auto' }}>
              {busy ? 'Saving…' : 'Save variants'}
            </button>
          </div>
        </>
      )}
      {message && <p className={message.ok ? 'form-ok' : 'dash-error'} style={{ marginLeft: 0 }}>{message.text}</p>}
    </div>
  );
}
