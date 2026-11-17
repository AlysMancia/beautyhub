-- SRP tier + quantity prices ("buy 10 or more, pay less"). Safe to run more than once.

-- ---------- SRP: which tier is the suggested retail price ----------
-- At most one per store. Members see their own price next to the SRP.
ALTER TABLE store_roles ADD COLUMN IF NOT EXISTS is_srp BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS store_roles_one_srp ON store_roles (store_id) WHERE is_srp;

-- Stores without one yet: their "Retailer" tier, else the last tier (toward retail).
UPDATE store_roles r SET is_srp = TRUE
WHERE r.id IN (
    SELECT DISTINCT ON (s.store_id) s.id
    FROM store_roles s
    WHERE NOT EXISTS (SELECT 1 FROM store_roles x WHERE x.store_id = s.store_id AND x.is_srp)
    ORDER BY s.store_id, (LOWER(s.name) = 'retailer') DESC, s.tier_level DESC, s.id DESC
);

-- ---------- quantity prices ----------
-- For a product and tier: from `min_qty` pieces on, each costs `price`.
-- Any number of steps, e.g. 1+ = 10.00 (the normal tier price), 10+ = 9.00, 50+ = 8.50.
CREATE TABLE IF NOT EXISTS product_qty_prices (
    id          BIGSERIAL PRIMARY KEY,
    product_id  BIGINT NOT NULL REFERENCES product_details (id) ON DELETE CASCADE,
    role_id     BIGINT NOT NULL REFERENCES store_roles (id) ON DELETE CASCADE,
    min_qty     INTEGER NOT NULL CHECK (min_qty >= 2),
    price       NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (product_id, role_id, min_qty)
);
CREATE INDEX IF NOT EXISTS product_qty_prices_product_idx ON product_qty_prices (product_id, role_id, min_qty);

-- The tier whose price (and quantity prices) a tier pays: its own if it has a
-- price for the product, else the next tier toward retail (same rule as tier_price()).
CREATE OR REPLACE FUNCTION price_tier_for(p_product_id BIGINT, p_role_id BIGINT) RETURNS BIGINT
LANGUAGE sql STABLE AS $$
    SELECT r.id
    FROM store_roles me
    JOIN store_roles r ON r.store_id = me.store_id AND (r.tier_level, r.id) >= (me.tier_level, me.id)
    JOIN product_role_prices rp ON rp.role_id = r.id AND rp.product_id = p_product_id
    WHERE me.id = p_role_id
    ORDER BY r.tier_level, r.id
    LIMIT 1
$$;
