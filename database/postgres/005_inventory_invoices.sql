-- Inventory (stock per product + movement history) and invoices / customer orders.
-- Safe to run more than once.

-- ---------- seller cost = cost role price (DD) ----------
ALTER TABLE product_details DROP COLUMN IF EXISTS cost_price CASCADE;

-- One-time: stores created before cost roles existed use their "DD" role.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'once:005_cost_role_dd') THEN
        UPDATE stores s SET cost_role_id = r.id
        FROM store_roles r
        WHERE r.store_id = s.id AND lower(r.name) = 'dd' AND s.cost_role_id IS NULL;
        INSERT INTO app_settings (key, value) VALUES ('once:005_cost_role_dd', 'done');
    END IF;
END $$;

-- ---------- inventory ----------
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS stock_qty     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE product_details ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 5; -- "low stock" at or below this

-- Every stock change, so the seller can see why a number changed.
CREATE TABLE IF NOT EXISTS inventory_movements (
    id          BIGSERIAL PRIMARY KEY,
    store_id    BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    product_id  BIGINT NOT NULL REFERENCES product_details (id) ON DELETE CASCADE,
    qty_change  INTEGER NOT NULL,                    -- + in, - out
    stock_after INTEGER NOT NULL,
    reason      VARCHAR(30) NOT NULL,                -- invoice | invoice_cancelled | adjustment | import | opening
    invoice_id  BIGINT,
    note        VARCHAR(255),
    created_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements (product_id, created_at DESC);

-- ---------- invoices ----------
-- source = 'seller'   : made by the seller, confirmed right away (stock deducted)
-- source = 'customer' : placed by a customer from the store page, 'pending' until the seller approves
-- status: pending -> confirmed | rejected ; confirmed -> cancelled (stock returned)
CREATE TABLE IF NOT EXISTS invoices (
    id              BIGSERIAL PRIMARY KEY,
    store_id        BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    invoice_no      VARCHAR(30) NOT NULL,
    source          VARCHAR(20) NOT NULL CHECK (source IN ('seller', 'customer')),
    status          VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled')),
    customer_user_id BIGINT REFERENCES users (id) ON DELETE SET NULL,  -- a registered customer, or NULL (walk-in)
    customer_name   VARCHAR(160) NOT NULL,
    customer_contact VARCHAR(160),
    role_id         BIGINT REFERENCES store_roles (id) ON DELETE SET NULL,  -- price tier used
    role_name       VARCHAR(60),
    subtotal        NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount        NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    total           NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_by      BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at    TIMESTAMP,
    closed_at       TIMESTAMP,     -- rejected / cancelled
    UNIQUE (store_id, invoice_no)
);
CREATE INDEX IF NOT EXISTS invoices_store_status_idx ON invoices (store_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices (customer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
    id          BIGSERIAL PRIMARY KEY,
    invoice_id  BIGINT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    product_id  BIGINT REFERENCES product_details (id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,   -- copies, so old invoices stay readable
    brand_name  VARCHAR(255),
    uom         VARCHAR(20),
    qty         INTEGER NOT NULL CHECK (qty > 0),
    unit_price  NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    unit_cost   NUMERIC(12, 2),           -- cost role price at the time, for profit
    line_total  NUMERIC(12, 2) NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items (invoice_id);
