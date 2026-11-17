'use client';

import Link from 'next/link';
import { useState } from 'react';
import { confirmDialog } from '../../components/Dialogs';
import { Attachment } from '../../components/HowToPay';
import Modal from '../../components/Modal';
import Pager from '../../components/Pager';
import SearchSelect from '../../components/SearchSelect';
import { api, uploadFile } from '../../lib/api';
import { money } from '../../lib/format';
import { useServerList } from '../../lib/useServerList';
import { useSeller } from '../SellerContext';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());

/** Preset periods → [from, to]. */
function periodRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case 'this_month': return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case 'last_month': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case 'last_30': return [iso(new Date(y, m, now.getDate() - 29)), today()];
    case 'this_year': return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    default: return ['', ''];
  }
}
const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

/** Add / edit one expense or income entry. */
function EntryModal({ entry, kind: startKind, categories, methods, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    id: entry?.id ?? '',
    kind: entry?.kind ?? startKind,
    category_id: entry?.category_id ? String(entry.category_id) : '',
    amount: entry ? Number(entry.amount).toFixed(2) : '',
    entry_date: entry?.entry_date ?? today(),
    description: entry?.description ?? '',
    payment_method_id: entry?.payment_method_id ? String(entry.payment_method_id) : '',
    reference: entry?.reference ?? '',
  }));
  const [file, setFile] = useState(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const cats = categories.filter((c) => c.kind === form.kind);
  const isExpense = form.kind === 'expense';

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = { ...form, remove_receipt: removeReceipt ? '1' : '' };
    const result = file ? await uploadFile('save_ledger_entry', data, file) : await api('save_ledger_entry', data);
    setBusy(false);
    if (!result.success) return setError(result.message);
    onSaved();
    onClose();
  };

  const remove = async () => {
    if (!(await confirmDialog(`${money(entry.amount)} · ${entry.category_name || 'No category'}`, { title: `Delete this ${entry.kind}?`, confirmLabel: 'Delete', danger: true }))) return;
    const result = await api('delete_ledger_entry', { id: entry.id });
    if (!result.success) return setError(result.message);
    onSaved();
    onClose();
  };

  return (
    <Modal title={entry ? `Edit ${isExpense ? 'expense' : 'income'}` : isExpense ? 'Add expense' : 'Add income'} onClose={onClose} width={560}>
      <form className="form-grid" onSubmit={save}>
        <div className="seg span-2 kind-seg">
          <button type="button" className={isExpense ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, kind: 'expense', category_id: '' }))}>
            <i className="fa-solid fa-arrow-up" /> Expense
          </button>
          <button type="button" className={!isExpense ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, kind: 'income', category_id: '' }))}>
            <i className="fa-solid fa-arrow-down" /> Income
          </button>
        </div>
        <label>
          Amount
          <input className="dash-input" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" required autoFocus />
        </label>
        <label>
          Date
          <input className="dash-input" type="date" value={form.entry_date} onChange={set('entry_date')} required />
        </label>
        <label className="span-2">
          <span>Category <Link href="/dashboard/settings/money" className="label-link">Manage categories</Link></span>
          <SearchSelect className="dash-select full" value={form.category_id} onChange={set('category_id')} aria-label="Category">
            <option value="">No category</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SearchSelect>
        </label>
        <label className="span-2">
          Description
          <input className="dash-input" value={form.description} onChange={set('description')} placeholder={isExpense ? 'e.g. Tricycle to the supplier' : 'e.g. Delivery fee from Ana'} />
        </label>
        <label>
          {isExpense ? 'Paid with' : 'Received via'}
          <SearchSelect className="dash-select full" value={form.payment_method_id} onChange={set('payment_method_id')} aria-label="Payment method">
            <option value="">—</option>
            {methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </SearchSelect>
        </label>
        <label>
          Reference no.
          <input className="dash-input" value={form.reference} onChange={set('reference')} maxLength={120} placeholder="Optional" />
        </label>
        <label className="span-2">
          Receipt (photo or PDF)
          {entry?.receipt_path && !removeReceipt && !file ? (
            <span className="receipt-row">
              <Attachment file={{ path: entry.receipt_path, thumb_path: entry.receipt_thumb, mime: entry.receipt_mime, name: 'Receipt' }} size="sm" />
              <button type="button" className="link-btn" onClick={() => setRemoveReceipt(true)}>Remove</button>
            </span>
          ) : (
            <input className="dash-input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          )}
        </label>
        {error && <p className="dash-error span-2">{error}</p>}
        <div className="form-actions span-2">
          <button type="submit" className="dash-btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" className="dash-btn ghost" onClick={onClose}>Cancel</button>
          {entry && (
            <button type="button" className="dash-btn ghost danger" style={{ marginLeft: 'auto' }} onClick={remove}>
              <i className="fa-regular fa-trash-can" /> Delete
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default function ExpensesPage() {
  useSeller();
  const [period, setPeriod] = useState('this_month');
  const [custom, setCustom] = useState(() => periodRange('this_month'));
  const [from, to] = period === 'custom' ? custom : periodRange(period);
  const list = useServerList('list_ledger', { q: '', kind: '', category: '' }, { perPage: 50, extra: { from, to } });
  const { data, filters, setFilter } = list;
  const [editing, setEditing] = useState(null); // { entry?, kind }

  const s = data?.summary;
  const expenseCats = (data?.by_category ?? []).filter((c) => c.kind === 'expense');
  const maxExpense = Math.max(1, ...expenseCats.map((c) => Number(c.total)));
  const incomeCats = (data?.by_category ?? []).filter((c) => c.kind === 'income');

  return (
    <>
      <header className="dash-top compact">
        <h1>Expenses &amp; income</h1>
        <p className="muted head-note">Money in and out that isn&apos;t an invoice: fare, gas, rent, delivery fees…</p>
        <div className="top-actions">
          <button type="button" className="dash-btn" onClick={() => setEditing({ kind: 'expense' })}>+ Expense</button>
          <button type="button" className="dash-btn ghost" onClick={() => setEditing({ kind: 'income' })}>+ Income</button>
        </div>
      </header>

      <div className="period-bar">
        <SearchSelect className="dash-select" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="last_30">Last 30 days</option>
          <option value="this_year">This year</option>
          <option value="all">All time</option>
          <option value="custom">Custom dates…</option>
        </SearchSelect>
        {period === 'custom' && (
          <>
            <input className="dash-input" type="date" value={custom[0]} onChange={(e) => setCustom(([, t]) => [e.target.value, t])} aria-label="From" />
            <span className="muted">to</span>
            <input className="dash-input" type="date" value={custom[1]} onChange={(e) => setCustom(([f]) => [f, e.target.value])} aria-label="To" />
          </>
        )}
        {from && to && period !== 'custom' && <span className="muted">{day(from)} – {day(to)}</span>}
      </div>

      {s && (
        <div className="kpi-row money-kpis">
          <div className="kpi">
            <span>Sales <small>({s.invoices} invoice{s.invoices === 1 ? '' : 's'})</small></span>
            <strong>{money(s.sales)}</strong>
            <small className="muted">Profit on sales {money(s.gross_profit)}</small>
          </div>
          <div className="kpi good">
            <span>Other income</span>
            <strong>{money(s.income)}</strong>
          </div>
          <div className="kpi bad">
            <span>Expenses</span>
            <strong>{money(s.expenses)}</strong>
          </div>
          <div className={`kpi ${Number(s.net) < 0 ? 'bad' : 'good'} net`}>
            <span title="Profit on sales + other income − expenses">Net</span>
            <strong>{money(s.net)}</strong>
            <small className="muted">profit + income − expenses</small>
          </div>
        </div>
      )}

      {(expenseCats.length > 0 || incomeCats.length > 0) && (
        <article className="card cat-breakdown">
          {expenseCats.length > 0 && (
            <div>
              <h3>Where the money went</h3>
              {expenseCats.map((c) => (
                <div key={c.name} className="cb-row">
                  <span className="cb-name">{c.name}</span>
                  <span className="cb-bar"><span style={{ width: `${(Number(c.total) / maxExpense) * 100}%` }} /></span>
                  <strong>{money(c.total)}</strong>
                </div>
              ))}
            </div>
          )}
          {incomeCats.length > 0 && (
            <div>
              <h3>Other income</h3>
              {incomeCats.map((c) => (
                <div key={c.name} className="cb-row income">
                  <span className="cb-name">{c.name}</span>
                  <strong>{money(c.total)}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
      )}

      {list.error && <p className="dash-error">{list.error}</p>}

      <article className="card list-card">
        <div className="toolbar">
          <div className="seg">
            {[['', 'All'], ['expense', 'Expenses'], ['income', 'Income']].map(([v, l]) => (
              <button key={v} type="button" className={filters.kind === v ? 'on' : ''} onClick={() => { setFilter('kind', v); setFilter('category', ''); }}>{l}</button>
            ))}
          </div>
          <SearchSelect className="dash-select" value={filters.category} onChange={(e) => setFilter('category', e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {(data?.categories ?? []).filter((c) => !filters.kind || c.kind === filters.kind).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{filters.kind ? '' : c.kind === 'income' ? ' (income)' : ''}</option>
            ))}
          </SearchSelect>
          <input className="dash-input" placeholder="Search description, reference…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
          <Pager list={list} label="entries" sizes={[50, 100, 200]} />
        </div>

        {!data ? (
          <p className="muted">Loading…</p>
        ) : data.entries.length === 0 ? (
          <div className="empty-state">
            <p className="muted">Nothing here for this period. Add your first expense, e.g. fare or gas.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="dash-table clickable dense">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Paid with</th>
                  <th>Receipt</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} onClick={() => setEditing({ entry: e, kind: e.kind })}>
                    <td>{day(e.entry_date)}</td>
                    <td><span className={`kind-dot ${e.kind}`} />{e.category_name || <span className="muted">No category</span>}</td>
                    <td className="wrap">{e.description || '—'}{e.reference && <small>Ref. {e.reference}</small>}</td>
                    <td>{e.method_name || '—'}</td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      {e.receipt_path ? <Attachment file={{ path: e.receipt_path, thumb_path: e.receipt_thumb, mime: e.receipt_mime, name: 'Receipt' }} size="sm" /> : '—'}
                    </td>
                    <td className={`num amt ${e.kind}`}>{e.kind === 'expense' ? '−' : '+'}{money(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager list={list} label="entries" sizes={[]} className="bottom" />
      </article>

      {editing && data && (
        <EntryModal
          entry={editing.entry}
          kind={editing.kind}
          categories={data.categories}
          methods={data.payment_methods}
          onClose={() => setEditing(null)}
          onSaved={list.reload}
        />
      )}
    </>
  );
}
