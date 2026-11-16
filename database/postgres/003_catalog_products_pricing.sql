-- Catalog (brands, categories, units of measure), products, per-role prices and promos.
-- Safe to run more than once (migrate.bat runs every file on each start).

-- ---------- small key/value table for app bookkeeping ----------
CREATE TABLE IF NOT EXISTS app_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- brands: per store ----------
ALTER TABLE brands ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES stores (id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS brands_store_name_unique ON brands (store_id, LOWER(name));

-- ---------- product categories: per store ----------
ALTER TABLE product_category ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES stores (id) ON DELETE CASCADE;
ALTER TABLE product_category ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS product_category_store_name_unique ON product_category (store_id, LOWER(name));

-- ---------- units of measure: per store (pc, pack, ml, ...) ----------
CREATE TABLE IF NOT EXISTS uoms (
    id          BIGSERIAL PRIMARY KEY,
    store_id    BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    code        VARCHAR(20) NOT NULL,
    name        VARCHAR(60) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uoms_store_code_unique ON uoms (store_id, LOWER(code));
ALTER TABLE uoms ADD COLUMN IF NOT EXISTS is_measure BOOLEAN NOT NULL DEFAULT FALSE;  -- see 007

-- ---------- products ----------
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS store_id    BIGINT REFERENCES stores (id) ON DELETE CASCADE;
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS uom_id      BIGINT REFERENCES uoms (id) ON DELETE SET NULL;
-- (The seller's cost is the price of the store's cost role, e.g. DD: see stores.cost_role_id.)
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS promo_price NUMERIC(12, 2);
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS promo_type  VARCHAR(30);      -- until_date | while_supplies_last
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS promo_until DATE;
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_details_brand_fk') THEN
        ALTER TABLE product_details ADD CONSTRAINT product_details_brand_fk
            FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_details_category_fk') THEN
        ALTER TABLE product_details ADD CONSTRAINT product_details_category_fk
            FOREIGN KEY (product_category_id) REFERENCES product_category (id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_details_promo_type_check') THEN
        ALTER TABLE product_details ADD CONSTRAINT product_details_promo_type_check
            CHECK (promo_type IS NULL OR promo_type IN ('until_date', 'while_supplies_last'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_details_promo_price_check') THEN
        ALTER TABLE product_details ADD CONSTRAINT product_details_promo_price_check
            CHECK (promo_price IS NULL OR promo_price >= 0);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_details_store_idx ON product_details (store_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_details_store_sku_unique
    ON product_details (store_id, LOWER(sku)) WHERE sku IS NOT NULL AND sku <> '';

-- ---------- price per product per customer role ----------
CREATE TABLE IF NOT EXISTS product_role_prices (
    product_id  BIGINT NOT NULL REFERENCES product_details (id) ON DELETE CASCADE,
    role_id     BIGINT NOT NULL REFERENCES store_roles (id) ON DELETE CASCADE,
    price       NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id, role_id)
);

-- =====================================================================
-- SEEDER: default roles, categories and units for a store.
-- Runs once per store (stores.defaults_seeded), so anything the seller
-- renames or deletes later is never re-added.
-- =====================================================================
ALTER TABLE stores ADD COLUMN IF NOT EXISTS defaults_seeded BOOLEAN NOT NULL DEFAULT FALSE;
-- Tier order of customer roles (1 = best price). See 006_role_tiers.sql.
ALTER TABLE store_roles ADD COLUMN IF NOT EXISTS tier_level INTEGER;
-- The role whose price is what the seller pays (their cost). Seeded as DD.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS cost_role_id BIGINT REFERENCES store_roles (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION seed_store_defaults(p_store_id BIGINT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT defaults_seeded FROM stores WHERE id = p_store_id) THEN
        RETURN;
    END IF;

    -- Customer roles (first one is the default for new customers)
    IF NOT EXISTS (SELECT 1 FROM store_roles WHERE store_id = p_store_id) THEN
        -- Tier order: DD (best price) -> CD -> Reseller -> Retailer (default for new customers).
        INSERT INTO store_roles (store_id, name, is_default, sort_order, tier_level)
        SELECT p_store_id, r.name, r.name = 'Retailer', r.ord, r.ord
        FROM unnest(ARRAY['DD', 'CD', 'Reseller', 'Retailer']) WITH ORDINALITY AS r(name, ord);
    END IF;

    -- The DD price is the seller's cost.
    UPDATE stores SET cost_role_id = (
        SELECT id FROM store_roles WHERE store_id = p_store_id AND lower(name) = 'dd' LIMIT 1
    ) WHERE id = p_store_id AND cost_role_id IS NULL;

    -- Product categories
    IF NOT EXISTS (SELECT 1 FROM product_category WHERE store_id = p_store_id) THEN
        INSERT INTO product_category (store_id, name, slug, sort_order)
        SELECT p_store_id, c.name, lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '-', 'g')), c.ord
        FROM unnest(ARRAY[
            'Skincare', 'Makeup', 'Haircare', 'Body Care', 'Fragrance', 'Bath & Shower',
            'Nail Care', 'Health & Supplements', 'Slimming', 'Whitening',
            'Tools & Accessories', 'Sets & Bundles'
        ]) WITH ORDINALITY AS c(name, ord);
    END IF;

    -- Units of measure
    IF NOT EXISTS (SELECT 1 FROM uoms WHERE store_id = p_store_id) THEN
        -- ml / L / g / kg ask for an amount on each product ("500 ml").
        INSERT INTO uoms (store_id, code, name, sort_order, is_measure)
        SELECT p_store_id, u.code, u.name, u.ord, u.code IN ('ml', 'L', 'g', 'kg')
        FROM unnest(
            ARRAY['pc', 'pack', 'box', 'set', 'bottle', 'tube', 'jar', 'sachet', 'ml', 'L', 'g', 'kg'],
            ARRAY['Piece', 'Pack', 'Box', 'Set', 'Bottle', 'Tube', 'Jar', 'Sachet', 'Milliliter', 'Liter', 'Gram', 'Kilogram']
        ) WITH ORDINALITY AS u(code, name, ord);
    END IF;

    UPDATE stores SET defaults_seeded = TRUE WHERE id = p_store_id;
END $$;

-- Existing stores get their defaults the first time this runs.
DO $$ BEGIN PERFORM seed_store_defaults(id) FROM stores WHERE NOT defaults_seeded; END $$;
