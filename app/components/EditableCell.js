'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A value you can click to edit in place (products list).
 * Enter or clicking away saves, Esc cancels.
 *   <EditableCell value="Glowbomb" display={<b>Glowbomb</b>} onSave={async (v) => ({ success, message })} />
 * `inputMode`: 'text' | 'numeric' | 'decimal'. `align`: 'left' | 'right'.
 */
export default function EditableCell({ value, display, onSave, inputMode = 'text', align = 'left', title = 'Click to edit', disabled, disabledTitle, width }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState(''); // '' | 'saving' | 'saved' | 'error'
  const [error, setError] = useState('');
  const input = useRef(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const start = () => {
    if (disabled) return;
    setDraft(value ?? '');
    setError('');
    setEditing(true);
  };

  const save = async () => {
    if (state === 'saving') return;
    const next = String(draft).trim();
    if (next === String(value ?? '').trim()) {
      setEditing(false);
      return;
    }
    setState('saving');
    const result = await onSave(next);
    if (result?.success) {
      setState('saved');
      setEditing(false);
      setTimeout(() => setState(''), 1200);
    } else {
      setState('error');
      setError(result?.message || 'Could not save.');
      input.current?.focus();
    }
  };

  if (editing) {
    return (
      <span className={`ec-edit ${align}`}>
        <input
          ref={input}
          className={`dash-input ec-input${state === 'error' ? ' bad' : ''}`}
          style={width ? { width } : undefined}
          value={draft}
          inputMode={inputMode}
          disabled={state === 'saving'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') { e.preventDefault(); setState(''); setEditing(false); }
          }}
          aria-label={title}
        />
        {state === 'saving' && <i className="fa-solid fa-spinner fa-spin ec-icon" />}
        {error && <small className="ec-error">{error}</small>}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`ec-view ${align}${disabled ? ' locked' : ''}${state === 'saved' ? ' saved' : ''}`}
      onClick={start}
      title={disabled ? disabledTitle : title}
    >
      {display ?? (value || <span className="muted">—</span>)}
      {!disabled && <i className="fa-solid fa-pen ec-hint" />}
      {state === 'saved' && <i className="fa-solid fa-check ec-ok" />}
    </button>
  );
}
