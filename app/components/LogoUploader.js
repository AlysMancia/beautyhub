'use client';

import { useRef, useState } from 'react';
import { api, uploadFile } from '../lib/api';
import { confirmDialog } from './Dialogs';

/**
 * Logo picker for a brand or the store.
 *   <LogoUploader src={logo} upload="upload_brand_logo" remove="delete_brand_logo" data={{ brand_id: 3 }} onChange={...} />
 */
export default function LogoUploader({ src, upload, remove, data = {}, onChange, size = 56, label = 'logo', fallback }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    const result = await uploadFile(upload, data, file);
    setBusy(false);
    if (result.success) onChange(result.logo_path);
    else setError(result.message);
  };

  const clear = async () => {
    if (!(await confirmDialog('You can upload a new one any time.', { title: `Remove this ${label}?`, confirmLabel: 'Remove', danger: true }))) return;
    const result = await api(remove, data);
    if (result.success) onChange(null);
    else setError(result.message);
  };

  return (
    <span className="logo-uploader">
      <button
        type="button"
        className="logo-box"
        style={{ width: size, height: size }}
        onClick={() => input.current?.click()}
        title={src ? `Change ${label}` : `Upload ${label}`}
        disabled={busy}
      >
        {busy ? (
          <i className="fa-solid fa-spinner fa-spin" />
        ) : src ? (
          <img src={src} alt="" />
        ) : (
          fallback ?? <i className="fa-regular fa-image" />
        )}
      </button>
      {src && !busy && (
        <button type="button" className="logo-remove" onClick={clear} title={`Remove ${label}`} aria-label={`Remove ${label}`}>
          ×
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
      {error && <small className="form-err logo-err">{error}</small>}
    </span>
  );
}
