-- Store categories for the "Explore stores" directory (Skincare, Makeup, ...).
-- The list is managed by admins; each seller picks the ones that fit their shop.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS store_categories (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(60) NOT NULL,
    icon        VARCHAR(40) NOT NULL DEFAULT 'fa-store',   -- Font Awesome icon
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS store_categories_name_unique ON store_categories (LOWER(name));

CREATE TABLE IF NOT EXISTS store_category_links (
    store_id     BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    category_id  BIGINT NOT NULL REFERENCES store_categories (id) ON DELETE CASCADE,
    PRIMARY KEY (store_id, category_id)
);
CREATE INDEX IF NOT EXISTS store_category_links_category_idx ON store_category_links (category_id);

-- Starting list (once; admins can rename, add or remove).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'once:store_categories') THEN
        INSERT INTO store_categories (name, icon, sort_order) VALUES
            ('Skincare', 'fa-spa', 1),
            ('Makeup', 'fa-wand-magic-sparkles', 2),
            ('Hair care', 'fa-scissors', 3),
            ('Body care', 'fa-pump-soap', 4),
            ('Fragrance', 'fa-spray-can-sparkles', 5),
            ('Nails', 'fa-hand-sparkles', 6),
            ('Wellness & supplements', 'fa-capsules', 7),
            ('Men''s grooming', 'fa-user-tie', 8),
            ('Beauty tools', 'fa-brush', 9),
            ('Baby & kids', 'fa-baby', 10)
        ON CONFLICT DO NOTHING;
        INSERT INTO app_settings (key, value) VALUES ('once:store_categories', '1');
    END IF;
END $$;

-- Seller can hide the "Explore stores" button on their own store page.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS show_explore BOOLEAN NOT NULL DEFAULT TRUE;
