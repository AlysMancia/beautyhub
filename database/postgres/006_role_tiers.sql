-- Customer tiers: each role has a tier level (1 = best price, e.g. DD).
-- A customer pays their tier's price; when their tier has no price for a
-- product, the next tier up (toward retail) is used. Safe to run more than once.

ALTER TABLE store_roles ADD COLUMN IF NOT EXISTS tier_level INTEGER;

-- One-time: number existing roles. Known names get the usual order
-- (DD, CD, Reseller, Retailer); any others go after them.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'once:006_tier_levels') THEN
        UPDATE store_roles r SET tier_level = t.lvl
        FROM (
            SELECT id, ROW_NUMBER() OVER (
                PARTITION BY store_id
                ORDER BY CASE lower(name) WHEN 'dd' THEN 1 WHEN 'cd' THEN 2 WHEN 'reseller' THEN 3 WHEN 'retailer' THEN 4 ELSE 5 END,
                         sort_order, id
            ) AS lvl
            FROM store_roles
        ) t
        WHERE t.id = r.id;
        INSERT INTO app_settings (key, value) VALUES ('once:006_tier_levels', 'done');
    END IF;
END $$;

-- Roles created later without a level go last.
UPDATE store_roles r SET tier_level = 1 + COALESCE(
    (SELECT MAX(tier_level) FROM store_roles x WHERE x.store_id = r.store_id AND x.tier_level IS NOT NULL), 0)
WHERE tier_level IS NULL;

CREATE INDEX IF NOT EXISTS store_roles_tier_idx ON store_roles (store_id, tier_level);

/**
 * Price of a product for a customer tier: the tier's own price, else the
 * nearest tier above it (toward retail) that has one. NULL when none has.
 */
CREATE OR REPLACE FUNCTION tier_price(p_product_id BIGINT, p_role_id BIGINT) RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    SELECT rp.price
    FROM store_roles me
    JOIN store_roles r ON r.store_id = me.store_id AND (r.tier_level, r.id) >= (me.tier_level, me.id)
    JOIN product_role_prices rp ON rp.role_id = r.id AND rp.product_id = p_product_id
    WHERE me.id = p_role_id
    ORDER BY r.tier_level, r.id
    LIMIT 1
$$;
