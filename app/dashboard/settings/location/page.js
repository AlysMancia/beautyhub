'use client';

import { useState } from 'react';
import LocationPicker, { formatAddress } from '../../../components/LocationPicker';
import { api } from '../../../lib/api';
import { useSeller } from '../../SellerContext';

export default function LocationPage() {
  const { store, reload } = useSeller();
  return (
    <>
      <header className="dash-top">
        <div>
          <h1>Store location</h1>
          <p>Your address and map pin, shown on your store page.</p>
        </div>
      </header>
      <LocationForm store={store} reload={reload} />
    </>
  );
}

function LocationForm({ store, reload }) {
  const [location, setLocation] = useState(() => store.location ?? {});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const payload = Object.fromEntries(
      Object.entries(location).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])
    );
    const result = await api('update_store_location', payload);
    setBusy(false);
    setMessage(result.success ? { ok: true, text: 'Location saved.' } : { ok: false, text: result.message });
    if (result.success) reload();
  };

  const address = formatAddress(location);

  return (
    <form className="card location-card" onSubmit={save}>
      <h3>Address</h3>
      <p className="muted" style={{ margin: '0 0 8px' }}>
        Shown on your store page so customers know where you are.
      </p>
      <LocationPicker value={location} onChange={setLocation} />
      {address && <p className="address-preview"><i className="fa-solid fa-location-dot" /> {address}</p>}
      <div style={{ marginTop: 12 }}>
        <button className="dash-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save location'}</button>
        {message && <span className={message.ok ? 'form-ok' : 'form-err'}>{message.text}</span>}
      </div>
    </form>
  );
}
