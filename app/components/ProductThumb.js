'use client';

import { useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '../lib/api';
import MediaManager from './MediaManager';

/**
 * Thumbnail in a product list.
 *  - No photo yet: click to pick photos; they upload right away (first = cover).
 *  - Has photos: click to view them large, add more, change the cover or delete.
 * `onChanged()` is called after any change so the list can refresh.
 */
export default function ProductThumb({ product, onChanged }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    for (const file of files) {
      const result = await uploadFile('upload_product_media', { product_id: product.id }, file);
      if (!result.success) {
        setError(result.message);
        break;
      }
    }
    setBusy(false);
    onChanged();
  };

  return (
    <>
      {product.cover ? (
        <button type="button" className="thumb-btn" onClick={() => setOpen(true)} title="View photos">
          <img src={product.cover} alt="" className="thumb" loading="lazy" />
          {product.media_count > 1 && <span className="thumb-count">{product.media_count}</span>}
        </button>
      ) : (
        <button type="button" className="thumb-btn add" onClick={() => input.current?.click()} title="Add photo" disabled={busy}>
          <span className="thumb empty">
            <i className={busy ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-camera'} />
          </span>
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={pick} />
      {error && <span className="thumb-err" title={error}><i className="fa-solid fa-triangle-exclamation" /></span>}
      {open && <MediaDialog product={product} onClose={() => { setOpen(false); onChanged(); }} />}
    </>
  );
}

/** Large view of a product's photos/videos with the add / cover / delete tools. */
function MediaDialog({ product, onClose }) {
  const [media, setMedia] = useState(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    api('get_product_media', { product_id: product.id }).then((d) => setMedia(d.success ? d.media : []));
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [product.id, onClose]);

  const current = media?.[Math.min(active, (media?.length ?? 1) - 1)];

  return (
    <div className="media-dialog-backdrop" onClick={onClose}>
      <div className="media-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Photos of ${product.name}`}>
        <header>
          <div>
            <strong>{product.name}</strong>
            <small className="muted"> · {product.brand}</small>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </header>
        {!media ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="media-dialog-body">
            <div className="media-stage">
              {!current ? (
                <span className="muted">No photos yet. Add some on the right.</span>
              ) : current.kind === 'video' ? (
                <video key={current.path} src={current.path} controls />
              ) : (
                <img src={current.path} alt="" />
              )}
            </div>
            <div className="media-side">
              <MediaManager
                productId={product.id}
                media={media}
                onChange={(m) => {
                  setMedia(m);
                  setActive(0);
                }}
                onSelect={(m) => setActive(media.findIndex((x) => x.id === m.id))}
                selectedId={current?.id}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
