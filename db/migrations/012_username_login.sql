-- Accounts sign in with a simple username (not necessarily an email address).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email') THEN
    ALTER TABLE users RENAME COLUMN email TO username;
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_length;
ALTER TABLE users ADD CONSTRAINT users_username_length CHECK (char_length(btrim(username)) BETWEEN 2 AND 320);
ALTER INDEX IF EXISTS idx_users_email_lower RENAME TO idx_users_username_lower;
