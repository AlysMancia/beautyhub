'use client';

import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import SearchSelect from '../components/SearchSelect';
import { api, storeHref, useSession } from '../lib/api';
import { money } from '../lib/format';
import { useServerList } from '../lib/useServerList';

const TYPES = { seller: 'Seller', customer: 'Customer', admin: 'Admin' };
const TABS = [['', 'All'], ['seller', 'Sellers'], ['customer', 'Customers'], ['admin', 'Admins']];
const day = (d) => new Date(d).toLocaleDateString('en-PH', { dateStyle: 'medium' });

/** Name / username / email / phone fields, shared by "new" and "edit". */
function ProfileFields({ form, set }) {
  return (
    <>
      <label>
        Full name
        <input className="dash-input" value={form.name} onChange={set('name')} required maxLength={255} />
      </label>
      <label>
        Username
        <input className="dash-input" value={form.username} onChange={set('username')} required pattern="[A-Za-z0-9_.]{3,30}" title="3-30 letters, numbers, _ or ." />
      </label>
      <label>
        Email
        <input className="dash-input" type="email" value={form.email} onChange={set('email')} required />
      </label>
      <label>
        Phone
        <input className="dash-input" value={form.phone} onChange={set('phone')} maxLength={30} />
      </label>
    </>
  );
}

function EditAccount({ account, me, onClose, onChanged }) {
  const [form, setForm] = useState({ name: account.name ?? '', username: account.username ?? '', email: account.email ?? '', phone: account.phone ?? '' });
  const [password, setPassword] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const self = account.id === me.id;

  const call = async (key, fn, data, done, close = false) => {
    setBusy(key);
    setError('');
    setMsg('');
    const result = await api(fn, { id: account.id, ...data });
    setBusy('');
    if (!result.success) return setError(result.message);
    setMsg(done);
    onChanged();
    if (close) onClose();
  };

  return (
    <Modal title={account.name || account.username} subtitle={`${TYPES[account.account_type]} · joined ${day(account.created_at)}${account.code ? ` · code ${account.code}` : ''}`} onClose={onClose} width={620}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); call('save', 'admin_update_user', form, 'Saved.'); }}>
        <ProfileFields form={form} set={set} />
        <div className="form-actions span-2">
          <button type="submit" className="dash-btn" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save details'}</button>
        </div>
      </form>

      <hr className="modal-rule" />
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); call('pw', 'admin_set_password', { password }, 'Password changed. They were logged out everywhere.').then(() => setPassword('')); }}>
        <label className="span-2">
          New password
          <span className="inline-row">
            <input className="dash-input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} placeholder="At least 6 characters" autoComplete="new-password" />
            <button type="submit" className="dash-btn ghost" disabled={!!busy || password.length < 6}>{busy === 'pw' ? 'Saving…' : 'Set password'}</button>
          </span>
          {account.has_password === false && <small className="muted">This customer was added by a seller and has no password yet.</small>}
        </label>
      </form>

      {!self && (
        <>
          <hr className="modal-rule" />
          <div className="admin-danger">
            <div>
              <strong>{account.is_active ? 'Turn off this account' : 'Turn this account back on'}</strong>
              <p className="muted">
                {account.is_active
                  ? `They can't log in${account.account_type === 'seller' ? ' and their store page is hidden' : ''}. Nothing is deleted.`
                  : 'They can log in again.'}
              </p>
            </div>
            <button
              type="button"
              className={`dash-btn ${account.is_active ? 'ghost danger' : ''}`}
              disabled={!!busy}
              onClick={() => call('active', 'admin_set_active', { active: account.is_active ? '0' : '1' }, account.is_active ? 'Account turned off.' : 'Account turned on.', true)}
            >
              {account.is_active ? 'Turn off' : 'Turn on'}
            </button>
          </div>
          <div className="admin-danger">
            <div>
              <strong>Delete for good</strong>
              <p className="muted">
                {account.account_type === 'seller'
                  ? 'Deletes the seller, their store, products, invoices and photos. This cannot be undone.'
                  : 'Deletes the account. Their past invoices stay with the stores. This cannot be undone.'}
              </p>
              <input className="dash-input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={`Type ${account.username} to confirm`} />
            </div>
            <button
              type="button"
              className="dash-btn danger"
              disabled={!!busy || confirmName.toLowerCase() !== String(account.username).toLowerCase()}
              onClick={() => call('del', 'admin_delete_user', { confirm: confirmName }, 'Deleted.', true)}
            >
              {busy === 'del' ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </>
      )}

      {msg && <p className="form-ok" style={{ marginLeft: 0 }}>{msg}</p>}
      {error && <p className="dash-error">{error}</p>}
    </Modal>
  );
}

function NewAccount({ onClose, onCreated }) {
  const [form, setForm] = useState({ account_type: 'seller', name: '', username: '', email: '', phone: '', password: '', store_name: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const result = await api('admin_create_user', form);
    setBusy(false);
    if (!result.success) return setError(result.message);
    onCreated();
    onClose();
  };

  return (
    <Modal title="New account" onClose={onClose} width={620}>
      <form className="form-grid" onSubmit={save}>
        <label>
          Account type
          <SearchSelect className="dash-select full" value={form.account_type} onChange={set('account_type')} aria-label="Account type">
            <option value="seller">Seller (gets a store)</option>
            <option value="customer">Customer</option>
            <option value="admin">Admin</option>
          </SearchSelect>
        </label>
        {form.account_type === 'seller' ? (
          <label>
            Store name
            <input className="dash-input" value={form.store_name} onChange={set('store_name')} required maxLength={120} />
          </label>
        ) : <span />}
        <ProfileFields form={form} set={set} />
        <label className="span-2">
          Password
          <input className="dash-input" type="text" value={form.password} onChange={set('password')} minLength={6} required autoComplete="new-password" placeholder="At least 6 characters" />
        </label>
        {error && <p className="dash-error span-2">{error}</p>}
        <div className="form-actions span-2">
          <button type="submit" className="dash-btn" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          <button type="button" className="dash-btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminPage() {
  const { user } = useSession();
  const [overview, setOverview] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const list = useServerList('admin_list_users', { q: '', type: '', status: '' }, { perPage: 25 });
  const { data, filters, setFilter } = list;

  const loadOverview = () => api('admin_overview').then((d) => d.success && setOverview(d));
  useEffect(() => {
    loadOverview();
  }, []);
  const refresh = () => {
    list.reload();
    loadOverview();
  };

  const typeCount = (t) => Number(overview?.types.find((x) => x.account_type === t)?.total ?? 0);
  const offCount = overview?.types.reduce((s, x) => s + Number(x.off), 0) ?? 0;

  return (
    <>
      <header className="dash-top compact">
        <h1>Accounts</h1>
        <p className="muted head-note">Every seller, customer and admin on the site.</p>
        <div className="top-actions">
          <button type="button" className="dash-btn" onClick={() => setCreating(true)}>+ New account</button>
        </div>
      </header>

      {overview && (
        <div className="kpi-grid admin-kpis">
          <article className="card"><h4>Sellers</h4><strong>{typeCount('seller')}</strong><small className="muted">{overview.stores} store{overview.stores === 1 ? "" : "s"}</small></article>
          <article className="card"><h4>Customers</h4><strong>{typeCount('customer')}</strong></article>
          <article className="card"><h4>Admins</h4><strong>{typeCount('admin')}</strong>{offCount > 0 && <small className="muted">{offCount} account{offCount === 1 ? '' : 's'} turned off</small>}</article>
          <article className="card"><h4>Sales (all stores)</h4><strong>{money(overview.sales.total)}</strong><small className="muted">{overview.sales.invoices} confirmed invoices</small></article>
        </div>
      )}

      {list.error && <p className="dash-error">{list.error}</p>}

      <article className="card list-card" style={{ marginTop: 14 }}>
        <div className="toolbar">
          <div className="seg">
            {TABS.map(([v, l]) => (
              <button key={v} type="button" className={filters.type === v ? 'on' : ''} onClick={() => setFilter('type', v)}>{l}</button>
            ))}
          </div>
          <SearchSelect className="dash-select" value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
            <option value="">Active or off</option>
            <option value="active">Active</option>
            <option value="off">Turned off</option>
          </SearchSelect>
          <input className="dash-input" placeholder="Search name, username, email, code or store" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          <Pager list={list} label="accounts" sizes={[25, 50, 100]} />
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.users.length === 0 ? (
          <div className="empty-state"><p className="muted">No accounts match.</p></div>
        ) : (
          <div className="table-scroll">
            <table className="dash-table clickable dense">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email / phone</th>
                  <th>Type</th>
                  <th>Store</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} onClick={() => setEditing(u)} className={u.is_active ? '' : 'row-off'}>
                    <td>
                      <strong>{u.name || '—'}</strong>
                      <small>@{u.username || '—'}{u.code ? ` · ${u.code}` : ''}{u.id === user?.id ? ' · you' : ''}</small>
                    </td>
                    <td>{u.email}{u.phone && <small>{u.phone}</small>}</td>
                    <td><span className={`type-pill ${u.account_type}`}>{TYPES[u.account_type]}</span></td>
                    <td>
                      {u.store_slug ? (
                        <a href={storeHref(u.store_slug)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{u.store_name}</a>
                      ) : u.account_type === 'customer' ? (
                        <span className="muted">{u.store_count} store{u.store_count === 1 ? '' : 's'}</span>
                      ) : '—'}
                    </td>
                    <td>{day(u.created_at)}</td>
                    <td>
                      <span className={`status-pill ${u.is_active ? 'confirmed' : 'cancelled'}`}>{u.is_active ? 'Active' : 'Off'}</span>
                      {u.has_password === false && <small>no password yet</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager list={list} label="accounts" sizes={[]} className="bottom" />
      </article>

      {editing && user && <EditAccount key={editing.id} account={editing} me={user} onClose={() => setEditing(null)} onChanged={refresh} />}
      {creating && <NewAccount onClose={() => setCreating(false)} onCreated={refresh} />}
    </>
  );
}
