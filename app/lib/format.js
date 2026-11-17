const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

/** "1250.5" -> "₱1,250.50"; blank stays blank. */
export function money(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  return Number.isFinite(n) ? peso.format(n) : '';
}

/** Profit margin of `price` over `cost` as "+₱50.00 (25%)", or '' when not computable. */
export function margin(price, cost) {
  const p = Number(price);
  const c = Number(cost);
  if (price === '' || cost === '' || price == null || cost == null || !Number.isFinite(p) || !Number.isFinite(c)) return '';
  const diff = p - c;
  const pct = c > 0 ? ` (${Math.round((diff / c) * 100)}%)` : '';
  return `${diff >= 0 ? '+' : '−'}${peso.format(Math.abs(diff))}${pct}`;
}

/** "2026-12-31" -> "Dec 31, 2026" */
export function shortDate(value) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Human text for a promo: "until Dec 31, 2026" / "while supplies last". */
export function promoLabel(type, until) {
  if (type === 'while_supplies_last') return 'while supplies last';
  if (type === 'until_date' && until) return `until ${shortDate(until)}`;
  return '';
}

/** Address line shown to customers, e.g. "123 Rizal St, Brgy. Banlic, City of Calamba, Laguna 4027". */
export function formatAddress(loc) {
  if (!loc?.city_name) return '';
  const parts = [
    loc.street_address,
    loc.barangay_name && `Brgy. ${loc.barangay_name}`,
    loc.city_name,
    [loc.province_name, loc.postal_code].filter(Boolean).join(' '),
  ];
  return parts.filter(Boolean).join(', ');
}

/** "K7M2QX9P" -> "K7M2-QX9P" (account codes). */
export function formatCode(code) {
  if (!code) return '';
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
