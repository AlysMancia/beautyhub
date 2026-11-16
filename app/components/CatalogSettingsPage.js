'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import CatalogList from './CatalogList';
import LogoUploader from './LogoUploader';

const KINDS = {
  brands: {
    title: 'Brands',
    intro: 'The brands you sell. Each product belongs to one brand.',
    listKey: 'brands',
    fields: [{ key: 'name', placeholder: 'New brand, e.g. Ryxskin' }],
    label: (b) => b.name,
    saveFn: 'save_brand',
    deleteFn: 'delete_brand',
    hint: 'Click the square to upload a logo. The number is how many products each brand has.',
    logos: true,
    deleteNote: () => 'Brands with products cannot be deleted.',
  },
  categories: {
    title: 'Categories',
    intro: 'Product categories shown as filters on your store page.',
    listKey: 'categories',
    fields: [{ key: 'name', placeholder: 'New category' }],
    label: (c) => c.name,
    saveFn: 'save_category',
    deleteFn: 'delete_category',
    hint: 'Started with common beauty categories. Rename or remove any. The number is how many products use it.',
    deleteNote: (n) => `${n} product(s) will become uncategorized.`,
  },
  units: {
    title: 'Units of measure',
    intro: 'How a product is sold: per piece, pack, bottle… The code is shown next to prices (₱120 / pc).',
    listKey: 'uoms',
    fields: [
      { key: 'code', placeholder: 'Code, e.g. pc', width: 100 },
      { key: 'name', placeholder: 'Name, e.g. Piece' },
      { key: 'is_measure', type: 'checkbox', placeholder: 'Ask how many', help: 'Products using this unit ask for an amount, e.g. 500 ml' },
    ],
    label: (u) => `${u.code} — ${u.name}`,
    saveFn: 'save_uom',
    deleteFn: 'delete_uom',
    hint: 'Units marked “asks how many” (ml, L, g, kg…) ask for the amount on each product, e.g. 500 ml. The number is how many products use each unit.',
    badges: (u) => u.is_measure && <span className="default-tag">ASKS HOW MANY</span>,
    deleteNote: (n) => `${n} product(s) will have no unit.`,
  },
};

/** Settings page for one catalog list: brands, categories or units. */
export default function CatalogSettingsPage({ kind }) {
  const cfg = KINDS[kind];
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const result = await api('list_catalog');
    if (result.success) setData(result);
    else setError(result.message);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <header className="dash-top">
        <div>
          <h1>{cfg.title}</h1>
          <p>{cfg.intro}</p>
        </div>
      </header>
      {error && <p className="dash-error">{error}</p>}
      <div className="settings-wide">
        {!data ? (
          <p className="muted">Loading…</p>
        ) : (
          <CatalogList
            title={`${data[cfg.listKey].length} ${cfg.title.toLowerCase()}`}
            hint={cfg.hint}
            items={data[cfg.listKey]}
            fields={cfg.fields}
            label={cfg.label}
            saveFn={cfg.saveFn}
            deleteFn={cfg.deleteFn}
            deleteNote={cfg.deleteNote}
            badges={cfg.badges}
            leading={cfg.logos ? (b) => (
              <LogoUploader
                size={40}
                src={b.logo_path}
                upload="upload_brand_logo"
                remove="delete_brand_logo"
                data={{ brand_id: b.id }}
                label={`${b.name} logo`}
                fallback={<span className="logo-initial">{b.name[0]}</span>}
                onChange={load}
              />
            ) : undefined}
            onChanged={() => {
              setError('');
              load();
            }}
            onError={setError}
          />
        )}
      </div>
    </>
  );
}
