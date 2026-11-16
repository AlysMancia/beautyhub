-- Photos/videos, logos and product sizes. Safe to run more than once.

-- Logos (paths under /uploads/...).
ALTER TABLE stores ADD COLUMN IF NOT EXISTS logo_path VARCHAR(255);
ALTER TABLE brands ADD COLUMN IF NOT EXISTS logo_path VARCHAR(255);

-- Units like ml / L / g / kg need an amount ("500 ml"); pc / box / set don't.
ALTER TABLE uoms ADD COLUMN IF NOT EXISTS is_measure BOOLEAN NOT NULL DEFAULT FALSE;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'once:007_measure_units') THEN
        UPDATE uoms SET is_measure = TRUE
        WHERE lower(code) IN ('ml', 'l', 'g', 'kg', 'mg', 'oz', 'cl', 'm', 'cm');
        INSERT INTO app_settings (key, value) VALUES ('once:007_measure_units', 'done');
    END IF;
END $$;

-- How many of the unit, e.g. 500 (ml). Only used when the unit is a measure.
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS uom_qty NUMERIC(10, 3) CHECK (uom_qty IS NULL OR uom_qty > 0);

-- Product photos and videos. One photo per product is the cover.
CREATE TABLE IF NOT EXISTS product_media (
    id          BIGSERIAL PRIMARY KEY,
    store_id    BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    product_id  BIGINT NOT NULL REFERENCES product_details (id) ON DELETE CASCADE,
    kind        VARCHAR(10) NOT NULL CHECK (kind IN ('image', 'video')),
    path        VARCHAR(255) NOT NULL,      -- full size (photos are resized to max 1600px)
    thumb_path  VARCHAR(255),               -- small photo for lists (photos only)
    mime        VARCHAR(60) NOT NULL,
    bytes       INTEGER NOT NULL,
    is_cover    BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS product_media_product_idx ON product_media (product_id, sort_order, id);
CREATE UNIQUE INDEX IF NOT EXISTS product_media_one_cover ON product_media (product_id) WHERE is_cover;
