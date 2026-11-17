'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * In-app dialogs instead of the browser's alert / confirm / prompt.
 * <DialogHost /> is mounted once in the root layout; anywhere else:
 *
 *   if (!(await confirmDialog('Delete this?', { danger: true, confirmLabel: 'Delete' }))) return;
 *   await alertDialog('Saved.');
 *   const reason = await promptDialog('Reason (optional)'); // null when cancelled
 */
let show = null;
const pending = [];

function open(kind, message, opts = {}) {
  return new Promise((resolve) => {
    const dialog = { kind, message, ...opts, resolve };
    if (show) show(dialog);
    else pending.push(dialog);
  });
}

export const confirmDialog = (message, opts) => open('confirm', message, opts);
export const alertDialog = (message, opts) => open('alert', message, opts);
export const promptDialog = (message, opts) => open('prompt', message, opts);

export function DialogHost() {
  const [queue, setQueue] = useState([]);
  const [value, setValue] = useState('');
  const okRef = useRef(null);
  const inputRef = useRef(null);
  const current = queue[0];

  useEffect(() => {
    show = (d) => setQueue((q) => [...q, d]);
    if (pending.length) setQueue((q) => [...q, ...pending.splice(0)]);
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return undefined;
    setValue(current.defaultValue ?? '');
    const t = setTimeout(() => (current.kind === 'prompt' ? inputRef.current : okRef.current)?.focus(), 30);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
    };
  }, [current]);

  if (!current) return null;

  const close = (result) => {
    current.resolve(result);
    setQueue((q) => q.slice(1));
  };
  const cancelValue = current.kind === 'prompt' ? null : current.kind === 'confirm' ? false : undefined;
  const okValue = current.kind === 'prompt' ? value : current.kind === 'confirm' ? true : undefined;
  const title = current.title ?? (current.kind === 'alert' ? 'Notice' : current.kind === 'prompt' ? 'Please enter' : 'Are you sure?');

  return (
    <div
      className="dlg-layer"
      onMouseDown={(e) => e.target === e.currentTarget && close(cancelValue)}
      onKeyDown={(e) => e.key === 'Escape' && close(cancelValue)}
    >
      <form
        className="dlg-box"
        role={current.kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dlg-title"
        aria-describedby="dlg-msg"
        onSubmit={(e) => {
          e.preventDefault();
          close(okValue);
        }}
      >
        <h3 id="dlg-title">{title}</h3>
        <p id="dlg-msg" className="dlg-msg">{current.message}</p>
        {current.kind === 'prompt' && (
          current.multiline ? (
            <textarea ref={inputRef} className="dlg-input" rows={3} value={value} placeholder={current.placeholder ?? ''} onChange={(e) => setValue(e.target.value)} aria-label={title} />
          ) : (
            <input ref={inputRef} className="dlg-input" value={value} placeholder={current.placeholder ?? ''} onChange={(e) => setValue(e.target.value)} aria-label={title} />
          )
        )}
        <div className="dlg-actions">
          {current.kind !== 'alert' && (
            <button type="button" className="dlg-btn" onClick={() => close(cancelValue)}>{current.cancelLabel ?? 'Cancel'}</button>
          )}
          <button ref={okRef} type="submit" className={`dlg-btn ${current.danger ? 'danger' : 'primary'}`}>
            {current.confirmLabel ?? (current.kind === 'alert' ? 'OK' : current.kind === 'prompt' ? 'OK' : 'Yes')}
          </button>
        </div>
      </form>
    </div>
  );
}
