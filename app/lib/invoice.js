/** Shared invoice helpers (seller + customer pages). */

export const STATUS = {
  pending: { label: 'Waiting for approval', short: 'Pending', className: 'pending' },
  confirmed: { label: 'Confirmed', short: 'Confirmed', className: 'confirmed' },
  rejected: { label: 'Rejected', short: 'Rejected', className: 'rejected' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', className: 'cancelled' },
};

/** Payment status, worked out on the server from the confirmed payments. */
export const PAYMENT = {
  unpaid: { label: 'Unpaid', className: 'unpaid' },
  partial: { label: 'Partly paid', short: 'Partial', className: 'partial' },
  paid: { label: 'Paid', className: 'paid' },
  overpaid: { label: 'Overpaid', className: 'overpaid' },
};

export const RELEASE = {
  open: { label: 'Open', className: 'open' },
  released: { label: 'Released', className: 'released' },
};

export const PAYMENT_KINDS = {
  cash: { label: 'Cash', icon: 'fa-money-bill-wave' },
  gcash: { label: 'GCash', icon: 'fa-mobile-screen' },
  maya: { label: 'Maya', icon: 'fa-mobile-screen' },
  bank: { label: 'Bank transfer', icon: 'fa-building-columns' },
  card: { label: 'Card', icon: 'fa-credit-card' },
  cod: { label: 'Cash on delivery', icon: 'fa-truck' },
  other: { label: 'Other', icon: 'fa-wallet' },
};

/**
 * Price of `product` for a tier: that tier's price, else the next tier up
 * (toward retail) that has one. `roles` must be in tier order (as the API
 * returns them). Same rule as tier_price() on the server.
 */
export function tierPrice(product, roleId, roles) {
  const start = roles.findIndex((r) => String(r.id) === String(roleId));
  for (const r of roles.slice(start < 0 ? 0 : start)) {
    if (product.prices[r.id] !== undefined && product.prices[r.id] !== null) return product.prices[r.id];
  }
  return null;
}

/** Selling price for a tier; an active promo wins when it is lower. */
export function priceFor(product, roleId, roles) {
  let price = tierPrice(product, roleId, roles);
  if (product.promo_active && product.promo_price !== null && (price === null || Number(product.promo_price) < Number(price))) {
    price = product.promo_price;
  }
  return price === null ? '' : Number(price).toFixed(2);
}

/**
 * Price per piece when buying `qty`: the best quantity step reached
 * ([{ min_qty, price }]), if it beats `base`. Same rule as price_at_qty() on the server.
 */
export function priceAtQty(base, steps, qty) {
  let best = base === null || base === undefined || base === '' ? null : Number(base);
  for (const s of steps ?? []) {
    if (Number(qty) >= s.min_qty && (best === null || Number(s.price) < best)) best = Number(s.price);
  }
  return best;
}

/** The next step up from `qty`, to nudge buyers ("Buy 10 for ₱9.00 each"). */
export function nextStep(steps, qty) {
  return (steps ?? []).find((s) => s.min_qty > Number(qty)) ?? null;
}

export const lineTotal = (line) => {
  const q = Number(line.qty);
  const p = Number(line.unit_price);
  return Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
};
