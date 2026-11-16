'use client';

import { useState } from 'react';
import { api } from '../lib/api';

/** One input: text, or a checkbox (`type: 'checkbox'`, value '1' / ''). */
function Field({ f, value, onChange, autoFocus }) {
  if (f.type === 'checkbox') {
    return (
      <label className="check inline-check" title={f.help}>
        <input type="checkbox" checked={value === '1' || value === true} onChange={(e) => onChange(e.target.checked ? '1' : '')} />
        {f.placeholder}
      </label>
    );
  }
  return (
    <input
      className="dash-input"
      style={f.width ? { maxWidth: f.width } : undefined}
      value={value}
      placeholder={f.placeholder}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
    />
  );
}

/**
 * One editable list (brands, categories or units).
 * `fields`: [{ key, placeholder, width?, type?: 'checkbox' }]
 * `leading(item, reload)`: optional element before the name (e.g. a brand logo).
 * `badges(item)`: optional element after the name.
 */
export default function CatalogList({ title, hint, items, fields, label, saveFn, deleteFn, deleteNote, onChanged, onError, leading, badges }) {
  const toForm = (item) => Object.fromEntries(fields.map((f) => [f.key, f.type === 'checkbox' ? (item?.[f.key] ? '1' : '') : item?.[f.key] ?? '']));
  const [draft, setDraft] = useState(toForm(null));
  const [editing, setEditing] = useState(null); // { id, ...values }

  const save = async (values, id) => {
    const result = await api(saveFn, { ...values, id: id ?? '' });
    if (!result.success) {
      onError(result.message);
      return false;
    }
    onChanged();
    return true;
  };

  const add = async (e) => {
    e.preventDefault();
    if (!String(draft[fields[0].key]).trim()) return;
    if (await save(draft)) setDraft(toForm(null));
  };

  const remove = async (item) => {
    const note = item.product_count ? `\n\n${deleteNote(item.product_count)}` : '';
    if (!window.confirm(`Delete ${label(item)}?${note}`)) return;
    const result = await api(deleteFn, { id: item.id });
    if (!result.success) onError(result.message);
    onChanged();
  };

  return (
    <article className="card">
      <div className="list-head">
        <h3>{title}</h3>
        <p className="muted">{hint}</p>
      </div>
      <form className="add-role" onSubmit={add}>
        {fields.map((f) => (
          <Field key={f.key} f={f} value={draft[f.key]} onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))} />
        ))}
        <button className="dash-btn" type="submit">Add</button>
      </form>
      <ul className="role-list catalog-grid">
        {items.map((item) =>
          editing?.id === item.id ? (
            <li key={item.id} className="editing">
              <form
                className="inline-edit"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const { id, ...values } = editing;
                  if (await save(values, id)) setEditing(null);
                }}
              >
                {fields.map((f, i) => (
                  <Field key={f.key} f={f} value={editing[f.key]} autoFocus={i === 0} onChange={(v) => setEditing((ed) => ({ ...ed, [f.key]: v }))} />
                ))}
                <button className="dash-btn small" type="submit">Save</button>
                <button className="dash-btn small ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            </li>
          ) : (
            <li key={item.id}>
              {leading?.(item)}
              <span className="role-name">
                {label(item)} {badges?.(item)}
              </span>
              <span className="count" title="Products">{item.product_count}</span>
              <button className="icon-btn" title="Edit" onClick={() => setEditing({ id: item.id, ...toForm(item) })}>
                <i className="fa-solid fa-pen" />
              </button>
              <button className="icon-btn" title="Delete" onClick={() => remove(item)}>
                <i className="fa-solid fa-trash" />
              </button>
            </li>
          )
        )}
        {items.length === 0 && <li className="muted">None yet.</li>}
      </ul>
    </article>
  );
}
