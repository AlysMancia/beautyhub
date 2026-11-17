'use client';

import { useEffect, useState } from 'react';
import LogoUploader from '../../../components/LogoUploader';
import StoreLinkCard from '../../../components/StoreLinkCard';
import { api } from '../../../lib/api';
import { useSeller } from '../../SellerContext';

/** Store categories (for Explore stores) + whether the Explore button shows on your page. */
function DirectoryCard({ store, reload }) {
  const [categories, setCategories] = useState(null);
  const [mine, setMine] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api('list_store_categories').then((d) => {
      if (!d.success) return setError(d.message);
      setCategories(d.categories);
      setMine(d.mine ?? []);
    });
  }, []);

  const toggle = async (id) => {
    const next = mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id];
    if (next.length > 5) return setError('Choose up to 5 categories.');
    setError('');
    setMine(next);
    const d = await api('set_store_categories', { ids: JSON.stringify(next) });
    if (!d.success) {
      setError(d.message);
      setMine(mine);
    } else setMsg('Saved.');
  };

  const setExplore = async (on) => {
    setError('');
    const d = await api('update_store', { name: store.name, description: store.description ?? '', show_explore: on ? '1' : '0' });
    if (!d.success) return setError(d.message);
    setMsg('Saved.');
    reload();
  };

  return (
    <article className="card directory-card">
      <h3>Explore stores</h3>
      <p className="muted" style={{ marginTop: 0 }}>
        Customers can find your shop on the <a href="/stores" target="_blank" rel="noreferrer">Explore stores</a> page. Pick what you sell so they can filter for it.
      </p>
      <strong className="dir-label">Store categories <small className="muted">(up to 5)</small></strong>
      {!categories ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="dir-chips">
          {categories.map((c) => (
            <button key={c.id} type="button" className={mine.includes(c.id) ? 'on' : ''} onClick={() => toggle(c.id)} aria-pressed={mine.includes(c.id)}>
              <i className={`fa-solid ${mine.includes(c.id) ? 'fa-check' : c.icon}`} /> {c.name}
            </button>
          ))}
        </div>
      )}
      <label className="check" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={store.show_explore !== false} onChange={(e) => setExplore(e.target.checked)} />
        Show the “Explore stores” button on my store page
      </label>
      <small className="muted">Turn it off to keep visitors on your page. Your shop is still listed on Explore stores.</small>
      <div className="dir-foot">
        {msg && <span className="form-ok" style={{ margin: 0 }}>{msg}</span>}
        {error && <span className="dash-error" style={{ margin: 0 }}>{error}</span>}
      </div>
    </article>
  );
}

export default function SettingsPage() {
  const { store, reload } = useSeller();
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const result = await api('update_store', { name: name.trim(), description: description.trim() });
    setMessage(result.success ? 'Saved.' : result.message);
    if (result.success) await reload();
    setBusy(false);
  };

  return (
    <>
      <header className="dash-top compact">
        <h1>Store details</h1>
      </header>

      <StoreLinkCard slug={store.slug} />

      <form className="card settings-split" onSubmit={save}>
        <div className="logo-side">
          <LogoUploader
            size={132}
            src={store.logo_path}
            upload="upload_store_logo"
            remove="delete_store_logo"
            label="store logo"
            fallback={<span className="logo-initial big">{store.name[0]}</span>}
            onChange={() => reload()}
          />
          <small className="muted">Your logo. Shown on your store page, dashboard and invoices. Square works best.</small>
        </div>
        <div className="settings-form" style={{ marginTop: 0, maxWidth: 'none' }}>
          <label>
            Store name
            <input className="dash-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </label>
          <label>
            Description
            <textarea
              className="dash-input"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell customers about your store"
            />
          </label>
          <p className="muted" style={{ margin: 0 }}>
            Changing the name does not change your link, so links you already shared keep working.
          </p>
          <div>
            <button className="dash-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            {message && <span className="muted" style={{ marginLeft: 10 }}>{message}</span>}
          </div>
        </div>
      </form>

      <DirectoryCard store={store} reload={reload} />
    </>
  );
}
