'use client';

import SearchSelect from './SearchSelect';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import HowToPay from './HowToPay';
import Pager from './Pager';
import { api } from '../lib/api';
import { money, promoLabel } from '../lib/format';
import { nextStep, priceAtQty } from '../lib/invoice';
import { useServerList } from '../lib/useServerList';

/**
 * Cart kept in this browser per store: { productId: { qty, name, brand, price, uom } }.
 * Each entry keeps what the customer saw, so the cart works across pages.
 */
function useCart(slug) {
  const key = `cart:${slug}`;
  const [cart, setCart] = useState({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      // Older carts stored just a number; drop those.
      setCart(Object.fromEntries(Object.entries(saved).filter(([, v]) => v && typeof v === 'object')));
    } catch {
      /* no storage */
    }
  }, [key]);
  const save = (next) => {
    setCart(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* no storage */
    }
  };
  return [cart, save];
}

const unitPrice = (p) => p.promo_price ?? p.price;

function QtyStepper({ value, onChange, label, small, max }) {
  const atMax = max != null && value >= max;
  return (
    <div className={`qty_stepper${small ? ' small' : ''}`}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label="One less">−</button>
      <input inputMode="numeric" value={value} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)} aria-label={label} />
      <button type="button" onClick={() => onChange(value + 1)} aria-label="One more" disabled={atMax} title={atMax ? `Only ${max} in stock` : undefined}>+</button>
    </div>
  );
}

/** Pieces left to order: the variant's stock, else the product's. */
const stockOf = (p, variant) => (variant ? variant.stock ?? (variant.in_stock ? 9999 : 0) : p.stock ?? (p.in_stock === false ? 0 : 9999));
/** A product with variants is out of stock when every variant is. */
const soldOut = (p) => (p.has_variants ? p.variants.length > 0 && p.variants.every((v) => !v.in_stock) : p.in_stock === false);

/**
 * Price for this customer. Members of a non-retail tier also see the SRP
 * (retail price) and what they save; "buy more, pay less" steps are listed.
 */
function PriceLine({ p, tier, price = unitPrice(p), srp = p.srp }) {
  const save = srp && price && Number(srp) > Number(price) ? Math.round((1 - Number(price) / Number(srp)) * 100) : 0;
  return (
    <>
      <div className="p_price">
        {p.promo_price && price === unitPrice(p) ? (
          <>
            <span className="p_now">{money(p.promo_price)}</span>
            {p.price && <span className="p_was">{money(p.price)}</span>}
          </>
        ) : price ? (
          <span className="p_now">{money(price)}</span>
        ) : (
          <span className="p_uom">Ask for price</span>
        )}
        {p.size && price && <span className="p_uom">/ {p.size}</span>}
      </div>
      {srp && price && (
        <div className="p_srp">
          {tier && <span className="p_tier">{tier} price</span>}
          <span>SRP <s>{money(srp)}</s></span>
          {save > 0 && <span className="p_save">save {save}%</span>}
        </div>
      )}
      {p.qty_prices?.length > 0 && (
        <div className="p_steps" title="Buy more, pay less">
          {p.qty_prices.map((q) => <span key={q.min_qty}>{q.min_qty}+ <strong>{money(q.price)}</strong></span>)}
        </div>
      )}
    </>
  );
}

/** Store page product grid: searched, filtered and paged on the server. */
export default function StoreProducts({ store, viewer }) {
  const list = useServerList('get_store', { q: '', brand: '', category: '' }, { perPage: 24, extra: { slug: store.slug } });
  const { data, filters, setFilter } = list;
  const canOrder = viewer.relation === 'member';
  const [cart, setCart] = useCart(store.slug);
  const [cartOpen, setCartOpen] = useState(false);
  const [openProduct, setOpenProduct] = useState(null);

  // Cart key: product id, plus the variant id for products with variants ("12:7").
  const cartKey = (p, variant) => (variant ? `${p.id}:${variant.id}` : String(p.id));

  /** Set the quantity of a product (and variant) in the cart; 0 removes it. */
  const setQty = (p, qty, variant = null) => {
    const key = cartKey(p, variant);
    const next = { ...cart };
    const max = stockOf(p, variant);
    if (qty > 0 && max > 0) {
      next[key] = {
        qty: Math.min(qty, max),
        max,
        product_id: p.id,
        variant_id: variant?.id ?? null,
        variant_name: variant?.name ?? null,
        name: p.name,
        brand: p.brand,
        price: variant?.price != null ? Number(variant.price) : unitPrice(p),
        product_price: unitPrice(p) == null ? null : Number(unitPrice(p)),
        qty_prices: p.qty_prices ?? [],
        uom: p.size,
      };
    } else {
      delete next[key];
    }
    setCart(next);
  };
  /** Change the quantity of a line already in the cart. */
  const setLineQty = (key, qty) => {
    const next = { ...cart };
    if (qty > 0) next[key] = { ...next[key], qty: Math.min(qty, next[key].max ?? 9999) };
    else delete next[key];
    setCart(next);
  };
  // Quantity prices: the product's total in the cart (all variants) decides the step.
  const rawLines = Object.entries(cart).map(([key, c]) => ({ key, product_id: c.product_id ?? Number(key), ...c }));
  const productQty = {};
  rawLines.forEach((l) => { productQty[l.product_id] = (productQty[l.product_id] ?? 0) + l.qty; });
  const cartLines = rawLines.map((l) => {
    const follows = l.qty_prices?.length && (!l.variant_id || Number(l.price) === Number(l.product_price));
    const each = follows ? priceAtQty(l.price, l.qty_prices, productQty[l.product_id]) : Number(l.price);
    const next = follows ? nextStep(l.qty_prices, productQty[l.product_id]) : null;
    return { ...l, base: Number(l.price), price: each, next, productQty: productQty[l.product_id] };
  });
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cartLines.reduce((s, l) => s + l.qty * Number(l.price || 0), 0);

  const priceNote =
    viewer.relation === 'member' && viewer.role
      ? `Prices shown are your ${viewer.role} prices.`
      : viewer.relation === 'owner'
        ? 'Visitors and new customers see your default tier prices. Members see their own tier prices.'
        : null;

  const facets = data?.facets;

  return (
    <section className="store_section">
      <div className="store_toolbar">
        <div className="st_title">
          <h3>Products</h3>
          {priceNote && <p className="price_note">{priceNote}</p>}
        </div>
        <input className="form-control" placeholder="Search products" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
        <SearchSelect className="form-select" value={filters.category} onChange={(e) => setFilter('category', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {facets?.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.n})</option>)}
        </SearchSelect>
        <SearchSelect className="form-select" value={filters.brand} onChange={(e) => setFilter('brand', e.target.value)} aria-label="Brand">
          <option value="">All brands</option>
          {facets?.brands.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.n})</option>)}
        </SearchSelect>
      </div>

      {facets && facets.brands.some((b) => b.logo_path) && (
        <div className="brand_strip" aria-label="Brands">
          {facets.brands.filter((b) => b.logo_path).map((b) => (
            <button
              key={b.id}
              type="button"
              className={`brand_chip${String(filters.brand) === String(b.id) ? ' on' : ''}`}
              onClick={() => setFilter('brand', String(filters.brand) === String(b.id) ? '' : String(b.id))}
              title={b.name}
            >
              <img src={b.logo_path} alt={b.name} />
            </button>
          ))}
        </div>
      )}

      {!data ? (
        <p className="price_note" style={{ marginTop: 12 }}>Loading products…</p>
      ) : data.total === 0 ? (
        <div className="store_empty" style={{ marginTop: 12 }}>
          {filters.q || filters.brand || filters.category ? 'No products match your search.' : `Products from ${store.name} will appear here.`}
        </div>
      ) : (
        <>
          <div className="product_grid">
            {data.products.map((p) => (
              <article key={p.id} className="product_card">
                <button type="button" className="p_image" onClick={() => setOpenProduct(p)} aria-label={`View ${p.name}`}>
                  {p.cover ? <img src={p.cover} alt="" loading="lazy" /> : <span className="p_noimg"><i className="fa-regular fa-image" /></span>}
                  {p.media_count > 1 && <span className="p_count"><i className="fa-regular fa-images" /> {p.media_count}</span>}
                  {p.promo_type && <span className="p_promo_tag">Promo</span>}
                </button>
                <div className="p_body">
                  <span className="p_brand">
                    {p.brand_logo && <img src={p.brand_logo} alt="" />}
                    {p.brand}
                  </span>
                  <button type="button" className="p_name" onClick={() => setOpenProduct(p)}>{p.name}</button>
                  <PriceLine p={p} tier={canOrder ? viewer.role : null} />
                  {p.promo_type && <span className="p_promo">Promo {promoLabel(p.promo_type, p.promo_until)}</span>}
                  {p.has_variants && p.variants.length > 0 && (
                    <span className="p_variants">
                      {p.variants.slice(0, 6).map((v) => (
                        <span key={v.id} className={`p_swatch${v.in_stock ? '' : ' out'}`} title={v.name}>
                          {v.image ? <img src={v.image} alt="" /> : v.name.slice(0, 2)}
                        </span>
                      ))}
                      <small>{p.variants.length} {(p.variant_label || 'option').toLowerCase()}s</small>
                    </span>
                  )}
                  {canOrder && unitPrice(p) && soldOut(p) && (
                    <button type="button" className="btn btn-sm add_btn soldout" disabled>Out of stock</button>
                  )}
                  {canOrder && unitPrice(p) && !soldOut(p) &&
                    (p.has_variants ? (
                      <button type="button" className="btn btn-primary btn-sm add_btn" onClick={() => setOpenProduct(p)}>
                        Choose {(p.variant_label || 'option').toLowerCase()}
                      </button>
                    ) : cart[p.id] ? (
                      <QtyStepper value={cart[p.id].qty} max={stockOf(p)} onChange={(n) => setQty(p, n)} label={`Quantity of ${p.name}`} />
                    ) : (
                      <button type="button" className="btn btn-primary btn-sm add_btn" onClick={() => setQty(p, 1)}>Add to order</button>
                    ))}
                </div>
              </article>
            ))}
          </div>
          <Pager list={list} label="products" sizes={[24, 48, 96]} className="store_pager" />
        </>
      )}

      {canOrder && cartCount > 0 && (
        <button type="button" className="cart_bar" onClick={() => setCartOpen(true)}>
          <span><i className="fa-solid fa-bag-shopping" /> {cartCount} item{cartCount === 1 ? '' : 's'}</span>
          <strong>{money(cartTotal)}</strong>
          <span>Review order →</span>
        </button>
      )}
      {cartOpen && (
        <CartDrawer
          store={store}
          lines={cartLines}
          total={cartTotal}
          setQty={setLineQty}
          onClose={() => setCartOpen(false)}
          onPlaced={() => setCart({})}
        />
      )}
      {openProduct && (
        <ProductModal
          store={store}
          tier={canOrder ? viewer.role : null}
          summary={openProduct}
          canOrder={canOrder}
          cart={cart}
          cartKey={cartKey}
          setQty={setQty}
          onClose={() => setOpenProduct(null)}
        />
      )}
    </section>
  );
}

/** Product details: photo gallery, videos, price, add to order. */
function ProductModal({ store, tier, summary, canOrder, cart, cartKey, setQty, onClose }) {
  const [product, setProduct] = useState(null);
  const [active, setActive] = useState(0);
  const [variantId, setVariantId] = useState(null);

  useEffect(() => {
    api('get_store_product', { slug: store.slug, id: summary.id }).then((d) => d.success && setProduct(d.product));
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [store.slug, summary.id, onClose]);

  const p = product ?? summary;
  const media = product?.media ?? (summary.cover ? [{ kind: 'image', path: summary.cover, thumb_path: summary.cover }] : []);
  const variants = p.variants ?? [];
  const variant = variants.find((v) => v.id === variantId) ?? null;
  // A chosen variant with its own photo shows that photo.
  const current = variant?.image_full ? { kind: 'image', path: variant.image_full } : media[active];
  const inCart = cart[cartKey(p, variant)]?.qty ?? 0;
  const needsChoice = p.has_variants && !variant;

  return (
    <div className="modal_backdrop" onClick={onClose}>
      <div className="product_modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={p.name}>
        <button type="button" className="btn-close modal_close" aria-label="Close" onClick={onClose} />
        <div className="pm_gallery">
          <div className="pm_main">
            {!current ? (
              <span className="p_noimg big"><i className="fa-regular fa-image" /></span>
            ) : current.kind === 'video' ? (
              <video key={current.path} src={current.path} controls playsInline />
            ) : (
              <img src={current.path} alt={p.name} />
            )}
          </div>
          {media.length > 1 && (
            <div className="pm_thumbs">
              {media.map((m, i) => (
                <button key={m.path} type="button" className={i === active ? 'on' : ''} onClick={() => setActive(i)} aria-label={m.kind === 'video' ? 'Video' : `Photo ${i + 1}`}>
                  {m.kind === 'video' ? <span className="pm_vid"><i className="fa-solid fa-play" /></span> : <img src={m.thumb_path || m.path} alt="" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="pm_info">
          <span className="p_brand">
            {p.brand_logo && <img src={p.brand_logo} alt="" />}
            {p.brand}
          </span>
          <h2>{p.name}</h2>
          <p className="price_note">{[p.category, p.size].filter(Boolean).join(' · ')}</p>
          {variant?.price != null && Number(variant.price) !== Number(unitPrice(p)) ? (
            <PriceLine p={{ ...p, qty_prices: [] }} tier={tier} price={variant.price} srp={variant.srp} />
          ) : (
            <PriceLine p={p} tier={tier} />
          )}
          {p.promo_type && <span className="p_promo">Promo {promoLabel(p.promo_type, p.promo_until)}</span>}
          {p.description && <p className="pm_desc">{p.description}</p>}
          {p.has_variants && variants.length > 0 && (
            <div className="pm_variants">
              <span className="pm_vlabel">
                {p.variant_label || 'Option'}: <strong>{variant ? variant.name : 'choose one'}</strong>
              </span>
              <div className="pm_vlist" role="radiogroup" aria-label={p.variant_label || 'Option'}>
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={v.id === variantId}
                    className={`pm_vbtn${v.id === variantId ? ' on' : ''}${v.in_stock ? '' : ' out'}`}
                    onClick={() => setVariantId(v.id)}
                    title={v.in_stock ? v.name : `${v.name} (out of stock)`}
                  >
                    {v.image && <img src={v.image} alt="" />}
                    <span>{v.name}</span>
                    {v.price != null && Number(v.price) !== Number(unitPrice(p)) && <small className="pm_vprice">{money(v.price)}</small>}
                  </button>
                ))}
              </div>
              {variant && !variant.in_stock && <small className="price_note soldout_note">This one is out of stock.</small>}
            </div>
          )}
          {canOrder && unitPrice(p) && (
            <div style={{ marginTop: 12 }}>
              {inCart ? (
                <>
                  <QtyStepper value={inCart} max={stockOf(p, variant)} onChange={(n) => setQty(p, n, variant)} label={`Quantity of ${p.name}`} />
                  {inCart >= stockOf(p, variant) && <small className="price_note">Only {stockOf(p, variant)} in stock.</small>}
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary add_btn"
                  disabled={needsChoice || soldOut(p) || (!needsChoice && stockOf(p, variant) <= 0)}
                  onClick={() => setQty(p, 1, variant)}
                >
                  {soldOut(p) || (!needsChoice && stockOf(p, variant) <= 0)
                    ? 'Out of stock'
                    : needsChoice ? `Choose a ${(p.variant_label || 'option').toLowerCase()} first` : 'Add to order'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CartDrawer({ store, lines, total, setQty, onClose, onPlaced }) {
  const [notes, setNotes] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const place = async () => {
    setBusy(true);
    setError('');
    const result = await api('place_order', {
      slug: store.slug,
      notes,
      contact,
      items: JSON.stringify(lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id ?? '', qty: l.qty }))),
    });
    setBusy(false);
    if (!result.success) return setError(result.message || 'Could not place the order.');
    setPlaced(result);
    onPlaced();
  };

  return (
    <div className="drawer_backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Your order">
        <header>
          <h3>{placed ? 'Order sent' : 'Your order'}</h3>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </header>
        {placed ? (
          <div className="drawer_body">
            <p>
              <strong>{placed.invoice_no}</strong> was sent to {store.name}. They will check it and confirm it. The seller may
              adjust the final prices.
            </p>
            <Link href={`/account/orders/${placed.invoice_id}`} className="btn btn-primary">View my order</Link>
            {store.payment_methods?.length > 0 && (
              <div className="drawer_pay">
                <HowToPay methods={store.payment_methods} title={`How to pay ${store.name}`} />
                <p className="price_note">After paying, send your receipt from your order page so {store.name} can confirm it.</p>
              </div>
            )}
          </div>
        ) : lines.length === 0 ? (
          <div className="drawer_body"><p>Your order is empty.</p></div>
        ) : (
          <>
            <div className="drawer_body">
              <ul className="cart_lines">
                {lines.map((l) => (
                  <li key={l.key}>
                    <div>
                      <strong>{l.name}{l.variant_name && ` — ${l.variant_name}`}</strong>
                      <small>
                        {l.brand} · {money(l.price)}{l.uom ? ` / ${l.uom}` : ''}
                        {l.price < l.base && <span className="cart_qtyprice"> · qty price (was {money(l.base)})</span>}
                      </small>
                      {l.max != null && l.qty >= l.max && <small className="cart_nudge">Only {l.max} in stock</small>}
                      {l.next && (
                        <small className="cart_nudge">Add {l.next.min_qty - l.productQty} more to pay {money(l.next.price)} each</small>
                      )}
                    </div>
                    <QtyStepper small value={l.qty} max={l.max} onChange={(n) => setQty(l.key, n)} label={`Quantity of ${l.name}`} />
                    <span className="line_amt">{money(l.qty * Number(l.price))}</span>
                  </li>
                ))}
              </ul>
              <label className="auth_label" htmlFor="orderContact">Contact number (optional)</label>
              <input id="orderContact" className="form-control auth_input" value={contact} maxLength={160} onChange={(e) => setContact(e.target.value)} placeholder="09xx xxx xxxx" />
              <label className="auth_label" htmlFor="orderNotes" style={{ marginTop: 10 }}>Notes for the seller (optional)</label>
              <textarea id="orderNotes" className="form-control auth_input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery or pickup details" />
              {store.payment_methods?.length > 0 && (
                <div className="drawer_pay">
                  <HowToPay methods={store.payment_methods} title={`How to pay ${store.name}`} />
                  <p className="price_note">You can pay once {store.name} confirms your order, then send your receipt from the order page.</p>
                </div>
              )}
            </div>
            <footer>
              <div className="drawer_total"><span>Estimated total</span><strong>{money(total)}</strong></div>
              {error && <p className="auth_error">{error}</p>}
              <button type="button" className="btn btn-primary auth_submit" onClick={place} disabled={busy}>
                {busy ? 'Sending…' : 'Place order'}
              </button>
              <p className="price_note" style={{ textAlign: 'center' }}>The seller confirms your order before it is final.</p>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
