-- Every account gets a unique code (8 characters, no look-alike letters such as
-- O/0 or I/1), e.g. K7M2QX9P, shown as K7M2-QX9P. A customer gives this code to
-- a seller so the seller can link a customer they added by hand to the real
-- account. Safe to run more than once.

ALTER TABLE users ADD COLUMN IF NOT EXISTS code VARCHAR(8);

CREATE OR REPLACE FUNCTION new_user_code() RETURNS VARCHAR
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    candidate TEXT;
BEGIN
    LOOP
        candidate := '';
        FOR i IN 1..8 LOOP
            candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        END LOOP;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE code = candidate);
    END LOOP;
    RETURN candidate;
END $$;

-- Existing accounts get a code once.
UPDATE users SET code = new_user_code() WHERE code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_code_unique ON users (code);

-- New accounts get one automatically.
CREATE OR REPLACE FUNCTION set_user_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.code IS NULL THEN
        NEW.code := new_user_code();
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_set_code ON users;
CREATE TRIGGER users_set_code BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION set_user_code();
