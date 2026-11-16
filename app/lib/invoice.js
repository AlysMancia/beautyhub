/** Shared invoice helpers (seller + customer pages). */

export const STATUS = {
  pending: { label: 'Waiting for approval', short: 'Pending', className: 'pending' },
  confirmed: { label: 'Confirmed', short: 'Confirmed', className: 'confirmed' },
  rejected: { label: 'Rejected', short: 'Rejected', className: 'rejected' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', className: 'cancelled' },
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

export const lineTotal = (line) => {
  const q = Number(line.qty);
  const p = Number(line.unit_price);
  return Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
};
