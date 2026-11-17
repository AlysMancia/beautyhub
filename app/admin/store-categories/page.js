'use client';

import { useCallback, useEffect, useState } from 'react';
import CatalogList from '../../components/CatalogList';
import { api } from '../../lib/api';

/** Admin: the store categories sellers choose from (shown on Explore stores). */
export default function StoreCategoriesPage() {
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const d = await api('list_store_categories');
    if (d.success) setCategories(d.categories);
    else setError(d.message);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="dash-top compact">
        <h1>Store categories</h1>
        <p className="muted head-note">
          Sellers pick up to 5 for their shop; customers filter by them on <a href="/stores" target="_blank" rel="noreferrer">Explore stores</a>.
        </p>
      </header>
      {error && <p className="dash-error">{error}</p>}
      {!categories ? (
        <p className="muted">Loading…</p>
      ) : (
        <CatalogList
          title="Categories"
          hint="The icon is a Font Awesome name, e.g. fa-spa, fa-gem, fa-heart. The number is how many stores use it."
          items={categories.map((c) => ({ ...c, product_count: c.store_count }))}
          fields={[
            { key: 'name', placeholder: 'New category, e.g. Organic' },
            { key: 'icon', placeholder: 'Icon, e.g. fa-leaf', width: 170 },
          ]}
          label={(c) => c.name}
          leading={(c) => <span className="cat-icon"><i className={`fa-solid ${c.icon}`} /></span>}
          saveFn="admin_save_store_category"
          deleteFn="admin_delete_store_category"
          countTitle="Stores"
          deleteNote={(n) => `${n} store(s) will no longer be listed under it.`}
          onChanged={load}
          onError={setError}
        />
      )}
    </>
  );
}
