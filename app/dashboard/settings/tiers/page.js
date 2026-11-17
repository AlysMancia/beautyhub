'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { confirmDialog } from '../../../components/Dialogs';

function TierRow({ role, index, count, defaultName, onChanged, onError }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(role.name);

  const call = async (fn, data) => {
    const result = await api(fn, { role_id: role.id, ...data });
    if (!result.success) onError(result.message);
    else onChanged();
    return result.success;
  };

  const save = async (e) => {
    e.preventDefault();
    if (name.trim() === role.name) return setEditing(false);
    if (await call('rename_role', { name: name.trim() })) setEditing(false);
  };

  const remove = async () => {
    const note = role.member_count ? `\n\n${role.member_count} customer(s) will be moved to "${defaultName}".` : '';
    if (await confirmDialog(`Its prices are deleted too.${note}`, { title: `Delete the "${role.name}" tier?`, confirmLabel: 'Delete', danger: true })) call('delete_role');
  };

  return (
    <li className="tier-row">
      <span className="tier-badge">{index + 1}</span>
      {editing ? (
        <form onSubmit={save} style={{ display: 'flex', gap: 6, flex: 1 }}>
          <input className="dash-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
          <button className="dash-btn small" type="submit">Save</button>
          <button className="dash-btn small ghost" type="button" onClick={() => { setName(role.name); setEditing(false); }}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          <span className="role-name">
            {role.name}
            {role.is_default && <span className="default-tag">DEFAULT</span>}
            {role.is_cost && <span className="default-tag cost">MY COST</span>}
            {role.is_srp && <span className="default-tag srp">SRP</span>}
            <small className="muted">{role.member_count} customer{role.member_count === 1 ? '' : 's'}</small>
          </span>
          <span className="tier-actions">
            <label className="srp-check" title="This tier's price is the SRP / retail price. Members of other tiers see it next to their own price.">
              <input type="checkbox" checked={role.is_srp} disabled={role.is_srp} onChange={() => call('set_srp_role')} />
              SRP
            </label>
            <button className="icon-btn" title="Move up (better price)" disabled={index === 0} onClick={() => call('move_role', { direction: 'up' })}>
              <i className="fa-solid fa-arrow-up" />
            </button>
            <button className="icon-btn" title="Move down (toward retail)" disabled={index === count - 1} onClick={() => call('move_role', { direction: 'down' })}>
              <i className="fa-solid fa-arrow-down" />
            </button>
            <button className={`icon-btn${role.is_cost ? ' on' : ''}`} title="This tier's price is what I pay (my cost)" disabled={role.is_cost} onClick={() => call('set_cost_role')}>
              <i className="fa-solid fa-coins" />
            </button>
            <button className={`icon-btn${role.is_default ? ' on' : ''}`} title="Default tier for new customers and visitors" disabled={role.is_default} onClick={() => call('set_default_role')}>
              <i className={role.is_default ? 'fa-solid fa-star' : 'fa-regular fa-star'} />
            </button>
            <button className="icon-btn" title="Rename" onClick={() => setEditing(true)}>
              <i className="fa-solid fa-pen" />
            </button>
            <button className="icon-btn" title={role.is_default ? 'Make another tier the default first' : 'Delete'} disabled={role.is_default} onClick={remove}>
              <i className="fa-solid fa-trash" />
            </button>
          </span>
        </>
      )}
    </li>
  );
}

export default function TiersPage() {
  const [roles, setRoles] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await api('list_roles');
    if (r.success) setRoles(r.roles);
    else setError(r.message);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changed = () => {
    setError('');
    load();
  };

  const addRole = async (e) => {
    e.preventDefault();
    if (!newRole.trim()) return;
    const result = await api('create_role', { name: newRole.trim() });
    if (!result.success) return setError(result.message);
    setNewRole('');
    changed();
  };

  const defaultName = roles?.find((r) => r.is_default)?.name ?? 'the default tier';

  return (
    <>
      <header className="dash-top">
        <div>
          <h1>Customer tiers</h1>
          <p>Your price levels, from the best price (1) down to retail. Each customer has one tier.</p>
        </div>
      </header>

      {error && <p className="dash-error">{error}</p>}

      <div className="settings-narrow">
        <article className="card">
          <h3>Tiers</h3>
          <div className="tier-help">
            <p><strong>How prices work:</strong> a customer pays their tier&apos;s price. If a product has no price for that tier, they pay the next tier below in this list (e.g. CD → Reseller → Retailer). They never get a better tier&apos;s price.</p>
            <p>
              <i className="fa-solid fa-star" /> <strong>Default</strong>: new customers and visitors.{' '}
              <i className="fa-solid fa-coins" /> <strong>My cost</strong>: what you pay, used for profit.{' '}
              <i className="fa-solid fa-arrow-up" /><i className="fa-solid fa-arrow-down" /> change the order.
            </p>
          </div>
          {!roles ? (
            <p className="muted">Loading…</p>
          ) : (
            <ul className="role-list">
              {roles.map((role, i) => (
                <TierRow key={role.id} role={role} index={i} count={roles.length} defaultName={defaultName} onChanged={changed} onError={setError} />
              ))}
            </ul>
          )}
          <form className="add-role" onSubmit={addRole}>
            <input className="dash-input" placeholder="New tier, e.g. Distributor" value={newRole} maxLength={60} onChange={(e) => setNewRole(e.target.value)} />
            <button className="dash-btn" type="submit">Add</button>
          </form>
          <p className="muted" style={{ margin: '8px 0 0' }}>New tiers are added at the bottom. Use the arrows to place them.</p>
        </article>
      </div>
    </>
  );
}
