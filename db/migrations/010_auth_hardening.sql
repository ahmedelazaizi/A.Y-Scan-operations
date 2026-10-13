-- Real per-user accounts: forced password change after an admin reset, and last-login tracking.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Emails are compared case-insensitively; the application stores them lower-cased.
UPDATE users SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions (token_hash) WHERE revoked_at IS NULL;
