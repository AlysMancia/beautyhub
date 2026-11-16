-- Account types, seller stores, per-store roles and store memberships.
-- Safe to run more than once (migrate.bat runs every file on each start).

-- ---------- users: username + account type ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'customer';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_account_type_check') THEN
        ALTER TABLE users
            ADD CONSTRAINT users_account_type_check CHECK (account_type IN ('seller', 'customer'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));

-- ---------- stores: one per seller, reachable at /store/{slug} ----------
CREATE TABLE IF NOT EXISTS stores (
    id           BIGSERIAL PRIMARY KEY,
    owner_id     BIGINT NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    slug         VARCHAR(60) NOT NULL UNIQUE,
    name         VARCHAR(120) NOT NULL,
    description  TEXT,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------- store_roles: roles each seller defines (Reseller, Retailer, ...) ----------
CREATE TABLE IF NOT EXISTS store_roles (
    id          BIGSERIAL PRIMARY KEY,
    store_id    BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    name        VARCHAR(60) NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS store_roles_name_unique ON store_roles (store_id, LOWER(name));
-- At most one default role per store (new customers get this role).
CREATE UNIQUE INDEX IF NOT EXISTS store_roles_one_default ON store_roles (store_id) WHERE is_default;

-- ---------- store_members: a customer's membership + role in a store ----------
CREATE TABLE IF NOT EXISTS store_members (
    id          BIGSERIAL PRIMARY KEY,
    store_id    BIGINT NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id     BIGINT REFERENCES store_roles (id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (store_id, user_id)
);

CREATE INDEX IF NOT EXISTS store_members_user_idx ON store_members (user_id);
