-- Customers added by the seller. Safe to run more than once.
--  - users.password stays NULL for a customer the seller added by hand
--    ("no login yet"). If that person later signs up with the same email,
--    they take over this account and keep their tier and orders.
--  - users.phone: contact number.
--  - store_members.notes: the seller's private notes about a customer.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
ALTER TABLE store_members ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE store_members ADD COLUMN IF NOT EXISTS added_by_seller BOOLEAN NOT NULL DEFAULT FALSE;
