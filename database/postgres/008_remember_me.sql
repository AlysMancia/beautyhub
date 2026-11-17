-- "Remember me" logins. The browser keeps a cookie "selector:validator";
-- only a SHA-256 hash of the validator is stored here, so a leaked database
-- can't be used to log in. Safe to run more than once.

CREATE TABLE IF NOT EXISTS remember_tokens (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    selector        VARCHAR(32) NOT NULL UNIQUE,
    validator_hash  CHAR(64) NOT NULL,
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at    TIMESTAMP
);
CREATE INDEX IF NOT EXISTS remember_tokens_user_idx ON remember_tokens (user_id);

-- Expired tokens are useless; clear them on each start.
DELETE FROM remember_tokens WHERE expires_at < CURRENT_TIMESTAMP;
