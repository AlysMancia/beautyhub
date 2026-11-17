'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const NEXT = { undefined: 'in', in: 'out', out: undefined };

/**
 * Searchable dropdown where each option cycles: click once = include,
 * twice = exclude, a third time = back to neutral. The list stays open so
 * you can pick several.
 *
 *   <IncludeExcludeSelect label="Brands" options={[{ id, name }]} value={{ 3: 'in', 7: 'out' }} onChange={setValue} />
 *
 * With nothing included, everything is in except the excluded ones.
 */
export default function IncludeExcludeSelect({ label, options, value, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const button = useRef(null);
  const panel = useRef(null);
  const listRef = useRef(null);

  const included = options.filter((o) => value[o.id] === 'in');
  const excluded = options.filter((o) => value[o.id] === 'out');
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? options.filter((o) => words.every((w) => o.name.toLowerCase().includes(w))) : options;

  const summary = [
    included.length ? (included.length === 1 ? `only ${included[0].name}` : `${included.length} included`) : '',
    excluded.length ? (excluded.length === 1 && !included.length ? `all but ${excluded[0].name}` : `${excluded.length} excluded`) : '',
  ].filter(Boolean).join(', ');

  const place = () => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    const up = below < 260 && r.top > below;
    setPos({ left: r.left, width: Math.max(r.width, 280), top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined, maxHeight: Math.min(380, Math.max(below, r.top) - 12) });
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
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

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const cycle = (o) => {
    if (!o) return;
    const next = { ...value };
    const state = NEXT[value[o.id]];
    if (state) next[o.id] = state;
    else delete next[o.id];
    onChange(next);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); cycle(shown[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); button.current?.focus(); }
  };

  return (
    <>
      <button
        type="button"
        ref={button}
        className={`ss-trigger ${className}`}
        onClick={() => {
          if (open) return setOpen(false);
          place();
          setQ('');
          setActive(0);
          setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className={`ss-value${summary ? '' : ' ph'}`}>{label}: {summary || 'all'}</span>
        <i className="fa-solid fa-chevron-down ss-caret" />
      </button>
      {open && pos &&
        createPortal(
          <div ref={panel} className="ss-panel ie-panel" style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}>
            <input
              autoFocus
              className="ss-search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={onKey}
              placeholder={`Search ${label.toLowerCase()}…`}
              aria-label={`Search ${label.toLowerCase()}`}
            />
            <div className="ie-help">
              <span><i className="fa-solid fa-check" /> once = include</span>
              <span><i className="fa-solid fa-ban" /> twice = exclude</span>
              {(included.length > 0 || excluded.length > 0) && (
                <button type="button" className="link-btn" onMouseDown={(e) => { e.preventDefault(); onChange({}); }}>Clear</button>
              )}
            </div>
            <ul ref={listRef} role="listbox" aria-multiselectable="true" tabIndex={-1} onKeyDown={onKey} style={{ maxHeight: pos.maxHeight - 76 }}>
              {shown.length === 0 && <li className="ss-empty">No matches</li>}
              {shown.map((o, i) => {
                const state = value[o.id];
                return (
                  <li
                    key={o.id}
                    role="option"
                    aria-selected={state === 'in'}
                    data-active={i === active}
                    className={`${i === active ? 'active' : ''}${state ? ` ie-${state}` : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); cycle(o); }}
                  >
                    <span>{o.name}</span>
                    {state === 'in' && <i className="fa-solid fa-check" title="Included" />}
                    {state === 'out' && <i className="fa-solid fa-ban" title="Excluded" />}
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
