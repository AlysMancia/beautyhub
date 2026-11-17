-- Expenses and other business income, with the seller's own categories.
-- Safe to run more than once.

-- Categories, e.g. Fare (expense), Gas (expense), Delivery fees (income).
CREATE TABLE IF NOT EXISTS ledger_categories (
    id          BIGSERIAL PRIMARY KEY,
    store_id    BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    kind        VARCHAR(10) NOT NULL CHECK (kind IN ('expense', 'income')),
    name        VARCHAR(60) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_categories_name_unique ON ledger_categories (store_id, kind, LOWER(name));

-- One expense or income entry.
CREATE TABLE IF NOT EXISTS ledger_entries (
    id                 BIGSERIAL PRIMARY KEY,
    store_id           BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    kind               VARCHAR(10) NOT NULL CHECK (kind IN ('expense', 'income')),
    category_id        BIGINT REFERENCES ledger_categories (id) ON DELETE SET NULL,
    category_name      VARCHAR(60),                 -- kept if the category is deleted later
    amount             NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    entry_date         DATE NOT NULL DEFAULT CURRENT_DATE,
    description        TEXT,
    payment_method_id  BIGINT REFERENCES payment_methods (id) ON DELETE SET NULL,
    method_name        VARCHAR(80),
    reference          VARCHAR(120),
    receipt_path       VARCHAR(255),                -- photo or PDF of the receipt
    receipt_thumb      VARCHAR(255),
    receipt_mime       VARCHAR(60),
    created_by         BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ledger_entries_store_date_idx ON ledger_entries (store_id, entry_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_category_idx ON ledger_entries (category_id);

-- Default categories for a store (runs once per store; the seller can change them).
CREATE OR REPLACE FUNCTION seed_ledger_categories(p_store_id BIGINT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_key TEXT := 'once:ledger_categories:' || p_store_id;
BEGIN
    IF EXISTS (SELECT 1 FROM app_settings WHERE key = v_key) THEN
        RETURN;
    END IF;
    INSERT INTO ledger_categories (store_id, kind, name, sort_order)
    SELECT p_store_id, c.kind, c.name, c.ord
    FROM (VALUES
        ('expense', 'Fare', 1), ('expense', 'Gas', 2), ('expense', 'Shipping & delivery', 3),
        ('expense', 'Packaging', 4), ('expense', 'Rent', 5), ('expense', 'Electricity & water', 6),
        ('expense', 'Internet & load', 7), ('expense', 'Food', 8), ('expense', 'Supplies', 9),
        ('expense', 'Marketing & ads', 10), ('expense', 'Salaries', 11), ('expense', 'Bank & e-wallet fees', 12),
        ('expense', 'Other expenses', 13),
        ('income', 'Delivery fees collected', 1), ('income', 'Service income', 2), ('income', 'Commission', 3),
        ('income', 'Refund received', 4), ('income', 'Other income', 5)
    ) AS c(kind, name, ord)
    ON CONFLICT DO NOTHING;
    INSERT INTO app_settings (key, value) VALUES (v_key, '1') ON CONFLICT (key) DO NOTHING;
END $$;

SELECT seed_ledger_categories(id) FROM stores;
