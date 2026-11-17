'use client';

import { useEffect, useRef } from 'react';

/**
 * Pop-up window. Closes on Esc, on the × button, or by clicking outside.
 *   <Modal title="Edit customer" onClose={...}>…</Modal>
 */
export default function Modal({ title, subtitle, onClose, children, width = 720 }) {
  const box = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the first field for keyboard users.
    box.current?.querySelector('input:not([disabled]), select, textarea, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="modal-layer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ width: `min(${width}px, 100%)` }} role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <header className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <i className="fa-solid fa-xmark" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
