-- Product variants (e.g. a lipstick in several shades). Safe to run more than once.
--  - product_details.has_variants / variant_label ("Shade", "Color", "Size"...)
--  - product_variants: one row per option, with its own stock, SKU and photo.
--    Variants share the product's tier prices. When a product has variants,
--    product_details.stock_qty is kept as the total of its variants.
--  - invoice lines and stock movements remember which variant.

ALTER TABLE product_details ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS variant_label VARCHAR(40);

CREATE TABLE IF NOT EXISTS product_variants (
    id          BIGSERIAL PRIMARY KEY,
    store_id    BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    product_id  BIGINT NOT NULL REFERENCES product_details (id) ON DELETE CASCADE,
    name        VARCHAR(120) NOT NULL,
    sku         VARCHAR(100),
    stock_qty   INTEGER NOT NULL DEFAULT 0,
    media_id    BIGINT REFERENCES product_media (id) ON DELETE SET NULL,  -- its photo (one of the product's)
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants (product_id, sort_order, id);
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_name_unique ON product_variants (product_id, LOWER(name));

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES product_variants (id) ON DELETE SET NULL;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS variant_name VARCHAR(120);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES product_variants (id) ON DELETE SET NULL;
