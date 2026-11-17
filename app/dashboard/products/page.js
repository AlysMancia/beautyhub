'use client';

import SearchSelect from '../../components/SearchSelect';
import Link from 'next/link';
import { useRef, useState } from 'react';
import Pager from '../../components/Pager';
import ProductThumb from '../../components/ProductThumb';
import EditableCell from '../../components/EditableCell';
import { api } from '../../lib/api';
import { exportProducts, readProductsFile } from '../../lib/excel';
import { money, promoLabel } from '../../lib/format';
import { useServerList } from '../../lib/useServerList';
import { useSeller } from '../SellerContext';

export default function ProductsPage() {
  const { store } = useSeller();
  const list = useServerList('list_products', { q: '', brand: '', category: '', stock: '' }, { perPage: 50 });
  const { data, filters, setFilter } = list;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const doExport = async (template) => {
    setBusy(template ? 'template' : 'export');
    setError('');
    try {
      // Export gets every product matching the current filters from the server.
      const all = template ? { products: [], ...data } : await api('export_products', filters);
      if (!all.success && !template) throw new Error(all.message);
      await exportProducts({ products: template ? [] : all.products, roles: data.roles, catalog: data, storeName: store.name, template });
    } catch (e) {
      setError(`Could not create the Excel file: ${e.message}`);
    }
    setBusy('');
  };

  const doImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('import');
    setError('');
    setImportResult(null);
    try {
      const rows = await readProductsFile(file);
      const result = await api('import_products', { rows: JSON.stringify(rows) });
      if (!result.success) setError(result.message);
      else {
        setImportResult({ ...result, file: file.name });
        list.reload();
      }
    } catch (e) {
      setError(e.message || 'Could not read that file. Please use an .xlsx file.');
    }
    setBusy('');
  };

  /** Save one clicked cell (name, stock or a tier price) and update that row. */
  const quickSave = async (product, field, value, roleId) => {
    const result = await api('quick_update_product', { product_id: product.id, field, value, role_id: roleId ?? '' });
    if (result.success) {
      list.mutate((d) => ({ ...d, products: d.products.map((x) => (x.id === product.id ? result.product : x)) }));
    }
    return result;
  };

  const remove = async (product) => {
    if (!window.confirm(`Delete "${product.name}" and its photos? This cannot be undone.`)) return;
    const result = await api('delete_product', { id: product.id });
    if (!result.success) setError(result.message);
    list.reload();
  };

  const roles = data?.roles ?? [];

  return (
    <>
      <header className="dash-top compact">
        <h1>Products</h1>
        <div className="top-actions wrap">
          <Link href="/dashboard/products/new" className="dash-btn" style={{ textDecoration: 'none' }}>+ Add product</Link>
          <button type="button" className="dash-btn ghost" onClick={() => fileRef.current?.click()} disabled={!data || !!busy}>
            <i className="fa-solid fa-file-import" /> {busy === 'import' ? 'Importing…' : 'Import'}
          </button>
          <button type="button" className="dash-btn ghost" onClick={() => doExport(false)} disabled={!data || !!busy}>
            <i className="fa-solid fa-file-export" /> {busy === 'export' ? 'Exporting…' : 'Export'}
          </button>
          <button type="button" className="dash-btn ghost" onClick={() => doExport(true)} disabled={!data || !!busy}>
            <i className="fa-solid fa-download" /> Template
          </button>
          <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={doImport} />
        </div>
      </header>

      {(error || list.error) && <p className="dash-error">{error || list.error}</p>}

      {importResult && (
        <div className="card notice">
          <strong>Imported {importResult.file}:</strong> {importResult.created} added, {importResult.updated} updated
          {importResult.errors.length > 0 && <>, {importResult.errors.length} skipped</>}.
          {importResult.errors.length > 0 && (
            <ul className="import-errors">
              {importResult.errors.slice(0, 20).map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}
              {importResult.errors.length > 20 && <li>…and {importResult.errors.length - 20} more</li>}
            </ul>
          )}
          <button type="button" className="icon-btn notice-close" onClick={() => setImportResult(null)} aria-label="Close">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      )}

      <article className="card list-card">
        <div className="toolbar">
          <input className="dash-input" placeholder="Search name, SKU, brand, category…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          <SearchSelect className="dash-select" value={filters.brand} onChange={(e) => setFilter('brand', e.target.value)} aria-label="Brand">
            <option value="">All brands</option>
            {data?.brands.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.product_count})</option>)}
          </SearchSelect>
          <SearchSelect className="dash-select" value={filters.category} onChange={(e) => setFilter('category', e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.product_count})</option>)}
            <option value="none">No category</option>
          </SearchSelect>
          <SearchSelect className="dash-select" value={filters.stock} onChange={(e) => setFilter('stock', e.target.value)} aria-label="Stock">
            <option value="">Any stock</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </SearchSelect>
          <Pager list={list} label="products" sizes={[50, 100, 200]} />
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : list.total === 0 && !filters.q && !filters.brand && !filters.category && !filters.stock ? (
          <div className="empty-state">
            <p>No products yet.</p>
            <p className="muted">Add them one by one, or download the <strong>Template</strong>, fill it in Excel and <strong>Import</strong> it.</p>
            <Link href="/dashboard/products/new" className="dash-btn" style={{ textDecoration: 'none' }}>+ Add your first product</Link>
          </div>
        ) : data.products.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>No products match.</p>
        ) : (
          <div className="table-scroll">
            <table className="dash-table products-table dense">
              <thead>
                <tr>
                  <th />
                  <th>Product</th>
                  <th>Category</th>
                  <th className="num">Stock</th>
                  {roles.map((r) => (
                    <th key={r.id} className="num">{r.name}{r.is_cost && <small className="cost-tag">my cost</small>}</th>
                  ))}
                  <th>Promo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.id} className={p.is_active ? '' : 'inactive'}>
                    <td className="thumb-cell">
                      <ProductThumb product={p} onChanged={list.reload} />
                    </td>
                    <td>
                      <EditableCell
                        value={p.name}
                        display={<span className="product-name">{p.name}</span>}
                        onSave={(v) => quickSave(p, 'name', v)}
                        title="Click to rename"
                      />
                      <small>
                        {p.brand}
                        {p.size && ` · ${p.size}`}
                        {p.sku && ` · ${p.sku}`}
                        {p.has_variants && ` · ${p.variants.length} ${(p.variant_label || 'variant').toLowerCase()}${p.variants.length === 1 ? '' : 's'}`}
                        {p.media_count > 1 && ` · ${p.media_count} files`}
                        {!p.is_active && ' · hidden'}
                      </small>
                    </td>
                    <td>{p.category || <span className="muted">—</span>}</td>
                    <td className={`num${p.stock_qty <= 0 ? ' out' : p.stock_qty <= p.reorder_level ? ' low-stock' : ''}`}>
                      <EditableCell
                        value={String(p.stock_qty)}
                        inputMode="numeric"
                        align="right"
                        width={70}
                        onSave={(v) => quickSave(p, 'stock', v)}
                        title="Click to set the stock count"
                        disabled={p.has_variants}
                        disabledTitle={`Stock is per ${(p.variant_label || 'variant').toLowerCase()} — edit it on the product page or in Inventory`}
                      />
                    </td>
                    {roles.map((r) => (
                      <td key={r.id} className="num">
                        <EditableCell
                          value={p.prices[r.id] !== undefined ? Number(p.prices[r.id]).toFixed(2) : ''}
                          display={money(p.prices[r.id]) || <span className="muted">—</span>}
                          inputMode="decimal"
                          align="right"
                          width={90}
                          onSave={(v) => quickSave(p, 'price', v, r.id)}
                          title={`Click to change the ${r.name} price (leave empty to remove)`}
                        />
                      </td>
                    ))}
                    <td>
                      {p.promo_price !== null && (
                        <span className={`promo-tag${p.promo_active ? '' : ' expired'}`}>
                          {money(p.promo_price)} {p.promo_active ? promoLabel(p.promo_type, p.promo_until) : 'expired'}
                        </span>
                      )}
                    </td>
                    <td className="row-actions">
                      <Link href={`/dashboard/products/${p.id}`} className="icon-btn" title="Edit"><i className="fa-solid fa-pen" /></Link>
                      <button type="button" className="icon-btn" title="Delete" onClick={() => remove(p)}><i className="fa-solid fa-trash" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager list={list} label="products" sizes={[]} className="bottom" />
      </article>
    </>
  );
}
