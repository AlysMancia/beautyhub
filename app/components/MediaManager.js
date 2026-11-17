'use client';

import { useRef, useState } from 'react';
import { api, uploadFile } from '../lib/api';
import { confirmDialog } from './Dialogs';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';

/**
 * A product's cover photo, other photos and videos.
 * Upload several at once; tap a photo's star to make it the cover.
 */
export default function MediaManager({ productId, media, onChange, onSelect, selectedId }) {
  // With onSelect, clicking a tile selects it (shown elsewhere) instead of opening a lightbox.
  const view = (m) => (onSelect ? onSelect(m) : setPreview(m));
  const [uploads, setUploads] = useState([]); // [{ name, progress }]
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const photoInput = useRef(null);
  const videoInput = useRef(null);

  const photos = media.filter((m) => m.kind === 'image');
  const videos = media.filter((m) => m.kind === 'video');

  const send = async (files) => {
    setError('');
    for (const file of files) {
      setUploads((u) => [...u, { name: file.name, progress: 0 }]);
      const result = await uploadFile('upload_product_media', { product_id: productId }, file, (p) =>
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, progress: p } : x)))
      );
      setUploads((u) => u.filter((x) => x.name !== file.name));
      if (result.success) onChange(result.media);
      else setError(`${file.name}: ${result.message}`);
    }
  };

  const pick = (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (files.length) send(files);
  };

  const act = async (fn, m, confirmText) => {
    if (confirmText && !(await confirmDialog(confirmText, { confirmLabel: 'Yes, continue', danger: /delete|remove/i.test(confirmText) }))) return;
    const result = await api(fn, { id: m.id });
    if (result.success) onChange(result.media);
    else setError(result.message);
  };

  return (
    <div className="media-manager">
      <div
        className="media-grid"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          send([...e.dataTransfer.files]);
        }}
      >
        {photos.map((m) => (
          <figure key={m.id} className={`media-tile${m.is_cover ? ' cover' : ''}${selectedId === m.id ? ' selected' : ''}`}>
            <button type="button" className="media-open" onClick={() => view(m)} aria-label="View photo">
              <img src={m.thumb_path || m.path} alt="" loading="lazy" />
            </button>
            {m.is_cover && <span className="cover-badge">Cover</span>}
            <span className="media-actions">
              {!m.is_cover && (
                <button type="button" title="Make cover photo" onClick={() => act('set_product_cover', m)}>
                  <i className="fa-regular fa-star" />
                </button>
              )}
              <button type="button" title="Delete" onClick={() => act('delete_product_media', m, 'Delete this photo?')}>
                <i className="fa-solid fa-trash" />
              </button>
            </span>
          </figure>
        ))}
        {videos.map((m) => (
          <figure key={m.id} className={`media-tile video${selectedId === m.id ? ' selected' : ''}`}>
            <button type="button" className="media-open" onClick={() => view(m)} aria-label="Play video">
              <video src={`${m.path}#t=0.5`} preload="metadata" muted />
              <i className="fa-solid fa-circle-play play" />
            </button>
            <span className="media-actions">
              <button type="button" title="Delete" onClick={() => act('delete_product_media', m, 'Delete this video?')}>
                <i className="fa-solid fa-trash" />
              </button>
            </span>
          </figure>
        ))}
        {uploads.map((u) => (
          <figure key={u.name} className="media-tile uploading">
            <span className="up-name">{u.name}</span>
            <span className="up-bar"><span style={{ width: `${Math.round(u.progress * 100)}%` }} /></span>
          </figure>
        ))}
        <button type="button" className="media-add" onClick={() => photoInput.current?.click()}>
          <i className="fa-solid fa-camera" />
          <span>{photos.length ? 'Add photos' : 'Add cover photo'}</span>
        </button>
        <button type="button" className="media-add" onClick={() => videoInput.current?.click()}>
          <i className="fa-solid fa-video" />
          <span>Add video</span>
          <small>optional</small>
        </button>
      </div>
      <input ref={photoInput} type="file" accept={IMAGE_ACCEPT} multiple hidden onChange={pick} />
      <input ref={videoInput} type="file" accept={VIDEO_ACCEPT} hidden onChange={pick} />
      <p className="muted small-note">
        JPG, PNG or WebP up to 12 MB (12 photos). MP4/WebM/MOV video up to 60 MB (3 videos). The first photo is the cover — tap ☆ to change it. You can also drag files here.
      </p>
      {error && <p className="dash-error">{error}</p>}

      {preview && (
        <div className="lightbox" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          {preview.kind === 'video' ? (
            <video src={preview.path} controls autoPlay onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={preview.path} alt="" />
          )}
          <button type="button" className="lightbox-close" aria-label="Close">×</button>
        </div>
      )}
    </div>
  );
}
