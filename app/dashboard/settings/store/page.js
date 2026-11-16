'use client';

import { useState } from 'react';
import LogoUploader from '../../../components/LogoUploader';
import StoreLinkCard from '../../../components/StoreLinkCard';
import { api } from '../../../lib/api';
import { useSeller } from '../../SellerContext';

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
    </>
  );
}
