'use client';

import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Flattens <option> children (including arrays, fragments and conditionals) into [{value, label, disabled}]. */
function readOptions(children) {
  const out = [];
  const walk = (nodes) =>
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === 'option') {
        const label = Children.toArray(child.props.children).join('');
        out.push({ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled });
      } else if (child.props?.children) {
        walk(child.props.children);
      }
    });
  walk(children);
  return out;
}

/**
 * Searchable dropdown (like Select2). Works as a drop-in for <select>:
 *   <SearchSelect value={x} onChange={(e) => setX(e.target.value)} className="dash-select">
 *     <option value="">All brands</option> …
 *   </SearchSelect>
 * Type to filter, ↑/↓ to move, Enter to pick, Esc to close.
 * The list opens in a layer above the page, so it isn't cut off inside tables or pop-ups.
 */
export default function SearchSelect({ value, onChange, children, className = '', disabled, placeholder, 'aria-label': ariaLabel, id, searchPlaceholder = 'Type to search…' }) {
  const options = useMemo(() => readOptions(children), [children]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const button = useRef(null);
  const panel = useRef(null);
  const listRef = useRef(null);

  const current = options.find((o) => o.value === String(value ?? ''));
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? options.filter((o) => words.every((w) => o.label.toLowerCase().includes(w))) : options;

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const height = Math.min(320, Math.max(below, r.top) - 12);
    const up = below < 220 && r.top > below;
    setPos({ left: r.left, width: Math.max(r.width, 220), top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined, maxHeight: height });
  };

  const openList = () => {
    if (disabled) return;
    place();
    setQ('');
    setActive(Math.max(0, options.findIndex((o) => o.value === String(value ?? ''))));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => place();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!panel.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (o) => {
    if (!o || o.disabled) return;
    setOpen(false);
    button.current?.focus();
    if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value } });
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); button.current?.focus(); }
  };

  return (
    <>
      <button
        type="button"
        id={id}
        ref={button}
        className={`ss-trigger ${className}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
          // Start typing on a closed dropdown to search.
          else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { openList(); setQ(e.key); }
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={`ss-value${current ? '' : ' ph'}`}>{current?.label ?? placeholder ?? 'Choose…'}</span>
        <i className="fa-solid fa-chevron-down ss-caret" />
      </button>
      {open && pos &&
        createPortal(
          <div ref={panel} className="ss-panel" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}>
            {options.length > 6 && (
              <input
                autoFocus
                className="ss-search"
                value={q}
                onChange={(e) => { setQ(e.target.value); setActive(0); }}
                onKeyDown={onKey}
                placeholder={searchPlaceholder}
                aria-label="Search options"
              />
            )}
            <ul ref={listRef} role="listbox" tabIndex={-1} onKeyDown={onKey} style={{ maxHeight: pos.maxHeight - (options.length > 6 ? 44 : 0) }} autoFocus={options.length <= 6}>
              {shown.length === 0 && <li className="ss-empty">No matches</li>}
              {shown.map((o, i) => (
                <li
                  key={`${o.value}-${i}`}
                  role="option"
                  aria-selected={o.value === String(value ?? '')}
                  aria-disabled={o.disabled}
                  data-active={i === active}
                  className={`${i === active ? 'active' : ''}${o.value === String(value ?? '') ? ' selected' : ''}${o.disabled ? ' disabled' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                >
                  {o.label || ' '}
                  {o.value === String(value ?? '') && <i className="fa-solid fa-check" />}
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
