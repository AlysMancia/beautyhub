'use client';

import { useCallback, useEffect, useState } from 'react';
import CatalogList from '../../../components/CatalogList';
import { api } from '../../../lib/api';
import { useSeller } from '../../SellerContext';

/** Categories for Expenses & income, e.g. Fare and Gas (expenses), Delivery fees (income). */
export default function MoneyCategoriesPage() {
  useSeller();
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await api('list_ledger_categories');
    if (result.success) setCategories(result.categories);
    else setError(result.message);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items = (kind) =>
    (categories ?? []).filter((c) => c.kind === kind).map((c) => ({ ...c, product_count: c.entry_count }));

  return (
    <>
      <header className="dash-top compact">
        <h1>Expense categories</h1>
        <p className="muted head-note">Used on Expenses &amp; income. Rename, add or remove any.</p>
      </header>
      {error && <p className="dash-error">{error}</p>}
      {!categories ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="two-up">
          <CatalogList
            title="Expenses"
            hint="Money going out: fare, gas, rent… The number is how many entries use it."
            items={items('expense')}
            fields={[{ key: 'name', placeholder: 'New expense category, e.g. Fare' }]}
            label={(c) => c.name}
            saveFn="save_ledger_category"
            deleteFn="delete_ledger_category"
            extra={{ kind: 'expense' }}
            countTitle="Entries"
            deleteNote={(n) => `${n} entr${n === 1 ? 'y keeps' : 'ies keep'} this name but won't be linked to a category.`}
            onChanged={load}
            onError={setError}
          />
          <CatalogList
            title="Other income"
            hint="Money coming in that isn't an invoice: delivery fees, services…"
            items={items('income')}
            fields={[{ key: 'name', placeholder: 'New income category' }]}
            label={(c) => c.name}
            saveFn="save_ledger_category"
            deleteFn="delete_ledger_category"
            extra={{ kind: 'income' }}
            countTitle="Entries"
            deleteNote={(n) => `${n} entr${n === 1 ? 'y keeps' : 'ies keep'} this name but won't be linked to a category.`}
            onChanged={load}
            onError={setError}
          />
        </div>
      )}
    </>
  );
}
