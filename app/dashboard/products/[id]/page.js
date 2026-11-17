'use client';

import SearchSelect from '../../../components/SearchSelect';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import MediaManager from '../../../components/MediaManager';
import VariantsEditor from '../../../components/VariantsEditor';
import { api } from '../../../lib/api';
import { margin } from '../../../lib/format';

const EMPTY = {
  name: '', sku: '', brand_id: '', category_id: '', uom_id: '', uom_qty: '', description: '',
  is_active: true, prices: {}, opening_stock: '', reorder_level: '5', stock_qty: 0,
  promo_on: false, promo_price: '', promo_type: 'until_date', promo_until: '',
};

function ProductFormPage() {
  const { id } = useParams();
  const router = useRouter();
  const isNew = id === 'new';
  const [catalog, setCatalog] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [newBrand, setNewBrand] = useState(null); // string while adding a brand inline
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [media, setMedia] = useState([]);
  const searchParams = useSearchParams();
  const justCreated = searchParams.get('created') === '1';

  useEffect(() => {
    api(isNew ? 'list_catalog' : 'get_product', isNew ? {} : { id }).then((data) => {
      if (!data.success) return setError(data.message);
      setCatalog(data);
      if (isNew) {
        const pc = data.uoms.find((u) => u.code === 'pc');
        setForm((f) => ({ ...f, uom_id: pc ? String(pc.id) : '', brand_id: data.brands.length === 1 ? String(data.brands[0].id) : '' }));
        return;
      }
      const p = data.product;
      setMedia(data.media ?? []);
      setForm({
        name: p.name,
        sku: p.sku ?? '',
        brand_id: p.brand_id ? String(p.brand_id) : '',
        category_id: p.category_id ? String(p.category_id) : '',
        uom_id: p.uom_id ? String(p.uom_id) : '',
        uom_qty: p.uom_qty ?? '',
        description: p.description ?? '',
        reorder_level: String(p.reorder_level ?? 5),
        stock_qty: p.stock_qty ?? 0,
        is_active: p.is_active,
        prices: Object.fromEntries(Object.entries(p.prices).map(([k, v]) => [k, Number(v).toFixed(2)])),
        promo_on: p.promo_price !== null,
        promo_price: p.promo_price ?? '',
        promo_type: p.promo_type ?? 'until_date',
        promo_until: p.promo_until ?? '',
      });
    });
  }, [id, isNew]);

  /** After variants change: refresh the product (stock total, variant list). */
  const refreshProduct = async () => {
    const data = await api('get_product', { id });
    if (!data.success) return;
    setCatalog(data);
    setForm((f) => ({ ...f, stock_qty: data.product.stock_qty }));
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setPrice = (roleId) => (e) => setForm((f) => ({ ...f, prices: { ...f.prices, [roleId]: e.target.value } }));

  const addBrand = async () => {
    if (!newBrand?.trim()) return;
    const result = await api('save_brand', { name: newBrand.trim() });
    if (!result.success) return setError(result.message);
    setCatalog((c) => ({ ...c, brands: [...c.brands, { id: result.id, name: newBrand.trim() }].sort((a, b) => a.name.localeCompare(b.name)) }));
    setForm((f) => ({ ...f, brand_id: String(result.id) }));
    setNewBrand(null);
    setError('');
  };

  const save = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Please enter the product name.');
    if (!form.brand_id) return setError('Please choose a brand.');

    setBusy(true);
    const prices = Object.fromEntries(catalog.roles.map((r) => [r.id, form.prices[r.id] ?? '']));
    const result = await api('save_product', {
      id: isNew ? '' : id,
      name: form.name,
      sku: form.sku,
      brand_id: form.brand_id,
      category_id: form.category_id,
      uom_id: form.uom_id,
      uom_qty: form.uom_qty,
      description: form.description,
      reorder_level: form.reorder_level,
      opening_stock: isNew ? form.opening_stock : '',
      is_active: form.is_active ? 'true' : 'false',
      prices: JSON.stringify(prices),
      promo_price: form.promo_on ? form.promo_price : '',
      promo_type: form.promo_on ? form.promo_type : '',
      promo_until: form.promo_on && form.promo_type === 'until_date' ? form.promo_until : '',
    });
    setBusy(false);
    if (!result.success) return setError(result.message);
    // New product: stay on it so photos can be added next.
    if (isNew) router.replace(`/dashboard/products/${result.product.id}?created=1`);
    else router.push('/dashboard/products');
  };

  if (!catalog) {
    return error ? <p className="dash-error">{error}</p> : <p className="muted">Loading…</p>;
  }

  const uom = catalog.uoms.find((u) => String(u.id) === form.uom_id);
  const costRole = catalog.roles.find((r) => r.is_cost);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <header className="dash-top">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/dashboard/products">← Products</Link>
          </p>
          <h1>{isNew ? 'Add product' : 'Edit product'}</h1>
        </div>
      </header>

      {justCreated && <p className="form-ok" style={{ marginLeft: 0 }}>Product saved. Add photos on the right.</p>}

      <form className="product-form" onSubmit={save}>
        <div className="col-main">
        <article className="card">
          <h3>Details</h3>
          <div className="form-grid">
            <label className="span-2">
              Product name *
              <input className="dash-input" value={form.name} onChange={set('name')} maxLength={255} placeholder="e.g. Glowbomb Rejuvenating Set" />
            </label>

            <label>
              Brand *
              {newBrand === null ? (
                <SearchSelect
                  className="dash-select full"
                  value={form.brand_id}
                  onChange={(e) => (e.target.value === '__new' ? setNewBrand('') : set('brand_id')(e))}
                >
                  <option value="">Choose a brand…</option>
                  {catalog.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  <option value="__new">+ Add a new brand…</option>
                </SearchSelect>
              ) : (
                <span className="inline-add">
                  <input
                    className="dash-input"
                    autoFocus
                    placeholder="New brand name"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBrand(); } }}
                  />
                  <button type="button" className="dash-btn small" onClick={addBrand}>Add</button>
                  <button type="button" className="dash-btn small ghost" onClick={() => setNewBrand(null)}>Cancel</button>
                </span>
              )}
            </label>

            <label>
              SKU / code
              <input className="dash-input" value={form.sku} onChange={set('sku')} maxLength={100} placeholder="Optional" />
            </label>

            <label>
              Category
              <SearchSelect className="dash-select full" value={form.category_id} onChange={set('category_id')}>
                <option value="">No category</option>
                {catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SearchSelect>
            </label>

            <label>
              Unit (UOM)
              <span className="unit-size">
                {uom?.is_measure && (
                  <input
                    className="dash-input size-input"
                    inputMode="decimal"
                    value={form.uom_qty}
                    onChange={set('uom_qty')}
                    placeholder="How many?"
                    aria-label={`How many ${uom.name.toLowerCase()}s`}
                  />
                )}
                <SearchSelect className="dash-select full" value={form.uom_id} onChange={set('uom_id')}>
                  <option value="">No unit</option>
                  {catalog.uoms.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                </SearchSelect>
              </span>
              {uom?.is_measure && <small className="muted">How many {uom.name.toLowerCase()}s, e.g. 500 → “500 {uom.code}”</small>}
            </label>

            <label className="span-2">
              Description
              <textarea className="dash-input" rows={3} value={form.description} onChange={set('description')} />
            </label>

            <label className="check span-2">
              <input type="checkbox" checked={form.is_active} onChange={set('is_active')} />
              Show this product on my store page
            </label>
          </div>
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Manage <Link href="/dashboard/settings/brands">brands</Link>, <Link href="/dashboard/settings/categories">categories</Link> and <Link href="/dashboard/settings/units">units</Link> in Settings.
          </p>
        </article>

        <article className="card">
          <h3>Pricing{uom ? ` per ${uom.code}` : ''}</h3>
          <div className="price-grid">
            {catalog.roles.map((r, i) => {
              // What this tier pays when its own price is empty: the next tier up that has one.
              const filled = (x) => form.prices[x.id] !== undefined && String(form.prices[x.id]).trim() !== '';
              const own = filled(r);
              const next = own ? null : catalog.roles.slice(i + 1).find(filled);
              const effective = own ? form.prices[r.id] : next ? form.prices[next.id] : '';
              return (
                <label key={r.id} className={r.is_cost ? 'cost-row' : ''}>
                  <span>
                    <strong><span className="tier-num">{r.tier_level}</span>{r.name}</strong>
                    {r.is_cost && <small>Your cost — what you pay</small>}
                    {r.is_default && <small>Default — also shown to visitors</small>}
                  </span>
                  <span className="money-input">
                    <span>₱</span>
                    <input
                      className="dash-input"
                      inputMode="decimal"
                      value={form.prices[r.id] ?? ''}
                      onChange={setPrice(r.id)}
                      placeholder={next ? Number(form.prices[next.id]).toFixed(2) : '0.00'}
                    />
                  </span>
                  <span className="margin">
                    {!own && next ? (
                      <span className="muted">uses {next.name} price</span>
                    ) : !own ? (
                      <span className="muted">no price — “Ask for price”</span>
                    ) : r.is_cost ? (
                      ''
                    ) : (
                      margin(effective, costRole ? form.prices[costRole.id] : '')
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="muted" style={{ margin: '10px 0 0' }}>
            Customers pay their tier&apos;s price. If a tier is empty, they pay the next tier&apos;s price below it (toward{' '}
            {catalog.roles.at(-1)?.name ?? 'retail'}).
            {costRole
              ? ` Profit is worked out against your ${costRole.name} price.`
              : ' Mark one tier as "My cost" in Settings → Customer tiers to see your profit.'}
          </p>
        </article>

        <article className="card">
          <h3>Variants</h3>
          {isNew ? (
            <p className="muted" style={{ margin: 0 }}>Save the product first, then add its shades, colors or sizes here.</p>
          ) : (
            <VariantsEditor productId={id} product={catalog.product} media={media} onMediaChange={setMedia} roles={catalog.roles} productPrices={form.prices} onSaved={refreshProduct} />
          )}
        </article>

        </div>

        <div className="col-side">
        <article className="card">
          <h3>Photos &amp; videos</h3>
          {isNew ? (
            <p className="muted" style={{ margin: 0 }}>Save the product first, then add its cover photo, more photos and videos here.</p>
          ) : (
            <MediaManager productId={id} media={media} onChange={setMedia} />
          )}
        </article>

        <article className="card">
          <h3>Stock</h3>
          <div className="form-grid">
            {isNew ? (
              <label>
                Opening stock
                <input className="dash-input" inputMode="numeric" value={form.opening_stock} onChange={set('opening_stock')} placeholder="0" />
              </label>
            ) : (
              <label>
                In stock
                <span className="stock-now">
                  <strong className={form.stock_qty <= Number(form.reorder_level) ? 'low' : ''}>{form.stock_qty}</strong>
                  {catalog.product?.has_variants ? (
                    <span className="muted">total of {catalog.product.variants.length} {(catalog.product.variant_label || 'variant').toLowerCase()}s</span>
                  ) : (
                    <Link href={`/dashboard/inventory?product=${id}`}>Adjust stock →</Link>
                  )}
                </span>
              </label>
            )}
            <label>
              Low-stock alert at
              <input className="dash-input" inputMode="numeric" value={form.reorder_level} onChange={set('reorder_level')} placeholder="5" />
            </label>
          </div>
        </article>

        <article className="card">
          <label className="check">
            <input type="checkbox" checked={form.promo_on} onChange={set('promo_on')} />
            <strong>Promo price</strong>
          </label>
          {form.promo_on && (
            <div className="promo-box">
              <label>
                Promo price
                <span className="money-input">
                  <span>₱</span>
                  <input className="dash-input" inputMode="decimal" value={form.promo_price} onChange={set('promo_price')} placeholder="0.00" />
                </span>
              </label>
              <fieldset>
                <legend>Valid</legend>
                <label className="check">
                  <input type="radio" name="promo_type" value="until_date" checked={form.promo_type === 'until_date'} onChange={set('promo_type')} />
                  until
                  <input
                    type="date"
                    className="dash-input"
                    style={{ width: 'auto' }}
                    min={today}
                    value={form.promo_until}
                    onChange={(e) => setForm((f) => ({ ...f, promo_type: 'until_date', promo_until: e.target.value }))}
                  />
                </label>
                <label className="check">
                  <input
                    type="radio"
                    name="promo_type"
                    value="while_supplies_last"
                    checked={form.promo_type === 'while_supplies_last'}
                    onChange={set('promo_type')}
                  />
                  while supplies last
                </label>
              </fieldset>
              <p className="muted" style={{ margin: 0 }}>
                Customers pay the promo price when it is lower than their role price.
                {form.promo_type === 'while_supplies_last' && ' Untick "Promo price" when supplies run out.'}
              </p>
            </div>
          )}
        </article>

        </div>

        <div className="form-footer">
        {error && <p className="dash-error">{error}</p>}
        <div className="form-actions">
          <button type="submit" className="dash-btn" disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button>
          <Link href="/dashboard/products" className="dash-btn ghost" style={{ textDecoration: 'none' }}>Cancel</Link>
        </div>
        </div>
      </form>
    </>
  );
}

export default function ProductFormRoute() {
  return (
    <Suspense>
      <ProductFormPage />
    </Suspense>
  );
}
