-- Payment methods (with attachments), invoice payments + release status,
-- and admin accounts. Safe to run more than once.

-- ---------- admin accounts + turning accounts off ----------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;
ALTER TABLE users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ('seller', 'customer', 'admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------- a seller's payment methods (GCash, bank, cash, ...) ----------
CREATE TABLE IF NOT EXISTS payment_methods (
    id              BIGSERIAL PRIMARY KEY,
    store_id        BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    kind            VARCHAR(20) NOT NULL DEFAULT 'other'
                    CHECK (kind IN ('cash', 'gcash', 'maya', 'bank', 'card', 'cod', 'other')),
    name            VARCHAR(80) NOT NULL,            -- e.g. "GCash", "BDO Savings"
    account_name    VARCHAR(120),
    account_number  VARCHAR(80),
    instructions    TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,  -- shown to customers
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS payment_methods_store_idx ON payment_methods (store_id, sort_order, id);

-- Attachments on a payment method: QR codes, photos of a card, PDF instructions.
CREATE TABLE IF NOT EXISTS payment_method_files (
    id                 BIGSERIAL PRIMARY KEY,
    payment_method_id  BIGINT NOT NULL REFERENCES payment_methods (id) ON DELETE CASCADE,
    path               VARCHAR(255) NOT NULL,
    thumb_path         VARCHAR(255),
    mime               VARCHAR(60) NOT NULL,
    original_name      VARCHAR(255),
    bytes              BIGINT NOT NULL DEFAULT 0,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS payment_method_files_method_idx ON payment_method_files (payment_method_id, id);

-- ---------- payments on an invoice ----------
-- status: confirmed = counted; pending = sent by the customer, waiting for the
-- seller to check it; rejected = not counted.
CREATE TABLE IF NOT EXISTS invoice_payments (
    id                 BIGSERIAL PRIMARY KEY,
    invoice_id         BIGINT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    payment_method_id  BIGINT REFERENCES payment_methods (id) ON DELETE SET NULL,
    method_name        VARCHAR(80),                  -- kept even if the method is deleted later
    amount             NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    paid_on            DATE NOT NULL DEFAULT CURRENT_DATE,
    reference          VARCHAR(120),                 -- e.g. GCash reference no.
    note               TEXT,
    proof_path         VARCHAR(255),                 -- receipt / screenshot (photo or PDF)
    proof_thumb        VARCHAR(255),
    proof_mime         VARCHAR(60),
    status             VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'rejected')),
    created_by         BIGINT REFERENCES users (id) ON DELETE SET NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON invoice_payments (invoice_id, created_at);

-- Payment status is worked out from the confirmed payments and kept on the
-- invoice so lists can filter by it: unpaid / partial / paid / overpaid.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_payment_status_check') THEN
        ALTER TABLE invoices ADD CONSTRAINT invoices_payment_status_check
            CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'overpaid'));
    END IF;
END $$;

-- Release: open = items not yet handed over; released = given / shipped to someone.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS release_status VARCHAR(20) NOT NULL DEFAULT 'open';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS released_to VARCHAR(160);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS released_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS release_note TEXT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_release_status_check') THEN
        ALTER TABLE invoices ADD CONSTRAINT invoices_release_status_check CHECK (release_status IN ('open', 'released'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS invoices_store_payment_idx ON invoices (store_id, payment_status);
CREATE INDEX IF NOT EXISTS invoices_store_release_idx ON invoices (store_id, release_status);
