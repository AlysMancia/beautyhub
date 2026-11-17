'use client';

import SearchSelect from '../../components/SearchSelect';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import Pager from '../../components/Pager';
import { api } from '../../lib/api';
import { formatCode, money } from '../../lib/format';
import { useServerList } from '../../lib/useServerList';
import { confirmDialog } from '../../components/Dialogs';

/**
 * Link a hand-added customer to the account they made themselves, using the
 * code shown on their account page.
 */
function LinkAccount({ member, onLinked }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const link = async () => {
    setError('');
    if (code.replace(/[^a-z0-9]/gi, '').length !== 8) return setError('The code has 8 letters/numbers, e.g. K7M2-QX9P.');
    if (!(await confirmDialog(`Their orders, tier and notes move to the account with code ${code.toUpperCase()}.`, { title: `Link ${member.name}?`, confirmLabel: 'Link account' }))) return;
    setBusy(true);
    const result = await api('link_customer_account', { member_id: member.id, code });
    setBusy(false);
    if (!result.success) return setError(result.message);
    onLinked(result);
  };

  return (
    <section className="link-account">
      <h4><i className="fa-solid fa-link" /> Link to their account</h4>
      <p className="muted">
        If {member.name} signed up on their own, ask for the <strong>account code</strong> on their account page and enter it here.
        Their orders, tier and notes move to that account.
      </p>
      <div className="link-row">
        <input
          className="dash-input code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); link(); } }}
          placeholder="K7M2-QX9P"
          maxLength={9}
          aria-label="Account code"
        />
        <button type="button" className="dash-btn" onClick={link} disabled={busy || !code.trim()}>
          {busy ? 'Linking…' : 'Link account'}
        </button>
      </div>
      {error && <p className="dash-error">{error}</p>}
    </section>
  );
}

/** Add a customer by hand, or edit one. `member` = existing row (edit) or null (add). Shown in a pop-up. */
function CustomerForm({ member, roles, onDone, onCancel }) {
  const editing = !!member;
  const locked = editing && member.has_login; // they manage their own name/email/phone
  const [form, setForm] = useState(
    editing
      ? { name: member.name, phone: member.phone ?? '', email: member.email ?? '', role_id: String(member.role_id ?? ''), notes: member.notes ?? '' }
      : { name: '', phone: '', email: '', notes: '', role_id: String(roles.find((r) => r.is_default)?.id ?? '') }
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Enter the customer name.');
    setBusy(true);
    const result = editing
      ? await api('update_customer', { member_id: member.id, ...form })
      : await api('add_customer', form);
    if (result.success && editing && String(member.role_id ?? '') !== form.role_id && form.role_id) {
      await api('set_member_role', { member_id: member.id, role_id: form.role_id });
    }
    setBusy(false);
    if (!result.success) return setError(result.message);
    onDone(result);
  };

  return (
    <Modal
      title={editing ? `Edit ${member.name}` : 'Add a customer'}
      subtitle={
        locked
          ? `Has their own login${member.code ? ` · code ${formatCode(member.code)}` : ''}. You can change their tier and notes.`
          : editing
            ? 'Added by you — no login yet.'
            : 'For people who buy by chat, phone or walk in.'
      }
      onClose={onCancel}
    >
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="span-2">
            Name *
            <input className="dash-input" value={form.name} onChange={set('name')} maxLength={120} disabled={locked} />
          </label>
          <label>
            Phone
            <input className="dash-input" value={form.phone} onChange={set('phone')} maxLength={40} inputMode="tel" placeholder="09xx xxx xxxx" disabled={locked} />
          </label>
          <label>
            Email
            <input className="dash-input" type="email" value={form.email} onChange={set('email')} placeholder="Optional" disabled={locked} />
          </label>
          <label>
            Tier
            <SearchSelect className="dash-select full" value={form.role_id} onChange={set('role_id')}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.tier_level}. {r.name}{r.is_default ? ' (default)' : ''}</option>)}
            </SearchSelect>
          </label>
          <label className="span-2">
            Notes (only you see these)
            <textarea className="dash-input" rows={2} value={form.notes} onChange={set('notes')} maxLength={2000} placeholder="e.g. Pays by GCash, delivers to Capas on Fridays" />
          </label>
        </div>
        {!editing && (
          <p className="muted small-note">
            They can’t log in until they sign up with the same email, or you link their account with their code. Either way they keep their tier and orders.
          </p>
        )}
        {error && <p className="dash-error">{error}</p>}
        <div className="form-actions modal-actions">
          <button className="dash-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}</button>
          <button className="dash-btn ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>

      {editing && !member.has_login && <LinkAccount member={member} onLinked={(r) => onDone({ ...r, linked: true })} />}
    </Modal>
  );
}

export default function CustomersPage() {
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [formFor, setFormFor] = useState(null); // null = closed, 'new', or a member row
  const list = useServerList('list_members', { q: '', role_id: '' }, { perPage: 50 });
  const { data, filters, setFilter } = list;

  const loadRoles = () => api('list_roles').then((r) => (r.success ? setRoles(r.roles) : setError(r.message)));
  useEffect(() => {
    loadRoles();
  }, []);

  const setMemberRole = async (memberId, roleId) => {
    const result = await api('set_member_role', { member_id: memberId, role_id: roleId });
    if (!result.success) setError(result.message);
    list.reload();
  };

  const removeMember = async (member) => {
    if (!(await confirmDialog('They can join again from your store link.', { title: `Remove ${member.name}?`, confirmLabel: 'Remove', danger: true }))) return;
    const result = await api('remove_member', { member_id: member.id });
    if (!result.success) setError(result.message);
    list.reload();
  };

  const noFilters = !filters.q && !filters.role_id;

  return (
    <>
      <header className="dash-top compact">
        <h1>Customers</h1>
        <p className="muted head-note">
          Their tier decides the prices they see and pay. <Link href="/dashboard/settings/tiers">Manage tiers</Link>
        </p>
        <div className="top-actions">
          <button type="button" className="dash-btn" onClick={() => { setFormFor('new'); setMessage(''); }} disabled={!roles.length}>
            + Add customer
          </button>
        </div>
      </header>

      {(error || list.error) && <p className="dash-error">{error || list.error}</p>}
      {message && <p className="form-ok" style={{ marginLeft: 0 }}>{message}</p>}

      {formFor && (
        <CustomerForm
          key={formFor === 'new' ? 'new' : formFor.id}
          member={formFor === 'new' ? null : formFor}
          roles={roles}
          onCancel={() => setFormFor(null)}
          onDone={(result) => {
            setMessage(
              result.linked
                ? `Linked to ${result.name}'s account.`
                : formFor === 'new'
                ? result.linked_existing
                  ? 'That email already had an account — they are now in your store.'
                  : 'Customer added.'
                : 'Customer updated.'
            );
            setFormFor(null);
            list.reload();
            loadRoles();
          }}
        />
      )}

      <article className="card list-card">
        <div className="toolbar">
          <input className="dash-input" placeholder="Search name, phone, username or email" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          <SearchSelect className="dash-select" value={filters.role_id} onChange={(e) => setFilter('role_id', e.target.value)} aria-label="Filter by tier">
            <option value="">All tiers</option>
            {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.tier_level}. {r.name} ({r.member_count})</option>)}
          </SearchSelect>
          <Pager list={list} label="customers" sizes={[50, 100, 200]} />
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.members.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>
            {noFilters ? 'No customers yet. Add one, or share your store link from the Dashboard.' : 'No customers match.'}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="dash-table dense">
              <thead>
                <tr><th>Customer</th><th>Contact</th><th>Tier</th><th className="num">Orders</th><th className="num">Spent</th><th>Joined</th><th /></tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name}
                      {!m.has_login && <span className="default-tag no-login" title="Added by you. No login until they sign up with this email.">NO LOGIN</span>}
                      <small>{m.has_login ? `@${m.username} · ${formatCode(m.code)}` : 'Added by you'}{m.notes && ` · ${m.notes}`}</small>
                    </td>
                    <td>
                      {m.phone || <span className="muted">—</span>}
                      {m.email && <small>{m.email}</small>}
                    </td>
                    <td>
                      <SearchSelect className="dash-select" value={m.role_id ?? ''} onChange={(e) => setMemberRole(m.id, e.target.value)} aria-label={`Tier for ${m.name}`}>
                        {m.role_id == null && <option value="">No tier</option>}
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.tier_level}. {r.name}</option>)}
                      </SearchSelect>
                    </td>
                    <td className="num">{m.orders}</td>
                    <td className="num">{money(m.spent)}</td>
                    <td>{new Date(m.joined_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Edit" onClick={() => { setFormFor(m); setMessage(''); }}>
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button className="icon-btn" title="Remove from store" onClick={() => removeMember(m)}>
                        <i className="fa-solid fa-user-minus" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager list={list} label="customers" sizes={[]} className="bottom" />
      </article>
    </>
  );
}
