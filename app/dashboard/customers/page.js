'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Pager from '../../components/Pager';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useServerList } from '../../lib/useServerList';

export default function CustomersPage() {
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const list = useServerList('list_members', { q: '', role_id: '' }, { perPage: 50 });
  const { data, filters, setFilter } = list;

  useEffect(() => {
    api('list_roles').then((r) => (r.success ? setRoles(r.roles) : setError(r.message)));
  }, []);

  const setMemberRole = async (memberId, roleId) => {
    const result = await api('set_member_role', { member_id: memberId, role_id: roleId });
    if (!result.success) setError(result.message);
    list.reload();
  };

  const removeMember = async (member) => {
    if (!window.confirm(`Remove ${member.name} from your store?`)) return;
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
      </header>

      {(error || list.error) && <p className="dash-error">{error || list.error}</p>}

      <article className="card list-card">
        <div className="toolbar">
          <input className="dash-input" placeholder="Search name, username or email" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          <select className="dash-select" value={filters.role_id} onChange={(e) => setFilter('role_id', e.target.value)} aria-label="Filter by tier">
            <option value="">All tiers</option>
            {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.tier_level}. {r.name} ({r.member_count})</option>)}
          </select>
          <Pager list={list} label="customers" sizes={[50, 100, 200]} />
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.members.length === 0 ? (
          <p className="muted" style={{ marginTop: 8 }}>
            {noFilters ? 'No customers yet. Share your store link from the Dashboard to get your first one.' : 'No customers match.'}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="dash-table dense">
              <thead>
                <tr><th>Customer</th><th>Email</th><th>Tier</th><th className="num">Orders</th><th className="num">Spent</th><th>Joined</th><th /></tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}<small>@{m.username}</small></td>
                    <td>{m.email}</td>
                    <td>
                      <select className="dash-select" value={m.role_id ?? ''} onChange={(e) => setMemberRole(m.id, e.target.value)} aria-label={`Tier for ${m.name}`}>
                        {m.role_id == null && <option value="">No tier</option>}
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.tier_level}. {r.name}</option>)}
                      </select>
                    </td>
                    <td className="num">{m.orders}</td>
                    <td className="num">{money(m.spent)}</td>
                    <td>{new Date(m.joined_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</td>
                    <td className="row-actions">
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
