'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import IncludeExcludeSelect from '../../components/IncludeExcludeSelect';
import SearchSelect from '../../components/SearchSelect';
import { api } from '../../lib/api';
import { buildLines, groupByBrand, layoutLines, priceListExcel, priceListImages, priceListPdf, priceShort } from '../../lib/priceList';
import { useSeller } from '../SellerContext';

// A4 in px (portrait 794 x 1123).
const A4_SHORT = 794;
const A4_LONG = 1123;
const PAGE_PADDING_X = 44;
const COLUMN_GAP = 14;

/** One line of the price list: a brand bar, a product, or its variants. */
function Line({ line, roles, photos }) {
  const icon = (src) => photos && (src ? <span className="lst-ic"><img src={src} alt="" /></span> : <span />);

  if (line.type === 'brand') {
    return (
      <div className="lst-line lst-brand">
        {photos && (line.group.logo ? <span className="lst-ic logo"><img src={line.group.logo} alt="" /></span> : <span />)}
        <span className="lst-name">
          {line.group.brand}
          {line.continued && <small> (cont.)</small>}
        </span>
        {roles.map((r) => <span key={r.id} className="lst-p">{r.name}</span>)}
      </div>
    );
  }

  const { p } = line;
  if (line.type === 'vnames') {
    return (
      <div className="lst-line lst-vnames">
        <span>{p.variant_label || 'Variants'}: {line.names.join(', ')}</span>
      </div>
    );
  }

  if (line.type === 'variant') {
    const { v } = line;
    return (
      <div className="lst-line lst-variant">
        {icon(v.image)}
        <span className="lst-name">↳ {v.name}</span>
        {/* Blank where the variant costs the same as the product. */}
        {roles.map((r) => (
          <span key={r.id} className="lst-p">{v.prices[r.id] != null && v.prices[r.id] !== p.prices[r.id] ? priceShort(v.prices[r.id]) : ''}</span>
        ))}
      </div>
    );
  }

  return (
    <div className="lst-line lst-product">
      {icon(p.image)}
      <span className="lst-name">
        {p.name}
        {p.size && <small>{p.size}</small>}
      </span>
      {roles.map((r) => <span key={r.id} className="lst-p">{priceShort(p.prices[r.id]) || '—'}</span>)}
    </div>
  );
}

/** The store header at the top of every page. */
function PageHead({ data, title, pageIndex, pageCount }) {
  return (
    <header className="cat-head">
      {data.store.logo && <img src={data.store.logo} alt="" />}
      <div>
        <h2>{data.store.name}</h2>
        <p>{title} · {data.generated_at}</p>
      </div>
      {pageCount > 1 && <span className="cat-pageno">{pageIndex + 1} / {pageCount}</span>}
    </header>
  );
}

export default function PriceListPage() {
  useSeller();
  const [catalog, setCatalog] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [filters, setFilters] = useState({ q: '', category: '', stock: '' });
  const [brandPick, setBrandPick] = useState({}); // { brandId: 'in' | 'out' }
  const [photos, setPhotos] = useState(true);
  const [variants, setVariants] = useState(true);
  const [columnsChoice, setColumnsChoice] = useState('3'); // most columns per page (one brand per column)
  const [fit, setFit] = useState('compact'); // 'compact' = page as tall as its content | 'a4' = full A4 pages
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const sheet = useRef(null);

  useEffect(() => {
    api('list_catalog').then((d) => {
      if (!d.success) return setError(d.message);
      setCatalog(d);
      setTiers(d.roles.map((r) => r.id));
    });
  }, []);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const toggleTier = (id) => setTiers((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const build = async () => {
    if (!tiers.length) return setError('Tick at least one tier.');
    setBusy('load');
    setError('');
    const ids = (state) => Object.keys(brandPick).filter((id) => brandPick[id] === state).map(Number);
    const result = await api('price_list', {
      ...filters,
      brands_in: JSON.stringify(ids('in')),
      brands_out: JSON.stringify(ids('out')),
      roles: JSON.stringify(tiers),
      variants: variants ? '1' : '',
    });
    setBusy('');
    if (!result.success) return setError(result.message);
    setData(result);
  };

  const title = data
    ? data.roles.length === catalog?.roles.length
      ? 'Price list'
      : `${data.roles.map((r) => r.name).join(' & ')} price list`
    : '';

  const tierCount = data?.roles.length ?? 1;
  const columns = Number(columnsChoice);
  const priceWidth = tierCount === 1 ? 52 : 41;
  const lineTemplate = `${photos ? '18px ' : ''}minmax(0, 1fr) repeat(${tierCount}, ${priceWidth}px)`;
  // Turn the page sideways when a portrait column is too narrow for names + prices.
  const columnWidth = (pageWidth) => (pageWidth - PAGE_PADDING_X - COLUMN_GAP * (columns - 1)) / columns;
  const needed = (photos ? 22 : 0) + 130 + tierCount * (priceWidth + 4);
  const landscape = columns > 1 && columnWidth(A4_SHORT) < needed;
  const pageWidth = landscape ? A4_LONG : A4_SHORT;
  const pageHeight = landscape ? A4_SHORT : A4_LONG;
  const layoutKey = `${columns}|${photos}|${landscape}`;

  const groups = useMemo(() => (data ? groupByBrand(data.products) : []), [data]);
  const lines = useMemo(() => (data ? buildLines(groups, data.roles) : []), [data, groups]);

  // Real line heights, measured from an off-screen copy (one column of the
  // same width), so the columns are filled exactly.
  const measure = useRef(null);
  const [sizes, setSizes] = useState(null);
  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return setSizes(null);
    const style = getComputedStyle(el);
    const heights = [...el.querySelectorAll('.lst-col > .lst-line')].map((l) => l.getBoundingClientRect().height);
    const head = el.querySelector('.cat-head').getBoundingClientRect().height + (parseFloat(style.rowGap) || 8);
    setSizes({
      lines,
      key: layoutKey,
      heights,
      brandHeight: heights[lines.findIndex((l) => l.type === 'brand')] ?? 20,
      pageHeight: pageHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - head - 2,
    });
  }, [lines, layoutKey]);

  const pages = useMemo(() => {
    if (!sizes || sizes.lines !== lines || sizes.key !== layoutKey || sizes.heights.length !== lines.length) return [];
    return layoutLines(lines, sizes.heights, { columns, pageHeight: sizes.pageHeight, brandHeight: sizes.brandHeight });
  }, [sizes, lines, layoutKey, columns]);

  const run = async (kind) => {
    setBusy(kind);
    setError('');
    try {
      const progress = (i, n) => setBusy(`${kind} ${i}/${n}`);
      if (kind === 'excel') await priceListExcel(data, { photos, title });
      if (kind === 'pdf') await priceListPdf(data, { title }, sheet.current, progress);
      if (kind === 'png') await priceListImages(data, { title }, sheet.current, progress);
    } catch (e) {
      setError(`Could not make the file: ${e.message}`);
    }
    setBusy('');
  };

  if (!catalog) return error ? <p className="dash-error">{error}</p> : <p className="muted">Loading…</p>;

  const variantCount = data ? data.products.reduce((s, p) => s + (p.variants?.length ?? 0), 0) : 0;
  const label = (kind, text) => (busy.startsWith(kind) ? `Making ${busy.slice(kind.length + 1) || ''}…` : text);
  const pageClass = 'price-page lst-page';
  const pageStyle = { width: pageWidth, minHeight: fit === 'a4' ? pageHeight : 0 };
  const colsStyle = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: COLUMN_GAP, '--lt': lineTemplate };

  return (
    <>
      <header className="dash-top compact">
        <h1>Price list</h1>
        <p className="muted head-note">For all tiers or just one (e.g. Reseller). Grouped by brand. Download as Excel, PDF or picture.</p>
      </header>

      <article className="card pl-options">
        <div className="pl-tiers">
          <strong>Tiers</strong>
          {catalog.roles.map((r) => (
            <label key={r.id} className={`pl-chip${tiers.includes(r.id) ? ' on' : ''}`}>
              <input type="checkbox" checked={tiers.includes(r.id)} onChange={() => toggleTier(r.id)} />
              {r.tier_level}. {r.name}
            </label>
          ))}
          <button type="button" className="link-btn" onClick={() => setTiers(catalog.roles.map((r) => r.id))}>All</button>
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <input className="dash-input" placeholder="Search products (optional)" value={filters.q} onChange={set('q')} />
          <IncludeExcludeSelect className="dash-select" label="Brands" options={catalog.brands} value={brandPick} onChange={setBrandPick} />
          <SearchSelect className="dash-select" value={filters.category} onChange={set('category')} aria-label="Category">
            <option value="">All categories</option>
            {catalog.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SearchSelect>
          <label className="check inline-check"><input type="checkbox" checked={filters.stock === 'in'} onChange={(e) => setFilters((f) => ({ ...f, stock: e.target.checked ? 'in' : '' }))} /> In stock only</label>
          <label className="check inline-check"><input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} /> Photos</label>
          <label className="check inline-check"><input type="checkbox" checked={variants} onChange={(e) => setVariants(e.target.checked)} /> Variants</label>
          <SearchSelect className="dash-select" value={fit} onChange={(e) => setFit(e.target.value)} aria-label="Pages">
            <option value="compact">Compact pages (for sharing)</option>
            <option value="a4">Full A4 pages (for printing)</option>
          </SearchSelect>
          <SearchSelect className="dash-select" value={columnsChoice} onChange={(e) => setColumnsChoice(e.target.value)} aria-label="Brands per page">
            <option value="3">Up to 3 brands per page</option>
            <option value="2">Up to 2 brands per page</option>
            <option value="1">1 brand per page</option>
          </SearchSelect>
          <button type="button" className="dash-btn" onClick={build} disabled={!!busy}>
            {busy === 'load' ? 'Loading…' : data ? 'Update' : 'Make price list'}
          </button>
        </div>
        {Object.keys(brandPick).length > 0 && (
          <div className="ie-chips">
            {['in', 'out'].map((state) => {
              const picked = catalog.brands.filter((b) => brandPick[b.id] === state);
              if (!picked.length) return null;
              return (
                <span key={state} className="ie-group">
                  <strong>{state === 'in' ? 'Only:' : 'Excluding:'}</strong>
                  {picked.map((b) => (
                    <span key={b.id} className={`ie-chip ie-${state}`}>
                      {b.name}
                      <button
                        type="button"
                        aria-label={`Remove ${b.name}`}
                        onClick={() => setBrandPick(({ [b.id]: _, ...rest }) => rest)}
                      >
                        <i className="fa-solid fa-xmark" />
                      </button>
                    </span>
                  ))}
                </span>
              );
            })}
            <button type="button" className="link-btn" onClick={() => setBrandPick({})}>Clear brands</button>
          </div>
        )}
      </article>

      {error && <p className="dash-error">{error}</p>}

      {data && (
        <>
          <div className="pl-downloads">
            <span className="muted">
              {data.products.length} products{variantCount ? ` + ${variantCount} variants` : ''} · {groups.length} brand{groups.length === 1 ? '' : 's'} · {pages.length} page{pages.length === 1 ? '' : 's'}
            </span>
            <button type="button" className="dash-btn" onClick={() => run('excel')} disabled={!!busy || !data.products.length}>
              <i className="fa-solid fa-file-excel" /> {label('excel', 'Excel')}
            </button>
            <button type="button" className="dash-btn" onClick={() => run('pdf')} disabled={!!busy || !data.products.length}>
              <i className="fa-solid fa-file-pdf" /> {label('pdf', 'PDF')}
            </button>
            <button type="button" className="dash-btn" onClick={() => run('png')} disabled={!!busy || !data.products.length}>
              <i className="fa-solid fa-image" /> {label('png', pages.length > 1 ? `Pictures (${pages.length}, zip)` : 'Picture')}
            </button>
          </div>

          {/* The price list. Each page = one picture / one PDF page. */}
          <div className="pl-sheet" ref={sheet}>
            {!data.products.length && <p className="muted">No products match.</p>}
            {pages.map((cols, pageIndex) => (
              <section key={pageIndex} className={pageClass} style={pageStyle}>
                <PageHead data={data} title={title} pageIndex={pageIndex} pageCount={pages.length} />
                <div className="lst-cols" style={colsStyle}>
                  {cols.map((col, i) => (
                    <div key={i} className="lst-col">
                      {col.map((line) => <Line key={line.key} line={line} roles={data.roles} photos={photos} />)}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Off-screen copy used only to measure line heights. */}
          <div className="pl-measure" aria-hidden="true">
            <section ref={measure} className={pageClass} style={{ ...pageStyle, minHeight: 0 }}>
              <PageHead data={data} title={title} pageIndex={0} pageCount={2} />
              <div className="lst-cols" style={colsStyle}>
                <div className="lst-col">
                  {lines.map((line) => <Line key={line.key} line={line} roles={data.roles} photos={photos} />)}
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
