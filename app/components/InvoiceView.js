'use client';

import { formatAddress, money } from '../lib/format';
import { STATUS } from '../lib/invoice';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Read-only, printable invoice (seller and customer). */
export default function InvoiceView({ invoice, showCost = false }) {
  const status = STATUS[invoice.status] ?? { label: invoice.status, className: '' };
  const cost = invoice.items.reduce((s, it) => s + (it.unit_cost == null ? 0 : it.qty * Number(it.unit_cost)), 0);
  const hasCost = showCost && invoice.items.some((it) => it.unit_cost != null);

  return (
    <article className="card invoice-paper" id={`invoice-${invoice.id}`}>
      <header className="paper-head">
        <div className="paper-store">
          {invoice.store_logo && <img src={invoice.store_logo} alt="" className="paper-logo" />}
          <div>
            <h2>{invoice.store_name}</h2>
            {formatAddress(invoice) && <p className="muted paper-address">{formatAddress(invoice)}</p>}
            <p className="muted">Invoice</p>
          </div>
        </div>
        <div className="paper-meta">
          <strong>{invoice.invoice_no}</strong>
          <span className={`status-pill ${status.className}`}>{status.label}</span>
          <span className="muted">{fmt(invoice.created_at)}</span>
        </div>
      </header>

      <div className="paper-parties">
        <div>
          <small className="muted">Bill to</small>
          <strong>{invoice.customer_name}</strong>
          {invoice.customer_contact && <span>{invoice.customer_contact}</span>}
          {invoice.role_name && <span className="muted">Price tier: {invoice.role_name}</span>}
        </div>
        <div>
          <small className="muted">{invoice.source === 'customer' ? 'Ordered online by the customer' : 'Made by the seller'}</small>
          {invoice.confirmed_at && <span>Confirmed {fmt(invoice.confirmed_at)}</span>}
          {invoice.closed_at && <span>{status.short} {fmt(invoice.closed_at)}</span>}
        </div>
      </div>

      <table className="dash-table paper-lines">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            <th className="num">Unit price</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((it) => (
            <tr key={it.id}>
              <td>
                {it.product_name}
                {it.brand_name && <small>{it.brand_name}</small>}
              </td>
              <td className="num">{it.qty}{it.uom ? ` ${it.uom}` : ''}</td>
              <td className="num">{money(it.unit_price)}</td>
              <td className="num">{money(it.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="invoice-bottom">
        <div className="notes">{invoice.notes && <><small className="muted">Notes</small><p className="pre">{invoice.notes}</p></>}</div>
        <div className="totals">
          <div><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
          {Number(invoice.discount) > 0 && <div><span>Discount</span><span>−{money(invoice.discount)}</span></div>}
          <div className="grand"><span>Total</span><span>{money(invoice.total)}</span></div>
          {hasCost && <div className="profit no-print"><span>Profit</span><span>{money(Number(invoice.total) - cost)}</span></div>}
        </div>
      </div>
    </article>
  );
}
