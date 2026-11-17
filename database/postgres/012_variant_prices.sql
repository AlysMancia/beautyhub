-- Per-variant prices (optional). Safe to run more than once.
-- A variant may set its own price for any tier; tiers it leaves empty use the
-- product's price for that tier. Then the usual tier fallback applies: the
-- customer's tier first, else the next tier toward retail.

CREATE TABLE IF NOT EXISTS product_variant_prices (
    variant_id  BIGINT NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
    role_id     BIGINT NOT NULL REFERENCES store_roles (id) ON DELETE CASCADE,
    price       NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (variant_id, role_id)
);

/** Price of a variant for a customer tier (see the rule above). NULL when none. */
CREATE OR REPLACE FUNCTION variant_tier_price(p_variant_id BIGINT, p_role_id BIGINT) RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(vp.price, rp.price)
    FROM product_variants v
    JOIN store_roles me ON me.id = p_role_id
    JOIN store_roles r ON r.store_id = me.store_id AND (r.tier_level, r.id) >= (me.tier_level, me.id)
    LEFT JOIN product_variant_prices vp ON vp.variant_id = v.id AND vp.role_id = r.id
    LEFT JOIN product_role_prices rp ON rp.product_id = v.product_id AND rp.role_id = r.id
    WHERE v.id = p_variant_id AND COALESCE(vp.price, rp.price) IS NOT NULL
    ORDER BY r.tier_level, r.id
    LIMIT 1
$$;
